export interface LabTest {
  name: string;
  result: string;
  previousResult?: string;
  lowerLimit?: string;
  upperLimit?: string;
  unit?: string;
}

export interface LabSection {
  name: string;
  tests: LabTest[];
}

export interface LabReport {
  patientName: string;
  patientRef: string;
  date: string;
  pageInfo: string;
  sections: LabSection[];
}

/**
 * Formats OCR text into a structured lab report format
 * @param text Raw OCR text from the lab report
 * @returns Formatted text in the desired output format
 */
export const formatLabResults = (text: string): string => {
  try {
    // Clean up the text first
    const cleanedText = cleanOcrText(text);
    
    // Extract patient info and header
    const patientMatch = cleanedText.match(/Pati[ëe]nt\s*:\s*([^\n]+)/i);
    const refMatch = cleanedText.match(/Ref\s*\.?\s*:\s*([0-9]+)/i);
    const dateMatch = cleanedText.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
    const pageMatch = cleanedText.match(/blz\s*\.?\s*(\d+\/\d+)/i);
    
    const patientName = patientMatch ? patientMatch[1].trim() : '';
    const refNumber = refMatch ? refMatch[1].trim() : '';
    const date = dateMatch ? dateMatch[0] : '';
    const pageInfo = pageMatch ? pageMatch[1] : '';
    
    // Format the header
    let formattedText = `Patiënt : ${patientName}                             Ref. : ${refNumber}\n`;
    formattedText += `                                                  ${date}      blz. ${pageInfo}\n\n`;
    
    // Format the table header
    formattedText += 'Testen                 Resultaten       Vorige resultaten   Onderl.   Bovenl.   Eenheden\n';
    formattedText += '---------------------------------------------------------------------------------------\n';
    
    // Extract dates from the table header section
    const tableHeaderLines = cleanedText.split('\n').filter(line => 
      line.match(/Testen|Resultaten|Vorige|Onderl|Bovenl|Eenheden/i)
    );
    
    // Look for date lines that typically appear after the table header
    const dateLines = [];
    const dateRegex = /^\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*$/;
    
    // Find the line with the table header
    const headerLineIndex = cleanedText.split('\n').findIndex(line => 
      line.match(/Testen|Resultaten|Vorige|Onderl|Bovenl|Eenheden/i)
    );
    
    // Look for dates in the lines after the header
    if (headerLineIndex !== -1) {
      const lines = cleanedText.split('\n');
      for (let i = headerLineIndex + 1; i < headerLineIndex + 5 && i < lines.length; i++) {
        const dateMatch = lines[i].match(dateRegex);
        if (dateMatch) {
          dateLines.push(dateMatch[1].trim());
        }
      }
    }
    
    // If we couldn't find dates after the header, look for them anywhere in the text
    if (dateLines.length === 0) {
      cleanedText.split('\n').forEach(line => {
        const dateMatch = line.match(dateRegex);
        if (dateMatch) {
          dateLines.push(dateMatch[1].trim());
        }
      });
    }
    
    const currentDate = dateLines.length > 0 ? dateLines[0] : '';
    const previousDate = dateLines.length > 1 ? dateLines[1] : '';
    
    formattedText += `${currentDate}               ${previousDate}\n\n`;
    
    // Process the test sections
    const sections = extractTestSections(cleanedText);
    
    // Format each section
    sections.forEach(section => {
      formattedText += `${section.name}\n`;
      
      // Format each test in the section
      section.tests.forEach(test => {
        // Pad the test name to align columns
        const paddedName = padRight(test.name, 20);
        const paddedResult = padRight(test.result || '', 15);
        const paddedPrevResult = padRight(test.previousResult || '', 18);
        const paddedLowerLimit = padRight(test.lowerLimit || '', 9);
        const paddedUpperLimit = padRight(test.upperLimit || '', 9);
        
        formattedText += `${paddedName} ${paddedResult} ${paddedPrevResult} ${paddedLowerLimit} ${paddedUpperLimit} ${test.unit || ''}\n`;
      });
      
      formattedText += '\n';
    });
    
    return formattedText;
  } catch (error) {
    console.error('Error formatting lab results:', error);
    return text; // Return original text if formatting fails
  }
};

/**
 * Extract test sections from OCR text
 */
const extractTestSections = (text: string): LabSection[] => {
  const sections: LabSection[] = [];
  let currentSection: LabSection | null = null;
  
  // Split text into lines and process each line
  const lines = text.split('\n');
  
  // First, identify section headers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Skip lines that are likely dates
    if (line.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/)) continue;
    
    // Skip lines that are likely table headers
    if (line.match(/Testen|Resultaten|Vorige|Onderl|Bovenl|Eenheden/i)) continue;
    
    // Check if this is a section header (all caps, no numbers)
    if (line.match(/^[A-ZÄËÏÖÜÁÉÍÓÚÀÈÌÒÙ\s]+$/) && !line.match(/^\d/) && line.length > 3) {
      // Start a new section
      currentSection = {
        name: line,
        tests: []
      };
      sections.push(currentSection);
      continue;
    }
    
    // If we have a current section, try to extract test data
    if (currentSection) {
      // Try to match test pattern with more flexible spacing
      // This regex is designed to better handle the format in the screenshot
      const testPattern = /^([A-Za-z0-9äëïöüáéíóúàèìòù\s\-\(\)]+?)\s{2,}(\d+[.,]?\d*)\s{2,}(\d+[.,]?\d*)?\s{2,}?(\d+[.,]?\d*)?\s{0,2}[-–]\s{0,2}(\d+[.,]?\d*)?\s{2,}?([A-Za-z0-9\/\%\-\+]+)?$/;
      const testMatch = line.match(testPattern);
      
      if (testMatch) {
        currentSection.tests.push({
          name: testMatch[1].trim(),
          result: testMatch[2],
          previousResult: testMatch[3],
          lowerLimit: testMatch[4],
          upperLimit: testMatch[5],
          unit: testMatch[6]
        });
        continue;
      }
      
      // Try alternative pattern for cases where columns might be misaligned
      const altPattern = /^([A-Za-z0-9äëïöüáéíóúàèìòù\s\-\(\)]+?)\s+(\d+[.,]?\d*)/;
      const altMatch = line.match(altPattern);
      
      if (altMatch) {
        // Extract the test name and result
        const testName = altMatch[1].trim();
        const result = altMatch[2];
        
        // Try to extract the remaining values from the rest of the line
        const remainingLine = line.substring(altMatch[0].length).trim();
        const remainingValues = remainingLine.split(/\s{2,}/).filter(val => val.trim());
        
        // Map the remaining values to the appropriate fields
        const previousResult = remainingValues.length > 0 ? remainingValues[0] : '';
        const lowerLimit = remainingValues.length > 1 ? remainingValues[1] : '';
        
        // Check if the next value is a range separator
        let upperLimitIndex = 2;
        if (remainingValues.length > 2 && remainingValues[2].match(/^[-–]$/)) {
          upperLimitIndex = 3;
        }
        
        const upperLimit = remainingValues.length > upperLimitIndex ? remainingValues[upperLimitIndex] : '';
        const unit = remainingValues.length > upperLimitIndex + 1 ? remainingValues[upperLimitIndex + 1] : '';
        
        currentSection.tests.push({
          name: testName,
          result: result,
          previousResult: previousResult,
          lowerLimit: lowerLimit,
          upperLimit: upperLimit,
          unit: unit
        });
      }
    }
  }
  
  // If no sections were found, try to create a default section
  if (sections.length === 0) {
    // Look for lines that might contain test results
    const testLines = lines.filter(line => 
      line.match(/^[A-Za-z0-9äëïöüáéíóúàèìòù\s\-\(\)]+\s+\d+[.,]?\d*/)
    );
    
    if (testLines.length > 0) {
      const defaultSection: LabSection = {
        name: "TESTS",
        tests: []
      };
      
      testLines.forEach(line => {
        // Try the same patterns as above
        const testPattern = /^([A-Za-z0-9äëïöüáéíóúàèìòù\s\-\(\)]+?)\s{2,}(\d+[.,]?\d*)\s{2,}(\d+[.,]?\d*)?\s{2,}?(\d+[.,]?\d*)?\s{0,2}[-–]\s{0,2}(\d+[.,]?\d*)?\s{2,}?([A-Za-z0-9\/\%\-\+]+)?$/;
        const testMatch = line.match(testPattern);
        
        if (testMatch) {
          defaultSection.tests.push({
            name: testMatch[1].trim(),
            result: testMatch[2],
            previousResult: testMatch[3],
            lowerLimit: testMatch[4],
            upperLimit: testMatch[5],
            unit: testMatch[6]
          });
          return;
        }
        
        // Try alternative pattern
        const altPattern = /^([A-Za-z0-9äëïöüáéíóúàèìòù\s\-\(\)]+?)\s+(\d+[.,]?\d*)/;
        const altMatch = line.match(altPattern);
        
        if (altMatch) {
          // Extract the test name and result
          const testName = altMatch[1].trim();
          const result = altMatch[2];
          
          // Try to extract the remaining values from the rest of the line
          const remainingLine = line.substring(altMatch[0].length).trim();
          const remainingValues = remainingLine.split(/\s{2,}/).filter(val => val.trim());
          
          // Map the remaining values to the appropriate fields
          const previousResult = remainingValues.length > 0 ? remainingValues[0] : '';
          const lowerLimit = remainingValues.length > 1 ? remainingValues[1] : '';
          
          // Check if the next value is a range separator
          let upperLimitIndex = 2;
          if (remainingValues.length > 2 && remainingValues[2].match(/^[-–]$/)) {
            upperLimitIndex = 3;
          }
          
          const upperLimit = remainingValues.length > upperLimitIndex ? remainingValues[upperLimitIndex] : '';
          const unit = remainingValues.length > upperLimitIndex + 1 ? remainingValues[upperLimitIndex + 1] : '';
          
          defaultSection.tests.push({
            name: testName,
            result: result,
            previousResult: previousResult,
            lowerLimit: lowerLimit,
            upperLimit: upperLimit,
            unit: unit
          });
        }
      });
      
      if (defaultSection.tests.length > 0) {
        sections.push(defaultSection);
      }
    }
  }
  
  return sections;
};

/**
 * Pad a string with spaces to the right to reach the specified length
 */
const padRight = (str: string, length: number): string => {
  if (!str) return ' '.repeat(length);
  return str + ' '.repeat(Math.max(0, length - str.length));
};

/**
 * Post-process OCR text to improve recognition quality
 * @param text Raw OCR text
 * @returns Cleaned and improved OCR text
 */
export const cleanOcrText = (text: string): string => {
  // Replace common OCR errors
  let cleaned = text
    // Fix common character confusions
    .replace(/[|]/g, 'I')
    .replace(/[lI](\d)/g, '1$1') // Replace l or I followed by digit with 1
    .replace(/(\d)[oO]/g, '$10') // Replace o or O preceded by digit with 0
    .replace(/[oO](\d)/g, '0$1') // Replace o or O followed by digit with 0
    .replace(/[cC][oO](\d)/g, 'CO$1') // Preserve CO2 and similar
    
    // Fix spacing issues
    .replace(/\s{2,}/g, ' ')
    
    // Fix date formats
    .replace(/(\d{1,2})[\s\.]+(\d{1,2})[\s\.]+(\d{2,4})/g, '$1/$2/$3')
    
    // Fix units
    .replace(/([0-9]) g\/d[lL]/g, '$1 g/dL')
    .replace(/([0-9]) mm[0o]l\/m[0o]l/g, '$1 mmol/mol')
    .replace(/([0-9]) mm[0o]l\/[lL]/g, '$1 mmol/L')
    
    // Fix common lab test names
    .replace(/[hH][bB][aA][l1I][cC]/g, 'HbA1c')
    .replace(/[hH]em[0o]gl[0o]b[il]ne/g, 'Hemoglobine')
    .replace(/[hH]emat[0o]cr[il]et/g, 'Hematocriet')
    .replace(/[aA][l1I][cC] [hH]em[0o]gl[0o]b[il]ne/g, 'A1c Hemoglobine')
    .replace(/[aA][l1I][cC]-[hH]em[0o]gl[0o]b[il]ne/g, 'A1c-Hemoglobine')
    .replace(/[bB][iI][oO][cC][hH][eE][mM][iI][eE]/g, 'BIOCHEMIE');
  
  return cleaned;
}; 