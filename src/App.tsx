import React, { useState, useRef, useEffect } from 'react';
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import * as Tesseract from 'tesseract.js';
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
  const [showRawJson, setShowRawJson] = useState(false);
  const [rawOcrJson, setRawOcrJson] = useState('');

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
    
    try {
      // Load the image
      const image = new Image();
      image.src = URL.createObjectURL(imageFile);
      
      await new Promise((resolve) => {
        image.onload = resolve;
      });
      
      // Create a canvas and optimize the image
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(image, 0, 0);
      
      // Optimize the image for OCR
      const optimizedDataUrl = optimizeImageForOCR(canvas);
      
      // Perform OCR with word bounding boxes
      const worker = await createWorker('eng');
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ,.;:()[]{}/\\-+*&^%$#@!?<>|"\' ',
      });
      
      // Get detailed OCR results with bounding boxes
      setProcessingStatus('Extracting text and analyzing table structure...');
      const { data } = await worker.recognize(optimizedDataUrl);
      await worker.terminate();
      
      // Process words with their positions
      setProcessingStatus('Processing table structure...');
      const structuredTable = processTableStructure(data);
      
      return JSON.stringify(structuredTable);
    } catch (error) {
      console.error('Error extracting text from image:', error);
      setError(error instanceof Error ? error.message : 'Error extracting text from image. Please try again.');
      return '';
    }
  };

  // Process OCR results into table structure
  const processTableStructure = (ocrData: any): string[][] => {
    if (!ocrData || !ocrData.words || ocrData.words.length === 0) {
      return [['No text detected']];
    }
    
    // Extract words with their positions
    const words = ocrData.words.map((word: any) => ({
      text: word.text,
      confidence: word.confidence,
      bbox: word.bbox // {x0, y0, x1, y1}
    }));
    
    // Group words by rows based on Y position
    const rowGroups: { [key: number]: any[] } = {};
    const rowTolerance = 10; // pixels tolerance for considering words on the same row
    
    words.forEach((word: any) => {
      const centerY = (word.bbox.y0 + word.bbox.y1) / 2;
      
      // Find if this word belongs to an existing row
      let assignedToRow = false;
      for (const rowY in rowGroups) {
        const rowCenterY = parseFloat(rowY);
        if (Math.abs(centerY - rowCenterY) <= rowTolerance) {
          rowGroups[rowY].push(word);
          assignedToRow = true;
          break;
        }
      }
      
      // If not assigned to any existing row, create a new row
      if (!assignedToRow) {
        rowGroups[centerY] = [word];
      }
    });
    
    // Sort rows by Y position
    const sortedRowKeys = Object.keys(rowGroups).map(Number).sort((a, b) => a - b);
    
    // For each row, sort words by X position
    const sortedRows = sortedRowKeys.map(rowY => {
      return rowGroups[rowY].sort((a: any, b: any) => a.bbox.x0 - b.bbox.x0);
    });
    
    // Now detect columns based on consistent spacing
    // First find potential column boundaries by analyzing word positions across rows
    
    // Analyze spacing between words in all rows to find potential column boundaries
    let allXCoordinates: number[] = [];
    sortedRows.forEach(row => {
      row.forEach(word => {
        // Add start and end positions of each word
        allXCoordinates.push(word.bbox.x0);
        allXCoordinates.push(word.bbox.x1);
      });
    });
    
    // Sort and deduplicate X coordinates
    allXCoordinates = [...new Set(allXCoordinates)].sort((a, b) => a - b);
    
    // Find gaps between X coordinates to identify potential column boundaries
    const gapThreshold = 20; // Minimum gap to consider a column boundary
    const gaps: {start: number, end: number, size: number}[] = [];
    
    for (let i = 0; i < allXCoordinates.length - 1; i++) {
      const gap = allXCoordinates[i + 1] - allXCoordinates[i];
      if (gap >= gapThreshold) {
        gaps.push({
          start: allXCoordinates[i],
          end: allXCoordinates[i + 1],
          size: gap
        });
      }
    }
    
    // Sort gaps by size in descending order
    gaps.sort((a, b) => b.size - a.size);
    
    // Use the largest gaps to determine column boundaries
    // We'll use the top N large gaps, where N depends on table complexity
    // For simplicity, let's assume N=5 (for tables with up to 6 columns)
    const maxColumns = Math.min(6, gaps.length + 1);
    const columnBoundaries = gaps.slice(0, maxColumns - 1).map(g => g.start).sort((a, b) => a - b);
    
    // Process rows into columns using boundaries
    const structuredTable: string[][] = [];
    
    // Process each row to detect columns
    sortedRows.forEach((row, rowIndex) => {
      const tableRow: string[] = [];
      
      // If this is the first row, consider it as column headers
      if (rowIndex === 0 && row.length > 1) {
        // Use individual words as column headers if no clear boundaries detected
        if (columnBoundaries.length === 0) {
          structuredTable.push(row.map(word => word.text));
          return;
        }
      }
      
      // Group words into columns based on detected column boundaries
      let currentColumn: string[] = [];
      let currentColumnIndex = 0;
      
      // Sort boundaries with word starts to create column groupings
      row.forEach(word => {
        const wordStartX = word.bbox.x0;
        
        // If we have boundaries and this word starts after the next boundary,
        // move to the next column
        while (currentColumnIndex < columnBoundaries.length && 
               wordStartX > columnBoundaries[currentColumnIndex]) {
          // Push current column words and start a new column
          if (currentColumn.length > 0) {
            tableRow.push(currentColumn.join(' '));
            currentColumn = [];
          } else {
            // Empty column
            tableRow.push('');
          }
          currentColumnIndex++;
        }
        
        // Add word to current column
        currentColumn.push(word.text);
      });
      
      // Add the last column
      if (currentColumn.length > 0) {
        tableRow.push(currentColumn.join(' '));
      }
      
      // Add placeholder columns if needed
      while (tableRow.length <= currentColumnIndex) {
        tableRow.push('');
      }
      
      structuredTable.push(tableRow);
    });
    
    return structuredTable;
  };

  // OCR process - starting from file upload
  // This single function now automatically populates all three outputs:
  // 1. Tab-delimited text in the OCR section
  // 2. Structured JSON in the JSON section
  // 3. Tabular view in the Tabular section
  const handleOcr = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    // Start with a clean slate
    setExtractedText('');
    setJsonText('');
    setStructuredData([]);
    setRawOcrJson('');

    setIsOcrProcessing(true);
    setIsJsonProcessing(true);
    setIsTabularProcessing(true);
    setError(null);
    setProcessingStatus('Starting OCR process...');
    
    try {
      let text = '';
      if (file.type === 'application/pdf') {
        text = await extractTextFromPdf(file);
      } else if (file.type.startsWith('image/')) {
        text = await extractTextFromImage(file);
      } else {
        throw new Error('Unsupported file format');
      }
      
      // We'll store the final results here
      let finalOcrText = '';
      let finalJsonData: Record<string, any>[] = [];
      let finalRawJson = '';

      // Handle possible structured table output
      try {
        // Check if the result is a structured table in JSON format
        const parsedStructure = JSON.parse(text);
        if (Array.isArray(parsedStructure) && parsedStructure.length > 0) {
          console.log("Parsed structure:", parsedStructure); // For debugging
          // Store the raw JSON for display option
          finalRawJson = text;
          
          // This is our structured table format
          // Convert structured table to readable text for display
          const formattedText = parsedStructure.map(row => 
            row.join('\t')
          ).join('\n');
          
          finalOcrText = formattedText;
          
          // First, extract headers from the first row
          const headers = parsedStructure[0] || [];
          
          // Create structured data objects for each row
          const tableData = parsedStructure.slice(1).map(row => {
            // Create objects from row data using headers
            if (headers.length > 0 && row.length === headers.length) {
              const obj: Record<string, string> = {};
              headers.forEach((header: string, index: number) => {
                obj[header] = row[index] || '';
              });
              return obj;
            }
            return { raw: row.join('\t') };
          });
          
          finalJsonData = tableData;
        } else {
          // Try to parse as a table based on lines and tabs
          const lines = text.split('\n').filter(line => line.trim());
          if (lines.length > 1) {
            console.log("Processing OCR text into table format...");
            // Try different delimiters and find the one that gives the most consistent column counts
            const delimiters = [
              /\t+/,         // Tab
              /\s{2,}/,      // 2+ spaces
              /\s*\|\s*/,    // Pipe with optional spaces
              /\s*;\s*/,     // Semicolon with optional spaces
              /\s*,\s*/      // Comma with optional spaces
            ];
            
            let bestRows: string[][] = [];
            let bestConsistency = 0;
            let mostCommonColumnCount = 0;
            
            for (const delimiter of delimiters) {
              const candidateRows = lines.map(line => {
                return line.split(delimiter).map(cell => cell.trim()).filter(cell => cell);
              }).filter(row => row.length > 0);
              
              if (candidateRows.length < 2) continue;  // Need at least header + one data row
              
              // Count occurrences of each column count
              const columnCounts: {[key: number]: number} = {};
              candidateRows.forEach(row => {
                columnCounts[row.length] = (columnCounts[row.length] || 0) + 1;
              });
              
              // Find the most common column count
              let maxCount = 0;
              let commonColumnCount = 0;
              
              Object.entries(columnCounts).forEach(([columns, count]) => {
                if (count > maxCount) {
                  maxCount = count;
                  commonColumnCount = parseInt(columns);
                }
              });
              
              // Calculate consistency as percentage of rows with the most common column count
              const consistency = maxCount / candidateRows.length;
              
              // If this delimiter gives better consistency and has multiple columns
              if (consistency > bestConsistency && commonColumnCount > 1) {
                bestConsistency = consistency;
                bestRows = candidateRows;
                mostCommonColumnCount = commonColumnCount;
              }
            }
            
            console.log(`Best table parsing consistency: ${bestConsistency * 100}% with ${mostCommonColumnCount} columns`);
            
            // If we found a good table structure (at least 50% consistent)
            if (bestConsistency >= 0.5 && mostCommonColumnCount > 1) {
              // Filter to rows with the right number of columns, or pad shorter rows
              const normalizedRows = bestRows.map(row => {
                if (row.length === mostCommonColumnCount) return row;
                if (row.length < mostCommonColumnCount) {
                  // Pad shorter rows
                  return [...row, ...Array(mostCommonColumnCount - row.length).fill('')];
                }
                // Truncate longer rows
                return row.slice(0, mostCommonColumnCount);
              });
              
              // Use first row as headers
              const headers = normalizedRows[0];
              const data = normalizedRows.slice(1).map(row => {
                const obj: Record<string, string> = {};
                headers.forEach((header, i) => {
                  obj[header] = row[i] || '';
                });
                return obj;
              });
              
              console.log("Created structured data from text:", data);
              finalOcrText = text;
              finalJsonData = data;
            } else {
              finalOcrText = text;
            }
          } else {
            finalOcrText = text;
          }
        }
      } catch (e) {
        console.error("Error processing OCR result:", e);
        // If it's not valid JSON, just use the text as-is
        finalOcrText = text;
      }

      // IMPORTANT: Now set all states at once to ensure they're synchronized
      console.log("Final JSON data:", finalJsonData);
      const jsonString = finalJsonData.length > 0 ? JSON.stringify(finalJsonData, null, 2) : '';
      
      // Use direct DOM manipulation as a fallback to ensure JSON is displayed
      document.querySelectorAll('textarea').forEach(el => {
        if (el.placeholder?.includes('JSON')) {
          el.value = jsonString;
        }
      });
      
      setExtractedText(finalOcrText);
      setRawOcrJson(finalRawJson);
      setJsonText(jsonString);
      setStructuredData(finalJsonData);
      
      // Force a pause before clearing loading states
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error('OCR error:', error);
      setError(error instanceof Error ? error.message : 'OCR process failed. Please try a different file.');
    } finally {
      // Ensure we clear loading states even if there was an error
      setIsOcrProcessing(false);
      setIsJsonProcessing(false);
      setIsTabularProcessing(false);
      setProcessingStatus('');
    }
  };

  // Convert OCR to JSON - this function now may not be needed if OCR already creates structured data
  const handleOcrToJson = async () => {
    if (!extractedText.trim()) {
      setError('No OCR text to convert');
      return;
    }

    // If we already have JSON, don't process again
    if (jsonText.trim()) {
      return;
    }

    setIsJsonProcessing(true);
    setError(null);
    setProcessingStatus('Converting text to JSON...');
    
    try {
      // Try to structure the data without OpenAI
      // Check if it's already in structured tab-delimited format
      // For simplicity, we'll try to structure it if it looks like a table
      const lines = extractedText.split('\n').filter(line => line.trim());
      if (lines.length > 1) {
        // Simple tab or multi-space delimiter detection
        const rows = lines.map(line => {
          return line.split(/\t+|\s{2,}/g).map(cell => cell.trim());
        });
        
        // Check if we have consistent columns
        const columnCount = rows[0].length;
        const isTableLike = rows.every(row => row.length === columnCount || Math.abs(row.length - columnCount) <= 1);
        
        if (isTableLike && columnCount > 1) {
          // Use first row as headers
          const headers = rows[0];
          const data = rows.slice(1).map(row => {
            const obj: Record<string, string> = {};
            headers.forEach((header, i) => {
              obj[header] = (row[i] || '').trim();
            });
            return obj;
          });
          
          setJsonText(JSON.stringify(data, null, 2));
          setStructuredData(data);
          setIsJsonProcessing(false);
          setProcessingStatus('');
          return;
        }
      }
      
      // If we couldn't structure it internally, fall back to OpenAI if available
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

    // If we already have structured data, don't process again
    if (structuredData.length > 0) {
      return;
    }

    setIsTabularProcessing(true);
    setError(null);
    setProcessingStatus('Converting text to tabular format...');
    
    try {
      // Try to generate JSON first if we don't already have it
      if (!jsonText.trim()) {
        await handleOcrToJson();
      }
      
      // If we now have jsonText, we can use it
      if (jsonText.trim()) {
        const tableData = JSON.parse(jsonText);
        setStructuredData(tableData);
      } else {
        // Fallback to OpenAI if needed
        const jsonData = await structureTableData(extractedText);
        
        if (jsonData.error) {
          throw new Error(jsonData.message || 'Failed to structure the data');
        }
        
        // Assuming the structureTableData returns an object with a data array
        const tableData = Array.isArray(jsonData.data) ? jsonData.data : [jsonData];
        setJsonText(JSON.stringify(tableData, null, 2));
        setStructuredData(tableData);
      }
    } catch (error) {
      console.error('Error converting to tabular:', error);
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
    <div className="section">
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
      <div className="container">
        {/* File Upload Section */}
        <Section title="Upload Lab Results">
          <div className="mb-4">
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
          </div>
          <Button
            onClick={handleOcr}
            disabled={!file || isOcrProcessing}
          >
            {isOcrProcessing ? 'Processing...' : 'Extract Text & Generate All Outputs'}
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

        {/* OCR Text Section */}
        <Section 
          title="Extracted Text (OCR)" 
          buttons={
            <>
              {rawOcrJson && (
                <Button
                  onClick={() => setShowRawJson(!showRawJson)}
                  disabled={false}
                >
                  {showRawJson ? 'Show Formatted Text' : 'Show Raw JSON'}
                </Button>
              )}
              <Button
                onClick={handleOcrToAnalysis}
                disabled={!extractedText || isAnalysisProcessing}
              >
                {isAnalysisProcessing ? 'Processing...' : 'Analyze Results'}
              </Button>
            </>
          }
        >
          <textarea
            value={showRawJson ? rawOcrJson : extractedText}
            onChange={handleOcrTextChange}
            className="bg-gray-50 p-4 rounded-md resize-none border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 text-base leading-relaxed"
            placeholder="OCR results will appear here..."
            spellCheck="false"
          />
        </Section>

        {/* JSON Data Section */}
        <Section 
          title="Structured Data (JSON)" 
          buttons={
            <Button
              onClick={handleJsonToAnalysis}
              disabled={!jsonText || isAnalysisProcessing}
            >
              {isAnalysisProcessing ? 'Processing...' : 'Analyze Results'}
            </Button>
          }
        >
          <textarea
            value={jsonText}
            onChange={handleJsonTextChange}
            className="bg-gray-50 p-4 rounded-md resize-none border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 font-mono text-sm leading-relaxed"
            placeholder="JSON data will appear here..."
            spellCheck="false"
          />
        </Section>

        {/* Tabular Data Section */}
        <Section 
          title="Tabular Data"
          buttons={
            <Button 
              onClick={handleTabularToAnalysis} 
              disabled={structuredData.length === 0 || isAnalysisProcessing}
            >
              {isAnalysisProcessing ? 'Processing...' : 'Analyze Results'}
            </Button>
          }
        >
          <div className="table-container overflow-y-auto border border-gray-200 rounded-md bg-white">
            {structuredData.length > 0 ? (
              <DataTable 
                data={structuredData} 
                className="w-full" 
              />
            ) : (
              <div className="p-4 text-gray-500 italic">No tabular data available</div>
            )}
          </div>
        </Section>

        {/* Analysis Results Section */}
        <Section title="Lab Analysis">
          <textarea
            value={analysisText}
            onChange={handleAnalysisTextChange}
            className="bg-gray-50 p-4 rounded-md resize-none border border-gray-300 focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 text-base leading-relaxed analysis-textarea"
            placeholder="Analysis results will appear here..."
            spellCheck="false"
          />
        </Section>
      </div>
      
      {/* Error display */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      )}
      
      {/* Processing status */}
      {processingStatus && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg">
          {processingStatus}
        </div>
      )}
    </div>
  );
};

export default App; 