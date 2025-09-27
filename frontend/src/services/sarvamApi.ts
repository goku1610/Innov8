/**
 * Sarvam AI API Integration Service
 * Provides Speech-to-Text and Text-to-Speech functionality
 */

const SARVAM_API_KEY = 'sk_21ibglod_RsO0CQw48A7JvPKC9m2VWb6f';
const SARVAM_BASE_URL = 'https://api.sarvam.ai';

export interface SpeechToTextResponse {
  transcript: string;
  success: boolean;
  error?: string;
}

export interface TextToSpeechResponse {
  audioUrl: string;
  success: boolean;
  error?: string;
}

/**
 * Convert speech (audio file) to text using Sarvam STT API
 */
export const speechToText = async (audioBlob: Blob): Promise<SpeechToTextResponse> => {
  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.wav');
    formData.append('model', 'saarika:v2.5'); // Updated to latest model
    formData.append('language_code', 'en-IN'); // English India

    const response = await fetch(`${SARVAM_BASE_URL}/speech-to-text`, {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY, // Correct header format
      },
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch (e) {
        // If response is not JSON, use status text
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    return {
      transcript: data.transcript || '',
      success: true,
    };
  } catch (error) {
    console.error('Speech-to-text error:', error);
    return {
      transcript: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

/**
 * Convert text to speech using Sarvam TTS API
 */
export const textToSpeech = async (text: string): Promise<TextToSpeechResponse> => {
  try {
    const response = await fetch(`${SARVAM_BASE_URL}/text-to-speech`, {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: [text],
        target_language_code: 'en-IN',
        speaker: 'meera',
        pitch: 0,
        pace: 1.0,
        loudness: 1.0,
        speech_sample_rate: 8000,
        enable_preprocessing: true,
        model: 'bulbul:v1',
      }),
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch (e) {
        // If response is not JSON, use status text
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    
    if (data.audios && data.audios.length > 0) {
      // Create blob URL from base64 audio data
      const audioBase64 = data.audios[0];
      const audioBlob = base64ToBlob(audioBase64, 'audio/wav');
      const audioUrl = URL.createObjectURL(audioBlob);
      
      return {
        audioUrl,
        success: true,
      };
    } else {
      throw new Error('No audio data received from API');
    }
  } catch (error) {
    console.error('Text-to-speech error:', error);
    return {
      audioUrl: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
};

/**
 * Utility function to convert base64 string to Blob
 */
function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * Check if the browser supports the Web Audio API for voice recording
 */
export const isVoiceSupported = (): boolean => {
  return !!(
    navigator.mediaDevices && 
    typeof navigator.mediaDevices.getUserMedia === 'function' && 
    typeof window.MediaRecorder === 'function'
  );
};

/**
 * Request microphone permissions
 */
export const requestMicrophonePermission = async (): Promise<boolean> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Stop the stream immediately as we just needed to check permission
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (error) {
    console.error('Microphone permission denied:', error);
    return false;
  }
};