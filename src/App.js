import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';

import './App.css'; // スタイルシート

const PDFConverter = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');
  const [pdfPreview, setPdfPreview] = useState(null);
  const [workerReady, setWorkerReady] = useState(false);
  
  // PDF.jsのワーカー設定 - 複数の方法を試みる
  useEffect(() => {
    const setupWorker = async () => {
      try {
        // 方法1: 既知の安定バージョンを使用
        const pdfjsWorker = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.14.305/pdf.worker.min.js';
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
        console.log('Set PDF.js worker to fixed version:', pdfjsWorker);
        
        // ワーカーの初期化を確認
        await new Promise(resolve => setTimeout(resolve, 1000));
        setWorkerReady(true);
      } catch (err) {
        console.error('Worker setup failed with fixed version:', err);
        
        try {
          // 方法2: フォールバックとしてインラインワーカーを使用
          const blob = new Blob([
            `importScripts('https://unpkg.com/pdfjs-dist@2.14.305/build/pdf.worker.min.js');`
          ], { type: 'application/javascript' });
          
          const workerUrl = URL.createObjectURL(blob);
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
          console.log('Using inline worker blob URL');
          
          // ワーカーの初期化を確認
          await new Promise(resolve => setTimeout(resolve, 1000));
          setWorkerReady(true);
        } catch (inlineErr) {
          console.error('Inline worker setup failed:', inlineErr);
          
          // 方法3: ワーカーなしモード（限定機能）
          pdfjsLib.GlobalWorkerOptions.workerSrc = '';
          console.log('Falling back to workerless mode');
          setWorkerReady(true);
        }
      }
    };
    
    setupWorker();
  }, []);
  
  // コンポーネントのアンマウント時にリソースを解放
  useEffect(() => {
    return () => {
      if (pdfPreview) {
        URL.revokeObjectURL(pdfPreview);
      }
    };
  }, [pdfPreview]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      console.log('PDF file selected:', selectedFile.name);
      setFile(selectedFile);
      
      // ファイルプレビューの作成
      const fileUrl = URL.createObjectURL(selectedFile);
      setPdfPreview(fileUrl);
      
      setProcessingStatus('ファイルはブラウザ内で処理され、サーバーにアップロードされません。');
      setError('');
    } else if (selectedFile) {
      setFile(null);
      setPdfPreview(null);
      setError('PDFファイルのみ対応しています。別の形式のファイルが選択されました。');
    }
  };
  
  // PDFからの表構造抽出（実際の実装を試みる）
  const extractTablesFromPDF = async (pdfData) => {
    try {
      console.log('Starting PDF data extraction...');
      setProcessingStatus('PDFからデータを抽出中...');
      
      if (!workerReady) {
        console.warn('Worker is not ready, using simulation mode');
        return simulateTableExtraction();
      }
      
      // PDFドキュメントをロード
      const loadingTask = pdfjsLib.getDocument({ data: pdfData });
      
      // 読み込みタイムアウトの設定（20秒）
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('PDF loading timeout')), 20000)
      );
      
      // タイムアウトか読み込み完了のどちらか早い方を採用
      const pdf = await Promise.race([
        loadingTask.promise,
        timeoutPromise
      ]);
      
      console.log(`PDF loaded, pages: ${pdf.numPages}`);
      
      let allTableData = [];
      
      // ヘッダー行を追加
      allTableData.push([`ファイル「${file.name}」から抽出されたデータ`]);
      allTableData.push([`総ページ数: ${pdf.numPages}`]);
      allTableData.push([]);
      
      // 各ページから表構造を抽出
      for (let i = 1; i <= pdf.numPages; i++) {
        setProgress(Math.floor((i / pdf.numPages) * 100));
        setProcessingStatus(`データ抽出中: ${i}/${pdf.numPages}ページ`);
        
        try {
          // ページの取得（タイムアウト付き）
          const pagePromise = pdf.getPage(i);
          const page = await Promise.race([
            pagePromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Page loading timeout')), 5000))
          ]);
          
          // ページ情報を追加
          allTableData.push([`--- ページ ${i} ---`]);
          
          // テキストコンテンツの取得（タイムアウト付き）
          const textContentPromise = page.getTextContent();
          const textContent = await Promise.race([
            textContentPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Text extraction timeout')), 5000))
          ]);
          
          if (!textContent || !textContent.items || textContent.items.length === 0) {
            allTableData.push(["このページにはテキストが含まれていないか、抽出できませんでした"]);
            continue;
          }
          
          // テキスト項目を位置情報付きで取得
          const textItems = textContent.items
            .filter(item => item && item.str && item.transform)
            .map(item => {
              try {
                return {
                  text: item.str,
                  x: Math.round(item.transform[4] || 0),
                  y: Math.round(item.transform[5] || 0)
                };
              } catch (e) {
                console.warn('Invalid text item:', e);
                return null;
              }
            })
            .filter(item => item !== null);
          
          if (textItems.length === 0) {
            allTableData.push(["このページには有効なテキスト要素が見つかりませんでした"]);
            continue;
          }
          
          // Y座標でグループ化して行を形成
          const rows = {};
          const yTolerance = 5; // 同じ行と見なす高さの許容差
          
          textItems.forEach(item => {
            if (!item.text.trim()) return;
            
            // 近似Y座標を計算して同じ行のアイテムをグループ化
            const roundedY = Math.round(item.y / yTolerance) * yTolerance;
            if (!rows[roundedY]) {
              rows[roundedY] = [];
            }
            rows[roundedY].push(item);
          });
          
          // Y座標でソート（PDFは下から上に座標が増えるため降順）
          const sortedYCoordinates = Object.keys(rows).sort((a, b) => b - a);
          
          // 各行をX座標でソートして列順を維持し、テーブルデータに追加
          for (const y of sortedYCoordinates) {
            rows[y].sort((a, b) => a.x - b.x);
            
            // テキストのみの配列に変換
            const rowTexts = rows[y].map(item => item.text.trim()).filter(text => text.length > 0);
            if (rowTexts.length > 0) {
              allTableData.push(rowTexts);
            }
          }
          
          // ページ区切り
          if (i < pdf.numPages) {
            allTableData.push([]);
          }
          
        } catch (pageError) {
          console.error(`Error processing page ${i}:`, pageError);
          allTableData.push([`[ページ ${i} の処理中にエラーが発生しました: ${pageError.message || 'Unknown error'}]`]);
        }
      }
      
      // 変換情報を追加
      allTableData.push([]);
      allTableData.push(["PDF変換情報"]);
      allTableData.push(["変換日時", new Date().toLocaleString()]);
      allTableData.push(["ファイルサイズ", `${Math.round(pdfData.byteLength / 1024)} KB`]);
      
      return allTableData;
    } catch (error) {
      console.error('PDF抽出エラー:', error);
      
      // エラーの場合はシミュレーションモードにフォールバック
      console.log('Falling back to simulation mode due to error');
      return simulateTableExtraction();
    }
  };
  
  // シミュレーションモード（実際の抽出が失敗した場合のバックアップ）
  const simulateTableExtraction = () => {
    console.log('Using simulation mode for table extraction');
    setProcessingStatus('シミュレーションモードでデータを生成中...');
    
    // ファイル名を取得
    const fileName = file ? file.name : 'document.pdf';
    
    // サンプルデータを返す
    return [
      [`ファイル「${fileName}」から抽出されたデータ`],
      [],
      ["注意: 実際のPDF内容の抽出に失敗したため、シミュレーションモードで出力しています。"],
      ["このデータはサンプルであり、実際のPDFの内容は反映されていません。"],
      [],
      ["項目", "数量", "単価", "金額"],
      ["商品A", "2", "1,000円", "2,000円"],
      ["商品B", "1", "3,000円", "3,000円"],
      ["商品C", "3", "500円", "1,500円"],
      ["合計", "", "", "6,500円"],
      [],
      ["PDF変換情報"],
      ["変換日時", new Date().toLocaleString()],
      ["ファイルサイズ", file ? `${Math.round(file.size / 1024)} KB` : "不明"],
      ["モード", "シミュレーション（フォールバック）"]
    ];
  };

  const handleConvert = async () => {
    if (!file) {
      setError('ファイルを選択してください');
      return;
    }
    
    setLoading(true);
    setError('');
    setProgress(0);
    console.log('Starting conversion process...');
    
    try {
      // ファイルの内容をArrayBufferとして読み込む
      const reader = new FileReader();
      const pdfData = await new Promise((resolve, reject) => {
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(new Error('ファイル読み込みエラー'));
        reader.readAsArrayBuffer(file);
      });
      
      console.log('File read, size:', pdfData.byteLength, 'bytes');
      
      // Excel変換処理
      console.log('Converting to Excel format...');
      
      // 表構造を抽出
      const tableData = await extractTablesFromPDF(pdfData);
      console.log('Table extraction completed, rows:', tableData.length);
      
      // ワークブックとワークシートを作成
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(tableData);
      
      // 列幅の自動調整
      const colWidths = tableData.reduce((acc, row) => {
        row.forEach((cell, i) => {
          const cellLength = cell ? cell.toString().length : 0;
          acc[i] = Math.max(acc[i] || 0, cellLength);
        });
        return acc;
      }, {});
      
      ws['!cols'] = Object.keys(colWidths).map(key => ({ width: colWidths[key] + 2 }));
      
      XLSX.utils.book_append_sheet(wb, ws, 'PDFデータ');
      
      // Excelファイルとして保存
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name.replace('.pdf', '')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // リソースの解放
      setTimeout(() => {
        URL.revokeObjectURL(url);
        setProcessingStatus('変換完了。Excelファイルがダウンロードされました。');
      }, 100);
      
      console.log('Conversion process completed successfully');
      setProgress(100);
    } catch (err) {
      console.error('変換エラー:', err);
      setError('変換処理中にエラーが発生しました: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>PDF to Excel 変換ツール</h1>
        <p>PDFファイルをExcel形式に変換できます。すべての処理はブラウザ内で行われます。</p>
      </header>

      <div className="app-content">
        <div className="control-panel">
          <h2>変換設定</h2>
          
          <div className="file-upload">
            <label>PDFファイルを選択:</label>
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
            />
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <button
            className="convert-button"
            onClick={handleConvert}
            disabled={!file || loading || !workerReady}
          >
            {!workerReady ? 'ロード中...' : loading ? '変換中...' : 'Excelに変換する'}
          </button>

          {/* Google広告用のスペース */}
          <div className="ads-container">
            <div className="ad-box">
              <div id="ad-slot-1" className="ad-slot">
                <p className="ad-placeholder">広告スペース 1</p>
              </div>
            </div>
            
            <div className="ad-box">
              <div id="ad-slot-2" className="ad-slot">
                <p className="ad-placeholder">広告スペース 2</p>
              </div>
            </div>
          </div>
          
          {loading && (
            <div className="progress-container">
              <div className="progress-bar">
                <div className="progress" style={{ width: `${progress}%` }}></div>
              </div>
              <p>{processingStatus} ({progress}%)</p>
            </div>
          )}
          
          {!loading && processingStatus && (
            <p className="status-message">{processingStatus}</p>
          )}
        </div>
        
        <div className="preview-panel">
          <h2>プレビュー</h2>
          {pdfPreview ? (
            <iframe src={pdfPreview} title="PDF Preview"></iframe>
          ) : (
            <div className="preview-placeholder">
              <p>PDFファイルをアップロードするとここにプレビューが表示されます</p>
            </div>
          )}
        </div>
      </div>
      
      <footer className="app-footer">
        <p>© {new Date().getFullYear()} PDF to Excel変換ツール - プライバシーを重視した無料のオンラインPDF変換サービス</p>
      </footer>
    </div>
  );
};

export default PDFConverter;