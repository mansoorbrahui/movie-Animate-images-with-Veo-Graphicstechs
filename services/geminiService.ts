import { GoogleGenAI, Modality } from "@google/genai";
import { AspectRatio } from "../types";

// Helper to get fresh AI instance (handling potential key updates)
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// Interface for the injected AI Studio widget
interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}

export async function checkApiKey(): Promise<boolean> {
  const aistudio = (window as any).aistudio as AIStudio | undefined;
  if (aistudio && aistudio.hasSelectedApiKey) {
    return await aistudio.hasSelectedApiKey();
  }
  // Fallback for environments without the specific widget, assume env var is there if not using the widget
  return !!process.env.API_KEY;
}

export async function promptApiKeySelection(): Promise<void> {
  const aistudio = (window as any).aistudio as AIStudio | undefined;
  if (aistudio && aistudio.openSelectKey) {
    await aistudio.openSelectKey();
  } else {
    console.warn("AI Studio key selection widget not available.");
  }
}

/**
 * Generate a creative story intro based on an image.
 */
export async function generateStory(imageBase64: string, mimeType: string): Promise<string> {
  const ai = getAI();
  const prompt = `
    Analyze the mood, lighting, and details of this image. 
    Ghostwrite a compelling, atmospheric opening paragraph (approx 80-100 words) to a story set in this world.
    Focus on sensory details and setting the scene. Do not start with "Here is a story" or similar meta-text.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        { inlineData: { data: imageBase64, mimeType } },
        { text: prompt }
      ]
    },
    config: {
      temperature: 0.8 // Slightly creative
    }
  });

  return response.text || "The mists of silence covered the land...";
}

/**
 * Generate a Veo video from an image.
 */
export async function generateVeoVideo(
  imageBase64: string, 
  mimeType: string, 
  ratio: AspectRatio
): Promise<string> {
  const ai = getAI();
  
  // Create the operation
  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-fast-generate-preview',
    prompt: "Cinematic, high quality, animated motion, atmospheric lighting", // Required field, providing a generic enhancer
    image: {
      imageBytes: imageBase64,
      mimeType: mimeType,
    },
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: ratio
    }
  });

  // Poll for completion
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s between polls
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  // Extract URI
  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) {
    throw new Error("No video generated in response.");
  }

  // Fetch the actual video blob with the key
  const videoResponse = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  if (!videoResponse.ok) {
    throw new Error("Failed to download generated video.");
  }

  const videoBlob = await videoResponse.blob();
  return URL.createObjectURL(videoBlob);
}

/**
 * Generate Speech from text.
 */
export async function generateSpeech(text: string): Promise<string> {
  const ai = getAI();
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' }, // 'Kore' is usually good for storytelling
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error("No audio data returned.");
  }

  return base64Audio;
}