'use client';

import { useState, useRef, useEffect } from 'react';
import { useCredentialsStore } from '../store/credentials.store';

type RecordingState = 'idle' | 'recording' | 'processing' | 'responding';

export function VoiceQuery() {
  const [state, setState] = useState<RecordingState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [error, setError] = useState<string>('');
  const credentialsStore = useCredentialsStore();
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    // Initialize speech synthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthesisRef.current = window.speechSynthesis;
    }

    return () => {
      // Cleanup on unmount
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
    };
  }, []);

  const processQuery = async (audioBlob?: Blob, transcriptText?: string) => {
    setState('processing');
    setError('');
    setResponse('');

    const openaiApiKey = credentialsStore.getOpenAIApiKey();
    const grantId = credentialsStore.getNylasGrantId();

    if (!openaiApiKey.trim() || !grantId.trim()) {
      setError('Please configure your OpenAI API Key and Nylas Grant ID in settings first.');
      setState('idle');
      return;
    }

    try {
      let audioBase64: string | undefined;
      let audioFormat: string | undefined;

      // Convert audio blob to base64 if provided
      if (audioBlob) {
        audioBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1]; // Remove data URL prefix
            resolve(base64String);
          };
          reader.onerror = reject;
          reader.readAsDataURL(audioBlob);
        });
        // Determine format from blob type
        audioFormat = audioBlob.type.includes('webm') ? 'webm' : 
                     audioBlob.type.includes('mp4') ? 'mp4' : 
                     audioBlob.type.includes('wav') ? 'wav' : 'webm';
      }

      // Call the voice query API
      const response = await fetch('/api/voice-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: transcriptText,
          audio: audioBase64,
          audioFormat,
          openaiApiKey,
          grantId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process query');
      }

      const data = await response.json();
      
      setTranscript(data.transcript || transcriptText || '');
      setResponse(data.response || 'No response received');
      setState('responding');

      // Speak the response using text-to-speech (faster rate)
      if (data.response && synthesisRef.current) {
        const utterance = new SpeechSynthesisUtterance(data.response);
        utterance.rate = 1.4; // Increased from 1.0 to 1.4 for faster playback
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        synthesisRef.current.speak(utterance);
      }
    } catch (error: any) {
      console.error('Error processing query:', error);
      setError(error.message || 'Failed to process your question. Please try again.');
      setState('idle');
    }
  };

  const startRecording = async () => {
    setState('recording');
    setTranscript('');
    setResponse('');
    setError('');
    audioChunksRef.current = [];

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
      });

      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release microphone
        stream.getTracks().forEach(track => track.stop());

        // Create audio blob
        const audioBlob = new Blob(audioChunksRef.current, {
          type: mediaRecorder.mimeType,
        });

        // Process the query with the recorded audio
        await processQuery(audioBlob);

        audioChunksRef.current = [];
      };

      mediaRecorder.onerror = (event: any) => {
        console.error('MediaRecorder error:', event.error);
        setError('Recording error occurred. Please try again.');
        setState('idle');
        stream.getTracks().forEach(track => track.stop());
      };

      // Start recording
      mediaRecorder.start();
    } catch (error: any) {
      console.error('Error starting recording:', error);
      setError(
        error.name === 'NotAllowedError'
          ? 'Microphone access denied. Please allow microphone access and try again.'
          : error.name === 'NotFoundError'
          ? 'No microphone found. Please connect a microphone and try again.'
          : 'Failed to start recording. Please try again.'
      );
      setState('idle');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    // The onstop handler will process the query
  };

  const reset = () => {
    // Stop any ongoing speech
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
    }
    setState('idle');
    setTranscript('');
    setResponse('');
    setError('');
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
            <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Voice Query</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Ask questions about your emails</p>
          </div>
        </div>
        <svg
          className={`h-5 w-5 text-zinc-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
          <div className="space-y-4">
            {/* Recording Button */}
            <div className="flex justify-center">
              <button
                onClick={state === 'idle' ? startRecording : stopRecording}
                disabled={state === 'processing' || state === 'responding'}
                className={`relative flex h-20 w-20 items-center justify-center rounded-full transition-all ${
                  state === 'recording'
                    ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                    : state === 'processing' || state === 'responding'
                    ? 'bg-zinc-400 cursor-not-allowed'
                    : 'bg-green-500 hover:bg-green-600'
                } text-white shadow-lg focus:outline-none focus:ring-4 focus:ring-offset-2 ${
                  state === 'recording' ? 'focus:ring-red-300' : 'focus:ring-green-300'
                } dark:focus:ring-offset-zinc-900`}
                aria-label={state === 'recording' ? 'Stop recording' : 'Start recording'}
              >
                {state === 'recording' ? (
                  <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : state === 'processing' ? (
                  <svg className="h-8 w-8 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg className="h-8 w-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Status Indicator */}
            {state !== 'idle' && (
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {state === 'recording' && 'Listening...'}
                  {state === 'processing' && 'Processing your query...'}
                  {state === 'responding' && 'Response ready'}
                </p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
                <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Error:</p>
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            )}

            {/* Transcript */}
            {transcript && (
              <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/50">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Your question:</p>
                <p className="text-sm text-zinc-900 dark:text-zinc-100">{transcript}</p>
              </div>
            )}

            {/* Response */}
            {response && (
              <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Response:</p>
                <p className="text-sm text-zinc-900 dark:text-zinc-100">{response}</p>
              </div>
            )}

            {/* Reset Button */}
            {(response || transcript) && state === 'responding' && (
              <button
                onClick={reset}
                className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Ask Another Question
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

