import React from 'react';

interface SectionProps {
  title: string;
  children: React.ReactNode;
  buttons?: React.ReactNode;
  className?: string;
}

const Section: React.FC<SectionProps> = ({ 
  title, 
  children, 
  buttons,
  className = ''
}) => (
  <div className={`section ${className}`}>
    <h2 className="text-xl font-semibold mb-4">{title}</h2>
    {children}
    {buttons && (
      <div className="mt-4 flex flex-wrap gap-3">
        {buttons}
      </div>
    )}
  </div>
);

export default Section; 