import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import StatusDisplay from './components/StatusDisplay';
import TextSection from './components/TextSection';
import Button from './components/ui/Button';
import Section from './components/ui/Section';
import useOcrProcessing from './hooks/useOcrProcessing';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const {
    state: {
      extractedText,
      analysisText,
      rawOcrJson,
      showRawJson,
      isOcrProcessing,
      isAnalysisProcessing,
      error,
      processingStatus,
      progress
    },
    handleOcr,
    handleAnalysis,
    updateState,
    cancelProcessing
  } = useOcrProcessing();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type === 'application/pdf' || selectedFile.type.startsWith('image/')) {
        setFile(selectedFile);
      } else {
        alert('Please upload a PDF or image file');
      }
    }
  };

  const handleProcess = async () => {
    if (file) {
      await handleOcr(file);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="container">
        {/* File Upload Section */}
        <Section title="Upload Lab Results">
          <FileUpload
            onFileChange={handleFileChange}
            onProcess={handleProcess}
            isProcessing={isOcrProcessing}
            onCancel={cancelProcessing}
            file={file}
          />
        </Section>

        {/* Status Display */}
        <StatusDisplay
          processingStatus={processingStatus}
          error={error}
          progress={progress}
        />

        {/* OCR Text Section */}
        <TextSection
          title="Extracted Text (OCR)"
          value={showRawJson ? rawOcrJson : extractedText}
          onChange={(e) => updateState({ extractedText: e.target.value })}
          placeholder="OCR results will appear here..."
          buttons={
            <>
              {rawOcrJson && (
                <Button
                  onClick={() => updateState({ showRawJson: !showRawJson })}
                >
                  {showRawJson ? 'Show Formatted Text' : 'Show Raw JSON'}
                </Button>
              )}
              <Button
                onClick={handleAnalysis}
                disabled={!extractedText || isAnalysisProcessing}
              >
                {isAnalysisProcessing ? 'Processing...' : 'Analyze Results'}
              </Button>
            </>
          }
        />

        {/* Analysis Results Section */}
        <TextSection
          title="Lab Analysis"
          value={analysisText}
          onChange={(e) => updateState({ analysisText: e.target.value })}
          placeholder="Analysis results will appear here..."
        />
      </div>
    </div>
  );
};

export default App; 