import React from 'react';
import Section from './ui/Section';
import Button from './ui/Button';

interface TextSectionProps {
  title: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  buttons?: React.ReactNode;
  className?: string;
  isMonospace?: boolean;
}

const TextSection: React.FC<TextSectionProps> = ({
  title,
  value,
  onChange,
  placeholder = '',
  buttons,
  className = '',
  isMonospace = false
}) => {
  return (
    <Section title={title} buttons={buttons}>
      <textarea
        value={value}
        onChange={onChange}
        className={`bg-gray-50 p-4 rounded-md resize-none border border-gray-300 
          focus:border-blue-500 focus:ring focus:ring-blue-200 focus:ring-opacity-50 
          ${isMonospace ? 'font-mono text-sm' : 'text-base'} leading-relaxed ${className}`}
        placeholder={placeholder}
        spellCheck="false"
      />
    </Section>
  );
};

export default TextSection; 