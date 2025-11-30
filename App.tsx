import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Film, FileText, Play, Square, Wand2, Volume2, Loader2, AlertCircle } from 'lucide-react';
import { Button } from './components/Button';
import { LoadingOverlay } from './components/LoadingOverlay';
import { generateStory, generateSpeech, generateVeoVideo, checkApiKey, promptApiKeySelection } from './services/geminiService';
import { decodeAudioData } from './services/audioUtils';
import { StoryState, VideoState, AudioState, AspectRatio } from './types';

export default function App() {
  // --- State ---
  const [apiKeyReady, setApiKeyReady] = useState(false);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  const [story, setStory] = useState<StoryState>({
    text: '',
    isGenerating: false,
    error: null
  });

  const [video, setVideo] = useState<VideoState>({
    url: null,
    isGenerating: false,
    progressMessage: '',
    error: null
  });

  const [audio, setAudio] = useState<AudioState>({
    isPlaying: false,
    isGenerating: false,
    audioBuffer: null
  });
  
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(AspectRatio.LANDSCAPE);

  // --- Refs ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // --- Effects ---
  useEffect(() => {
    // Check initial API key status
    checkApiKey().then(setApiKeyReady);
  }, []);

  // Initialize AudioContext lazily
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    }
    return audioContextRef.current;
  }, []);

  // --- Handlers ---

  const handleApiKeySelect = async () => {
    try {
      await promptApiKeySelection();
      const ready = await checkApiKey();
      setApiKeyReady(ready);
    } catch (e) {
      console.error("Failed to select API key", e);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setImagePreview(result);
        
        // Reset states
        setStory({ text: '', isGenerating: false, error: null });
        setVideo({ url: null, isGenerating: false, progressMessage: '', error: null });
        stopAudio();
        setAudio({ isPlaying: false, isGenerating: false, audioBuffer: null });

        // Auto-generate story on upload
        handleGenerateStory(result, file.type);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateStory = async (base64Image: string, mimeType: string) => {
    // Strip header from base64 if present for API
    const base64Data = base64Image.split(',')[1];
    
    setStory(prev => ({ ...prev, isGenerating: true, error: null }));
    
    try {
      const generatedText = await generateStory(base64Data, mimeType);
      setStory({ text: generatedText, isGenerating: false, error: null });
    } catch (err: any) {
      console.error(err);
      setStory({ text: '', isGenerating: false, error: "Failed to generate story. " + (err.message || "") });
    }
  };

  const handleGenerateVideo = async () => {
    if (!imagePreview || !selectedFile) return;
    
    // Safety check for API key before heavy lifting
    if (!apiKeyReady) {
      await handleApiKeySelect();
      const ready = await checkApiKey();
      if (!ready) return;
    }

    const base64Data = imagePreview.split(',')[1];
    const mimeType = selectedFile.type;

    setVideo({ url: null, isGenerating: true, progressMessage: 'Initializing Veo...', error: null });

    try {
      // Create a "fake" progress updates for UX since polling can be silent
      const progressTimer = setInterval(() => {
        setVideo(prev => {
           if (!prev.isGenerating) return prev;
           const msgs = [
             "Analyzing scene composition...",
             "Dreaming up motion vectors...",
             "Rendering frames with Veo...",
             "Polishing pixels...",
             "Almost there..."
           ];
           const currentIdx = msgs.indexOf(prev.progressMessage);
           const nextMsg = msgs[(currentIdx + 1) % msgs.length] || msgs[0];
           return { ...prev, progressMessage: nextMsg };
        });
      }, 4000);

      const videoUrl = await generateVeoVideo(base64Data, mimeType, aspectRatio);
      
      clearInterval(progressTimer);
      setVideo({ url: videoUrl, isGenerating: false, progressMessage: '', error: null });
      
    } catch (err: any) {
      setVideo({ 
        url: null, 
        isGenerating: false, 
        progressMessage: '', 
        error: "Video generation failed. " + (err.message || "") 
      });
    }
  };

  const handleReadAloud = async () => {
    if (!story.text) return;

    // Stop if currently playing
    if (audio.isPlaying) {
      stopAudio();
      return;
    }

    // If we already have the buffer, just play it
    if (audio.audioBuffer) {
      playBuffer(audio.audioBuffer);
      return;
    }

    setAudio(prev => ({ ...prev, isGenerating: true }));

    try {
      const base64Audio = await generateSpeech(story.text);
      const ctx = getAudioContext();
      const buffer = await decodeAudioData(base64Audio, ctx);
      
      setAudio(prev => ({ ...prev, isGenerating: false, audioBuffer: buffer }));
      playBuffer(buffer);
    } catch (err) {
      console.error(err);
      setAudio(prev => ({ ...prev, isGenerating: false, isPlaying: false }));
    }
  };

  const playBuffer = (buffer: AudioBuffer) => {
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => setAudio(prev => ({ ...prev, isPlaying: false }));
    source.start();
    
    audioSourceRef.current = source;
    setAudio(prev => ({ ...prev, isPlaying: true }));
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) { /* ignore if already stopped */ }
      audioSourceRef.current = null;
    }
    setAudio(prev => ({ ...prev, isPlaying: false }));
  };

  // --- Render ---

  if (!apiKeyReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="bg-indigo-500/10 p-6 rounded-full inline-block">
            <Wand2 className="w-16 h-16 text-indigo-400" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Veo Storyteller</h1>
          <p className="text-slate-400 text-lg">
            Connect your Google Cloud project to unlock Veo video generation and Gemini 2.5 narration.
          </p>
          <div className="p-4 bg-slate-800 rounded-lg border border-slate-700 text-sm text-left text-slate-300">
             <p className="mb-2 font-semibold text-white">Requirement:</p>
             <p>This app uses <span className="text-indigo-400">Veo 3.1</span>. You must select a paid API key from a Google Cloud Project with billing enabled.</p>
             <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 underline mt-2 block">Read Billing Docs &rarr;</a>
          </div>
          <Button onClick={handleApiKeySelect} className="w-full py-4 text-lg">
            Connect Account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8">
      <header className="max-w-7xl mx-auto mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg">
            <Film className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Veo Storyteller</h1>
        </div>
        <div className="flex items-center gap-2">
           {/* Aspect Ratio Toggle */}
           <div className="bg-slate-800 p-1 rounded-lg flex text-sm">
             <button 
               onClick={() => setAspectRatio(AspectRatio.LANDSCAPE)}
               className={`px-3 py-1.5 rounded-md transition-colors ${aspectRatio === AspectRatio.LANDSCAPE ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
             >
               16:9
             </button>
             <button 
               onClick={() => setAspectRatio(AspectRatio.PORTRAIT)}
               className={`px-3 py-1.5 rounded-md transition-colors ${aspectRatio === AspectRatio.PORTRAIT ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
             >
               9:16
             </button>
           </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Visuals */}
        <div className="space-y-6">
          
          {/* Main Visual Display */}
          <div className={`relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-800 shadow-2xl transition-all duration-500 ${!imagePreview ? 'h-96' : 'aspect-video'}`}>
            
            {!imagePreview && (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-700/50 transition-colors group"
              >
                <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Upload className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-xl font-medium text-slate-300">Upload a scene image</p>
                <p className="text-slate-500 mt-2">Supports JPG, PNG</p>
              </div>
            )}

            {imagePreview && (
              <>
                {video.url ? (
                  <video 
                    src={video.url} 
                    className="w-full h-full object-cover" 
                    controls 
                    autoPlay 
                    loop
                  />
                ) : (
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="w-full h-full object-cover"
                  />
                )}
                
                {video.isGenerating && (
                  <LoadingOverlay message={video.progressMessage || "Generating video..."} />
                )}

                {/* Overlays / Controls when image is present but no video processing */}
                {!video.isGenerating && !video.url && (
                   <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-900/90 to-transparent flex justify-center">
                      <Button 
                        onClick={handleGenerateVideo} 
                        icon={<Film className="w-5 h-5" />}
                        className="shadow-xl hover:scale-105 transition-transform"
                      >
                        Generate Veo Video
                      </Button>
                   </div>
                )}
              </>
            )}

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/png, image/jpeg, image/webp"
            />
          </div>
          
          {/* Error Banner for Video */}
          {video.error && (
            <div className="bg-red-900/20 border border-red-500/50 p-4 rounded-lg flex items-start gap-3 text-red-200">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>{video.error}</p>
            </div>
          )}

          {/* Reset / Re-upload */}
          {imagePreview && (
            <div className="flex justify-end">
               <button 
                onClick={() => fileInputRef.current?.click()}
                className="text-sm text-slate-400 hover:text-white flex items-center gap-2"
              >
                <Upload className="w-4 h-4" /> Upload different image
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Story & Text */}
        <div className="space-y-6">
          <div className="bg-slate-800/50 rounded-2xl border border-slate-700 p-6 md:p-8 min-h-[400px] flex flex-col relative overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2 text-indigo-400">
                <FileText className="w-5 h-5" />
                <span className="font-semibold tracking-wide uppercase text-xs">The Story</span>
              </div>
              
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReadAloud}
                disabled={story.isGenerating || !story.text || audio.isGenerating}
                className={`!py-1.5 !px-3 ${audio.isPlaying ? 'ring-2 ring-indigo-500 text-indigo-300 bg-slate-700' : ''}`}
              >
                 {audio.isGenerating ? (
                   <Loader2 className="w-4 h-4 animate-spin mr-2" />
                 ) : audio.isPlaying ? (
                   <Square className="w-4 h-4 fill-current mr-2" />
                 ) : (
                   <Volume2 className="w-4 h-4 mr-2" />
                 )}
                 {audio.isPlaying ? 'Stop' : 'Read Aloud'}
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1">
              {!imagePreview ? (
                 <div className="h-full flex items-center justify-center text-slate-600 italic">
                   Upload an image to spark a story...
                 </div>
              ) : story.isGenerating ? (
                <div className="space-y-4 animate-pulse">
                  <div className="h-4 bg-slate-700 rounded w-3/4"></div>
                  <div className="h-4 bg-slate-700 rounded w-full"></div>
                  <div className="h-4 bg-slate-700 rounded w-5/6"></div>
                  <div className="h-4 bg-slate-700 rounded w-2/3"></div>
                </div>
              ) : story.error ? (
                <div className="text-red-400 flex flex-col items-center justify-center h-full gap-2">
                  <AlertCircle className="w-8 h-8" />
                  <p className="text-center">{story.error}</p>
                </div>
              ) : (
                <div className="prose prose-invert max-w-none">
                  <p className="text-lg leading-relaxed text-slate-200 font-light">
                    {story.text}
                  </p>
                </div>
              )}
            </div>

            {/* Decoration */}
            <div className="absolute -bottom-20 -right-20 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>
          </div>

          <div className="bg-slate-900 rounded-xl p-4 border border-slate-800 text-xs text-slate-500 space-y-2">
            <p>
              <span className="font-semibold text-slate-400">Models used:</span> Veo 3.1 (Video), Gemini 2.5 Flash (Story), Gemini 2.5 TTS (Voice).
            </p>
            <p>
              Video generation may take 1-2 minutes. Ensure your selected Google Cloud project has billing enabled for Veo access.
            </p>
          </div>
        </div>

      </main>
    </div>
  );
}