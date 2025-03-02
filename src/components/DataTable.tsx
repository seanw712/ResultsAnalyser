import React from 'react';

interface DataTableProps {
  data: Record<string, any>[];
  title?: string;
  className?: string;
}

const DataTable: React.FC<DataTableProps> = ({ data, title, className = '' }) => {
  if (!data || data.length === 0) {
    return <div className="text-gray-500 italic">No data available</div>;
  }

  // Get headers from the first object's keys
  const headers = Object.keys(data[0]);

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
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
            >
              {headers.map((header) => (
                <td
                  key={`${rowIndex}-${header}`}
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                >
                  {row[header]?.toString() || ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable; 