import React, { useState, useRef, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { analyzeBloodwork, structureTableData } from './services/openai';
import DataTable from './components/DataTable';

// Set the worker source path
pdfjsLib.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdf.worker.min.mjs`;

// Utility to optimize image for OCR
const optimizeImageForOCR = (canvas: HTMLCanvasElement): string => {
  // Create a temporary canvas for image processing
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d')!;
  
  // Increase resolution for better number recognition
  const scaleFactor = 2.0; // Scale up for better detail
  const width = canvas.width * scaleFactor;
  const height = canvas.height * scaleFactor;
  
  tempCanvas.width = width;
  tempCanvas.height = height;
  
  // Enable image smoothing for better scaling
  tempCtx.imageSmoothingEnabled = true;
  tempCtx.imageSmoothingQuality = 'high';
  
  // Draw the image with scaling
  tempCtx.drawImage(canvas, 0, 0, width, height);
  
  // Apply preprocessing to improve OCR
  try {
    // Get the image data
    const imageData = tempCtx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Enhanced image processing for better number recognition
    for (let i = 0; i < data.length; i += 4) {
      // Convert to grayscale using precise coefficients
      const gray = 0.2989 * data[i] + 0.5870 * data[i + 1] + 0.1140 * data[i + 2];
      
      // Enhance contrast
      const contrast = 1.2; // Subtle contrast enhancement
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
      const enhancedGray = factor * (gray - 128) + 128;
      
      // Adaptive thresholding
      const localThreshold = 180; // Slightly higher threshold for numbers
      const value = enhancedGray > localThreshold ? 255 : 0;
      
      // Set all channels to the same value
      data[i] = data[i + 1] = data[i + 2] = value;
    }
    
    // Put the modified pixels back
    tempCtx.putImageData(imageData, 0, 0);
  } catch (err) {
    console.warn('Image optimization failed, proceeding with unoptimized image', err);
  }
  
  return tempCanvas.toDataURL('image/png');
};

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  
  // Text content for each stage
  const [extractedText, setExtractedText] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [structuredData, setStructuredData] = useState<Record<string, any>[]>([]);
  const [analysisText, setAnalysisText] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Processing flags for each section
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [isJsonProcessing, setIsJsonProcessing] = useState(false);
  const [isTabularProcessing, setIsTabularProcessing] = useState(false);
  const [isAnalysisProcessing, setIsAnalysisProcessing] = useState(false);

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

  // OCR process - starting from file upload
  const handleOcr = async () => {
    if (!file) {
      setError('Please upload a file first');
      return;
    }

    setIsOcrProcessing(true);
    setError(null);
    setProcessingStatus('Starting OCR processing...');
    
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
    } catch (error) {
      console.error('Error processing file:', error);
      setError(error instanceof Error ? error.message : 'Error processing file. Please try again.');
    } finally {
      setIsOcrProcessing(false);
      setProcessingStatus('');
    }
  };

  // Convert OCR to JSON
  const handleOcrToJson = async () => {
    if (!extractedText.trim()) {
      setError('No OCR text to convert');
      return;
    }

    setIsJsonProcessing(true);
    setError(null);
    setProcessingStatus('Converting text to structured format...');
    
    try {
      const jsonData = await structureTableData(extractedText);
      
      if (jsonData.error) {
        throw new Error(jsonData.message || 'Failed to structure the data');
      }
      
      // Assuming the structureTableData returns an object with a data array
      const tableData = Array.isArray(jsonData.data) ? jsonData.data : [jsonData];
      setJsonText(JSON.stringify(tableData, null, 2));
      setStructuredData(tableData);
    } catch (error) {
      console.error('Error converting to JSON:', error);
      setError(error instanceof Error ? error.message : 'Error converting to JSON. Please try again.');
    } finally {
      setIsJsonProcessing(false);
      setProcessingStatus('');
    }
  };

  // Convert OCR directly to Tabular (via JSON)
  const handleOcrToTabular = async () => {
    if (!extractedText.trim()) {
      setError('No OCR text to convert');
      return;
    }

    setIsTabularProcessing(true);
    setError(null);
    setProcessingStatus('Converting text to tabular format...');
    
    try {
      const jsonData = await structureTableData(extractedText);
      
      if (jsonData.error) {
        throw new Error(jsonData.message || 'Failed to structure the data');
      }
      
      // Assuming the structureTableData returns an object with a data array
      const tableData = Array.isArray(jsonData.data) ? jsonData.data : [jsonData];
      setJsonText(JSON.stringify(tableData, null, 2));
      setStructuredData(tableData);
    } catch (error) {
      console.error('Error converting to tabular format:', error);
      setError(error instanceof Error ? error.message : 'Error converting to tabular format. Please try again.');
    } finally {
      setIsTabularProcessing(false);
      setProcessingStatus('');
    }
  };

  // Convert OCR directly to Analysis (via JSON and Tabular)
  const handleOcrToAnalysis = async () => {
    if (!extractedText.trim()) {
      setError('No OCR text to analyze');
      return;
    }

    setIsAnalysisProcessing(true);
    setError(null);
    setProcessingStatus('Processing for analysis...');
    
    try {
      // First convert to JSON
      const jsonData = await structureTableData(extractedText);
      
      if (jsonData.error) {
        throw new Error(jsonData.message || 'Failed to structure the data');
      }
      
      // Set JSON data
      const tableData = Array.isArray(jsonData.data) ? jsonData.data : [jsonData];
      setJsonText(JSON.stringify(tableData, null, 2));
      setStructuredData(tableData);
      
      // Then analyze
      setProcessingStatus('Analyzing data...');
      const analysisResult = await analyzeBloodwork(JSON.stringify(tableData));
      setAnalysisText(analysisResult);
    } catch (error) {
      console.error('Error analyzing from OCR:', error);
      setError(error instanceof Error ? error.message : 'Error analyzing from OCR. Please try again.');
    } finally {
      setIsAnalysisProcessing(false);
      setProcessingStatus('');
    }
  };

  // Convert JSON to Tabular
  const handleJsonToTabular = async () => {
    if (!jsonText.trim()) {
      setError('No JSON to convert');
      return;
    }

    setIsTabularProcessing(true);
    setError(null);
    
    try {
      // Parse the JSON
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) {
        setStructuredData(parsed);
      } else {
        throw new Error('Invalid JSON format - expected an array');
      }
    } catch (error) {
      console.error('Error converting JSON to tabular:', error);
      setError(error instanceof Error ? error.message : 'Error converting JSON to tabular. Please check JSON format.');
    } finally {
      setIsTabularProcessing(false);
    }
  };

  // Analyze from JSON
  const handleJsonToAnalysis = async () => {
    if (!jsonText.trim()) {
      setError('No JSON to analyze');
      return;
    }

    setIsAnalysisProcessing(true);
    setError(null);
    setProcessingStatus('Analyzing data...');
    
    try {
      // Parse the JSON first
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) {
        setStructuredData(parsed);
        
        // Then analyze
        const analysisResult = await analyzeBloodwork(jsonText);
        setAnalysisText(analysisResult);
      } else {
        throw new Error('Invalid JSON format - expected an array');
      }
    } catch (error) {
      console.error('Error analyzing from JSON:', error);
      setError(error instanceof Error ? error.message : 'Error analyzing from JSON. Please check JSON format.');
    } finally {
      setIsAnalysisProcessing(false);
      setProcessingStatus('');
    }
  };

  // Analyze from Tabular
  const handleTabularToAnalysis = async () => {
    if (structuredData.length === 0) {
      setError('No tabular data to analyze');
      return;
    }

    setIsAnalysisProcessing(true);
    setError(null);
    setProcessingStatus('Analyzing data...');
    
    try {
      const analysisResult = await analyzeBloodwork(JSON.stringify(structuredData));
      setAnalysisText(analysisResult);
    } catch (error) {
      console.error('Error analyzing from tabular:', error);
      setError(error instanceof Error ? error.message : 'Error analyzing from tabular. Please try again.');
    } finally {
      setIsAnalysisProcessing(false);
      setProcessingStatus('');
    }
  };

  // Handle OCR text changes
  const handleOcrTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setExtractedText(e.target.value);
  };

  // Handle JSON text changes
  const handleJsonTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonText(e.target.value);
    // We don't parse JSON here because it might be invalid during editing
  };

  // Handle analysis text changes
  const handleAnalysisTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setAnalysisText(e.target.value);
  };

  // Section component for consistent styling
  const Section = ({ 
    title, 
    children, 
    buttons 
  }: { 
    title: string; 
    children: React.ReactNode; 
    buttons?: React.ReactNode 
  }) => (
    <div className="mb-10 bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      {children}
      {buttons && (
        <div className="mt-4 flex flex-wrap gap-3">
          {buttons}
        </div>
      )}
    </div>
  );

  // Button component for consistent styling
  const Button = ({ 
    onClick, 
    disabled, 
    children 
  }: { 
    onClick: () => void; 
    disabled?: boolean; 
    children: React.ReactNode 
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-md text-white font-medium ${
        disabled
          ? 'bg-gray-400 cursor-not-allowed'
          : 'bg-blue-600 hover:bg-blue-700'
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-5xl mx-auto">
        {/* File Upload Section */}
        <Section title="Upload Lab Results">
          <div className="mb-4">
            <label className="block text-gray-700 mb-2">Select PDF or Image File</label>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="application/pdf,image/*"
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
          </div>
          <Button onClick={handleOcr} disabled={!file || isOcrProcessing}>
            {isOcrProcessing ? 'Processing...' : 'OCR'}
          </Button>
        </Section>

        {/* Processing Status */}
        {processingStatus && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-md p-4">
            <p className="text-blue-700">
              <span className="animate-pulse inline-block h-2 w-2 rounded-full bg-blue-600 mr-2"></span>
              {processingStatus}
            </p>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* OCR Results Section */}
        <Section 
          title="OCR Results" 
          buttons={
            <>
              <Button onClick={handleOcrToJson} disabled={!extractedText || isJsonProcessing}>
                Convert to JSON
              </Button>
              <Button onClick={handleOcrToTabular} disabled={!extractedText || isTabularProcessing}>
                Convert to Tabular Format
              </Button>
              <Button onClick={handleOcrToAnalysis} disabled={!extractedText || isAnalysisProcessing}>
                Analyze Results
              </Button>
            </>
          }
        >
          <textarea
            value={extractedText}
            onChange={handleOcrTextChange}
            className="bg-gray-50 p-4 rounded-md h-[300px] w-full resize-none border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            placeholder="OCR results will appear here..."
            spellCheck="false"
          />
        </Section>

        {/* JSON Results Section */}
        <Section 
          title="JSON Data" 
          buttons={
            <>
              <Button onClick={handleJsonToTabular} disabled={!jsonText || isTabularProcessing}>
                Convert to Tabular Format
              </Button>
              <Button onClick={handleJsonToAnalysis} disabled={!jsonText || isAnalysisProcessing}>
                Analyze Results
              </Button>
            </>
          }
        >
          <textarea
            value={jsonText}
            onChange={handleJsonTextChange}
            className="bg-gray-50 p-4 rounded-md h-[300px] w-full font-mono text-sm resize-none border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            placeholder="JSON data will appear here..."
            spellCheck="false"
          />
        </Section>

        {/* Tabular Results Section */}
        <Section 
          title="Tabular Format" 
          buttons={
            <Button onClick={handleTabularToAnalysis} disabled={structuredData.length === 0 || isAnalysisProcessing}>
              Analyze Results
            </Button>
          }
        >
          <div className="h-[400px] overflow-y-auto border border-gray-200 rounded-md">
            {structuredData.length > 0 ? (
              <DataTable 
                data={structuredData} 
                title="Blood Work Results" 
                className="w-full"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Tabular data will appear here...
              </div>
            )}
          </div>
        </Section>

        {/* Analysis Results Section */}
        <Section title="Lab Analysis">
          <textarea
            value={analysisText}
            onChange={handleAnalysisTextChange}
            className="bg-gray-50 p-4 rounded-md h-[300px] w-full resize-none border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            placeholder="Analysis results will appear here..."
            spellCheck="false"
          />
        </Section>
      </div>
    </div>
  );
};

export default App; 