import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import { sendFullSnapshot, sendPatchSnapshot } from './api';
import { useVoiceRecording } from './hooks/useVoiceRecording';
import { useTextToSpeech } from './hooks/useTextToSpeech';
import { isVoiceSupported } from './services/sarvamApi';
import './App.css';

interface ExecutionResult {
  output: string;
  error: string;
}

interface SyntaxError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

const LANGUAGES = [
  { value: 'python', label: 'Python', monacoLang: 'python' },
  { value: 'javascript', label: 'JavaScript', monacoLang: 'javascript' },
  { value: 'java', label: 'Java', monacoLang: 'java' },
  { value: 'c', label: 'C', monacoLang: 'c' },
  { value: 'cpp', label: 'C++', monacoLang: 'cpp' }
];

const DEFAULT_CODE = {
  python: `print("Hello, World!")
print("Python is awesome!")`,
  javascript: `console.log("Hello, World!");
console.log("JavaScript is awesome!");`,
  java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
        System.out.println("Java is awesome!");
    }
}`,
  c: `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    printf("C is awesome!\\n");
    return 0;
}`,
  cpp: `#include <iostream>

int main() {
    std::cout << "Hello, World!" << std::endl;
    std::cout << "C++ is awesome!" << std::endl;
    return 0;
}`
};

interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

interface ChatBoxProps {}

const ChatBox: React.FC<ChatBoxProps> = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: "Hi there! 👋 I'm your AI coding assistant. I can help you with the Two Sum problem and other coding concepts. What would you like to know? You can also use voice input by clicking the microphone button!",
      sender: 'bot',
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Voice functionality hooks
  const voiceRecording = useVoiceRecording();
  const textToSpeech = useTextToSpeech();
  const isVoiceSupportedBrowser = isVoiceSupported();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || inputText.trim();
    if (!textToSend || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      text: textToSend,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      const response = await axios.post('http://localhost:5000/chat', {
        message: textToSend
      });

      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: response.data.response,
        sender: 'bot',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, botMessage]);
      
      // Automatically speak the bot's response
      if (response.data.response) {
        // Try browser TTS first since it's more reliable
        try {
          await textToSpeech.speakWithBrowser(response.data.response);
        } catch (browserTtsError) {
          console.warn('Browser TTS failed, trying Sarvam TTS:', browserTtsError);
          try {
            await textToSpeech.speak(response.data.response);
          } catch (sarvamTtsError) {
            console.warn('Both TTS methods failed:', sarvamTtsError);
          }
        }
      }
    } catch (error) {
      console.error('Failed to get AI response:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        text: "Sorry, I'm having trouble connecting to the AI service right now. Please try again later.",
        sender: 'bot',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Voice recording handlers
  const handleVoiceStart = async () => {
    try {
      voiceRecording.clearError();
      textToSpeech.clearError();
      await voiceRecording.startRecording();
    } catch (error) {
      console.error('Failed to start voice recording:', error);
    }
  };

  const handleVoiceStop = async () => {
    try {
      let transcript = await voiceRecording.stopRecording();
      
      // If Sarvam API failed, try browser speech recognition as fallback
      if (!transcript || transcript.trim() === '') {
        console.log('Trying browser speech recognition as fallback...');
        transcript = await voiceRecording.startBrowserRecording();
      }
      
      if (transcript && transcript.trim()) {
        // Send the transcript as a message
        handleSendMessage(transcript.trim());
      }
    } catch (error) {
      console.error('Failed to stop voice recording:', error);
    }
  };

  const handleVoiceToggle = () => {
    if (voiceRecording.isRecording) {
      handleVoiceStop();
    } else {
      handleVoiceStart();
    }
  };

  // Request microphone permission on component mount
  useEffect(() => {
    if (isVoiceSupportedBrowser && !voiceRecording.hasPermission) {
      voiceRecording.requestPermission();
    }
  }, [isVoiceSupportedBrowser, voiceRecording]);


  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.sender}`}>
            <div className="message-content">
              <div className="message-text">{message.text}</div>
              <div className="message-time">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="chat-message bot">
            <div className="message-content">
              <div className="message-text">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder={voiceRecording.isRecording ? "🎤 Listening..." : "Ask me anything about coding..."}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isLoading || voiceRecording.isRecording}
        />
        
        {/* Voice controls */}
        {isVoiceSupportedBrowser && (
          <button
            className={`voice-button ${voiceRecording.isRecording ? 'recording' : ''}`}
            onClick={handleVoiceToggle}
            disabled={isLoading || voiceRecording.isProcessing}
            title={voiceRecording.isRecording ? "Stop recording" : "Start voice input"}
          >
            {voiceRecording.isProcessing ? (
              '🔄'
            ) : voiceRecording.isRecording ? (
              '🔴'
            ) : (
              '🎤'
            )}
          </button>
        )}
        
        {/* TTS controls for last bot message */}
        {messages.length > 1 && (
          <button
            className={`tts-button ${textToSpeech.isPlaying ? 'playing' : ''}`}
            onClick={async () => {
              const lastBotMessage = messages.filter(m => m.sender === 'bot').slice(-1)[0];
              if (lastBotMessage && !textToSpeech.isPlaying) {
                // Use browser TTS first since it's more reliable
                try {
                  await textToSpeech.speakWithBrowser(lastBotMessage.text);
                } catch (browserError) {
                  console.warn('Browser TTS failed, trying Sarvam TTS:', browserError);
                  try {
                    await textToSpeech.speak(lastBotMessage.text);
                  } catch (sarvamError) {
                    console.warn('Both TTS methods failed:', sarvamError);
                  }
                }
              } else {
                textToSpeech.stop();
              }
            }}
            disabled={textToSpeech.isLoading}
            title={textToSpeech.isPlaying ? "Stop playback" : "Repeat last response"}
          >
            {textToSpeech.isLoading ? '🔄' : textToSpeech.isPlaying ? '🔇' : '🔊'}
          </button>
        )}
        
        <button
          className="chat-send"
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim() || isLoading || voiceRecording.isRecording}
        >
          {isLoading ? '...' : 'Send'}
        </button>
      </div>
      
      {/* Voice error display */}
      {(voiceRecording.error || textToSpeech.error) && (
        <div className="voice-error">
          {voiceRecording.error && (
            <div className="error-message">
              🎤 {voiceRecording.error}
              <button onClick={voiceRecording.clearError}>×</button>
            </div>
          )}
          {textToSpeech.error && (
            <div className="error-message">
              🔊 {textToSpeech.error}
              <button onClick={textToSpeech.clearError}>×</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function App() {
  const navigate = useNavigate();
  const [selectedLanguage, setSelectedLanguage] = useState('python');
  const [code, setCode] = useState(DEFAULT_CODE.python);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [syntaxErrors, setSyntaxErrors] = useState<SyntaxError[]>([]);
  const [hasSyntaxErrors, setHasSyntaxErrors] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayProgress, setReplayProgress] = useState(0);
  const [replayEvents, setReplayEvents] = useState<any[]>([]);
  const [replaySession, setReplaySession] = useState<any>(null);
  const [isReplayCompleted, setIsReplayCompleted] = useState<boolean>(false);
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);
  const [isSessionDropdownOpen, setIsSessionDropdownOpen] = useState<boolean>(false);
  const editorRef = useRef<any>(null);
  const pollRef = useRef<boolean>(false);
  const pollTimeoutRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const isRecordingEnabledRef = useRef<boolean>(true);
  const pendingEventsRef = useRef<any[]>([]);
  const lastFlushRef = useRef<number>(0);
  const lastInputTimeRef = useRef<number>(0);
  const idleFlushTimerRef = useRef<number | null>(null);
  const lastCodeRef = useRef<string>('');
  const wordBufferRef = useRef<string>('');
  const lineBufferRef = useRef<string>('');
  const lastWordTimeRef = useRef<number>(0);
  const lastLineTimeRef = useRef<number>(0);
  const isReplayingRef = useRef<boolean>(false);
  const replayTimeoutRef = useRef<number | null>(null);
  const currentReplayIndexRef = useRef<number>(0);
  const replaySortedRef = useRef<any[]>([]);

  // Refs to keep latest values for 30s snapshot loop without resetting interval
  const selectedLanguageRef = useRef<string>(selectedLanguage);
  const syntaxErrorsRef = useRef<SyntaxError[]>(syntaxErrors);
  const hasSyntaxErrorsRef = useRef<boolean>(hasSyntaxErrors);

  // ADD THESE TWO NEW REFS
  const lineUpdateBufferRef = useRef<Record<number, { timestamp: number, content: string }>>({});
  const lineUpdateFlushTimerRef = useRef<number | null>(null);

  // --- Metrics instrumentation refs ---
  const activeLineRef = useRef<number | null>(null);
  const lineStartTimeRef = useRef<number>(0);
  const lineIdleAccumRef = useRef<number>(0);
  const lastEventTimeRef = useRef<number>(0);
  const idleThresholdMsRef = useRef<number>(3000);
  const wordDurationsRef = useRef<number[]>([]); // rolling list of recent word durations
  const maxWordDurationsRef = useRef<number>(200);
  const churnEventsRef = useRef<Array<{ ts: number, line: number, added: number, deleted: number }>>([]);
  const undoRedoEventsRef = useRef<Array<{ ts: number, line: number, kind: 'undo' | 'redo' }>>([]);
  const keystrokeEventsRef = useRef<Array<{ ts: number, line: number, chars: number }>>([]);
  const metricsWindowMsRef = useRef<number>(60000);
  const churnRadiusRef = useRef<number>(5);
  const lineMetricsBufferRef = useRef<Record<number, { timestamp: number, metrics: any }>>({});
  const lineMetricsFlushTimerRef = useRef<number | null>(null);

  // Force-flush any queued events to the backend immediately
  const flushPendingEvents = useCallback(async () => {
    try {
      const currentSessionId = sessionIdRef.current;
      if (!currentSessionId) return;
      if (!pendingEventsRef.current.length) return;
      const toSend = pendingEventsRef.current.splice(0, pendingEventsRef.current.length);
      lastFlushRef.current = Date.now();
      await axios.post('http://localhost:3000/session/event', {
        sessionId: currentSessionId,
        events: toSend
      }).catch(() => {
        // If still same session, re-queue; otherwise drop to avoid cross-session mix
        if (sessionIdRef.current === currentSessionId) {
          pendingEventsRef.current.unshift(...toSend);
        }
      });
    } catch (_) {}
  }, []);

  // ADD THIS NEW FUNCTION
  const flushLineUpdates = useCallback(async () => {
    try {
      const buffer = lineUpdateBufferRef.current;
      const currentSessionId = sessionIdRef.current;

      if (!buffer || Object.keys(buffer).length === 0 || !currentSessionId) {
          return;
      }

      // Format the buffer into an array of events
      const lineEvents = Object.entries(buffer).map(([lineNumber, data]) => ({
          type: 'LINE_UPDATE',
          timestamp: data.timestamp,
          payload: {
              lineNumber: parseInt(lineNumber, 10),
              content: data.content
          }
      }));

      // Clear the buffer immediately
      lineUpdateBufferRef.current = {};

      // Send to your /session/event endpoint
      await axios.post('http://localhost:3000/session/event', {
          sessionId: currentSessionId,
          events: lineEvents
      });
    } catch (error) {
        console.error('Failed to flush line updates:', error);
        // Optional: Add logic to re-queue failed events
    }
  }, []);

  // Compute trimmed mean and std for delays
  const computeTrimmedStats = useCallback((values: number[]) => {
    if (!values.length) return { mean: 0, std: 0 };
    const sorted = [...values].sort((a, b) => a - b);
    const trimCount = Math.floor(sorted.length * 0.1); // trim 10% on each side
    const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
    const mean = trimmed.reduce((s, v) => s + v, 0) / Math.max(1, trimmed.length);
    const variance = trimmed.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / Math.max(1, trimmed.length);
    const std = Math.sqrt(variance);
    return { mean, std };
  }, []);

  

  const flushLineMetrics = useCallback(async () => {
    try {
      const currentSessionId = sessionIdRef.current;
      const buffer = lineMetricsBufferRef.current;
      if (!currentSessionId || Object.keys(buffer).length === 0) return;

      const events = Object.entries(buffer).map(([lineNumber, data]) => ({
        type: 'LINE_METRICS',
        timestamp: data.timestamp,
        payload: {
          lineNumber: parseInt(lineNumber, 10),
          metrics: data.metrics
        }
      }));
      lineMetricsBufferRef.current = {};
      await axios.post('http://localhost:3000/session/event', {
        sessionId: currentSessionId,
        events
      });
    } catch (err) {
      // best-effort
    }
  }, []);

  const bufferLineMetrics = useCallback((lineNumber: number, timestamp: number, metrics: any) => {
    lineMetricsBufferRef.current[lineNumber] = { timestamp, metrics };
    if (lineMetricsFlushTimerRef.current !== null) {
      clearTimeout(lineMetricsFlushTimerRef.current);
    }
    lineMetricsFlushTimerRef.current = window.setTimeout(() => {
      flushLineMetrics();
    }, 750);
  }, [flushLineMetrics]);

  // Semantic event detection functions
  const detectWordComplete = (currentCode: string, timestamp: number) => {
    const words = currentCode.split(/\s+/);
    const lastWord = words[words.length - 1];
    
    if (lastWord !== wordBufferRef.current && lastWord.length > 0) {
      const timeSinceLastWord = timestamp - lastWordTimeRef.current;
      if (timeSinceLastWord > 500) { // 500ms pause indicates word completion
        const event = {
          timestamp: timestamp - (sessionStartTimeRef.current || timestamp),
          type: 'WORD_COMPLETE',
          payload: {
            word: wordBufferRef.current,
            position: currentCode.lastIndexOf(wordBufferRef.current),
            duration: timeSinceLastWord
          }
        };
        pendingEventsRef.current.push(event);
        // Record duration for normalized delay stats
        wordDurationsRef.current.push(timeSinceLastWord);
        if (wordDurationsRef.current.length > maxWordDurationsRef.current) {
          wordDurationsRef.current.shift();
        }
        wordBufferRef.current = lastWord;
        lastWordTimeRef.current = timestamp;
      }
    }
  };

  const detectLineComplete = (currentCode: string, timestamp: number) => {
    const lines = currentCode.split('\n');
    const lastLine = lines[lines.length - 1];
    
    if (lastLine !== lineBufferRef.current && lastLine.trim().length > 0) {
      const timeSinceLastLine = timestamp - lastLineTimeRef.current;
      if (timeSinceLastLine > 1000) { // 1s pause indicates line completion
        const event = {
          timestamp: timestamp - (sessionStartTimeRef.current || timestamp),
          type: 'LINE_COMPLETE',
          payload: {
            line: lineBufferRef.current,
            lineNumber: lines.length - 1,
            duration: timeSinceLastLine
          }
        };
        pendingEventsRef.current.push(event);
        lineBufferRef.current = lastLine;
        lastLineTimeRef.current = timestamp;
      }
    }
  };

  // Finalize metrics when leaving a line
  const finalizeActiveLineMetrics = useCallback((nowAbs: number) => {
    const active = activeLineRef.current;
    if (!active) return;
    const base = sessionStartTimeRef.current || nowAbs;
    const now = nowAbs - base;

    const activeDuration = Math.max(0, nowAbs - (lineStartTimeRef.current || nowAbs));
    const idleMs = Math.max(0, lineIdleAccumRef.current);

    // Delay outlier based on word durations
    const { mean, std } = computeTrimmedStats(wordDurationsRef.current);
    const significantDelayMs = Math.max(0, (lastEventTimeRef.current ? (nowAbs - lastEventTimeRef.current) : 0));
    const isDelayOutlier = std > 0 && significantDelayMs > (mean + 2 * std);

    // Churn within window and radius
    const windowStart = nowAbs - metricsWindowMsRef.current;
    const churnRadius = churnRadiusRef.current;
    let added = 0, deleted = 0;
    for (const ev of churnEventsRef.current) {
      if (ev.ts >= windowStart && Math.abs(ev.line - active) <= churnRadius) {
        added += ev.added;
        deleted += ev.deleted;
      }
    }
    const net = Math.max(1, Math.abs(added - deleted));
    const churnRatio = (added + deleted) / net;

    // Undo/redo rate within window and radius
    let undoCount = 0, redoCount = 0;
    for (const ev of undoRedoEventsRef.current) {
      if (ev.ts >= windowStart && Math.abs(ev.line - active) <= churnRadius) {
        if (ev.kind === 'undo') undoCount++; else redoCount++;
      }
    }

    // Keystroke rate: chars over active editing seconds (approx by window or active)
    let chars = 0;
    for (const ev of keystrokeEventsRef.current) {
      if (ev.ts >= windowStart && Math.abs(ev.line - active) <= churnRadius) {
        chars += ev.chars;
      }
    }
    const activeSeconds = Math.max(1, Math.floor((metricsWindowMsRef.current - Math.min(metricsWindowMsRef.current, idleMs)) / 1000));
    const keystrokeRate = chars / activeSeconds;

    // Idle detection flag
    const idleFlag = idleMs > idleThresholdMsRef.current;

    bufferLineMetrics(active, now, {
      activeMs: activeDuration,
      idleMs,
      delayMs: significantDelayMs,
      delayOutlier: isDelayOutlier,
      churnRatio,
      churnAdded: added,
      churnDeleted: deleted,
      undoCount,
      redoCount,
      keystrokeRate,
      idleFlag
    });

    // Reset accumulators for next line
    lineIdleAccumRef.current = 0;
  }, [bufferLineMetrics, computeTrimmedStats]);

  const detectCodeRun = (currentCode: string, timestamp: number) => {
    // This will be called when the run button is clicked
    const event = {
      timestamp: timestamp - (sessionStartTimeRef.current || timestamp),
      type: 'CODE_RUN',
      payload: {
        codeLength: currentCode.length,
        lineCount: currentCode.split('\n').length,
        language: selectedLanguage
      }
    };
    pendingEventsRef.current.push(event);
  };

  // Replay functionality
  const startReplay = async (sessionId: string) => {
    try {
      // Fetch session data from backend
      const response = await axios.get(`http://localhost:3000/session/${sessionId}`);
      const sessionData = response.data;
      
      const eventsArr = Array.isArray(sessionData.events) ? sessionData.events : [];
      // Precompute a stable-sorted events list
      replaySortedRef.current = eventsArr
        .map((evt: any, idx: number) => ({ evt, idx }))
        .sort((a: any, b: any) => {
          const dt = (a.evt?.timestamp || 0) - (b.evt?.timestamp || 0);
          if (dt !== 0) return dt;
          return a.idx - b.idx;
        })
        .map((x: any) => x.evt);

      setReplaySession(sessionData);
      setReplayEvents(eventsArr);
      setIsReplaying(true);
      isReplayingRef.current = true;
      setReplayProgress(0);
      setIsReplayCompleted(false);
      currentReplayIndexRef.current = 0;
      if (replayTimeoutRef.current !== null) {
        clearTimeout(replayTimeoutRef.current);
        replayTimeoutRef.current = null;
      }
      
      // Start with initial code
      setCode(sessionData.initialCode);
      setSelectedLanguage(sessionData.language);
      
      // Start replay after a short delay
      replayTimeoutRef.current = window.setTimeout(() => {
        replayCompleteSession(replaySortedRef.current || eventsArr, 0);
      }, 1000);
      
    } catch (error) {
      console.error('Failed to load session for replay:', error);
    }
  };

  const replayCompleteSession = (events: any[], startIndex: number = 0) => {
    if (!events.length) return;
    
    // Sort events by timestamp to ensure chronological order
    const sortedEvents = replaySortedRef.current?.length ? replaySortedRef.current : events;
    
    // Constant-speed typing configuration
    const FIXED_STEP_MS = 60; // constant per-event delay for normal flow
    const LONG_BREAK_THRESHOLD_MS = 800; // preserve long user pauses beyond this
    
    let currentIndex = Math.max(0, Math.min(startIndex, sortedEvents.length));
    const totalEvents = sortedEvents.length;
    
    const replayNextEvent = () => {
      if (currentIndex >= totalEvents || !isReplayingRef.current) {
        setIsReplaying(false);
        isReplayingRef.current = false;
        console.log('Replay completed');
        setReplayProgress(100);
        setIsReplayCompleted(true);
        currentReplayIndexRef.current = totalEvents;
        if (replayTimeoutRef.current !== null) {
          clearTimeout(replayTimeoutRef.current);
          replayTimeoutRef.current = null;
        }
        return;
      }
      
      const event = sortedEvents[currentIndex];
      const nextEvent = sortedEvents[currentIndex + 1];
      
      // Show current event being replayed
      
      // Debug logging
      console.log(`Replaying event ${currentIndex + 1}/${totalEvents}:`, event);
      
      // Apply the edit to the editor
      applyReplayEdit(event);
      
      // Calculate delay to next event
      // Use constant per-event delay except when original gap indicates a long break
      let delay = 0;
      if (nextEvent) {
        const originalGap = nextEvent.timestamp - event.timestamp;
        if (originalGap >= LONG_BREAK_THRESHOLD_MS) {
          // Preserve long pause timing but allow speed multiplier
          delay = Math.max(20, originalGap / 1);
        } else {
          // Constant-speed typing
          delay = Math.max(20, FIXED_STEP_MS / 1);
        }
      }
      
      currentIndex++;
      currentReplayIndexRef.current = currentIndex;
      setReplayProgress((currentIndex / totalEvents) * 100);
      
      if (isReplayingRef.current) {
        // Use original timing but with speed control
        replayTimeoutRef.current = window.setTimeout(replayNextEvent, delay); // delay already accounts for min
      }
    };
    
    replayNextEvent();
  };

  const applyReplayEdit = (event: any) => {
    try {
      const editor = editorRef.current;
      if (!editor) {
        console.log('No editor ref available');
      }

      const model = editor?.getModel();
      if (!model) {
        console.log('No model available');
        return;
      }

      // Only process EDIT events for Monaco replay
      if (event.type !== 'EDIT') {
        console.log(`Skipping non-EDIT event: ${event.type}`);
        return;
      }

      console.log('Applying edit:', event.payload.changes);

      // Apply each change individually to simulate real typing
      event.payload.changes.forEach((change: any) => {
        const range = {
          startLineNumber: change.range.startLineNumber,
          startColumn: change.range.startColumn,
          endLineNumber: change.range.endLineNumber,
          endColumn: change.range.endColumn
        };

        console.log('Applying change:', { range, text: change.text });

        // Apply the edit
        model.pushEditOperations([], [{
          range,
          text: change.text,
          forceMoveMarkers: false
        }], () => null);

        // Update React state immediately
        const newCode = model.getValue();
        console.log('New code after edit:', newCode);
        setCode(newCode);
      });
    } catch (err) {
      console.error('Replay edit failed, continuing:', err);
      // Swallow errors to prevent replay from pausing
    }
  };

  const pauseReplay = () => {
    setIsReplaying(false);
    isReplayingRef.current = false;
    if (replayTimeoutRef.current !== null) {
      clearTimeout(replayTimeoutRef.current);
      replayTimeoutRef.current = null;
    }
  };

  const resumeReplay = () => {
    if (replayEvents.length > 0) {
      setIsReplaying(true);
      isReplayingRef.current = true;
      setIsReplayCompleted(false);
      // Continue from precise saved index
      const startIndex = Math.max(0, Math.min(currentReplayIndexRef.current, replayEvents.length));
      if (replayTimeoutRef.current !== null) {
        clearTimeout(replayTimeoutRef.current);
        replayTimeoutRef.current = null;
      }
      const sorted = replaySortedRef.current?.length ? replaySortedRef.current : replayEvents;
      replayCompleteSession(sorted, startIndex);
    }
  };

  const stopReplay = () => {
    setIsReplaying(false);
    isReplayingRef.current = false;
    setReplayProgress(0);
    setReplayEvents([]);
    setReplaySession(null);
    currentReplayIndexRef.current = 0;
    setIsReplayCompleted(false);
    if (replayTimeoutRef.current !== null) {
      clearTimeout(replayTimeoutRef.current);
      replayTimeoutRef.current = null;
    }
  };


  const seekReplayToPercent = (percent: number) => {
    const clamped = Math.max(0, Math.min(100, percent));
    setReplayProgress(clamped);
    const sorted = replaySortedRef.current?.length ? replaySortedRef.current : replayEvents;
    if (!sorted.length || !replaySession) return;
    const startIndex = Math.floor((clamped / 100) * sorted.length);

    // Auto-pause immediately
    if (replayTimeoutRef.current !== null) {
      clearTimeout(replayTimeoutRef.current);
      replayTimeoutRef.current = null;
    }
    setIsReplaying(false);
    isReplayingRef.current = false;
    setIsReplayCompleted(false);

    // Render editor to the selected point deterministically
    const editor = editorRef.current;
    const model = editor?.getModel?.();
    if (!editor || !model) return;

    // Prevent recording during programmatic rebuild
    const prevReplayFlag = isReplayingRef.current;
    isReplayingRef.current = true;

    try {
      // Reset to initial state
      if (replaySession.language && replaySession.language !== selectedLanguage) {
        setSelectedLanguage(replaySession.language);
      }
      setCode(replaySession.initialCode || '');
      model.setValue(replaySession.initialCode || '');

      // Apply events up to startIndex
      for (let i = 0; i < startIndex; i++) {
        const ev = sorted[i];
        if (ev?.type === 'EDIT') {
          // Inline minimal apply to avoid extra logging
          (ev.payload?.changes || []).forEach((change: any) => {
            const range = {
              startLineNumber: change.range.startLineNumber,
              startColumn: change.range.startColumn,
              endLineNumber: change.range.endLineNumber,
              endColumn: change.range.endColumn
            };
            model.pushEditOperations([], [{ range, text: change.text, forceMoveMarkers: false }], () => null);
          });
        }
      }

      // Sync React state to final code at the index
      setCode(model.getValue());
      currentReplayIndexRef.current = startIndex;
    } finally {
      // Restore flag
      isReplayingRef.current = prevReplayFlag;
    }
  };

  const rerunReplay = () => {
    if (!replaySession) return;
    const sorted = replaySortedRef.current?.length ? replaySortedRef.current : replayEvents;
    if (!sorted.length) return;
    const editor = editorRef.current;
    const model = editor?.getModel?.();
    if (model) {
      model.setValue(replaySession.initialCode || '');
    }
    setCode(replaySession.initialCode || '');
    setReplayProgress(0);
    currentReplayIndexRef.current = 0;
    setIsReplayCompleted(false);
    setIsReplaying(true);
    isReplayingRef.current = true;
    if (replayTimeoutRef.current !== null) {
      clearTimeout(replayTimeoutRef.current);
      replayTimeoutRef.current = null;
    }
    replayCompleteSession(sorted, 0);
  };

  // --- Three-pane resizable layout state ---
  const [leftWidthPct, setLeftWidthPct] = useState<number>(25); // 15-40
  const [rightWidthPct, setRightWidthPct] = useState<number>(25); // 15-40
  const [middleSplitPct, setMiddleSplitPct] = useState<number>(60); // editor height % in middle, 30-80

  const isDraggingLeftRef = useRef<boolean>(false);
  const isDraggingRightRef = useRef<boolean>(false);
  const isDraggingMidSplitRef = useRef<boolean>(false);

  const dragStartXRef = useRef<number>(0);
  const dragStartYRef = useRef<number>(0);
  const dragStartLeftPctRef = useRef<number>(leftWidthPct);
  const dragStartRightPctRef = useRef<number>(rightWidthPct);
  const dragStartMidSplitPctRef = useRef<number>(middleSplitPct);

  // Attach global mouse listeners for resizing
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      // Calculate container width/height relative to viewport
      const container = document.getElementById('three-pane-container');
      if (!container) return;
      const rect = container.getBoundingClientRect();

      if (isDraggingLeftRef.current) {
        const deltaPx = e.clientX - dragStartXRef.current;
        const deltaPct = (deltaPx / rect.width) * 100;
        let newLeft = Math.max(15, Math.min(40, dragStartLeftPctRef.current + deltaPct));
        // Ensure middle retains at least 20% total
        const middleAvailable = 100 - newLeft - rightWidthPct;
        if (middleAvailable < 20) {
          newLeft = 100 - rightWidthPct - 20;
        }
        setLeftWidthPct(newLeft);
      }

      if (isDraggingRightRef.current) {
        const deltaPx = dragStartXRef.current - e.clientX; // dragging left increases right pane
        const deltaPct = (deltaPx / rect.width) * 100;
        let newRight = Math.max(15, Math.min(40, dragStartRightPctRef.current + deltaPct));
        // Ensure middle retains at least 20% total
        const middleAvailable = 100 - leftWidthPct - newRight;
        if (middleAvailable < 20) {
          newRight = 100 - leftWidthPct - 20;
        }
        setRightWidthPct(newRight);
      }

      if (isDraggingMidSplitRef.current) {
        const middle = document.getElementById('middle-pane');
        if (!middle) return;
        const mrect = middle.getBoundingClientRect();
        const deltaPx = e.clientY - dragStartYRef.current;
        const deltaPct = (deltaPx / mrect.height) * 100;
        let newPct = Math.max(30, Math.min(80, dragStartMidSplitPctRef.current + deltaPct));
        setMiddleSplitPct(newPct);
      }
    };

    const onMouseUp = () => {
      isDraggingLeftRef.current = false;
      isDraggingRightRef.current = false;
      isDraggingMidSplitRef.current = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [leftWidthPct, rightWidthPct]);

  const beginDragLeft = (e: React.MouseEvent) => {
    dragStartXRef.current = e.clientX;
    dragStartLeftPctRef.current = leftWidthPct;
    isDraggingLeftRef.current = true;
  };

  const beginDragRight = (e: React.MouseEvent) => {
    dragStartXRef.current = e.clientX;
    dragStartRightPctRef.current = rightWidthPct;
    isDraggingRightRef.current = true;
  };

  const beginDragMiddleSplit = (e: React.MouseEvent) => {
    dragStartYRef.current = e.clientY;
    dragStartMidSplitPctRef.current = middleSplitPct;
    isDraggingMidSplitRef.current = true;
  };

  // Centralized syntax check that applies Monaco markers and updates sidebar state
  const performSyntaxCheck = useCallback(async () => {
    // Give absolute priority to replay: skip checks while replaying
    if (isReplayingRef.current) return;
    const current = editorRef.current;
    if (!current) return;
    const monacoModel = current.getModel?.();
    if (!monacoModel) return;
    if (!code.trim()) {
      // Clear markers and state only when the editor is empty
      // @ts-ignore
      const monacoAny = (window as any).monaco;
      if (monacoAny) {
        monacoAny.editor.setModelMarkers(monacoModel, 'owner', []);
      }
      setSyntaxErrors([]);
      setHasSyntaxErrors(false);
      return;
    }

    try {
      const resp = await axios.post('http://localhost:3000/check', {
        language: selectedLanguage,
        code
      });

      const stderr: string = resp.data?.stderr || '';

      // Parse stderr into Monaco markers (best-effort, per language)
      const markers: any[] = [];
      const addMarker = (line: number, column: number, message: string) => {
        markers.push({
          startLineNumber: Math.max(1, line),
          startColumn: Math.max(1, column),
          endLineNumber: Math.max(1, line),
          endColumn: Math.max(1, column + 1),
          message,
          severity: 8 // monaco.MarkerSeverity.Error
        });
      };

      if (stderr) {
        if (selectedLanguage === 'javascript') {
          const re = /:(\d+)(?::(\d+))?/g;
          let m;
          while ((m = re.exec(stderr)) !== null) {
            const line = parseInt(m[1] || '1', 10);
            const col = parseInt(m[2] || '1', 10);
            addMarker(line, col || 1, stderr.trim());
          }
        } else if (selectedLanguage === 'python') {
          const re = /line\s+(\d+)/g;
          let m;
          while ((m = re.exec(stderr)) !== null) {
            const line = parseInt(m[1] || '1', 10);
            addMarker(line, 1, stderr.trim());
          }
        } else if (selectedLanguage === 'c' || selectedLanguage === 'cpp') {
          const re = /:(\d+):(\d+):\s+error:/g;
          let m;
          while ((m = re.exec(stderr)) !== null) {
            const line = parseInt(m[1] || '1', 10);
            const col = parseInt(m[2] || '1', 10);
            addMarker(line, col, stderr.trim());
          }
        } else if (selectedLanguage === 'java') {
          const re = /:(\d+):\s+error:/g;
          let m;
          while ((m = re.exec(stderr)) !== null) {
            const line = parseInt(m[1] || '1', 10);
            addMarker(line, 1, stderr.trim());
          }
        }
      }

      // Apply markers to Monaco
      // @ts-ignore
      const monacoAny = (window as any).monaco;
      if (monacoAny) {
        monacoAny.editor.setModelMarkers(monacoModel, 'owner', markers);
      }

      // Mirror in our sidebar list
      const sidebarErrors: SyntaxError[] = markers.map((mk) => ({
        line: mk.startLineNumber,
        column: mk.startColumn,
        message: stderr || 'Compilation error',
        severity: 'error'
      }));
      setSyntaxErrors(sidebarErrors);
      setHasSyntaxErrors(sidebarErrors.length > 0);
    } catch (_) {
      // Do not clear markers on failures; persist until a successful, clean check
    }
  }, [code, selectedLanguage]);

  const handleLanguageChange = async (newLanguage: string) => {
    // Pause recording while switching languages
    isRecordingEnabledRef.current = false;

    // Stop any active replay immediately
    if (isReplayingRef.current) {
      setIsReplaying(false);
      isReplayingRef.current = false;
      setReplayProgress(0);
      setReplayEvents([]);
      setReplaySession(null);
    }

    // End current recording session if exists (flush first to avoid dropped tail keystrokes)
    const previousSessionId = sessionIdRef.current;
    if (previousSessionId) {
      try {
        await flushPendingEvents();
        await axios.post('http://localhost:3000/session/stop', { sessionId: previousSessionId });
      } catch (_) {}
    }

    // Determine fresh initial code for the new language
    const newInitialCode = DEFAULT_CODE[newLanguage as keyof typeof DEFAULT_CODE] || '';

    // Update language and reset editor to language default (synchronously in Monaco too)
    setSelectedLanguage(newLanguage);
    setCode(newInitialCode);
    try {
      const model = editorRef.current?.getModel?.();
      if (model) {
        model.setValue(newInitialCode);
      }
    } catch (_) {}
    setResult(null);
    setSyntaxErrors([]);
    setHasSyntaxErrors(false);

    // Start a fresh session with a new ID for the new language
    try {
      const resp = await axios.post('http://localhost:3000/session/start', {
        language: newLanguage,
        initialCode: newInitialCode,
        meta: { userAgent: navigator.userAgent }
      });
      sessionIdRef.current = resp.data?.sessionId || null;
      sessionStartTimeRef.current = resp.data?.startTime || Date.now();
    } catch (_) {
      sessionIdRef.current = null;
      sessionStartTimeRef.current = Date.now();
    }

    // Clear any pending events from old session
    pendingEventsRef.current = [];
    lastFlushRef.current = 0;
    lastCodeRef.current = '';
    wordBufferRef.current = '';
    lineBufferRef.current = '';
    lastWordTimeRef.current = 0;
    lastLineTimeRef.current = 0;

    // Re-enable recording
    isRecordingEnabledRef.current = true;
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    // Flush pending events when editor loses focus
    try {
      editor.onDidBlurEditorText(() => {
        flushPendingEvents();
      });
    } catch (_) {}
    // Start a new recording session
    (async () => {
      try {
        const resp = await axios.post('http://localhost:3000/session/start', {
          language: selectedLanguage,
          initialCode: editor.getValue(),
          meta: { userAgent: navigator.userAgent }
        });
        sessionIdRef.current = resp.data?.sessionId || null;
        sessionStartTimeRef.current = resp.data?.startTime || Date.now();
      } catch (_) {}
    })();
    
    // Set up syntax checking using the correct Monaco API
    const setupSyntaxChecking = () => {
      // Get the current model
      const model = editor.getModel();
      if (!model) return;

      // Custom validation function
      const validateCode = (code: string) => {
        const errors: SyntaxError[] = [];
        const lines = code.split('\n');
        
        // Basic syntax validation for different languages
        const currentLang = LANGUAGES.find(lang => lang.value === selectedLanguage)?.monacoLang;
        
        if (currentLang === 'python') {
          // Python-specific validation
          lines.forEach((line, index) => {
            const trimmedLine = line.trim();
            
            // Check for common Python syntax errors
            if (trimmedLine.includes('def ') && !trimmedLine.includes(':')) {
              errors.push({
                line: index + 1,
                column: 1,
                message: 'Function definition missing colon',
                severity: 'error'
              });
            }
            
            if (trimmedLine.includes('if ') && !trimmedLine.includes(':')) {
              errors.push({
                line: index + 1,
                column: 1,
                message: 'If statement missing colon',
                severity: 'error'
              });
            }
            
            // Check for unmatched parentheses
            const openParens = (line.match(/\(/g) || []).length;
            const closeParens = (line.match(/\)/g) || []).length;
            if (openParens !== closeParens) {
              errors.push({
                line: index + 1,
                column: 1,
                message: 'Unmatched parentheses',
                severity: 'error'
              });
            }
          });
        } else if (currentLang === 'javascript') {
          // JavaScript-specific validation
          lines.forEach((line, index) => {
            // Check for unmatched brackets
            const openBrackets = (line.match(/\{/g) || []).length;
            const closeBrackets = (line.match(/\}/g) || []).length;
            if (openBrackets !== closeBrackets) {
              errors.push({
                line: index + 1,
                column: 1,
                message: 'Unmatched curly braces',
                severity: 'error'
              });
            }
            
            // Check for unmatched parentheses
            const openParens = (line.match(/\(/g) || []).length;
            const closeParens = (line.match(/\)/g) || []).length;
            if (openParens !== closeParens) {
              errors.push({
                line: index + 1,
                column: 1,
                message: 'Unmatched parentheses',
                severity: 'error'
              });
            }
          });
        } else if (currentLang === 'java') {
          // Java-specific validation
          lines.forEach((line, index) => {
            // Check for unmatched brackets
            const openBrackets = (line.match(/\{/g) || []).length;
            const closeBrackets = (line.match(/\}/g) || []).length;
            if (openBrackets !== closeBrackets) {
              errors.push({
                line: index + 1,
                column: 1,
                message: 'Unmatched curly braces',
                severity: 'error'
              });
            }
          });
        }
        
        return errors;
      };

      // Set up error markers using the correct API
      const updateMarkers = () => {
        let monacoErrors: SyntaxError[] = [];
        
        try {
          // Try to get Monaco markers
          const markers = monaco.editor.getModelMarkers({ resource: model.uri });
          monacoErrors = markers.map((marker: any) => ({
            line: marker.startLineNumber,
            column: marker.startColumn,
            message: marker.message,
            severity: marker.severity === 8 ? 'error' : marker.severity === 4 ? 'warning' : 'info'
          }));
        } catch (error) {
          // Fallback: use only custom validation
          // Monaco markers not available, using custom validation only
        }
        
        // Combine Monaco errors with custom validation
        const customErrors = validateCode(model.getValue());
        const allErrors = [...monacoErrors, ...customErrors];
        
        setSyntaxErrors(allErrors);
        setHasSyntaxErrors(allErrors.some(e => e.severity === 'error'));
      };

      // Listen for model changes
      model.onDidChangeContent((e: any) => {
        // If we are replaying, ignore editor-driven changes to avoid feedback loops
        if (isReplayingRef.current) {
          return;
        }
        // If recording is temporarily disabled (e.g., during language switch), skip
        if (!isRecordingEnabledRef.current) {
          return;
        }
        // Debounce the marker updates
        setTimeout(updateMarkers, 500);
        
        const now = Date.now();
        const base = sessionStartTimeRef.current || now;
        const relativeTimestamp = now - base;

        // --- START OF MODIFICATIONS ---

        // 1. Capture the raw keystroke event (as you already do)
        const keystrokeEvent = {
          timestamp: relativeTimestamp,
          type: 'EDIT',
          payload: {
            changes: (e?.changes || []).map((c: any) => ({
              rangeOffset: c.rangeOffset,
              rangeLength: c.rangeLength,
              text: c.text,
              range: {
                startLineNumber: c.range?.startLineNumber,
                startColumn: c.range?.startColumn,
                endLineNumber: c.range?.endLineNumber,
                endColumn: c.range?.endColumn
              }
            }))
          }
        };
        pendingEventsRef.current.push(keystrokeEvent);

        // 2. Capture the full content of every changed line for versioning
        for (const change of e.changes) {
            // A single change can affect multiple lines (e.g., pasting a block of code)
            for (let i = change.range.startLineNumber; i <= change.range.endLineNumber; i++) {
                try {
                    // Ensure line number is valid and get content safely
                    if (i > 0 && i <= model.getLineCount()) {
                        const newContent = model.getLineContent(i); // Get the new content
                        const lastKnownContent = lineUpdateBufferRef.current[i]?.content; // Get the last version from our buffer

                        // --- THIS IS THE FIX ---
                        // ONLY add to the buffer if the line's text has actually changed.
                        if (newContent !== lastKnownContent) {
                            lineUpdateBufferRef.current[i] = {
                                timestamp: relativeTimestamp,
                                content: newContent 
                            };
                        }
                    }
                } catch (error) {
                    console.warn('Failed to get line content for line', i, error);
                }
            }
        }

        // 2b. Metrics: compute churn, undo/redo, keystroke counters
        const startLine = (e.changes?.[0]?.range?.startLineNumber) || 1;
        const endLine = (e.changes?.[0]?.range?.endLineNumber) || startLine;
        const centerLine = Math.floor((startLine + endLine) / 2);
        let totalAdded = 0;
        let totalDeleted = 0;
        for (const c of e.changes || []) {
          const addedLen = (c.text || '').length;
          const deletedLen = Math.max(0, c.rangeLength || 0);
          totalAdded += addedLen;
          totalDeleted += deletedLen;
        }
        churnEventsRef.current.push({ ts: now, line: centerLine, added: totalAdded, deleted: totalDeleted });
        if (e.isUndoing) undoRedoEventsRef.current.push({ ts: now, line: centerLine, kind: 'undo' });
        if (e.isRedoing) undoRedoEventsRef.current.push({ ts: now, line: centerLine, kind: 'redo' });
        if (totalAdded > 0) keystrokeEventsRef.current.push({ ts: now, line: centerLine, chars: totalAdded });

        // Evict old windowed events to bound memory
        const windowStartEvict = now - metricsWindowMsRef.current * 2; // keep 2x window
        if (churnEventsRef.current.length > 2000) {
          churnEventsRef.current = churnEventsRef.current.filter(ev => ev.ts >= windowStartEvict);
        }
        if (undoRedoEventsRef.current.length > 1000) {
          undoRedoEventsRef.current = undoRedoEventsRef.current.filter(ev => ev.ts >= windowStartEvict);
        }
        if (keystrokeEventsRef.current.length > 2000) {
          keystrokeEventsRef.current = keystrokeEventsRef.current.filter(ev => ev.ts >= windowStartEvict);
        }

        // Track active line and idle accumulation
        const currentActiveLine = centerLine;
        if (activeLineRef.current === null) {
          activeLineRef.current = currentActiveLine;
          lineStartTimeRef.current = now;
          lineIdleAccumRef.current = 0;
        } else if (activeLineRef.current !== currentActiveLine) {
          // Leaving previous line; finalize metrics
          finalizeActiveLineMetrics(now);
          // Switch to new line
          activeLineRef.current = currentActiveLine;
          lineStartTimeRef.current = now;
          lineIdleAccumRef.current = 0;
        }

        // Idle accumulation relative to last event
        if (lastEventTimeRef.current > 0) {
          const gap = now - lastEventTimeRef.current;
          if (gap >= idleThresholdMsRef.current && activeLineRef.current === currentActiveLine) {
            lineIdleAccumRef.current += gap;
          }
        }
        lastEventTimeRef.current = now;

        // 3. Debounce sending the buffered line updates to the server
        if (lineUpdateFlushTimerRef.current !== null) {
          clearTimeout(lineUpdateFlushTimerRef.current);
        }
        lineUpdateFlushTimerRef.current = window.setTimeout(() => {
            try {
                flushLineUpdates();
            } catch (error) {
                console.error('Error in flushLineUpdates timeout:', error);
            }
        }, 750); // Send line updates after 750ms of inactivity

        // --- END OF MODIFICATIONS ---

        // The rest of your existing logic for flushing raw events can remain
        lastInputTimeRef.current = now;
        if (idleFlushTimerRef.current !== null) {
          clearTimeout(idleFlushTimerRef.current);
        }
        idleFlushTimerRef.current = window.setTimeout(() => {
          const idleFor = Date.now() - lastInputTimeRef.current;
          if (idleFor >= 200) {
            flushPendingEvents(); // This flushes the raw 'EDIT' events
          }
        }, 220);

        if (pendingEventsRef.current.length >= 25) {
          flushPendingEvents();
        }
        
        // Detect semantic events
        const currentCode = model.getValue();
        detectWordComplete(currentCode, now);
        detectLineComplete(currentCode, now);
        
        // Update buffers
        lastCodeRef.current = currentCode;
        
        // Throttle flush to backend (~500ms)
        const shouldFlush = now - (lastFlushRef.current || 0) > 350; // slightly faster to reduce drop risk
        if (shouldFlush && sessionIdRef.current && pendingEventsRef.current.length) {
          // Bind the sessionId at the moment of flushing to avoid mixing after switches
          const boundSessionId = sessionIdRef.current;
          const toSend = pendingEventsRef.current.splice(0, pendingEventsRef.current.length);
          lastFlushRef.current = now;
          axios.post('http://localhost:3000/session/event', {
            sessionId: boundSessionId,
            events: toSend
          }).catch(() => {
            // On failure, only re-queue if we're still on the same session
            if (sessionIdRef.current === boundSessionId) {
              pendingEventsRef.current.unshift(...toSend);
            }
          });
        }
      });

      // Initial marker check
      setTimeout(updateMarkers, 1000);
    };

    // Configure language-specific settings
    const configureLanguage = () => {
      const currentLang = LANGUAGES.find(lang => lang.value === selectedLanguage)?.monacoLang;
      
      if (currentLang === 'javascript' || currentLang === 'typescript') {
        // Configure TypeScript/JavaScript diagnostics
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: false,
          noSyntaxValidation: false,
          noSuggestionDiagnostics: false
        });
        
        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: false,
          noSyntaxValidation: false,
          noSuggestionDiagnostics: false
        });
      }
    };

    // Set up the editor
    configureLanguage();
    setupSyntaxChecking();

    // Cursor movement: finalize metrics when moving off a line
    try {
      editor.onDidChangeCursorPosition(() => {
        const nowAbs = Date.now();
        finalizeActiveLineMetrics(nowAbs);
        // Reset start for new active line will be handled on next edit event
      });
    } catch (_) {}
  };

  // Stop session on unmount
  useEffect(() => {
    const handleBeforeUnload = async () => {
      // Best-effort flush of last events
      try { await flushPendingEvents(); } catch(_) {}
      try { await flushLineUpdates(); } catch(_) {}
      try { await (async () => { const f = (flushLineMetrics as any); if (typeof f === 'function') await f(); })(); } catch(_) {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    const handleVisibility = async () => {
      try { await flushPendingEvents(); } catch(_) {}
      try { await flushLineUpdates(); } catch(_) {}
      try { await (async () => { const f = (flushLineMetrics as any); if (typeof f === 'function') await f(); })(); } catch(_) {}
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handleVisibility);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handleVisibility);
      const sid = sessionIdRef.current;
      if (sid) {
        // Flush pending events before stopping the session
        Promise.resolve().then(() => flushPendingEvents()).then(() => flushLineUpdates()).then(() => (flushLineMetrics as any)()).finally(() => {
          axios.post('http://localhost:3000/session/stop', { sessionId: sid }).catch(() => {});
        });
      }
    };
  }, [flushPendingEvents, flushLineUpdates, flushLineMetrics]);

  // Debounced server-side compile/syntax checks and Monaco markers
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // Small debounce
      await new Promise(r => setTimeout(r, 350));
      if (cancelled) return;
      // Skip any background work during replay
      if (isReplayingRef.current) return;
      await performSyntaxCheck();
    };

    run();
    return () => { cancelled = true; };
  }, [performSyntaxCheck]);

  // When an error is present, keep re-checking every 350ms until resolved
  useEffect(() => {
    // Replay has highest priority: disable polling entirely during replay
    if (isReplayingRef.current) {
      pollRef.current = false;
      if (pollTimeoutRef.current !== null) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
      return;
    }

    if (hasSyntaxErrors) {
      pollRef.current = true;
      const loop = async () => {
        if (!pollRef.current) return;
        if (isReplayingRef.current) return;
        await performSyntaxCheck();
        if (pollRef.current) {
          pollTimeoutRef.current = window.setTimeout(loop, 350);
        }
      };
      loop();
      return () => {
        pollRef.current = false;
        if (pollTimeoutRef.current !== null) {
          clearTimeout(pollTimeoutRef.current);
          pollTimeoutRef.current = null;
        }
      };
    } else {
      // Stop polling when errors are resolved
      pollRef.current = false;
      if (pollTimeoutRef.current !== null) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    }
  }, [hasSyntaxErrors, performSyntaxCheck]);

  // Silence unused warning for detectCodeRun (reserved for future event type)
  useEffect(() => {
    if (false) {
      detectCodeRun('', 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runCode = async () => {
    if (!code.trim()) {
      setResult({ output: '', error: 'Please enter some code to run.' });
      return;
    }

    // Allow running code even with syntax errors
    // The red underlines and error indicators will still be visible

    setIsRunning(true);
    setResult(null);

    try {
      const response = await axios.post('http://localhost:3000/run', {
        language: selectedLanguage,
        code: code,
        sessionId: sessionIdRef.current
      });

      setResult(response.data);
    } catch (error: any) {
      setResult({
        output: '',
        error: error.response?.data?.error || 'Failed to execute code. Make sure the backend server is running.'
      });
    } finally {
      setIsRunning(false);
    }
  };

  const clearOutput = () => {
    setResult(null);
  };

  // Keep refs in sync with latest state for snapshot metrics
  useEffect(() => { selectedLanguageRef.current = selectedLanguage; }, [selectedLanguage]);
  useEffect(() => { syntaxErrorsRef.current = syntaxErrors; }, [syntaxErrors]);
  useEffect(() => { hasSyntaxErrorsRef.current = hasSyntaxErrors; }, [hasSyntaxErrors]);

  // Text differ for patches (simple diff-match-patch compatible generation)
  const makePatch = useCallback((oldText: string, newText: string): string => {
    // Minimal inline JS diff-match-patch is not bundled; create a lightweight patch format
    // For now, fallback to sending full when changes are too large; otherwise send unified diff-like
    try {
      if (oldText === newText) return '';
      // Simple heuristic: if delta > 20% of newText, skip patching (send full)
      const delta = Math.abs(newText.length - oldText.length);
      const threshold = Math.floor(newText.length * 0.2);
      if (delta > threshold) return '';
      // Very naive patch: include both texts; backend still handles real patches, so prefer full
      return '';
    } catch (_) {
      return '';
    }
  }, []);

  // Every 30s, send code snapshot; start immediately on mount
  useEffect(() => {
    let cancelled = false;

    const sendSnapshot = async () => {
      if (isReplayingRef.current) return;
      const editor = editorRef.current;
      const model = editor?.getModel?.();
      const currentCode = (model?.getValue?.() ?? lastCodeRef.current ?? (code ?? '')).toString();
      if (!currentCode.trim()) return;
      try {
        let respText = '';
        if (!lastCodeRef.current) {
          respText = await sendFullSnapshot(currentCode, sessionIdRef.current);
        } else {
          const patch = makePatch(lastCodeRef.current, currentCode);
          if (patch) {
            respText = await sendPatchSnapshot(patch, sessionIdRef.current);
          } else {
            respText = await sendFullSnapshot(currentCode, sessionIdRef.current);
          }
        }
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.log('[AI 30s]', respText);
        }
        lastCodeRef.current = currentCode;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('AI snapshot failed', err);
      }
    };

    // Fire immediately once on mount
    void sendSnapshot();
    const interval = window.setInterval(sendSnapshot, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  // Intentionally empty deps: we use refs to read latest values
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Custom syntax checking when code changes
  useEffect(() => {
    if (!code.trim()) {
      setSyntaxErrors([]);
      setHasSyntaxErrors(false);
      return;
    }

    const validateCode = (code: string) => {
      const errors: SyntaxError[] = [];
      const lines = code.split('\n');
      
      // Basic syntax validation for different languages
      const currentLang = LANGUAGES.find(lang => lang.value === selectedLanguage)?.monacoLang;
      
      if (currentLang === 'python') {
        // Python-specific validation
        lines.forEach((line, index) => {
          const trimmedLine = line.trim();
          
          // Check for common Python syntax errors
          if (trimmedLine.includes('def ') && !trimmedLine.includes(':')) {
            errors.push({
              line: index + 1,
              column: 1,
              message: 'Function definition missing colon',
              severity: 'error'
            });
          }
          
          if (trimmedLine.includes('if ') && !trimmedLine.includes(':')) {
            errors.push({
              line: index + 1,
              column: 1,
              message: 'If statement missing colon',
              severity: 'error'
            });
          }
          
          // Check for unmatched parentheses
          const openParens = (line.match(/\(/g) || []).length;
          const closeParens = (line.match(/\)/g) || []).length;
          if (openParens !== closeParens) {
            errors.push({
              line: index + 1,
              column: 1,
              message: 'Unmatched parentheses',
              severity: 'error'
            });
          }
        });
      } else if (currentLang === 'javascript') {
        // JavaScript-specific validation
        lines.forEach((line, index) => {
          // Check for unmatched brackets
          const openBrackets = (line.match(/\{/g) || []).length;
          const closeBrackets = (line.match(/\}/g) || []).length;
          if (openBrackets !== closeBrackets) {
            errors.push({
              line: index + 1,
              column: 1,
              message: 'Unmatched curly braces',
              severity: 'error'
            });
          }
          
          // Check for unmatched parentheses
          const openParens = (line.match(/\(/g) || []).length;
          const closeParens = (line.match(/\)/g) || []).length;
          if (openParens !== closeParens) {
            errors.push({
              line: index + 1,
              column: 1,
              message: 'Unmatched parentheses',
              severity: 'error'
            });
          }
        });
      } else if (currentLang === 'java') {
        // Java-specific validation
        lines.forEach((line, index) => {
          // Check for unmatched brackets
          const openBrackets = (line.match(/\{/g) || []).length;
          const closeBrackets = (line.match(/\}/g) || []).length;
          if (openBrackets !== closeBrackets) {
            errors.push({
              line: index + 1,
              column: 1,
              message: 'Unmatched curly braces',
              severity: 'error'
            });
          }
        });
      }
      
      return errors;
    };

    // Debounce the validation
    const timeoutId = setTimeout(() => {
      const errors = validateCode(code);
      setSyntaxErrors(errors);
      setHasSyntaxErrors(errors.some(e => e.severity === 'error'));
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [code, selectedLanguage]);

  return (
    <div className="App">
      <header className="app-header">
        <h1>Code Execution Platform</h1>
        <div className="header-controls">
          <button onClick={() => navigate('/analytics')} style={{ marginRight: 12 }}>Analytics</button>
          <div className="language-selector">
            <label htmlFor="language-select">Language: </label>
            <select
              id="language-select"
              value={selectedLanguage}
              onChange={(e) => handleLanguageChange(e.target.value)}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
          <div className="session-selector">
            <label htmlFor="session">Replay Session:</label>
            <div className="session-dropdown">
              <input 
                id="session"
                type="text" 
                placeholder="Enter session ID"
                autoComplete="off"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const sessionId = e.currentTarget.value.trim();
                    if (sessionId) {
                      startReplay(sessionId);
                    }
                  }
                }}
                onFocus={async () => {
                  try {
                    setIsSessionDropdownOpen(true);
                    // Cleanup empty sessions first
                    try { await axios.post('http://localhost:3000/sessions/cleanup-empty'); } catch (_) {}
                    const resp = await axios.get('http://localhost:3000/sessions?limit=100');
                    const list = Array.isArray(resp.data?.sessions) ? resp.data.sessions : [];
                    setAvailableSessions(list);
                  } catch (_) {
                    setAvailableSessions([]);
                  }
                }}
                onBlur={() => {
                  // Delay close to allow click on item
                  setTimeout(() => setIsSessionDropdownOpen(false), 150);
                }}
              />
              {isSessionDropdownOpen && availableSessions.length > 0 && (
                <div className="session-dropdown-menu">
                  {availableSessions.map((s) => (
                    <div
                      key={s.sessionId}
                      className="session-dropdown-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const input = document.getElementById('session') as HTMLInputElement;
                        if (input) input.value = s.sessionId;
                        startReplay(s.sessionId);
                        setIsSessionDropdownOpen(false);
                      }}
                      title={`${s.sessionId} • ${s.language || ''}`}
                    >
                      <span className="session-id">{s.sessionId.slice(0,8)}...</span>
                      <span className="session-meta">{s.language || ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button 
              onClick={() => {
                const input = document.getElementById('session') as HTMLInputElement;
                const sessionId = input?.value.trim();
                if (sessionId) {
                  startReplay(sessionId);
                }
              }}
            >
              Load
            </button>
            <button 
              onClick={() => {
                // Test with sample data
                const sampleSession = {
                  sessionId: 'test-session',
                  language: 'python',
                  initialCode: '',
                  events: [
                    { timestamp: 0, type: 'EDIT', payload: { changes: [{ range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'p' }] } },
                    { timestamp: 100, type: 'EDIT', payload: { changes: [{ range: { startLineNumber: 1, startColumn: 2, endLineNumber: 1, endColumn: 2 }, text: 'r' }] } },
                    { timestamp: 200, type: 'EDIT', payload: { changes: [{ range: { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 3 }, text: 'i' }] } },
                    { timestamp: 300, type: 'EDIT', payload: { changes: [{ range: { startLineNumber: 1, startColumn: 4, endLineNumber: 1, endColumn: 4 }, text: 'n' }] } },
                    { timestamp: 400, type: 'EDIT', payload: { changes: [{ range: { startLineNumber: 1, startColumn: 5, endLineNumber: 1, endColumn: 5 }, text: 't' }] } }
                  ]
                };
                
                setReplaySession(sampleSession);
                setReplayEvents(sampleSession.events);
                setIsReplaying(true);
                isReplayingRef.current = true;
                setReplayProgress(0);
                setCode(sampleSession.initialCode);
                setSelectedLanguage(sampleSession.language);
                
                setTimeout(() => {
                  replayCompleteSession(sampleSession.events);
                }, 1000);
              }}
            >
              Test
            </button>
          </div>
        </div>
      </header>

      {/* Three-pane resizable layout */}
      <div id="three-pane-container" className="three-pane-container">
        {/* Left: Question panel */}
        <div className="pane pane-left" style={{ width: `${leftWidthPct}%` }}>
          <div className="pane-header">Question</div>
          <div className="pane-content question-content">
            <h3>Two Sum</h3>
            <p>
              Given an array of integers nums and an integer target, return indices of the two numbers 
              such that they add up to target.
            </p>
            <p>
              You may assume that each input would have exactly one solution, and you may not use the same element twice.
            </p>
            <p>Example: nums = [2,7,11,15], target = 9 → [0,1]</p>
          </div>
        </div>
        <div className="gutter-vertical" onMouseDown={beginDragLeft} />

        {/* Middle: Editor (top) + Output (bottom) with horizontal resizer */}
        <div id="middle-pane" className="pane pane-middle" style={{ width: `${100 - leftWidthPct - rightWidthPct}%` }}>
          <div className="middle-top" style={{ height: `${middleSplitPct}%` }}>
            <div className="editor-header">
              <div className="editor-title">
                <h3>Code Editor</h3>
                {isReplaying && (
                  <div className="replay-info">
                    <span className="replay-indicator">🔴 REPLAYING</span>
                  </div>
                )}
              </div>
              <div className="button-group">
                {(replaySession && replayEvents.length > 0) ? (
                  <div className="replay-controls">
                    {!isReplayCompleted ? (
                      <>
                        <button 
                          className="replay-button"
                          onClick={isReplaying ? pauseReplay : resumeReplay}
                        >
                          {isReplaying ? 'Pause' : 'Resume'}
                        </button>
                        <button 
                          className="replay-button"
                          onClick={stopReplay}
                        >
                          Stop
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="replay-completed">Replay completed</span>
                        <button 
                          className="replay-button"
                          onClick={rerunReplay}
                        >
                          Rerun
                        </button>
                      </>
                    )}
                    <div className="replay-progress">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={replayProgress}
                        onChange={(e) => seekReplayToPercent(parseInt(e.target.value, 10))}
                      />
                      <span>{Math.round(replayProgress)}%</span>
                    </div>
                  </div>
                ) : (
                  <button 
                    className={`run-button ${hasSyntaxErrors ? 'has-errors' : ''}`}
                    onClick={runCode} 
                    disabled={isRunning}
                  >
                    {isRunning ? 'Running...' : 'Run Code'}
                  </button>
                )}
              </div>
            </div>
            <div className="editor-container">
              <Editor
                height="100%"
                language={LANGUAGES.find(lang => lang.value === selectedLanguage)?.monacoLang}
                value={code}
                onChange={(value) => {
                  // Do not allow user edits during replay
                  if (isReplayingRef.current) return;
                  setCode(value || '');
                }}
                onMount={handleEditorDidMount}
                theme="vs-dark"
                options={{
                  readOnly: isReplaying,
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  roundedSelection: false,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  // Disable all autocomplete and suggestions
                  quickSuggestions: false,
                  suggestOnTriggerCharacters: false,
                  acceptSuggestionOnEnter: 'off',
                  tabCompletion: 'off',
                  wordBasedSuggestions: 'off',
                  // Error highlighting
                  renderValidationDecorations: 'on',
                  // Code folding
                  folding: true,
                  foldingStrategy: 'indentation',
                  // Bracket matching
                  matchBrackets: 'always',
                  // Auto closing brackets
                  autoClosingBrackets: 'languageDefined',
                  autoClosingQuotes: 'languageDefined',
                  // Indentation
                  insertSpaces: true,
                  tabSize: 4,
                  // Error squiggles
                  renderWhitespace: 'boundary',
                  // Disable IntelliSense completely
                  suggest: {
                    showKeywords: false,
                    showSnippets: false,
                    showFunctions: false,
                    showConstructors: false,
                    showFields: false,
                    showVariables: false,
                    showClasses: false,
                    showStructs: false,
                    showInterfaces: false,
                    showModules: false,
                    showProperties: false,
                    showEvents: false,
                    showOperators: false,
                    showUnits: false,
                    showValues: false,
                    showConstants: false,
                    showEnums: false,
                    showEnumMembers: false,
                    showColors: false,
                    showFiles: false,
                    showReferences: false,
                    showFolders: false,
                    showTypeParameters: false,
                    showIssues: false,
                    showUsers: false,
                    showWords: false
                  }
                }}
              />
            </div>
          </div>
          <div className="gutter-horizontal" onMouseDown={beginDragMiddleSplit} />
          <div className="middle-bottom" style={{ height: `${100 - middleSplitPct}%` }}>
            <div className="output-header">
              <h3>Output</h3>
              <button className="clear-button" onClick={clearOutput}>
                Clear
              </button>
            </div>
            <div className="output-container">
              {isRunning ? (
                <div className="loading">
                  <div className="spinner"></div>
                  <span>Executing code...</span>
                </div>
              ) : syntaxErrors.length > 0 ? (
                <div className="syntax-errors">
                  <div className="error-header">
                    <strong>Syntax Errors ({syntaxErrors.length})</strong>
                  </div>
                  {syntaxErrors.map((error, index) => (
                    <div key={index} className={`syntax-error ${error.severity}`}>
                      <span className="error-location">Line {error.line}, Column {error.column}</span>
                      <span className="error-message">{error.message}</span>
                    </div>
                  ))}
                </div>
              ) : result ? (
                <div className="result">
                  {result.output && (
                    <div className="stdout">
                      <strong>Output:</strong>
                      <pre>{result.output}</pre>
                    </div>
                  )}
                  {result.error && (
                    <div className="stderr">
                      <strong>Runtime/Compilation Error:</strong>
                      <pre>{result.error}</pre>
                    </div>
                  )}
                  {!result.output && !result.error && (
                    <div className="no-output">No output</div>
                  )}
                </div>
              ) : (
                <div className="no-output">Click "Run Code" to execute your program</div>
              )}
            </div>
          </div>
        </div>
        <div className="gutter-vertical" onMouseDown={beginDragRight} />

        {/* Right: Chatbot panel */}
        <div className="pane pane-right" style={{ width: `${rightWidthPct}%` }}>
          <div className="pane-header">AI Assistant</div>
          <div className="pane-content chat-content">
            <ChatBox />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;