// App.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import './App.css';

// PDF Workerのベースパス - publicフォルダにコピーされることを前提
const PDF_WORKER_BASE_URL = `${process.env.PUBLIC_URL || ''}/pdf-worker`;

const PDFConverter = () => {
  // 状態の定義
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [processingStatus, setProcessingStatus] = useState('');
  const [pdfPreview, setPdfPreview] = useState(null);
  const [workerReady, setWorkerReady] = useState(false);
  const [conversionSuccess, setConversionSuccess] = useState(false);
  const [showSupportedInfo, setShowSupportedInfo] = useState(false);
  const [lastExcelUrl, setLastExcelUrl] = useState(null);
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [processingLogs, setProcessingLogs] = useState([]);
  const [showDetailedLogs, setShowDetailedLogs] = useState(false);
  const [workerVersion, setWorkerVersion] = useState('');
  
  const fileInputRef = useRef(null);
  const processingLogRef = useRef([]);
  
  // 処理ログの追加関数
  const addLog = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `${timestamp}: ${message}`;
    console.log(logMessage);
    
    processingLogRef.current = [...processingLogRef.current, logMessage];
    setProcessingLogs(processingLogRef.current);
  }, []);
  
  // PDF.jsのワーカー設定 - 複数の方法を試みる
  useEffect(() => {
    const setupWorker = async () => {
      addLog('PDF.jsワーカーの設定を開始します');
      
      try {
        // workerSrcの現在の値を確認
        const currentWorkerSrc = pdfjsLib.GlobalWorkerOptions.workerSrc;
        addLog(`現在のワーカーパス: ${currentWorkerSrc || 'なし'}`);
        
        // 方法1: プロジェクトにバンドルされたワーカーを使用（推奨）
        try {
          const pdfjsWorker = `${PDF_WORKER_BASE_URL}/pdf.worker.min.js`;
          pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
          addLog(`バンドルされたワーカーを設定: ${pdfjsWorker}`);
          
          // ワーカーの初期化を確認
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // バージョン確認
          const version = pdfjsLib.version;
          setWorkerVersion(version);
          addLog(`PDF.jsバージョン: ${version}`);
          
          setWorkerReady(true);
          return;
        } catch (bundleErr) {
          addLog(`バンドルワーカー設定失敗: ${bundleErr.message}`);
        }
        
        // 方法2: CDNを使用（フォールバック1）
        try {
          // ライブラリのバージョンに合わせる
          const version = pdfjsLib.version || '2.14.305';
          const pdfjsWorker = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.js`;
          pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
          addLog(`CDNワーカーを設定: ${pdfjsWorker}`);
          
          // ワーカーの初期化を確認
          await new Promise(resolve => setTimeout(resolve, 1000));
          setWorkerReady(true);
          return;
        } catch (cdnErr) {
          addLog(`CDNワーカー設定失敗: ${cdnErr.message}`);
        }
        
        // 方法3: インラインワーカーを使用（フォールバック2）
        try {
          const version = '2.14.305'; // 安定版
          const workerScript = `importScripts('https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.js');`;
          const blob = new Blob([workerScript], { type: 'application/javascript' });
          const workerUrl = URL.createObjectURL(blob);
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
          addLog(`インラインワーカーを設定: Blob URL使用`);
          
          // クリーンアップ関数を設定
          const cleanup = () => {
            URL.revokeObjectURL(workerUrl);
            addLog('インラインワーカーのBlobを解放');
          };
          
          // 初期化確認
          await new Promise(resolve => setTimeout(resolve, 1000));
          setWorkerReady(true);
          return;
        } catch (inlineErr) {
          addLog(`インラインワーカー設定失敗: ${inlineErr.message}`);
        }
        
        // 方法4: ワーカーなしモード（最終フォールバック）
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
        addLog('ワーカーなしモードにフォールバック');
        setWorkerReady(true);
      } catch (err) {
        addLog(`ワーカー設定中のエラー: ${err.message}`);
        setWorkerReady(true); // UIをブロックしないために有効化
      }
    };
    
    setupWorker();
    
    // ワーカー設定のステータスチェック
    const checkWorkerStatus = setTimeout(() => {
      if (!workerReady) {
        addLog('ワーカー設定タイムアウト - UIを有効化');
        setWorkerReady(true);
      }
    }, 5000); // 5秒後にタイムアウト
    
    return () => {
      clearTimeout(checkWorkerStatus);
      // リソースの解放
      if (pdfPreview) {
        URL.revokeObjectURL(pdfPreview);
      }
      if (lastExcelUrl) {
        URL.revokeObjectURL(lastExcelUrl);
      }
    };
  }, [addLog]);

  // ファイル選択ハンドラー
  const handleFileChange = useCallback((e) => {
    const selectedFile = e.target.files?.[0] || null;
    
    // 以前のファイルに関するリソースを解放
    if (pdfPreview) {
      URL.revokeObjectURL(pdfPreview);
      setPdfPreview(null);
    }
    
    if (selectedFile && selectedFile.type === 'application/pdf') {
      addLog(`PDFファイル選択: ${selectedFile.name} (${Math.round(selectedFile.size / 1024)} KB)`);
      setFile(selectedFile);
      
      // ファイルプレビューの作成
      const fileUrl = URL.createObjectURL(selectedFile);
      setPdfPreview(fileUrl);
      
      setProcessingStatus('ファイルはブラウザ内で処理され、サーバーにアップロードされません。');
      setError('');
      setConversionSuccess(false);
      setIsSimulationMode(false);
      setProgress(0);
      processingLogRef.current = [];
      setProcessingLogs([]);
    } else if (selectedFile) {
      setFile(null);
      setPdfPreview(null);
      setError('PDFファイルのみ対応しています。別の形式のファイルが選択されました。');
      addLog('非PDFファイルが選択されました');
    }
  }, [pdfPreview, addLog]);
  
  // ドラッグ&ドロップハンドラー
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf') {
        const input = fileInputRef.current;
        // FileInputに設定するためのDataTransferオブジェクトを作成
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(droppedFile);
        input.files = dataTransfer.files;
        handleFileChange({ target: input });
      } else {
        setError('PDFファイルのみ対応しています。');
        addLog('ドラッグ&ドロップ: 非PDFファイルがドロップされました');
      }
    }
  }, [handleFileChange, addLog]);
  
  // ドラッグオーバーハンドラー
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  
  // 同じ行と見なすY座標の許容差を動的に計算
  const calculateYTolerance = useCallback((textItems) => {
    if (!textItems || textItems.length < 10) return 5; // デフォルト値
    
    // Y座標の差分を収集
    const yDiffs = [];
    const sortedItems = [...textItems].sort((a, b) => a.y - b.y);
    
    for (let i = 1; i < sortedItems.length; i++) {
      const diff = Math.abs(sortedItems[i].y - sortedItems[i-1].y);
      if (diff > 0 && diff < 20) { // 極端な値を除外
        yDiffs.push(diff);
      }
    }
    
    if (yDiffs.length === 0) return 5;
    
    // 最も頻繁に見られる差分を特定（行間隔の推定）
    const diffCounts = {};
    yDiffs.forEach(diff => {
      const roundedDiff = Math.round(diff);
      diffCounts[roundedDiff] = (diffCounts[roundedDiff] || 0) + 1;
    });
    
    const mostCommonDiff = Object.entries(diffCounts)
      .sort((a, b) => b[1] - a[1])[0][0];
    
    return Math.max(3, Math.ceil(parseInt(mostCommonDiff) * 0.3));
  }, []);
  
  // X座標に基づいて列の境界を推定
  const estimateColumnBoundaries = useCallback((rows) => {
    // すべてのテキスト項目のX座標を収集
    const allXPositions = [];
    Object.values(rows).forEach(row => {
      row.forEach(item => {
        allXPositions.push(item.x);
        // 項目の終了位置も考慮
        if (item.width) {
          allXPositions.push(item.x + item.width);
        }
      });
    });
    
    // X座標をソートして重複を削除
    const uniqueXPositions = [...new Set(allXPositions)].sort((a, b) => a - b);
    
    // 近接する値をクラスタリング
    const xClusters = [];
    const xThreshold = 10; // クラスタリングの許容差
    
    uniqueXPositions.forEach(x => {
      const existingCluster = xClusters.find(
        cluster => Math.abs(cluster.avg - x) <= xThreshold
      );
      
      if (existingCluster) {
        existingCluster.positions.push(x);
        existingCluster.avg = existingCluster.positions.reduce((sum, pos) => sum + pos, 0) / 
                              existingCluster.positions.length;
      } else {
        xClusters.push({
          positions: [x],
          avg: x
        });
      }
    });
    
    // クラスターの平均値を列の境界として使用
    return xClusters.map(cluster => cluster.avg).sort((a, b) => a - b);
  }, []);
  
  // PDFからの表構造抽出
  const extractTablesFromPDF = useCallback(async (pdfData) => {
    try {
      addLog('PDF抽出処理を開始します');
      setProcessingStatus('PDFからデータを抽出中...');
      setIsSimulationMode(false);
      
      if (!workerReady) {
        addLog('ワーカーが準備できていません。シミュレーションモードを使用します');
        setIsSimulationMode(true);
        return simulateTableExtraction();
      }
      
      // PDFドキュメントをロード
      const loadingTask = pdfjsLib.getDocument({ data: pdfData });
      
      // 読み込みタイムアウトの設定（20秒）
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('PDF読み込みがタイムアウトしました')), 20000)
      );
      
      addLog('PDFドキュメントの読み込みを開始します');
      
      // タイムアウトか読み込み完了のどちらか早い方を採用
      const pdf = await Promise.race([
        loadingTask.promise,
        timeoutPromise
      ]);
      
      addLog(`PDF読み込み完了: ${pdf.numPages}ページ`);
      
      let allTableData = [];
      
      // ヘッダー行を追加
      allTableData.push([`ファイル「${file.name}」から抽出されたデータ`]);
      allTableData.push([`総ページ数: ${pdf.numPages}`]);
      allTableData.push([]);
      
      // 各ページから表構造を抽出
      for (let i = 1; i <= pdf.numPages; i++) {
        setProgress(Math.floor((i / pdf.numPages) * 100));
        setProcessingStatus(`データ抽出中: ${i}/${pdf.numPages}ページ`);
        addLog(`ページ ${i} の処理を開始`);
        
        try {
          // ページの取得（タイムアウト付き）
          const pagePromise = pdf.getPage(i);
          const page = await Promise.race([
            pagePromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('ページ読み込みタイムアウト')), 5000))
          ]);
          
          addLog(`ページ ${i} を読み込みました`);
          
          // ページ情報を追加
          allTableData.push([`--- ページ ${i} ---`]);
          
          // テキストコンテンツの取得（タイムアウト付き）
          const textContentPromise = page.getTextContent();
          const textContent = await Promise.race([
            textContentPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('テキスト抽出タイムアウト')), 5000))
          ]);
          
          if (!textContent || !textContent.items || textContent.items.length === 0) {
            addLog(`ページ ${i} にはテキストが含まれていないか、抽出できませんでした`);
            allTableData.push(["このページにはテキストが含まれていないか、抽出できませんでした"]);
            continue;
          }
          
          addLog(`ページ ${i} から ${textContent.items.length} 個のテキスト要素を抽出しました`);
          
          // テキスト項目を位置情報付きで取得
          const textItems = textContent.items
            .filter(item => item && item.str && item.transform)
            .map(item => {
              try {
                return {
                  text: item.str,
                  x: Math.round(item.transform[4] || 0),
                  y: Math.round(item.transform[5] || 0),
                  width: item.width || 0,
                  height: item.height || 0,
                  fontName: item.fontName,
                  fontSize: item.fontSize
                };
              } catch (e) {
                addLog(`テキスト項目の処理中にエラー: ${e.message}`);
                return null;
              }
            })
            .filter(item => item !== null);
          
          if (textItems.length === 0) {
            addLog(`ページ ${i} には有効なテキスト要素が見つかりませんでした`);
            allTableData.push(["このページには有効なテキスト要素が見つかりませんでした"]);
            continue;
          }
          
          // 動的に行の許容差を計算
          const yTolerance = calculateYTolerance(textItems);
          addLog(`ページ ${i} の行許容差: ${yTolerance}`);
          
          // Y座標でグループ化して行を形成
          const rows = {};
          
          textItems.forEach(item => {
            if (!item.text.trim()) return;
            
            // 近似Y座標を計算して同じ行のアイテムをグループ化
            const roundedY = Math.round(item.y / yTolerance) * yTolerance;
            if (!rows[roundedY]) {
              rows[roundedY] = [];
            }
            rows[roundedY].push(item);
          });
          
          // 列の境界を推定（X座標に基づいて）
          const columnBoundaries = estimateColumnBoundaries(rows);
          addLog(`推定された列数: ${columnBoundaries.length - 1}`);
          
          // Y座標でソート（PDFは下から上に座標が増えるため降順）
          const sortedYCoordinates = Object.keys(rows).sort((a, b) => b - a);
          
          // フォント特性を分析して見出しを検出
          const detectHeaders = (items) => {
            // フォントの頻度分析
            const fontCounts = {};
            items.forEach(item => {
              if (item.fontName) {
                fontCounts[item.fontName] = (fontCounts[item.fontName] || 0) + 1;
              }
            });
            
            // 最も一般的なフォントを特定
            const commonFonts = Object.entries(fontCounts)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 2)
              .map(entry => entry[0]);
            
            // 一般的でないフォントや大きいフォントサイズを使用しているアイテムを見出しの候補とする
            return items.some(item => 
              (item.fontName && !commonFonts.includes(item.fontName)) ||
              (item.fontSize && item.fontSize > 12) // 12ptより大きいフォントを見出しとみなす
            );
          };
          
          // 前回の行の列数
          let lastColumnCount = 0;
          
          // 各行をX座標でソートして列順を維持し、テーブルデータに追加
          for (const y of sortedYCoordinates) {
            rows[y].sort((a, b) => a.x - b.x);
            
            // テキストのみの配列に変換
            const rowTexts = rows[y].map(item => item.text.trim()).filter(text => text.length > 0);
            
            if (rowTexts.length > 0) {
              const isHeader = detectHeaders(rows[y]);
              
              // 空行を追加して表の構造を区切る（列数が大きく変わる場合）
              if (lastColumnCount > 0 && 
                  rowTexts.length > 1 && 
                  Math.abs(rowTexts.length - lastColumnCount) > 2) {
                allTableData.push([]);
              }
              
              // 見出し行の前に空行を挿入
              if (isHeader && allTableData.length > 0 && 
                  allTableData[allTableData.length-1].length > 0) {
                allTableData.push([]);
              }
              
              // データ行の追加
              allTableData.push(rowTexts);
              
              // 見出し行の後にも空行を挿入
              if (isHeader) {
                allTableData.push([]);
              }
              
              lastColumnCount = rowTexts.length;
            }
          }
          
          // ページ区切り
          if (i < pdf.numPages) {
            allTableData.push([]);
          }
          
          addLog(`ページ ${i} の処理が完了しました`);
          
        } catch (pageError) {
          addLog(`ページ ${i} の処理中にエラーが発生: ${pageError.message}`);
          allTableData.push([`[ページ ${i} の処理中にエラーが発生しました: ${pageError.message || '不明なエラー'}]`]);
        }
      }
      
      // 変換情報を追加
      allTableData.push([]);
      allTableData.push(["PDF変換情報"]);
      allTableData.push(["変換日時", new Date().toLocaleString()]);
      allTableData.push(["ファイルサイズ", `${Math.round(pdfData.byteLength / 1024)} KB`]);
      allTableData.push(["PDF.jsバージョン", pdfjsLib.version || 'N/A']);
      allTableData.push(["抽出モード", "実データ抽出"]);
      
      addLog('データ抽出完了');
      return allTableData;
    } catch (error) {
      addLog(`PDF抽出エラー: ${error.message}`);
      
      // エラーの場合はシミュレーションモードにフォールバック
      addLog('シミュレーションモードにフォールバック');
      setIsSimulationMode(true);
      return simulateTableExtraction();
    }
  }, [file, workerReady, addLog, calculateYTolerance, estimateColumnBoundaries]);
  
  // シミュレーションモード（実際の抽出が失敗した場合のバックアップ）
  const simulateTableExtraction = useCallback(() => {
    addLog('シミュレーションモードを使用');
    setProcessingStatus('シミュレーションモードでデータを生成中...');
    
    // ファイル名を取得
    const fileName = file ? file.name : 'document.pdf';
    
    // 日付文字列を安全に生成
    let dateStr = "";
    try {
      dateStr = new Date().toLocaleString();
    } catch (e) {
      dateStr = new Date().toString();
    }
    
    // ファイルサイズを安全に計算
    let fileSizeStr = "不明";
    if (file && typeof file.size === 'number') {
      try {
        fileSizeStr = `${Math.round(file.size / 1024)} KB`;
      } catch (e) {
        fileSizeStr = "計算エラー";
      }
    }
    
    addLog('シミュレーションデータ生成完了');
    
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
      ["変換日時", dateStr],
      ["ファイルサイズ", fileSizeStr],
      ["PDF.jsバージョン", pdfjsLib.version || 'N/A'],
      ["モード", "シミュレーション（フォールバック）"]
    ];
  }, [file, addLog]);

  // 変換処理の開始
  const handleConvert = useCallback(async () => {
    if (!file) {
      setError('ファイルを選択してください');
      return;
    }
    
    setLoading(true);
    setError('');
    setProgress(0);
    setConversionSuccess(false);
    setIsSimulationMode(false);
    processingLogRef.current = [];
    setProcessingLogs([]);
    addLog('変換処理を開始');
    
    // 以前のExcel URLがあれば解放
    if (lastExcelUrl) {
      URL.revokeObjectURL(lastExcelUrl);
      setLastExcelUrl(null);
    }
    
    try {
      // ファイルの内容をArrayBufferとして読み込む
      addLog('PDFファイルの読み込みを開始');
      const reader = new FileReader();
      const pdfData = await new Promise((resolve, reject) => {
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(new Error('ファイル読み込みエラー'));
        reader.readAsArrayBuffer(file);
      });
      
      addLog(`ファイル読み込み完了: ${Math.round(pdfData.byteLength / 1024)} KB`);
      
      // Excel変換処理
      addLog('Excel形式への変換を開始');
      
      // 表構造を抽出
      const tableData = await extractTablesFromPDF(pdfData);
      addLog(`テーブル抽出完了: ${tableData.length} 行のデータ`);
      
      // Excel生成処理を開始
      setProcessingStatus('Excelファイルの生成中...');
      
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
      setLastExcelUrl(url);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name.replace('.pdf', '')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      addLog('Excel変換完了、ファイルのダウンロードを開始');
      setProgress(100);
      setConversionSuccess(true);
      setProcessingStatus('変換完了。Excelファイルがダウンロードされました。');
      
    } catch (err) {
      addLog(`変換エラー: ${err.message}`);
      setError('変換処理中にエラーが発生しました: ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  }, [file, lastExcelUrl, extractTablesFromPDF, addLog]);
  
  // 変換済みファイルの再ダウンロード
  const handleRedownload = useCallback(() => {
    if (!lastExcelUrl || !file) return;
    
    addLog('Excelファイルの再ダウンロード');
    const a = document.createElement('a');
    a.href = lastExcelUrl;
    a.download = `${file.name.replace('.pdf', '')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [lastExcelUrl, file]);

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>PDF to Excel 変換ツール</h1>
        <p>PDFファイルをExcel形式に変換できます。すべての処理はブラウザ内で行われます。</p>
      </header>

      {workerVersion && (
        <div className="worker-info">
          <p>PDF.js バージョン: {workerVersion}</p>
        </div>
      )}

      <div className="app-content">
        <div className="control-panel">
          <h2>変換設定</h2>
          
          <div 
            className="file-upload-area" 
            onClick={() => fileInputRef.current.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <div className="file-icon">📄</div>
            <p>クリックまたはドラッグ＆ドロップでPDFファイルを選択</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileChange}
              className="hidden-input"
            />
            {file && (
              <div className="selected-file">
                <span className="file-name">{file.name}</span>
                <span className="file-size">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
              </div>
            )}
          </div>
          
          {error && (
            <div className="error-message">
              <span className="icon">⚠️</span>
              <span>{error}</span>
            </div>
          )}
          
          {isSimulationMode && (
            <div className="simulation-notice">
              <span className="icon">ℹ️</span>
              <span>
                <strong>注意:</strong> PDFの解析に問題が発生したため、シミュレーションモードを使用しています。
                実際のPDF内容は反映されていません。
              </span>
            </div>
          )}
          
          {conversionSuccess && (
            <div className="success-message">
              <span className="icon">✅</span>
              <span>変換に成功しました！Excelファイルをダウンロードしました。</span>
            </div>
          )}
          
          <div className="action-buttons">
            <button
              className="convert-button"
              onClick={handleConvert}
              disabled={!file || loading || !workerReady}
            >
              {!workerReady ? 'ロード中...' : loading ? '変換中...' : 'Excelに変換する'}
              {loading && <span className="spinner-icon">🔄</span>}
            </button>
            
            {conversionSuccess && (
              <button
                className="download-button"
                onClick={handleRedownload}
              >
                <span className="icon">⬇️</span>
                再ダウンロード
              </button>
            )}
          </div>
          
          <div className="support-info">
            <button 
              className="info-button"
              onClick={() => setShowSupportedInfo(!showSupportedInfo)}
            >
              <span className="icon">ℹ️</span>
              サポート対象PDFについて
            </button>
            
            {showSupportedInfo && (
              <div className="info-panel">
                <h3>対応PDFの種類</h3>
                <ul>
                  <li>テキストが含まれるPDF（画像化されたPDFは変換精度が下がります）</li>
                  <li>表形式のデータが含まれるPDF</li>
                  <li>複雑なレイアウトは正確に変換できない場合があります</li>
                </ul>
                <h3>変換のヒント</h3>
                <ul>
                  <li>シンプルな表構造のPDFが最適です</li>
                  <li>セル結合が少ないPDFの方が良好な結果が得られます</li>
                  <li>変換に失敗する場合は、PDFの品質や互換性に問題がある可能性があります</li>
                </ul>
              </div>
            )}
          </div>
          
          <div className="logs-control">
            <button 
              className="toggle-logs-button"
              onClick={() => setShowDetailedLogs(!showDetailedLogs)}
            >
              {showDetailedLogs ? '処理ログを隠す' : '処理ログを表示'}
            </button>
          </div>
          
          {showDetailedLogs && (
            <div className="processing-logs">
              <h3>処理ログ</h3>
              <div className="logs-container">
                {processingLogs.map((log, index) => (
                  <div key={index} className="log-entry">{log}</div>
                ))}
              </div>
            </div>
          )}

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