import React, { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { analyzeBloodwork } from './services/openai';

// Set worker path manually instead of importing the worker entry
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [analysis, setAnalysis] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
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
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const textItems = textContent.items.map((item: any) => item.str).join(' ');
      fullText += textItems + '\n';
    }

    return fullText;
  };

  const extractTextFromImage = async (imageFile: File): Promise<string> => {
    const result = await Tesseract.recognize(imageFile, 'eng');
    return result.data.text;
  };

  const processFile = async () => {
    if (!file) return;

    setIsProcessing(true);
    try {
      let text = '';
      if (file.type === 'application/pdf') {
        text = await extractTextFromPdf(file);
      } else if (file.type.startsWith('image/')) {
        text = await extractTextFromImage(file);
      }
      
      setExtractedText(text);
      
      // Use our OpenAI service to analyze the text
      const analysisResult = await analyzeBloodwork(text);
      setAnalysis(analysisResult);
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Error processing file. Please try again.');
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