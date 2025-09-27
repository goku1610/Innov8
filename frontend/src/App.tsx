import React, { useState, useRef, useEffect } from 'react';
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
  const editorRef = useRef<any>(null);

  const handleLanguageChange = (newLanguage: string) => {
    setSelectedLanguage(newLanguage);
    setCode(DEFAULT_CODE[newLanguage as keyof typeof DEFAULT_CODE] || '');
    setResult(null);
    setSyntaxErrors([]);
    setHasSyntaxErrors(false);
  };

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    
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
          console.log('Monaco markers not available, using custom validation only');
        }
        
        // Combine Monaco errors with custom validation
        const customErrors = validateCode(model.getValue());
        const allErrors = [...monacoErrors, ...customErrors];
        
        setSyntaxErrors(allErrors);
        setHasSyntaxErrors(allErrors.some(e => e.severity === 'error'));
      };

      // Listen for model changes
      model.onDidChangeContent(() => {
        // Debounce the marker updates
        setTimeout(updateMarkers, 500);
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

  // Debounced server-side compile/syntax checks and Monaco markers
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const current = editorRef.current;
      if (!current) return;
      const monacoModel = current.getModel?.();
      if (!monacoModel) return;
      if (!code.trim()) {
        // Clear markers and state
        // @ts-ignore
        const monacoAny = (window as any).monaco;
        if (monacoAny) {
          monacoAny.editor.setModelMarkers(monacoModel, 'owner', []);
        }
        setSyntaxErrors([]);
        setHasSyntaxErrors(false);
        return;
      }

      // Small debounce
      await new Promise(r => setTimeout(r, 350));
      if (cancelled) return;

      try {
        const resp = await axios.post('http://localhost:3000/check', {
          language: selectedLanguage,
          code
        });
        if (cancelled) return;

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
            // Node --check error format example: /work/file.js:3
            const re = /:(\d+)(?::(\d+))?/g;
            let m;
            while ((m = re.exec(stderr)) !== null) {
              const line = parseInt(m[1] || '1', 10);
              const col = parseInt(m[2] || '1', 10);
              addMarker(line, col || 1, stderr.trim());
            }
          } else if (selectedLanguage === 'python') {
            // py_compile traceback lines typically: File "...", line 3
            const re = /line\s+(\d+)/g;
            let m;
            while ((m = re.exec(stderr)) !== null) {
              const line = parseInt(m[1] || '1', 10);
              addMarker(line, 1, stderr.trim());
            }
          } else if (selectedLanguage === 'c' || selectedLanguage === 'cpp') {
            // gcc/g++: file.c:12:5: error: ...
            const re = /:(\d+):(\d+):\s+error:/g;
            let m;
            while ((m = re.exec(stderr)) !== null) {
              const line = parseInt(m[1] || '1', 10);
              const col = parseInt(m[2] || '1', 10);
              addMarker(line, col, stderr.trim());
            }
          } else if (selectedLanguage === 'java') {
            // javac: Main.java:6: error: ...
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
      } catch (e) {
        // Network or other failures: do not block editing
      }
    };

    run();
    return () => { cancelled = true; };
  }, [code, selectedLanguage]);

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
      </header>

      <div className="main-container">
        <div className="editor-section">
          <div className="editor-header">
            <h3>Code Editor</h3>
            <button 
              className={`run-button ${hasSyntaxErrors ? 'has-errors' : ''}`}
              onClick={runCode} 
              disabled={isRunning}
            >
              {isRunning ? 'Running...' : 'Run Code'}
            </button>
          </div>
          
          <div className="editor-container">
            <Editor
              height="400px"
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

        <div className="output-section">
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
    </div>
  );
}

export default App;