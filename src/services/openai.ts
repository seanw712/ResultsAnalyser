import OpenAI from 'openai';

// In a real application, you would use environment variables for the API key
// For this demo, we'll just simulate the API call
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here', // Replace with your actual API key
  dangerouslyAllowBrowser: true // Only for demo purposes, not recommended for production
});

export const analyzeBloodwork = async (text: string): Promise<string> => {
  try {
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
    throw new Error('Unable to analyze blood work results. Please check the data and try again.');
  }
};

export default {
  analyzeBloodwork
}; 