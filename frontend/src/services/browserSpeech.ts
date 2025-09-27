/**
 * Fallback Speech Services using Browser APIs
 * Used when Sarvam API is unavailable or fails
 */

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
 * Browser-based Speech Recognition (Web Speech API)
 */
export const browserSpeechToText = async (): Promise<SpeechToTextResponse> => {
  return new Promise((resolve) => {
    try {
      // Check if SpeechRecognition is available
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      
      if (!SpeechRecognition) {
        resolve({
          transcript: '',
          success: false,
          error: 'Speech recognition not supported in this browser',
        });
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        resolve({
          transcript,
          success: true,
        });
      };

      recognition.onerror = (event: any) => {
        resolve({
          transcript: '',
          success: false,
          error: `Speech recognition error: ${event.error}`,
        });
      };

      recognition.onend = () => {
        // If no result was captured, resolve with empty transcript
        setTimeout(() => {
          resolve({
            transcript: '',
            success: false,
            error: 'No speech detected',
          });
        }, 100);
      };

      recognition.start();
      
      // Timeout after 10 seconds
      setTimeout(() => {
        recognition.stop();
      }, 10000);
      
    } catch (error) {
      resolve({
        transcript: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
};

/**
 * Browser-based Text-to-Speech (Speech Synthesis API)
 */
export const browserTextToSpeech = async (text: string): Promise<TextToSpeechResponse> => {
  return new Promise((resolve) => {
    try {
      if (!window.speechSynthesis) {
        resolve({
          audioUrl: '',
          success: false,
          error: 'Speech synthesis not supported in this browser',
        });
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      // Try to find an English voice
      const voices = speechSynthesis.getVoices();
      const englishVoice = voices.find(voice => 
        voice.lang.startsWith('en') && voice.name.toLowerCase().includes('female')
      ) || voices.find(voice => voice.lang.startsWith('en'));
      
      if (englishVoice) {
        utterance.voice = englishVoice;
      }

      utterance.onend = () => {
        resolve({
          audioUrl: '', // Not applicable for direct synthesis
          success: true,
        });
      };

      utterance.onerror = (event) => {
        resolve({
          audioUrl: '',
          success: false,
          error: `Speech synthesis error: ${event.error}`,
        });
      };

      speechSynthesis.speak(utterance);
      
    } catch (error) {
      resolve({
        audioUrl: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
};

/**
 * Check if browser speech APIs are supported
 */
export const isBrowserSpeechSupported = (): boolean => {
  const hasSpeechRecognition = !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
  const hasSpeechSynthesis = !!window.speechSynthesis;
  
  return hasSpeechRecognition && hasSpeechSynthesis;
};