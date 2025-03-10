import { useState, useRef } from 'react';
import { createWorker, PSM } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { analyzeBloodwork, structureTableData } from '../services/openai';
import { optimizeImageForOCR } from '../utils/imageProcessing.ts';

// Add Tesseract types
interface TesseractResult {
  data: {
    text: string;
    words?: OcrWord[];
  };
}

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

// Add type for OCR word object
interface OcrWord {
  text: string;
  bbox: {
    x0: number;
    x1: number;
    y0: number;
    y1: number;
  };
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

  // Update the function signature with proper typing
  const transformOcrWordsToTable_BBox = (words: OcrWord[]): { structuredData: string[][], htmlTable: string } => {
    const rowTolerance = 10; // pixels tolerance to group words into the same row
    const rows: { y: number, words: any[] }[] = [];
    
    words.forEach(word => {
      // Compute the vertical center of the word from its bounding box
      const midY = (word.bbox.y0 + word.bbox.y1) / 2;
      let foundRow = rows.find(r => Math.abs(r.y - midY) < rowTolerance);
      if (foundRow) {
        foundRow.words.push(word);
        // Update the average row y value
        foundRow.y = (foundRow.y + midY) / 2;
      } else {
        rows.push({ y: midY, words: [word] });
      }
    });
    
    // Sort rows top-to-bottom
    rows.sort((a, b) => a.y - b.y);

    // For each row, sort words left-to-right and group into cells by detecting large horizontal gaps
    const gapThreshold = 20; // if the gap between words exceeds 20 pixels, consider it the start of a new cell
    const structuredRows = rows.map(row => {
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
    paddedRows.forEach(row => {
      html += "<tr>";
      row.forEach(cell => {
        const content = cell.trim() === "" ? "—" : cell.trim();
        html += `<td>${content}</td>`;
      });
      html += "</tr>";
    });
    html += "</table>";
    
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
          tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,%%<>/-+()μ: ',
          tessedit_pageseg_mode: PSM.AUTO, // Assume uniform text block
          preserve_interword_spaces: '1',
          tessedit_create_txt: '1',
          tessedit_create_hocr: '1',
          tessedit_enable_doc_dict: '0', // Disable dictionary to prevent unwanted corrections
          tessedit_write_images: '1'
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
        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('Failed to get canvas context');
        }

        await page.render({ canvasContext: context, viewport }).promise;
        const imageData = optimizeImageForOCR(canvas);

        if (workerRef.current) {
          setProcessingStatus(`OCR Processing page ${i} of ${pdf.numPages}...`, ((i - 1) / pdf.numPages) * 100 + (50 / pdf.numPages));
          const result = (await workerRef.current.recognize(imageData)) as TesseractResult;
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
      throw error instanceof Error ? error : new Error('Failed to extract text from PDF');
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
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      ctx.drawImage(image, 0, 0);

      const optimizedDataUrl = optimizeImageForOCR(canvas);

      setProcessingStatus('Performing OCR on image...', 25);
      workerRef.current = await createWorker();

      if (workerRef.current) {
        workerRef.current.setParameters({
          tessedit_ocr_engine_mode: 1, // Use LSTM only
          tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,%%<>/-+()μ: ',
          tessedit_pageseg_mode: PSM.AUTO, // Assume uniform text block
          preserve_interword_spaces: '1',
          tessedit_create_txt: '1',
          tessedit_create_hocr: '1',
          tessedit_enable_doc_dict: '0', // Disable dictionary to prevent unwanted corrections
          tessedit_write_images: '1'
        });
        setProcessingStatus('Starting OCR...', 30);
        const result = (await workerRef.current.recognize(optimizedDataUrl)) as TesseractResult;
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
      throw error instanceof Error ? error : new Error('Failed to extract text from image');
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