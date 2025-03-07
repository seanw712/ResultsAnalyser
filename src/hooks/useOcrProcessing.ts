import { useState, useRef } from 'react';
import { createWorker, PSM } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { analyzeBloodwork } from '../services/openai';

// Set the worker source path
pdfjsLib.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;

export interface OcrState {
  extractedText: string;
  analysisText: string;
  isOcrProcessing: boolean;
  isAnalysisProcessing: boolean;
  error: string | null;
  progress: number;
}

export const useOcrProcessing = () => {
  const [state, setState] = useState<OcrState>({
    extractedText: '',
    analysisText: '',
    isOcrProcessing: false,
    isAnalysisProcessing: false,
    error: null,
    progress: 0
  });

  // Use any type to avoid TypeScript errors with Tesseract.js
  const workerRef = useRef<any>(null);

  const updateState = (updates: Partial<OcrState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  const cleanupWorker = async () => {
    if (workerRef.current) {
      await workerRef.current.terminate();
      workerRef.current = null;
    }
  };

  const extractTextFromImage = async (imageFile: File): Promise<string> => {
    try {
      const image = new Image();
      image.src = URL.createObjectURL(imageFile);
      await new Promise((resolve) => { image.onload = resolve; });

      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(image, 0, 0);

      // Create worker
      workerRef.current = await createWorker();
      
      // Configure worker for optimal table recognition
      await workerRef.current.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1',
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:+*/()[]{}=<>%&#@!?\'"\\-_°µ∞≤≥±'
      });

      const result = await workerRef.current.recognize(canvas);
      await cleanupWorker();
      canvas.remove();
      URL.revokeObjectURL(image.src);
      
      return result.data.text;
    } catch (error) {
      await cleanupWorker();
      throw new Error('Failed to extract text from image');
    }
  };

  const extractTextFromPdf = async (pdfFile: File): Promise<string> => {
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d')!;

        await page.render({ canvasContext: context, viewport }).promise;
        
        // Create worker
        workerRef.current = await createWorker();
        
        // Configure worker for optimal table recognition
        await workerRef.current.setParameters({
          tessedit_pageseg_mode: PSM.AUTO,
          preserve_interword_spaces: '1',
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:+*/()[]{}=<>%&#@!?\'"\\-_°µ∞≤≥±',
          textord_tabfind_find_tables: '1',
          classify_bln_numeric_mode: '1',
          textord_tablefind_recognize_tables: '0',
          tessedit_create_boxfile: '0',           // Enable box file output

        });

        const result = await workerRef.current.recognize(canvas);
        fullText += JSON.stringify(result.data.blocks, null, 2) + '\n\n';
        
        canvas.remove();
        await cleanupWorker();
      }

      if (!fullText.trim()) {
        throw new Error('No text content was found in the PDF');
      }

      return fullText;
    } catch (error) {
      await cleanupWorker();
      throw new Error('Failed to extract text from PDF');
    }
  };

  const handleOcr = async (file: File) => {
    updateState({
      extractedText: '',
      analysisText: '',
      isOcrProcessing: true,
      error: null,
      progress: 0
    });

    try {
      const text = file.type === 'application/pdf'
        ? await extractTextFromPdf(file)
        : await extractTextFromImage(file);

      updateState({
        extractedText: text,
        progress: 100
      });
    } catch (error) {
      updateState({
        error: error instanceof Error ? error.message : 'OCR process failed'
      });
    } finally {
      updateState({ isOcrProcessing: false });
    }
  };

  const handleAnalysis = async () => {
    updateState({ isAnalysisProcessing: true });
    
    try {
      const analysisResult = await analyzeBloodwork(state.extractedText);
      updateState({ 
        analysisText: analysisResult,
        progress: 100
      });
    } catch (error) {
      updateState({
        error: error instanceof Error ? error.message : 'Analysis failed'
      });
    } finally {
      updateState({ isAnalysisProcessing: false });
    }
  };

  return {
    state,
    handleOcr,
    handleAnalysis
  };
};

export default useOcrProcessing; 