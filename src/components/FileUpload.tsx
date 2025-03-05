import React from 'react';
import Button from './ui/Button';

interface FileUploadProps {
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onProcess: () => void;
  onCancel: () => void;
  isProcessing: boolean;
  file: File | null;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onFileChange,
  onProcess,
  onCancel,
  isProcessing,
  file
}) => {
  return (
    <div>
      <div className="mb-4">
        <input
          type="file"
          accept=".pdf,image/*"
          onChange={onFileChange}
          className="block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100"
        />
      </div>
      {isProcessing ? (
        <Button
          onClick={onCancel}
          className="bg-red-600 hover:bg-red-700"
        >
          Cancel Processing
        </Button>
      ) : (
        <Button
          onClick={onProcess}
          disabled={!file}
        >
          Extract Text & Generate All Outputs
        </Button>
      )}
    </div>
  );
};

export default FileUpload; 