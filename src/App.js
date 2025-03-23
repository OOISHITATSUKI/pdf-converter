import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';

import './App.css'; // スタイルシート

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
    console.log('PDF.js version:', pdfjsLib.version);
    const workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    console.log('Setting worker src to:', workerSrc);
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
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

  const extractTextWithOCR = async (pdfData) => {
    try {
      console.log('Starting OCR extraction...');
      setProcessingStatus('OCRでテキストを抽出中...');
      
      // PDFドキュメントをロード
      console.log('Loading PDF document for OCR...');
      const pdf = await pdfjsLib.getDocument(new Uint8Array(pdfData)).promise;
      console.log('PDF loaded, pages:', pdf.numPages);
      
      let fullText = '';
      
      // Tesseract.jsワーカーを作成
      console.log('Initializing Tesseract worker...');
      const worker = await createWorker('eng');
      console.log('Tesseract worker initialized');
      
      // 各ページを処理
      for (let i = 1; i <= pdf.numPages; i++) {
        console.log(`Processing page ${i}/${pdf.numPages}`);
        const pageProgressBase = ((i - 1) / pdf.numPages) * 100;
        setProgress(Math.floor(pageProgressBase));
        setProcessingStatus(`OCR処理中: ${i}/${pdf.numPages}ページ...`);
        
        // ページをレンダリング
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 }); // 高解像度でレンダリング
        
        // キャンバス要素の作成
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // ページをキャンバスにレンダリング
        console.log('Rendering page to canvas...');
        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;
        
        // キャンバスからデータURLを取得
        const dataUrl = canvas.toDataURL('image/png');
        
        // OCRでテキスト認識
        console.log('Running OCR on page image...');
        const { data } = await worker.recognize(dataUrl);
        console.log('OCR completed for page');
        fullText += data.text + '\n\n';
        
        // 各ページ完了後の進捗更新
        setProgress(Math.floor(pageProgressBase + (1 / pdf.numPages) * 100));
      }
      
      // ワーカーを終了
      console.log('Terminating Tesseract worker...');
      await worker.terminate();
      console.log('OCR extraction completed');
      
      return fullText;
    } catch (error) {
      console.error('OCR抽出エラー:', error);
      setError('OCR処理中にエラーが発生しました: ' + error.message);
      throw error;
    }
  };

  const extractTextFromPDF = async (pdfData) => {
    try {
      console.log('Starting text extraction from PDF...');
      setProcessingStatus('PDFからテキストを抽出中...');
      
      // PDFドキュメントをロード
      console.log('Loading PDF document...');
      const pdf = await pdfjsLib.getDocument(new Uint8Array(pdfData)).promise;
      console.log('PDF loaded, pages:', pdf.numPages);
      
      let fullText = '';
      
      // 各ページからテキストを抽出
      for (let i = 1; i <= pdf.numPages; i++) {
        console.log(`Extracting text from page ${i}/${pdf.numPages}`);
        setProgress(Math.floor((i / pdf.numPages) * 100));
        setProcessingStatus(`テキスト抽出中: ${i}/${pdf.numPages}ページ`);
        
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        
        fullText += pageText + '\n\n';
      }
      
      console.log('Text extraction completed');
      return fullText;
    } catch (error) {
      console.error('PDFテキスト抽出エラー:', error);
      setError('PDFテキスト抽出中にエラーが発生しました: ' + error.message);
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
      // ファイルをArrayBufferとして読み込む
      console.log('Reading file as ArrayBuffer...');
      const pdfData = await file.arrayBuffer();
      console.log('File read, size:', pdfData.byteLength, 'bytes');
      
      // テキスト抽出
      let extractedText;
      if (useOcr) {
        extractedText = await extractTextWithOCR(pdfData);
      } else {
        extractedText = await extractTextFromPDF(pdfData);
      }
      console.log('Text extraction completed, length:', extractedText.length);
      
      // 選択された形式に変換
      let blob, extension;
      switch (conversionType) {
        case 'text':
          console.log('Converting to text format...');
          blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
          extension = 'txt';
          break;
          
        case 'excel':
          console.log('Converting to Excel format...');
          // テキストを行に分割
          const lines = extractedText.split('\n').filter(line => line.trim() !== '');
          
          // 行をセルに分割
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
          blob = new Blob([excelBuffer], { 
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
          });
          extension = 'xlsx';
          break;
          
        case 'word':
          console.log('Converting to Word format...');
          // HTMLに変換
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
            ${extractedText.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '').join('')}
          </body>
          </html>`;
          
          blob = new Blob([html], { 
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
          });
          extension = 'docx';
          break;
          
        default:
          throw new Error('不正な変換タイプです');
      }
      
      // ファイルのダウンロード
      console.log('Creating download for converted file...');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name.replace('.pdf', '')}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      // リソースの解放
      setTimeout(() => {
        URL.revokeObjectURL(url);
        setProcessingStatus('変換完了。ファイルは自動的にダウンロードされました。');
        console.log('Conversion process completed successfully');
      }, 100);
      
      setProgress(100);
    } catch (err) {
      console.error('変換エラー:', err);
      setError('変換処理中にエラーが発生しました: ' + err.message);
    } finally {
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
        <p>© {new Date().getFullYear()} PDF変換ツール - プライバシーを重視した無料のオンラインPDF変換サービス</p>
      </footer>
    </div>
  );
};

export default PDFConverter;