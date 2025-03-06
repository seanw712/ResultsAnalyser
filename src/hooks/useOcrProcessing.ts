import { useState, useRef } from 'react';
import { createWorker, PSM } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { analyzeBloodwork, structureTableData } from '../services/openai';
import { optimizeImageForOCR } from '../utils/imageProcessing';

// Set the worker source path
pdfjsLib.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;

export interface OcrState {
  extractedText: string;
  jsonText: string;
  structuredData: Record<string, any>[];
  analysisText: string;
  rawOcrJson: string;
  showRawJson: boolean;
  isOcrProcessing: boolean;
  isAnalysisProcessing: boolean;
  error: string | null;
  processingStatus: string;
  progress: number;
  currentPage: number;
  totalPages: number;
}

export const useOcrProcessing = () => {
  const [state, setState] = useState<OcrState>({
    extractedText: '',
    jsonText: '',
    structuredData: [],
    analysisText: '',
    rawOcrJson: '',
    showRawJson: false,
    isOcrProcessing: false,
    isAnalysisProcessing: false,
    error: null,
    processingStatus: '',
    progress: 0,
    currentPage: 0,
    totalPages: 0
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const workerRef = useRef<Tesseract.Worker | null>(null);

  const updateState = (updates: Partial<OcrState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const setError = (error: string | null) => {
    updateState({ error });
  };

  const setProcessingStatus = (status: string, progress?: number) => {
    updateState({ 
      processingStatus: status,
      ...(progress !== undefined && { progress })
    });
  };

  const cleanupWorker = async () => {
    if (workerRef.current) {
      await workerRef.current.terminate();
      workerRef.current = null;
    }
  };

  // Replace the current transformOcrTextToTable function with this new one
  const transformOcrWordsToTable_BBox = (words: any[]): { structuredData: string[][], htmlTable: string } => {
    const rowTolerance = 30; // Increased tolerance for row grouping
    const rows: { y: number, words: any[] }[] = [];
    
    // Skip processing if no words
    if (!words || words.length === 0) {
      return { structuredData: [], htmlTable: "<table></table>" };
    }
    
    // First, sort all words by their vertical position (top to bottom)
    const sortedWords = [...words].sort((a, b) => {
      const midYA = (a.bbox.y0 + a.bbox.y1) / 2;
      const midYB = (b.bbox.y0 + b.bbox.y1) / 2;
      return midYA - midYB;
    });
    
    // Find document boundaries
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    
    sortedWords.forEach(word => {
      minY = Math.min(minY, word.bbox.y0);
      maxY = Math.max(maxY, word.bbox.y1);
      minX = Math.min(minX, word.bbox.x0);
      maxX = Math.max(maxX, word.bbox.x1);
    });
    
    // Calculate document dimensions
    const docHeight = maxY - minY;
    const docWidth = maxX - minX;
    
    // Group words into rows with the increased tolerance
    sortedWords.forEach(word => {
      // Compute the vertical center of the word from its bounding box
      const midY = (word.bbox.y0 + word.bbox.y1) / 2;
      let foundRow = rows.find(r => Math.abs(r.y - midY) < rowTolerance);
      if (foundRow) {
        foundRow.words.push(word);
        // Update the average row y value
        foundRow.y = (foundRow.y * foundRow.words.length + midY) / (foundRow.words.length + 1);
      } else {
        rows.push({ y: midY, words: [word] });
      }
    });
    
    // Sort rows top-to-bottom
    rows.sort((a, b) => a.y - b.y);
    
    // Log all rows for debugging
    console.log('All rows before header detection:', rows.map((row, idx) => ({
      index: idx,
      y: row.y,
      wordCount: row.words.length,
      text: row.words.map(w => w.text).join(' ')
    })));

    // Enhanced header detection algorithm
    const potentialHeaderIndices: number[] = [];
    
    // Look for specific header patterns in lab reports
    // 1. Look for rows with common header terms
    const headerTerms = ['testen', 'resultaten', 'test', 'result', 'parameter', 'waarde', 'eenheid', 'eenheden', 'onderl', 'bovenl'];
    
    // 2. Look for rows that are positioned in the top third of the document
    const topThirdThreshold = minY + (docHeight / 3);
    
    // 3. Look for rows with multiple evenly spaced words (column headers)
    rows.forEach((row, index) => {
      // Skip empty rows
      if (row.words.length === 0) return;
      
      // Sort words left-to-right
      row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      
      // Check if this row contains any header terms
      const rowText = row.words.map(w => w.text.toLowerCase()).join(' ');
      const containsHeaderTerm = headerTerms.some(term => rowText.includes(term));
      
      // Check if row is in the top third of the document
      const isInTopThird = row.y < topThirdThreshold;
      
      // Check if words are distributed across the width (indicating column headers)
      const leftmostX = row.words[0].bbox.x0;
      const rightmostX = row.words[row.words.length - 1].bbox.x1;
      const rowWidth = rightmostX - leftmostX;
      const rowWidthRatio = rowWidth / docWidth;
      
      // Check for even spacing between words
      let hasEvenSpacing = false;
      if (row.words.length >= 3) {
        const gaps = [];
        for (let i = 1; i < row.words.length; i++) {
          gaps.push(row.words[i].bbox.x0 - row.words[i-1].bbox.x1);
        }
        
        // Calculate standard deviation of gaps
        const avgGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
        const stdDev = Math.sqrt(gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length);
        const coeffVar = stdDev / avgGap;
        
        // If coefficient of variation is low, spacing is relatively even
        hasEvenSpacing = coeffVar < 0.7; // Threshold for evenness
      }
      
      // Log detailed info about this row for debugging
      console.log(`Row ${index} analysis:`, {
        y: row.y,
        text: rowText,
        wordCount: row.words.length,
        rowWidth,
        rowWidthRatio,
        containsHeaderTerm,
        isInTopThird,
        hasEvenSpacing
      });
      
      // Determine if this is a header row based on multiple criteria
      const isHeaderRow = (
        // Either contains a header term
        containsHeaderTerm ||
        // Or meets multiple structural criteria
        (row.words.length >= 3 && 
         rowWidthRatio > 0.5 && 
         isInTopThird && 
         hasEvenSpacing)
      );
      
      if (isHeaderRow) {
        potentialHeaderIndices.push(index);
        console.log(`Row ${index} identified as a header row`);
      }
    });
    
    // If no headers were found but we have rows, try to identify the first row with multiple columns as a header
    if (potentialHeaderIndices.length === 0 && rows.length > 1) {
      // Find the first row with at least 3 words that spans a significant width
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        if (rows[i].words.length >= 3) {
          rows[i].words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
          const leftmostX = rows[i].words[0].bbox.x0;
          const rightmostX = rows[i].words[rows[i].words.length - 1].bbox.x1;
          const rowWidth = rightmostX - leftmostX;
          
          if (rowWidth / docWidth > 0.4) {
            potentialHeaderIndices.push(i);
            console.log(`Fallback: Row ${i} identified as a header row`);
            break;
          }
        }
      }
    }
    
    // For each row, sort words left-to-right and group into cells by detecting large horizontal gaps
    const gapThreshold = 20; // if the gap between words exceeds 20 pixels, consider it the start of a new cell
    const structuredRows = rows.map((row, rowIndex) => {
      // sort the words in this row by their x position
      row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      
      if (row.words.length === 0) return [];
      
      const cells: string[] = [];
      let currentCellText = row.words[0].text;
      let previousWord = row.words[0];
      
      for (let i = 1; i < row.words.length; i++) {
        const currentWord = row.words[i];
        // compute gap using previous word's right boundary (x1) and current word's left boundary (x0)
        const gap = currentWord.bbox.x0 - previousWord.bbox.x1;
        
        if (gap > gapThreshold) {
          // large gap found, store the current cell and start a new one
          cells.push(currentCellText);
          currentCellText = currentWord.text;
        } else {
          // continue same cell by merging text
          currentCellText += " " + currentWord.text;
        }
        previousWord = currentWord;
      }
      // push the last cell
      cells.push(currentCellText);
      return cells;
    });

    // Determine how many columns the table should have by picking the maximum cell count
    const numColumns = Math.max(...structuredRows.map(r => r.length), 1);
    
    // Pad rows with missing cells with "—"
    const paddedRows = structuredRows.map(row => {
      const newRow = row.slice();
      while (newRow.length < numColumns) {
        newRow.push("—");
      }
      return newRow;
    });

    // Build the HTML table string
    let html = "<table>";
    paddedRows.forEach((row, index) => {
      // Check if this is a potential header row
      const isHeader = potentialHeaderIndices.includes(index);
      
      if (isHeader) {
        html += "<tr class='header-row'>";
        row.forEach(cell => {
          const content = cell.trim() === "" ? "—" : cell.trim();
          html += `<th>${content}</th>`;
        });
      } else {
        html += "<tr>";
        row.forEach(cell => {
          const content = cell.trim() === "" ? "—" : cell.trim();
          html += `<td>${content}</td>`;
        });
      }
      html += "</tr>";
    });
    html += "</table>";
    
    // For debugging
    console.log('Potential header rows:', potentialHeaderIndices);
    console.log('Structured rows:', paddedRows);
    
    return { structuredData: paddedRows, htmlTable: html };
  };

  /* Update extractTextFromPdf to collect word data with bounding boxes */
  const extractTextFromPdf = async (pdfFile: File): Promise<{ text: string, table: string, structuredData: string[][] }> => {
    try {
      setProcessingStatus('Loading PDF document...', 0);
      const arrayBuffer = await pdfFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      const pdf = await loadingTask.promise;
      updateState({ totalPages: pdf.numPages });
      let fullText = '';
      const allWords: any[] = [];

      // Create worker
      workerRef.current = await createWorker();
      if (workerRef.current) {
        workerRef.current.setParameters({
          tessedit_ocr_engine_mode: 1, // Use LSTM only
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,  // Assume a single uniform block of text
          preserve_interword_spaces: '1', // Preserve spaces between words
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:+-*/()[]{}=<>%&$#@!?\'"\\ ', // Allow these characters
        });
      }

      for (let i = 1; i <= pdf.numPages; i++) {
        if (signal.aborted) {
          throw new Error('Operation cancelled');
        }

        updateState({ currentPage: i });
        setProcessingStatus(`Processing page ${i} of ${pdf.numPages} for OCR...`, ((i - 1) / pdf.numPages) * 100);

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d')!;

        await page.render({ canvasContext: context, viewport }).promise;
        const imageData = optimizeImageForOCR(canvas);

        if (workerRef.current) {
          setProcessingStatus(`OCR Processing page ${i} of ${pdf.numPages}...`, ((i - 1) / pdf.numPages) * 100 + (50 / pdf.numPages));
          const result = await workerRef.current.recognize(imageData);
          fullText += result.data.text + '\n';
          
          // Accumulate word data (with bounding box positions)
          if (result.data.words) {
            allWords.push(...result.data.words);
          }
          
          // For debugging
          console.log('Raw OCR text for page', i, ':', result.data.text);
          console.log('Words with bounding boxes for page', i, ':', result.data.words);
          
          setProcessingStatus(`Completed page ${i} of ${pdf.numPages}`, (i / pdf.numPages) * 100);
        }

        canvas.remove();
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      await cleanupWorker();

      if (!fullText.trim()) {
        throw new Error('No text content was found in the PDF');
      }

      // Reconstruct the table using bounding box information
      const { structuredData, htmlTable } = transformOcrWordsToTable_BBox(allWords);
      return { text: fullText, table: htmlTable, structuredData };
    } catch (error) {
      await cleanupWorker();
      throw new Error('Failed to extract text from PDF');
    }
  };

  /* Update extractTextFromImage to collect word data with bounding boxes */
  const extractTextFromImage = async (imageFile: File): Promise<{ text: string, table: string, structuredData: string[][] }> => {
    setProcessingStatus('Preparing image for OCR...', 0);
    try {
      const image = new Image();
      image.src = URL.createObjectURL(imageFile);
      await new Promise((resolve) => { image.onload = resolve; });

      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(image, 0, 0);

      const optimizedDataUrl = optimizeImageForOCR(canvas);

      setProcessingStatus('Performing OCR on image...', 25);
      workerRef.current = await createWorker();

      if (workerRef.current) {
        workerRef.current.setParameters({
          tessedit_ocr_engine_mode: 1, // Use LSTM only
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,  // Assume a single uniform block of text
          preserve_interword_spaces: '1', // Preserve spaces between words
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:+-*/()[]{}=<>%&$#@!?\'"\\ ', // Allow these characters
        });
        setProcessingStatus('Starting OCR...', 30);
        const result = await workerRef.current.recognize(optimizedDataUrl);
        setProcessingStatus('OCR completed, processing results...', 90);

        await cleanupWorker();
        canvas.remove();
        URL.revokeObjectURL(image.src);

        const fullText = result.data.text;
        // Accumulate the words from OCR
        const words = result.data.words || [];
        
        // For debugging
        console.log('Raw OCR text from image:', fullText);
        console.log('Words with bounding boxes from image:', words);
        
        const { structuredData, htmlTable } = transformOcrWordsToTable_BBox(words);
        return { text: fullText, table: htmlTable, structuredData };
      }

      await cleanupWorker();
      throw new Error('Failed to create worker');
    } catch (error) {
      await cleanupWorker();
      throw new Error('Failed to extract text from image');
    }
  };

  const cancelProcessing = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    await cleanupWorker();
    updateState({
      isOcrProcessing: false,
      processingStatus: '',
      progress: 0,
      currentPage: 0,
      jsonText: '',
      rawOcrJson: ''
    });
  };

  /* Update handleOcr to use the new extraction results */
  const handleOcr = async (file: File) => {
    updateState({
      extractedText: '',
      jsonText: '',
      structuredData: [],
      analysisText: '',
      rawOcrJson: '',
      showRawJson: false,
      isOcrProcessing: true,
      isAnalysisProcessing: false,
      error: null,
      processingStatus: '',
      progress: 0,
      currentPage: 0,
      totalPages: 0
    });

    try {
      const result = file.type === 'application/pdf'
        ? await extractTextFromPdf(file)
        : await extractTextFromImage(file);

      // Update state with the raw text, generated HTML table, and structured data array
      setProcessingStatus('Structuring data...', 90);
      updateState({
        extractedText: result.text,
        jsonText: result.table,
        structuredData: result.structuredData,
        rawOcrJson: JSON.stringify(result, null, 2),
        progress: 100
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Operation cancelled') {
        setError('Operation cancelled by user');
      } else {
        setError(error instanceof Error ? error.message : 'OCR process failed');
      }
    } finally {
      updateState({
        isOcrProcessing: false,
        processingStatus: ''
      });
    }
  };

  const handleAnalysis = async () => {
    updateState({ isAnalysisProcessing: true });
    setProcessingStatus('Analyzing data...', 0);
    
    try {
      const analysisResult = await analyzeBloodwork(state.extractedText);
      updateState({ 
        analysisText: analysisResult,
        progress: 100
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Analysis failed');
    } finally {
      updateState({
        isAnalysisProcessing: false,
        processingStatus: ''
      });
    }
  };

  return {
    state,
    handleOcr,
    handleAnalysis,
    updateState,
    cancelProcessing
  };
};

export default useOcrProcessing; 