export interface StoryState {
  text: string;
  isGenerating: boolean;
  error: string | null;
}

export interface VideoState {
  url: string | null;
  isGenerating: boolean;
  progressMessage: string;
  error: string | null;
}

export interface AudioState {
  isPlaying: boolean;
  isGenerating: boolean;
  audioBuffer: AudioBuffer | null;
}

export enum AspectRatio {
  LANDSCAPE = '16:9',
  PORTRAIT = '9:16'
}

// Window interface extension for Veo API Key selection
declare global {
  interface Window {
    // aistudio definition removed to prevent conflict with global 'AIStudio' type
    webkitAudioContext: typeof AudioContext;
  }
}