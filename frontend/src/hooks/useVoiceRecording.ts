/**
 * Custom React Hook for Voice Recording
 * Handles microphone access, recording, and audio processing
 */

import { useState, useRef, useCallback } from 'react';
import { speechToText, requestMicrophonePermission } from '../services/sarvamApi';
import { browserSpeechToText, isBrowserSpeechSupported } from '../services/browserSpeech';

export interface UseVoiceRecordingReturn {
  isRecording: boolean;
  isProcessing: boolean;
  hasPermission: boolean;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  startBrowserRecording: () => Promise<string | null>;
  requestPermission: () => Promise<void>;
  clearError: () => void;
}

export const useVoiceRecording = (): UseVoiceRecordingReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const requestPermission = useCallback(async () => {
    try {
      setError(null);
      const granted = await requestMicrophonePermission();
      setHasPermission(granted);
      
      if (!granted) {
        setError('Microphone permission is required for voice input');
      }
    } catch (err) {
      setError('Failed to request microphone permission');
      setHasPermission(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      
      if (!hasPermission) {
        await requestPermission();
        if (!hasPermission) {
          return;
        }
      }

      // Get user media
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      chunksRef.current = [];

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;

      // Handle data availability
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Failed to start recording. Please check your microphone.');
      setIsRecording(false);
    }
  }, [hasPermission, requestPermission]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || !isRecording) {
        resolve(null);
        return;
      }

      const mediaRecorder = mediaRecorderRef.current;

      mediaRecorder.onstop = async () => {
        try {
          setIsRecording(false);
          setIsProcessing(true);

          // Create audio blob from chunks
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm;codecs=opus' });
          
          // Convert to WAV format for better compatibility
          const wavBlob = await convertToWav(audioBlob);
          
          // Convert speech to text using Sarvam API
          const result = await speechToText(wavBlob);
          
          if (result.success && result.transcript) {
            resolve(result.transcript);
          } else {
            setError(result.error || 'Failed to convert speech to text');
            resolve(null);
          }
        } catch (err) {
          console.error('Failed to process recording:', err);
          setError('Failed to process recording');
          resolve(null);
        } finally {
          setIsProcessing(false);
          
          // Clean up
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
          }
          mediaRecorderRef.current = null;
          chunksRef.current = [];
        }
      };

      // Stop recording
      mediaRecorder.stop();
    });
  }, [isRecording]);

  const startBrowserRecording = useCallback(async (): Promise<string | null> => {
    try {
      setError(null);
      setIsProcessing(true);
      setIsRecording(true);

      if (!isBrowserSpeechSupported()) {
        setError('Browser speech recognition not supported');
        return null;
      }

      const result = await browserSpeechToText();
      
      if (result.success && result.transcript) {
        return result.transcript;
      } else {
        setError(result.error || 'Failed to recognize speech');
        return null;
      }
    } catch (err) {
      console.error('Browser speech recognition error:', err);
      setError('Failed to use browser speech recognition');
      return null;
    } finally {
      setIsProcessing(false);
      setIsRecording(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isRecording,
    isProcessing,
    hasPermission,
    error,
    startRecording,
    stopRecording,
    startBrowserRecording,
    requestPermission,
    clearError,
  };
};

/**
 * Convert WebM audio blob to WAV format for better API compatibility
 */
async function convertToWav(webmBlob: Blob): Promise<Blob> {
  try {
    // Create audio context
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Decode audio data
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Convert to WAV
    const wavArrayBuffer = audioBufferToWav(audioBuffer);
    
    return new Blob([wavArrayBuffer], { type: 'audio/wav' });
  } catch (error) {
    console.warn('Failed to convert to WAV, using original format:', error);
    return webmBlob;
  }
}

/**
 * Convert AudioBuffer to WAV format
 */
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const length = buffer.length;
  const sampleRate = buffer.sampleRate;
  const channels = buffer.numberOfChannels;
  
  // Create WAV header
  const arrayBuffer = new ArrayBuffer(44 + length * channels * 2);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * channels * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * channels * 2, true);
  
  // Convert audio data
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      const intSample = Math.max(-1, Math.min(1, sample)) * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }
  
  return arrayBuffer;
}