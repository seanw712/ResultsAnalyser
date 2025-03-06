import { useState, useRef } from 'react';
import { createWorker, PSM } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { analyzeBloodwork } from '../services/openai';
import { optimizeImageForOCR } from '../utils/imageProcessing';

// Set the worker source path
pdfjsLib.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;

export interface OcrState {
  extractedText: string;
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

  const extractTextFromPdf = async (pdfFile: File): Promise<string> => {
    try {
      setProcessingStatus('Loading PDF document...', 0);
      const arrayBuffer = await pdfFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      const pdf = await loadingTask.promise;
      updateState({ totalPages: pdf.numPages });
      let fullText = '';

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
          
          // For debugging
          console.log('Raw OCR text for page', i, ':', result.data.text);
          
          setProcessingStatus(`Completed page ${i} of ${pdf.numPages}`, (i / pdf.numPages) * 100);
        }

        canvas.remove();
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      await cleanupWorker();

      if (!fullText.trim()) {
        throw new Error('No text content was found in the PDF');
      }

      return fullText;
    } catch (error) {
      await cleanupWorker();
      throw new Error('Failed to extract text from PDF');
    }
  };

  const extractTextFromImage = async (imageFile: File): Promise<string> => {
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
        
        // For debugging
        console.log('Raw OCR text from image:', fullText);
        
        return fullText;
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
      rawOcrJson: ''
    });
  };

  const handleOcr = async (file: File) => {
    updateState({
      extractedText: '',
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
      const text = file.type === 'application/pdf'
        ? await extractTextFromPdf(file)
        : await extractTextFromImage(file);

      // Update state with the raw text
      setProcessingStatus('Processing complete', 100);
      updateState({
        extractedText: text,
        rawOcrJson: JSON.stringify({ text }, null, 2),
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