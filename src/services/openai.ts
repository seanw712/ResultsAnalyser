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

export default {
  analyzeBloodwork
}; 