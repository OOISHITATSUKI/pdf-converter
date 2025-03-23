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

  useEffect(() => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  }, []);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setPdfPreview(URL.createObjectURL(selectedFile));
      setProcessingStatus('ファイルはブラウザ内で処理されます。');
      setError('');
    } else {
      setFile(null);
      setPdfPreview(null);
      setError('PDFファイルのみ対応しています。');
    }
  };

  const extractTextWithOCR = async (pdfData) => {
    setProcessingStatus('OCRでテキストを抽出中...');
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfData) }).promise;

    const worker = await createWorker({ logger: m => setProgress(Math.floor(m.progress * 100)) });
    await worker.loadLanguage('jpn+eng');
    await worker.initialize('jpn+eng');

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      setProcessingStatus(`OCR処理中: ${i}/${pdf.numPages}ページ`);

      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

      const { data: { text } } = await worker.recognize(canvas);
      fullText += text + '\n\n';
      setProgress(Math.floor((i / pdf.numPages) * 100));
    }

    await worker.terminate();
    return fullText;
  };

  const extractTextFromPDF = async (pdfData) => {
    setProcessingStatus('PDFからテキストを抽出中...');
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(pdfData) }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      setProcessingStatus(`テキスト抽出中: ${i}/${pdf.numPages}ページ`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map(item => item.str).join(' ') + '\n\n';
      setProgress(Math.floor((i / pdf.numPages) * 100));
    }

    return fullText;
  };

  const handleConvert = async () => {
    if (!file) {
      setError('ファイルを選択してください');
      return;
    }

    setLoading(true);
    setProgress(0);
    setProcessingStatus('ファイルを処理中です。');
    setError('');

    try {
      const pdfData = await file.arrayBuffer();
      const extractedText = useOcr ? await extractTextWithOCR(pdfData) : await extractTextFromPDF(pdfData);

      let blob, extension;
      switch (conversionType) {
        case 'text':
          blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
          extension = 'txt';
          break;
        case 'excel':
          const rows = extractedText.split('\n').map(line => line.split(/\t+|\s{2,}/));
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
          blob = new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          extension = 'xlsx';
          break;
        case 'word':
          const html = extractedText.split('\n').map(p => `<p>${p}</p>`).join('');
          blob = new Blob([`<html><body>${html}</body></html>`], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
          extension = 'docx';
          break;
        default:
          throw new Error('無効な変換タイプ');
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${file.name.replace('.pdf', '')}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setProcessingStatus('変換が完了しました。');
    } catch (err) {
      setError('変換エラー: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* UIはそのまま保持 */}
      {/* 省略 */}
    </div>
  );
};

export default PDFConverter;
