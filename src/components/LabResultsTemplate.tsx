import React from 'react';
import Section from './ui/Section';
import Button from './ui/Button';

// Define the structure for a lab result row
export interface LabResultRow {
  testName: string;
  result: string;
  previousResult: string;
  referenceLower: string;
  referenceUpper: string;
  unit: string;
  comments: string;
}

interface LabResultsTemplateProps {
  data: LabResultRow[];
  onDataChange: (newData: LabResultRow[]) => void;
  onAnalyze: () => void;
  isProcessing: boolean;
}

const LabResultsTemplate: React.FC<LabResultsTemplateProps> = ({
  data,
  onDataChange,
  onAnalyze,
  isProcessing
}) => {
  // Function to handle changes to a specific cell
  const handleCellChange = (rowIndex: number, field: keyof LabResultRow, value: string) => {
    const newData = [...data];
    newData[rowIndex] = {
      ...newData[rowIndex],
      [field]: value
    };
    onDataChange(newData);
  };

  // Function to add a new empty row
  const addRow = () => {
    onDataChange([
      ...data,
      {
        testName: '',
        result: '',
        previousResult: '',
        referenceLower: '',
        referenceUpper: '',
        unit: '',
        comments: ''
      }
    ]);
  };

  // Function to remove a row
  const removeRow = (index: number) => {
    const newData = [...data];
    newData.splice(index, 1);
    onDataChange(newData);
  };

  return (
    <Section 
      title="Lab Results Template" 
      buttons={
        <>
          <Button onClick={addRow}>
            Add Row
          </Button>
          <Button 
            onClick={onAnalyze}
            disabled={data.length === 0 || isProcessing}
          >
            {isProcessing ? 'Processing...' : 'Analyze Results'}
          </Button>
        </>
      }
    >
      <div className="overflow-x-auto border border-gray-200 rounded-md bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Test Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Result
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Previous Result
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reference Value (Lower)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reference Value (Upper)
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Unit
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Comments
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                  No data available. Add a row or process OCR results.
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {Object.keys(row).map((key) => (
                    <td key={`${rowIndex}-${key}`} className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="text"
                        value={row[key as keyof LabResultRow]}
                        onChange={(e) => handleCellChange(rowIndex, key as keyof LabResultRow, e.target.value)}
                        className="w-full p-1 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      />
                    </td>
                  ))}
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => removeRow(rowIndex)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
};

export default LabResultsTemplate; 