import React, { useState, useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import axios from 'axios';
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

function App() {
  const [selectedLanguage, setSelectedLanguage] = useState('python');
  const [code, setCode] = useState(DEFAULT_CODE.python);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [syntaxErrors, setSyntaxErrors] = useState<SyntaxError[]>([]);
  const [hasSyntaxErrors, setHasSyntaxErrors] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [replayProgress, setReplayProgress] = useState(0);
  const [replayEvents, setReplayEvents] = useState<any[]>([]);
  const [replaySession, setReplaySession] = useState<any>(null);
  const [currentReplayEvent, setCurrentReplayEvent] = useState<any>(null);
  const editorRef = useRef<any>(null);
  const pollRef = useRef<boolean>(false);
  const pollTimeoutRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartTimeRef = useRef<number | null>(null);
  const pendingEventsRef = useRef<any[]>([]);
  const lastFlushRef = useRef<number>(0);
  const lastCodeRef = useRef<string>('');
  const wordBufferRef = useRef<string>('');
  const lineBufferRef = useRef<string>('');
  const lastWordTimeRef = useRef<number>(0);
  const lastLineTimeRef = useRef<number>(0);
  const isReplayingRef = useRef<boolean>(false);

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
      
      setReplaySession(sessionData);
      setReplayEvents(sessionData.events || []);
      setIsReplaying(true);
      isReplayingRef.current = true;
      setReplayProgress(0);
      
      // Start with initial code
      setCode(sessionData.initialCode);
      setSelectedLanguage(sessionData.language);
      
      // Start replay after a short delay
      setTimeout(() => {
        replayCompleteSession(sessionData.events || []);
      }, 1000);
      
    } catch (error) {
      console.error('Failed to load session for replay:', error);
    }
  };

  const replayCompleteSession = (events: any[]) => {
    if (!events.length) return;
    
    // Sort events by timestamp to ensure chronological order
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);
    
    let currentIndex = 0;
    const totalEvents = sortedEvents.length;
    
    const replayNextEvent = () => {
      if (currentIndex >= totalEvents || !isReplayingRef.current) {
        setIsReplaying(false);
        isReplayingRef.current = false;
        console.log('Replay completed');
        return;
      }
      
      const event = sortedEvents[currentIndex];
      const nextEvent = sortedEvents[currentIndex + 1];
      
      // Show current event being replayed
      setCurrentReplayEvent(event);
      
      // Debug logging
      console.log(`Replaying event ${currentIndex + 1}/${totalEvents}:`, event);
      
      // Apply the edit to the editor
      applyReplayEdit(event);
      
      // Calculate delay to next event (preserve original timing)
      const delay = nextEvent ? (nextEvent.timestamp - event.timestamp) / replaySpeed : 0;
      
      currentIndex++;
      setReplayProgress((currentIndex / totalEvents) * 100);
      
      if (isReplayingRef.current) {
        // Use original timing but with speed control
        setTimeout(replayNextEvent, Math.max(20, delay)); // Minimum 20ms delay
      }
    };
    
    replayNextEvent();
  };

  const applyReplayEdit = (event: any) => {
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
  };

  const pauseReplay = () => {
    setIsReplaying(false);
    isReplayingRef.current = false;
  };

  const resumeReplay = () => {
    if (replayEvents.length > 0) {
      setIsReplaying(true);
      isReplayingRef.current = true;
      // Continue from current progress
      const startIndex = Math.floor((replayProgress / 100) * replayEvents.length);
      const remainingEvents = replayEvents.slice(startIndex);
      replayCompleteSession(remainingEvents);
    }
  };

  const stopReplay = () => {
    setIsReplaying(false);
    isReplayingRef.current = false;
    setReplayProgress(0);
    setReplayEvents([]);
    setReplaySession(null);
  };

  const changeReplaySpeed = (speed: number) => {
    setReplaySpeed(speed);
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

  const handleLanguageChange = (newLanguage: string) => {
    setSelectedLanguage(newLanguage);
    setCode(DEFAULT_CODE[newLanguage as keyof typeof DEFAULT_CODE] || '');
    setResult(null);
    setSyntaxErrors([]);
    setHasSyntaxErrors(false);
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
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
        // Debounce the marker updates
        setTimeout(updateMarkers, 500);
        
        // Record keystroke event for session (event sourcing)
        const now = Date.now();
        const base = sessionStartTimeRef.current || now;
        const currentCode = model.getValue();
        
        // Keystroke-level event (for Monaco replay)
        const keystrokeEvent = {
          timestamp: now - base,
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
        
        // Detect semantic events
        detectWordComplete(currentCode, now);
        detectLineComplete(currentCode, now);
        
        // Update buffers
        lastCodeRef.current = currentCode;
        
        // Throttle flush to backend (~500ms)
        const shouldFlush = now - (lastFlushRef.current || 0) > 500;
        if (shouldFlush && sessionIdRef.current && pendingEventsRef.current.length) {
          const toSend = pendingEventsRef.current.splice(0, pendingEventsRef.current.length);
          lastFlushRef.current = now;
          axios.post('http://localhost:3000/session/event', {
            sessionId: sessionIdRef.current,
            events: toSend
          }).catch(() => {
            // On failure, re-queue toSend
            pendingEventsRef.current.unshift(...toSend);
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
  };

  // Stop session on unmount
  useEffect(() => {
    return () => {
      const sid = sessionIdRef.current;
      if (sid) {
        axios.post('http://localhost:3000/session/stop', { sessionId: sid }).catch(() => {});
      }
    };
  }, []);

  // Debounced server-side compile/syntax checks and Monaco markers
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // Small debounce
      await new Promise(r => setTimeout(r, 350));
      if (cancelled) return;
      await performSyntaxCheck();
    };

    run();
    return () => { cancelled = true; };
  }, [performSyntaxCheck]);

  // When an error is present, keep re-checking every 350ms until resolved
  useEffect(() => {
    if (hasSyntaxErrors) {
      pollRef.current = true;
      const loop = async () => {
        if (!pollRef.current) return;
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
        code: code
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
            <input 
              id="session"
              type="text" 
              placeholder="Enter session ID"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  const sessionId = e.currentTarget.value.trim();
                  if (sessionId) {
                    startReplay(sessionId);
                  }
                }
              }}
            />
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
                {isReplaying && replaySession && (
                  <div className="replay-info">
                    <span className="replay-indicator">🔴 REPLAYING</span>
                    <span className="session-info">
                      Session: {replaySession.sessionId?.substring(0, 8)}... | 
                      Language: {replaySession.language} | 
                      Events: {replayEvents.length}
                    </span>
                    {currentReplayEvent && (
                      <div className="current-event">
                        <span className="event-type">{currentReplayEvent.type}</span>
                        <span className="event-time">+{currentReplayEvent.timestamp}ms</span>
                        {currentReplayEvent.type === 'EDIT' && currentReplayEvent.payload.changes[0] && (
                          <span className="event-text">
                            "{currentReplayEvent.payload.changes[0].text}"
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="button-group">
                {!isReplaying ? (
                  <button 
                    className={`run-button ${hasSyntaxErrors ? 'has-errors' : ''}`}
                    onClick={runCode} 
                    disabled={isRunning}
                  >
                    {isRunning ? 'Running...' : 'Run Code'}
                  </button>
                ) : (
                  <div className="replay-controls">
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
                    <div className="replay-speed">
                      <label>Speed:</label>
                      <select 
                        value={replaySpeed} 
                        onChange={(e) => changeReplaySpeed(parseFloat(e.target.value))}
                      >
                        <option value={0.5}>0.5x</option>
                        <option value={1}>1x</option>
                        <option value={2}>2x</option>
                        <option value={4}>4x</option>
                      </select>
                    </div>
                    <div className="replay-progress">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${replayProgress}%` }}
                        ></div>
                      </div>
                      <span>{Math.round(replayProgress)}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="editor-container">
              <Editor
                height="100%"
                language={LANGUAGES.find(lang => lang.value === selectedLanguage)?.monacoLang}
                value={code}
                onChange={(value) => setCode(value || '')}
                onMount={handleEditorDidMount}
                theme="vs-dark"
                options={{
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

        {/* Right: Chatbot panel (sample) */}
        <div className="pane pane-right" style={{ width: `${rightWidthPct}%` }}>
          <div className="pane-header">AI Assistant</div>
          <div className="pane-content chat-content">
            <div className="chat-message bot">Hello! I'm your coding assistant. Ask me anything about this problem.</div>
            <div className="chat-message user">What's the time complexity of the optimal solution?</div>
            <div className="chat-message bot">O(n) using a hash map to store seen values.</div>
            <div className="chat-input-row">
              <input className="chat-input" placeholder="Type a message..." />
              <button className="chat-send">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;