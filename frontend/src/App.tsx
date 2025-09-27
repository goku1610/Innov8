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

  const runCode = async () => {
    if (!code.trim()) {
      setResult({ output: '', error: 'Please enter some code to run.' });
      return;
    }

    // Check for syntax errors before execution
    if (hasSyntaxErrors) {
      setResult({ 
        output: '', 
        error: 'Please fix syntax errors before running the code.' 
      });
      return;
    }

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
              className={`run-button ${hasSyntaxErrors ? 'disabled' : ''}`}
              onClick={runCode} 
              disabled={isRunning || hasSyntaxErrors}
            >
              {isRunning ? 'Running...' : hasSyntaxErrors ? 'Fix Errors First' : 'Run Code'}
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
                // Enhanced language features
                quickSuggestions: true,
                suggestOnTriggerCharacters: true,
                acceptSuggestionOnEnter: 'on',
                tabCompletion: 'on',
                wordBasedSuggestions: 'currentDocument',
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
                // IntelliSense
                suggest: {
                  showKeywords: true,
                  showSnippets: true,
                  showFunctions: true,
                  showConstructors: true,
                  showFields: true,
                  showVariables: true,
                  showClasses: true,
                  showStructs: true,
                  showInterfaces: true,
                  showModules: true,
                  showProperties: true,
                  showEvents: true,
                  showOperators: true,
                  showUnits: true,
                  showValues: true,
                  showConstants: true,
                  showEnums: true,
                  showEnumMembers: true,
                  showColors: true,
                  showFiles: true,
                  showReferences: true,
                  showFolders: true,
                  showTypeParameters: true,
                  showIssues: true,
                  showUsers: true,
                  showWords: true
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