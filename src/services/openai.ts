import OpenAI from 'openai';

const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

// Create OpenAI instance only if API key is available
const openai = apiKey 
  ? new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true // Only for demo purposes, not recommended for production
    })
  : null;

export const analyzeBloodwork = async (text: string): Promise<string> => {
  try {
    // Check if OpenAI instance is available
    if (!openai) {
      console.warn('OpenAI API key not found. Providing mock analysis.');
      return 'API key not configured. This is a mock analysis response.\n\nPlease set up your VITE_OPENAI_API_KEY in the .env file to receive real analysis.';
    }
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      store: true,
      messages: [
        { 
          role: "system", 
          content: "You are a medical assistant specializing in blood work analysis. Analyze the provided blood test results, highlighting any abnormal values and their potential implications. Focus on key findings and present them in a clear, professional manner." 
        },
        { 
          role: "user", 
          content: `Please analyze these blood test results:\n\n${text}` 
        }
      ]
    });

    return completion.choices[0].message.content || 'No analysis available';
  } catch (error) {
    console.error('Error analyzing blood work:', error);
    return 'Error: Unable to analyze blood work results. Please check your API key and network connection.';
  }
};

/**
 * Converts OCR'd text from tables to structured JSON format
 * @param ocrText The unstructured OCR'd text from a table
 * @returns A JSON object with structured data extracted from the table
 */
export const structureTableData = async (ocrText: string): Promise<any> => {
  try {
    // Check if OpenAI instance is available
    if (!openai) {
      console.warn('OpenAI API key not found. Providing mock structured data.');
      return { 
        error: "API key not configured", 
        message: "Please set up your VITE_OPENAI_API_KEY in the .env file to receive real structured data."
      };
    }
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { 
          role: "system", 
          content: `You are an AI assistant that specializes in converting OCR'd table text into structured data.
          Your task is to interpret the provided OCR text that originated from a table and convert it into a well-structured JSON format.
          Follow these guidelines:
          1. Identify column headers and use them as keys in the JSON
          2. Create an array of objects where each object represents a row in the original table
          3. Handle any misalignments or OCR errors intelligently
          4. If the table structure is unclear, create the most logical structure based on the content
          5. Return only valid JSON with no explanations or markdown`
        },
        { 
          role: "user", 
          content: `Convert this OCR'd table text to structured JSON:\n\n${ocrText}` 
        }
      ]
    });

    // Parse the JSON response
    const jsonResponse = JSON.parse(completion.choices[0].message.content || '{}');
    return jsonResponse;
  } catch (error) {
    console.error('Error structuring table data:', error);
    return { 
      error: "Processing failed", 
      message: "Unable to convert OCR text to structured data. Please check your API key and network connection."
    };
  }
};

export default {
  analyzeBloodwork,
  structureTableData
}; 