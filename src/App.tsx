import React, { useState, useRef, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { analyzeBloodwork } from './services/openai';

// Set the worker source path - updated to use the correct URL
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('/pdf.worker.min.mjs', window.location.origin).href;

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Add console log on component mount to verify it's loading
    console.log('App component mounted');
    
    // Verify that Tesseract and pdfjsLib are loaded correctly
    console.log('Tesseract available:', !!Tesseract);
    console.log('PDF.js available:', !!pdfjsLib);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      console.log('File selected:', selectedFile.name, selectedFile.type);
      if (selectedFile.type === 'application/pdf' || selectedFile.type.startsWith('image/')) {
        setFile(selectedFile);
      } else {
        alert('Please upload a PDF or image file');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const extractTextFromPdf = async (pdfFile: File): Promise<string> => {
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      
      // Add timeout handling
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('PDF loading timed out')), 30000); // 30 seconds timeout
      });
      
      const pdf = await Promise.race([loadingTask.promise, timeoutPromise]);
      let fullText = '';

      console.log(`PDF loaded successfully with ${pdf.numPages} pages`);
      
      for (let i = 1; i <= pdf.numPages; i++) {
        console.log(`Processing page ${i}`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const textItems = textContent.items.map((item: any) => item.str).join(' ');
        fullText += textItems + '\n';
      }

      if (!fullText.trim()) {
        console.warn('PDF was processed but no text was extracted');
        return 'No text content was found in the PDF. The document might be scanned or contain only images.';
      }

      return fullText;
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw new Error('Failed to extract text from PDF. Please make sure the file is not corrupted and try again.');
    }
  };

  const extractTextFromImage = async (imageFile: File): Promise<string> => {
    const result = await Tesseract.recognize(imageFile, 'eng');
    return result.data.text;
  };

  const processFile = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    
    try {
      let text = '';
      if (file.type === 'application/pdf') {
        text = await extractTextFromPdf(file);
      } else if (file.type.startsWith('image/')) {
        text = await extractTextFromImage(file);
      }
      
      if (!text.trim()) {
        throw new Error('No text was extracted from the file');
      }
      
      setExtractedText(text);
      
      // Use our OpenAI service to analyze the text
      const analysisResult = await analyzeBloodwork(text);
      setAnalysis(analysisResult);
    } catch (error) {
      console.error('Error processing file:', error);
      setError(error instanceof Error ? error.message : 'Error processing file. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-2xl font-bold text-center mb-6">Blood Work Analysis</h1>
          
          <div className="mb-6">
            <label className="block text-gray-700 mb-2">Upload Lab Results (PDF or Image)</label>
            <div className="flex items-center">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf,image/jpeg,image/png"
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-md file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
              <button
                onClick={processFile}
                disabled={!file || isProcessing}
                className={`ml-4 px-4 py-2 rounded-md text-white font-medium ${
                  !file || isProcessing
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isProcessing ? 'Processing...' : 'Analyze'}
              </button>
            </div>
            {file && (
              <p className="mt-2 text-sm text-gray-600">
                Selected file: {file.name}
              </p>
            )}

            {error && (
              <p className="mt-2 text-sm text-red-600">
                Error: {error}
              </p>
            )}
          </div>

          {extractedText && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2">Extracted Text</h2>
              <div className="border rounded-md p-3 bg-gray-50 h-40 overflow-y-auto">
                <pre className="text-sm whitespace-pre-wrap">{extractedText}</pre>
              </div>
            </div>
          )}

          {analysis && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Analysis Results</h2>
              <textarea
                value={analysis}
                onChange={(e) => setAnalysis(e.target.value)}
                className="w-full border rounded-md p-3 h-48 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                placeholder="Analysis results will appear here..."
              />
              <p className="mt-2 text-sm text-gray-500">
                You can edit this analysis if needed. Always verify results with a healthcare professional.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default App; 