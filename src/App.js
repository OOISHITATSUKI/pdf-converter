import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';

import './App.css'; // スタイルシート

const PDFConverter = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [conversionType, setConversionType] = useState('text');
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

  // PDFからのテキスト抽出（実際の実装）
  const extractTextFromPDF = async (pdfData) => {
    try {
      console.log('Starting text extraction from PDF...');
      setProcessingStatus('PDFからテキストを抽出中...');
      
      // PDFドキュメントをロード
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      console.log(`PDF loaded, pages: ${pdf.numPages}`);
      
      let fullText = '';
      
      // 各ページからテキストを抽出
      for (let i = 1; i <= pdf.numPages; i++) {
        setProgress(Math.floor((i / pdf.numPages) * 100));
        setProcessingStatus(`テキスト抽出中: ${i}/${pdf.numPages}ページ`);
        
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map(item => item.str)
            .join(' ')
            .replace(/\s+/g, ' '); // 余分な空白を削除
          
          fullText += pageText + '\n\n';
          console.log(`Extracted text from page ${i}, length: ${pageText.length} chars`);
        } catch (pageError) {
          console.error(`Error extracting text from page ${i}:`, pageError);
          fullText += `[Page ${i} text extraction failed]\n\n`;
        }
      }
      
      return fullText;
    } catch (error) {
      console.error('PDFテキスト抽出エラー:', error);
      
      // フォールバック：エラーが発生した場合は基本的なテキストを返す
      return "PDF抽出エラー: " + error.message + 
        "\n\nPDFが保護されているか、テキストレイヤーがない可能性があります。";
    }
  };
  
  // PDFからの表構造抽出（Excel用）
  const extractTablesFromPDF = async (pdfData) => {
    try {
      console.log('Starting table extraction from PDF...');
      setProcessingStatus('PDFから表データを抽出中...');
      
      // PDFドキュメントをロード
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      console.log(`PDF loaded, pages: ${pdf.numPages}`);
      
      let tableData = [];
      
      // 各ページから表構造を抽出
      for (let i = 1; i <= pdf.numPages; i++) {
        setProgress(Math.floor((i / pdf.numPages) * 100));
        setProcessingStatus(`表データ抽出中: ${i}/${pdf.numPages}ページ`);
        
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          
          // テキスト項目を位置情報付きで取得
          const textItems = textContent.items.map(item => ({
            text: item.str,
            x: item.transform[4], // X座標
            y: item.transform[5], // Y座標
            height: item.height,
            width: item.width
          }));
          
          // Y座標でグループ化して行を形成（同じ行にあるテキストアイテムをグループ化）
          const rows = {};
          const yTolerance = 3; // 同じ行と見なす高さの許容差
          
          textItems.forEach(item => {
            // 近似Y座標を計算して同じ行のアイテムをグループ化
            const roundedY = Math.round(item.y / yTolerance) * yTolerance;
            if (!rows[roundedY]) {
              rows[roundedY] = [];
            }
            rows[roundedY].push(item);
          });
          
          // Y座標でソートして行順を維持
          const sortedYCoordinates = Object.keys(rows).sort((a, b) => b - a); // 降順（PDFは下から上に座標が増える）
          
          // 各行をX座標でソートして列順を維持
          sortedYCoordinates.forEach(y => {
            rows[y].sort((a, b) => a.x - b.x);
            
            // テキストのみの配列に変換
            const rowTexts = rows[y].map(item => item.text.trim()).filter(text => text.length > 0);
            if (rowTexts.length > 0) {
              tableData.push(rowTexts);
            }
          });
          
          console.log(`Extracted table data from page ${i}, rows: ${Object.keys(rows).length}`);
        } catch (pageError) {
          console.error(`Error extracting table from page ${i}:`, pageError);
          tableData.push([`[Page ${i} extraction failed]`]);
        }
      }
      
      return tableData;
    } catch (error) {
      console.error('PDF表抽出エラー:', error);
      
      // フォールバック：エラーが発生した場合
      return [["PDF表抽出エラー: " + error.message]];
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
      
      if (conversionType === 'text') {
        // テキスト変換処理
        console.log('Converting to text format...');
        const extractedText = await extractTextFromPDF(pdfData);
        console.log('Text extraction completed, length:', extractedText.length);
        
        // テキストファイルとして保存
        const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${file.name.replace('.pdf', '')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // リソースの解放
        setTimeout(() => {
          URL.revokeObjectURL(url);
          setProcessingStatus('変換完了。テキストファイルがダウンロードされました。');
        }, 100);
      } else if (conversionType === 'excel') {
        // Excel変換処理
        console.log('Converting to Excel format...');
        
        // 表構造を抽出
        const tableData = await extractTablesFromPDF(pdfData);
        console.log('Table extraction completed, rows:', tableData.length);
        
        // ワークブックとワークシートを作成
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(tableData);
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
      }
      
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
        <h1>PDF変換ツール</h1>
        <p>PDFファイルをテキストやExcel形式に変換できます。すべての処理はブラウザ内で行われます。</p>
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
            </div>
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