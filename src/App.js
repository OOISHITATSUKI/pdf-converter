import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';

import './App.css'; // 標準のスタイルシートを使用

const PDFConverter = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [conversionType, setConversionType] = useState('text');
  const [useOcr, setUseOcr] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [pdfPreview, setPdfPreview] = useState(null);
  
  // PDF.jsのワーカー設定
  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  }, []);
  
  // ファイルアップロード時の処理
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError('');
      
      // ファイルプレビューの作成
      const fileUrl = URL.createObjectURL(selectedFile);
      setPdfPreview(fileUrl);
      
      // セキュリティ通知
      setProcessingStatus('ファイルはブラウザ内で処理され、サーバーにアップロードされません。');
    } else if (selectedFile) {
      setFile(null);
      setPdfPreview(null);
      setError('PDFファイルのみ対応しています。別の形式のファイルが選択されました。');
    }
  };
  
  // コンポーネントのアンマウント時にリソースを解放
  useEffect(() => {
    return () => {
      if (pdfPreview) {
        URL.revokeObjectURL(pdfPreview);
      }
    };
  }, [pdfPreview]);
  
  // OCRを使用したテキスト抽出（実際の実装）
  const extractTextWithOCR = async (pdfData) => {
    try {
      setProcessingStatus('OCRでテキストを抽出中...');
      
      // PDFドキュメントをロード
      const loadingTask = pdfjsLib.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;
      
      let fullText = '';
      const totalPages = pdf.numPages;
      
      // Tesseract.jsワーカーを作成
      const worker = await createWorker('eng');
      
      // 各ページを処理
      for (let i = 1; i <= totalPages; i++) {
        // 進捗状況の更新（OCRはページごとに20%ずつ進行）
        const pageProgressBase = ((i - 1) / totalPages) * 100;
        setProgress(Math.floor(pageProgressBase));
        setProcessingStatus(`OCR処理中: ${i}/${totalPages}ページ...`);
        
        // ページをレンダリング
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 }); // 高解像度でレンダリング
        
        // キャンバス要素の作成
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // ページをキャンバスにレンダリング
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
        
        // キャンバスからデータURLを取得
        const dataUrl = canvas.toDataURL('image/png');
        
        // OCRでテキスト認識
        const { data } = await worker.recognize(dataUrl);
        fullText += data.text + '\n\n';
        
        // 各ページ完了後の進捗更新
        setProgress(Math.floor(pageProgressBase + (1 / totalPages) * 50));
      }
      
      // ワーカーを終了
      await worker.terminate();
      
      return fullText;
    } catch (error) {
      console.error('OCR抽出エラー:', error);
      setError('OCR処理中にエラーが発生しました');
      throw error;
    }
  };
  
  // 通常のPDFからのテキスト抽出（実際の実装）
  const extractTextFromPDF = async (pdfData) => {
    try {
      setProcessingStatus('PDFからテキストを抽出中...');
      
      // PDFドキュメントをロード
      const loadingTask = pdfjsLib.getDocument({ data: pdfData });
      const pdf = await loadingTask.promise;
      
      let fullText = '';
      
      // 各ページからテキストを抽出
      for (let i = 1; i <= pdf.numPages; i++) {
        // 進捗状況を更新
        setProgress(Math.floor((i / pdf.numPages) * 100));
        
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        
        fullText += pageText + '\n\n';
      }
      
      return fullText;
    } catch (error) {
      console.error('PDFテキスト抽出エラー:', error);
      setError('PDFテキスト抽出中にエラーが発生しました');
      throw error;
    }
  };
  
  // テキストへの変換処理
  const convertToText = async (pdfData) => {
    try {
      let text;
      
      // OCRの使用有無に応じて処理を分岐
      if (useOcr) {
        text = await extractTextWithOCR(pdfData);
      } else {
        text = await extractTextFromPDF(pdfData);
      }
      
      // テキストファイルとして保存
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name.replace('.pdf', '')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // セキュリティ対策：URLオブジェクトを解放
      setTimeout(() => {
        URL.revokeObjectURL(url);
        setProcessingStatus('変換完了。ファイルは自動的にダウンロードされました。ブラウザ内で処理され、サーバーには保存されていません。');
      }, 100);
      
      return true;
    } catch (err) {
      console.error('テキスト変換エラー:', err);
      setError('テキスト変換に失敗しました');
      return false;
    }
  };
  
  // Excelへの変換処理
  const convertToExcel = async (pdfData) => {
    try {
      setProcessingStatus('Excel形式に変換中...');
      
      // テキストを抽出（OCRの使用有無で分岐）
      let text;
      if (useOcr) {
        text = await extractTextWithOCR(pdfData);
      } else {
        text = await extractTextFromPDF(pdfData);
      }
      
      // テキストを行に分割
      const lines = text.split('\n').filter(line => line.trim() !== '');
      
      // 行をセルに分割（タブまたはスペースで区切る）
      const data = lines.map(line => {
        // タブ区切りか、複数スペース区切りでセルを分割
        const cells = line.split(/\t+|\s{2,}/);
        return cells;
      });
      
      // ワークブックとワークシートを作成
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      
      // Excelファイルとして保存
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name.replace('.pdf', '')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // セキュリティ対策：URLオブジェクトを解放
      setTimeout(() => {
        URL.revokeObjectURL(url);
        setProcessingStatus('変換完了。ファイルは自動的にダウンロードされました。ブラウザ内で処理され、サーバーには保存されていません。');
      }, 100);
      
      return true;
    } catch (err) {
      console.error('Excel変換エラー:', err);
      setError('Excel変換に失敗しました');
      return false;
    }
  };
  
  // Wordへの変換処理
  const convertToWord = async (pdfData) => {
    try {
      setProcessingStatus('Word形式に変換中...');
      
      // テキストを抽出（OCRの使用有無で分岐）
      let text;
      if (useOcr) {
        text = await extractTextWithOCR(pdfData);
      } else {
        text = await extractTextFromPDF(pdfData);
      }
      
      // HTMLに変換（簡易的なフォーマット）
      const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${file.name.replace('.pdf', '')}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.5; }
          p { margin-bottom: 0.8em; }
        </style>
      </head>
      <body>
        ${text.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '').join('')}
      </body>
      </html>`;
      
      // DocxファイルとしてエクスポートするためのBlob作成
      const blob = new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name.replace('.pdf', '')}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // セキュリティ対策：URLオブジェクトを解放
      setTimeout(() => {
        URL.revokeObjectURL(url);
        setProcessingStatus('変換完了。ファイルは自動的にダウンロードされました。ブラウザ内で処理され、サーバーには保存されていません。');
      }, 100);
      
      return true;
    } catch (err) {
      console.error('Word変換エラー:', err);
      setError('Word変換に失敗しました');
      return false;
    }
  };
  
  // 変換処理の実行
  const handleConvert = async () => {
    if (!file) {
      setError('ファイルを選択してください');
      return;
    }
    
    setLoading(true);
    setError('');
    setProgress(0);
    
    try {
      // セキュリティメッセージを表示
      setProcessingStatus('ファイルを処理中...すべての処理はブラウザ内で実行され、データはサーバーに送信されません。');
      
      // ファイルを読み込む
      const fileReader = new FileReader();
      
      fileReader.onload = async (e) => {
        const pdfData = e.target.result;
        let success = false;
        
        // 選択された変換タイプに基づいて処理
        switch (conversionType) {
          case 'text':
            success = await convertToText(pdfData);
            break;
          case 'excel':
            success = await convertToExcel(pdfData);
            break;
          case 'word':
            success = await convertToWord(pdfData);
            break;
          default:
            setError('不正な変換タイプです');
        }
        
        if (success) {
          setProgress(100);
        }
        
        setLoading(false);
      };
      
      fileReader.onerror = () => {
        setError('ファイル読み込みエラー');
        setLoading(false);
      };
      
      fileReader.readAsArrayBuffer(file);
      
    } catch (err) {
      console.error('変換エラー:', err);
      setError('変換処理中にエラーが発生しました');
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>PDF変換ツール</h1>
        <p>PDFファイルをテキスト、Excel、Word形式に変換できます。すべての処理はブラウザ内で行われます。</p>
      </header>

      <div className="app-content">
        <div className="control-panel">
          <h2>変換設定</h2>
          
          <div className="conversion-type">
            <label>変換形式を選択:</label>
            <div className="type-buttons">
              <button 
                className={conversionType === 'text' ? 'active' : ''} 
                onClick={() => setConversionType('text')}
              >
                テキスト
              </button>
              <button 
                className={conversionType === 'excel' ? 'active' : ''} 
                onClick={() => setConversionType('excel')}
              >
                Excel
              </button>
              <button 
                className={conversionType === 'word' ? 'active' : ''} 
                onClick={() => setConversionType('word')}
              >
                Word
              </button>
            </div>
          </div>
          
          <div className="ocr-option">
            <label>
              <input
                type="checkbox"
                checked={useOcr}
                onChange={() => setUseOcr(!useOcr)}
              />
              OCRを使用する (スキャンされたPDFや画像を含むPDF)
            </label>
          </div>
          
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
            {loading ? '変換中...' : '変換する'}
          </button>

          {/* Google広告用のスペース */}
          <div className="ads-container">
            <div className="ad-box">
              {/* 広告1のコード */}
              <div id="ad-slot-1" className="ad-slot">
                <p className="ad-placeholder">広告スペース 1</p>
              </div>
            </div>
            
            <div className="ad-box">
              {/* 広告2のコード */}
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
        <p>© {new Date().getFullYear()} PDF変換ツール - プライバシーを重視した無料のオンラインPDF変換サービス</p>
      </footer>
    </div>
  );
};

export default PDFConverter;