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
  
  // PDF.jsのワーカー設定
  useEffect(() => {
    const pdfjsWorker = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
    console.log('Set PDF.js worker to:', pdfjsWorker);
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
  
  // PDFからの表構造抽出（実際の実装）
  const extractTablesFromPDF = async (pdfData) => {
    try {
      console.log('Starting actual PDF table extraction...');
      setProcessingStatus('PDFから表データを抽出中...');
      
      // PDFドキュメントをロード
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      console.log(`PDF loaded, pages: ${pdf.numPages}`);
      
      let allTableData = [];
      
      // ヘッダー行を追加
      allTableData.push([`ファイル「${file.name}」から抽出されたデータ`]);
      allTableData.push([`総ページ数: ${pdf.numPages}`]);
      allTableData.push([]);
      
      // 各ページから表構造を抽出
      for (let i = 1; i <= pdf.numPages; i++) {
        setProgress(Math.floor((i / pdf.numPages) * 100));
        setProcessingStatus(`表データ抽出中: ${i}/${pdf.numPages}ページ`);
        
        try {
          const page = await pdf.getPage(i);
          
          // ページ情報を追加
          allTableData.push([`--- ページ ${i} ---`]);
          
          const textContent = await page.getTextContent();
          
          // テキスト項目を位置情報付きで取得
          const textItems = textContent.items.map(item => ({
            text: item.str,
            x: Math.round(item.transform[4]),
            y: Math.round(item.transform[5]),
            height: Math.round(item.height),
            width: Math.round(item.width)
          }));
          
          if (textItems.length === 0) {
            allTableData.push(["このページにはテキストが含まれていません"]);
            continue;
          }
          
          // Y座標でグループ化して行を形成（同じ行にあるテキストアイテムをグループ化）
          const rows = {};
          const yTolerance = 5; // 同じ行と見なす高さの許容差
          
          textItems.forEach(item => {
            // 空のテキストはスキップ
            if (!item.text.trim()) return;
            
            // 近似Y座標を計算して同じ行のアイテムをグループ化
            const roundedY = Math.round(item.y / yTolerance) * yTolerance;
            if (!rows[roundedY]) {
              rows[roundedY] = [];
            }
            rows[roundedY].push(item);
          });
          
          // Y座標でソートして行順を維持
          const sortedYCoordinates = Object.keys(rows).sort((a, b) => b - a); // 降順（PDFは下から上に座標が増える）
          
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
          console.error(`Error extracting from page ${i}:`, pageError);
          allTableData.push([`[ページ ${i} の抽出中にエラーが発生しました]`]);
        }
      }
      
      // 変換情報を追加
      allTableData.push([]);
      allTableData.push(["PDF変換情報"]);
      allTableData.push(["変換日時", new Date().toLocaleString()]);
      allTableData.push(["ファイルサイズ", `${Math.round(pdfData.byteLength / 1024)} KB`]);
      
      return allTableData;
    } catch (error) {
      console.error('PDF表抽出エラー:', error);
      
      // エラーが発生した場合はエラーメッセージを含むデータを返す
      return [
        ["PDF抽出エラーが発生しました"],
        ["エラー内容", error.message || String(error)],
        ["ファイル名", file ? file.name : "不明"],
        ["変換日時", new Date().toLocaleString()]
      ];
    }
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
            disabled={!file || loading}
          >
            {loading ? '変換中...' : 'Excelに変換する'}
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