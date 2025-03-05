import React from 'react';

interface StatusDisplayProps {
  processingStatus?: string;
  error?: string | null;
  progress?: number;
}

const StatusDisplay: React.FC<StatusDisplayProps> = ({
  processingStatus,
  error,
  progress
}) => {
  return (
    <>
      {processingStatus && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-md p-4">
          <p className="text-blue-700 mb-2">
            <span className="animate-pulse inline-block h-2 w-2 rounded-full bg-blue-600 mr-2"></span>
            {processingStatus}
          </p>
          {progress !== undefined && (
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600">{error}</p>
        </div>
      )}
    </>
  );
};

export default StatusDisplay; 