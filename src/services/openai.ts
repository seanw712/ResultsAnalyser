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
          Your task is to interpret the provided OCR text that originated from a table and convert it into a well-structured JSON format. Example:   {
            "test_name": "Cortisol ochtend",
            "result_current": 16.8,
            "result_previous": 12.6,
            "reference_range_lower_value": "4.3",
            "reference_range_upper_value": "22.4",
            "unit": "g/dL",
            "comment": "Risico indicatie bij hoge waardes"
          }
          Follow these guidelines:
          1. Ensure all values are taken into account, and are in the correct unit (mg/dL, mmol/L, etc.)
          2. Stick to the example format, do not add any other keys. If you cannot find a value, use null.
          3. Create an array of objects where each object represents a row in the original table
          4. Handle any misalignments or OCR errors intelligently and feed possible errors to the user with the tag "ERROR".
          5. Return only valid JSON with no explanations or markdown`
        },
        { 
          role: "user", 
          content: `Convert this extracted text (OCR) to structured JSON:\n\n${ocrText}` 
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