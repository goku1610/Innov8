/**
 * Custom React Hook for Text-to-Speech
 * Handles audio playback of AI responses using Sarvam TTS API
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { textToSpeech } from '../services/sarvamApi';
import { browserTextToSpeech, isBrowserSpeechSupported } from '../services/browserSpeech';

export interface UseTextToSpeechReturn {
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  speak: (text: string) => Promise<void>;
  speakWithBrowser: (text: string) => Promise<void>;
  stop: () => void;
  clearError: () => void;
}

export const useTextToSpeech = (): UseTextToSpeechReturn => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);

  const speak = useCallback(async (text: string) => {
    try {
      setError(null);
      setIsLoading(true);

      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      // Clean up previous audio URL
      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
        currentAudioUrlRef.current = null;
      }

      // Convert text to speech
      const result = await textToSpeech(text);
      
      if (!result.success || !result.audioUrl) {
        throw new Error(result.error || 'Failed to generate speech');
      }

      // Create audio element and play
      const audio = new Audio(result.audioUrl);
      audioRef.current = audio;
      currentAudioUrlRef.current = result.audioUrl;

      // Set up event listeners
      audio.onloadstart = () => {
        setIsLoading(true);
      };

      audio.oncanplay = () => {
        setIsLoading(false);
      };

      audio.onplay = () => {
        setIsPlaying(true);
      };

      audio.onended = () => {
        setIsPlaying(false);
        // Clean up after playback
        if (currentAudioUrlRef.current) {
          URL.revokeObjectURL(currentAudioUrlRef.current);
          currentAudioUrlRef.current = null;
        }
        audioRef.current = null;
      };

      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        setError('Failed to play audio');
        setIsPlaying(false);
        setIsLoading(false);
        // Clean up on error
        if (currentAudioUrlRef.current) {
          URL.revokeObjectURL(currentAudioUrlRef.current);
          currentAudioUrlRef.current = null;
        }
        audioRef.current = null;
      };

      audio.onpause = () => {
        setIsPlaying(false);
      };

      // Start playback
      await audio.play();

    } catch (err) {
      console.error('Text-to-speech error:', err);
      setError(err instanceof Error ? err.message : 'Failed to convert text to speech');
      setIsLoading(false);
      setIsPlaying(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }, []);

  const speakWithBrowser = useCallback(async (text: string) => {
    try {
      setError(null);
      setIsLoading(true);

      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      if (!isBrowserSpeechSupported()) {
        throw new Error('Browser speech synthesis not supported');
      }

      setIsPlaying(true);
      const result = await browserTextToSpeech(text);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to synthesize speech');
      }
      
      // Browser TTS plays directly, so we just wait for completion
      setIsPlaying(false);
      
    } catch (err) {
      console.error('Browser text-to-speech error:', err);
      setError(err instanceof Error ? err.message : 'Failed to use browser speech synthesis');
      setIsLoading(false);
      setIsPlaying(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
        currentAudioUrlRef.current = null;
      }
    };
  }, []);

  return {
    isPlaying,
    isLoading,
    error,
    speak,
    speakWithBrowser,
    stop,
    clearError,
  };
};