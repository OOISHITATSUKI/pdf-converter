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
  
  // PDFからの表構造抽出（シミュレーション版）
  const extractTablesFromPDF = async (pdfData) => {
    try {
      console.log('Starting table extraction simulation...');
      setProcessingStatus('PDFから表データを抽出中...');
      
      // 進行状況をシミュレート
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        setProgress(i);
      }
      
      // ファイル名を取得
      const fileName = file ? file.name : 'document.pdf';
      
      // サンプルデータを返す
      return [
        [`ファイル「${fileName}」から抽出されたデータ`],
        [],
        ["項目", "数量", "単価", "金額"],
        ["商品A", "2", "1,000円", "2,000円"],
        ["商品B", "1", "3,000円", "3,000円"],
        ["商品C", "3", "500円", "1,500円"],
        ["合計", "", "", "6,500円"],
        [],
        ["注記", "このデータはシミュレーションによるもので、実際のPDFの内容は反映されていません。"],
        ["PDF変換日時", new Date().toLocaleString()],
        ["ファイルサイズ", file ? `${Math.round(file.size / 1024)} KB` : "不明"]
      ];
    } catch (error) {
      console.error('表データ抽出エラー:', error);
      setError('表データ抽出中にエラーが発生しました');
      throw error;
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