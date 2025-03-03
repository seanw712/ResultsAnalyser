import React, { useEffect } from 'react';

interface DataTableProps {
  data: Record<string, any>[];
  title?: string;
  className?: string;
}

const DataTable: React.FC<DataTableProps> = ({ data, title, className = '' }) => {
  // Debug log to see what data we're receiving
  useEffect(() => {
    console.log("DataTable received data:", data);
  }, [data]);

  if (!data || data.length === 0) {
    console.log("No data available for DataTable");
    return <div className="text-gray-500 italic p-4">No data available</div>;
  }

  // Get headers from the keys of all objects to ensure we capture all possible columns
  const allHeaders = new Set<string>();
  data.forEach(row => {
    Object.keys(row).forEach(key => {
      if (key !== 'raw') { // Skip 'raw' keys used for fallback
        allHeaders.add(key);
      }
    });
  });
  
  const headers = Array.from(allHeaders);
  console.log("DataTable headers:", headers);
  
  // If no valid headers but we have data with 'raw' property, show raw data
  if (headers.length === 0 && data[0]?.raw) {
    console.log("Using raw data display for DataTable");
    return (
      <div className={`overflow-x-auto ${className}`}>
        {title && (
          <h3 className="text-lg font-semibold mb-2 text-gray-800">{title}</h3>
        )}
        <div className="bg-white p-4 border border-gray-200 rounded-lg">
          {data.map((row, i) => (
            <div key={i} className="py-2 border-b border-gray-100">
              {row.raw}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      {title && (
        <h3 className="text-lg font-semibold mb-2 text-gray-800">{title}</h3>
      )}
      <table className="min-w-full bg-white border border-gray-200 shadow-sm rounded-lg overflow-hidden">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {data.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {headers.map((header, colIndex) => {
                const cellValue = row[header];
                console.log(`Cell [${rowIndex}][${header}]:`, cellValue);
                return (
                  <td
                    key={`${rowIndex}-${colIndex}`}
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-500"
                  >
                    {cellValue !== undefined ? cellValue : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable; 