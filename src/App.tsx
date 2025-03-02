import React, { useState, useRef, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { analyzeBloodwork } from './services/openai';

// Set the worker source path
pdfjsLib.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;

// Utility to optimize image for OCR
const optimizeImageForOCR = (canvas: HTMLCanvasElement): string => {
  // Create a temporary canvas for image processing
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d')!;
  
  // Set dimensions (optionally resize for very large images)
  const maxDimension = 2000; // Reasonable upper limit for OCR
  let width = canvas.width;
  let height = canvas.height;
  
  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round(height * (maxDimension / width));
      width = maxDimension;
    } else {
      width = Math.round(width * (maxDimension / height));
      height = maxDimension;
    }
  }
  
  tempCanvas.width = width;
  tempCanvas.height = height;
  
  // Draw the image with optional resizing
  tempCtx.drawImage(canvas, 0, 0, width, height);
  
  // Apply preprocessing to improve OCR
  try {
    // Get the image data
    const imageData = tempCtx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Simple contrast enhancement and binarization
    for (let i = 0; i < data.length; i += 4) {
      // Convert to grayscale
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      
      // Threshold to increase contrast (adjust the 127 value as needed)
      const value = gray > 127 ? 255 : 0;
      
      // Set RGB channels to the same value for black/white effect
      data[i] = data[i + 1] = data[i + 2] = value;
    }
    
    // Put the modified pixels back
    tempCtx.putImageData(imageData, 0, 0);
  } catch (err) {
    console.warn('Image optimization failed, proceeding with unoptimized image', err);
  }
  
  // Return as data URL
  return tempCanvas.toDataURL('image/png');
};

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
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
      setProcessingStatus('Loading PDF document...');
      const arrayBuffer = await pdfFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      
      // Add timeout handling
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('PDF loading timed out')), 30000); // 30 seconds timeout
      });
      
      const pdf = await Promise.race([loadingTask.promise, timeoutPromise]);
      let fullText = '';

      console.log(`PDF loaded successfully with ${pdf.numPages} pages`);
      setProcessingStatus(`Extracting text from ${pdf.numPages} pages...`);
      
      // First try to extract text directly
      for (let i = 1; i <= pdf.numPages; i++) {
        console.log(`Processing page ${i} for text extraction`);
        setProcessingStatus(`Extracting text from page ${i} of ${pdf.numPages}...`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const textItems = textContent.items.map((item: any) => item.str).join(' ');
        fullText += textItems + '\n';
      }

      // Check if meaningful text was extracted
      if (!fullText.trim() || fullText.trim().length < 50) {
        console.log('PDF has minimal or no text content. Attempting OCR on rendered pages...');
        setProcessingStatus('PDF appears to be scanned. Performing OCR (this may take a while)...');
        
        // If minimal text was found, try OCR on rendered pages
        fullText = ''; // Reset the text
        
        for (let i = 1; i <= pdf.numPages; i++) {
          console.log(`Processing page ${i} for OCR`);
          setProcessingStatus(`Performing OCR on page ${i} of ${pdf.numPages} (this may take a while)...`);
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 }); // Higher scale for better OCR
          
          // Create a canvas element to render the PDF page
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d')!;
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          // Render the page
          const renderContext = {
            canvasContext: context,
            viewport: viewport
          };
          
          await page.render(renderContext).promise;
          
          // Optimize image for better OCR results
          const imageData = optimizeImageForOCR(canvas);
          
          // Perform OCR on the rendered page
          console.log(`Performing OCR on page ${i}`);
          const result = await Tesseract.recognize(
            imageData,
            'eng',
            {
              logger: progress => {
                if (progress.status === 'recognizing text') {
                  setProcessingStatus(`OCR on page ${i}: ${Math.round(progress.progress * 100)}% complete...`);
                }
              }
            }
          );
          fullText += result.data.text + '\n';
          
          // Clean up to avoid memory leaks
          canvas.width = 0;
          canvas.height = 0;
          
          // Add a small delay to allow for garbage collection
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      if (!fullText.trim()) {
        console.warn('PDF was processed but no text was extracted, even after OCR attempt');
        return 'No text content was found in the PDF, even after trying OCR. The document might be corrupted or contain unsupported content.';
      }

      return fullText;
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw new Error('Failed to extract text from PDF. Please make sure the file is not corrupted and try again.');
    }
  };

  const extractTextFromImage = async (imageFile: File): Promise<string> => {
    setProcessingStatus('Performing OCR on image (this may take a while)...');
    const result = await Tesseract.recognize(
      imageFile, 
      'eng',
      {
        logger: progress => {
          if (progress.status === 'recognizing text') {
            setProcessingStatus(`OCR progress: ${Math.round(progress.progress * 100)}% complete...`);
          }
        }
      }
    );
    return result.data.text;
  };

  const processFile = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProcessingStatus('Starting processing...');
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
      setProcessingStatus('Analyzing extracted text...');
      const analysisResult = await analyzeBloodwork(text);
      setAnalysis(analysisResult);
    } catch (error) {
      console.error('Error processing file:', error);
      setError(error instanceof Error ? error.message : 'Error processing file. Please try again.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
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

            {isProcessing && processingStatus && (
              <div className="mt-4">
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div className="bg-blue-600 h-2.5 rounded-full animate-pulse"></div>
                </div>
                <p className="mt-2 text-sm text-gray-600">{processingStatus}</p>
              </div>
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