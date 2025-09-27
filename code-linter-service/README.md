# Code Linter Service

A comprehensive code linting service that routes code to appropriate command-line linter tools based on the programming language. Supports Python, Java, C++, and C with industry-standard linters and style guides.

## Features

- **Multi-language support**: Python, Java, C++, and C
- **Industry-standard linters**: 
  - Python: flake8
  - Java: Checkstyle with Google Java Style Guide
  - C++: clang-tidy with Google/LLVM style
  - C: cppcheck for static analysis
- **Raw output**: Returns unprocessed linter output for maximum flexibility
- **JSON output format**: Results include `staticStyleAnalysisResults` key as specified
- **Configurable**: Custom configuration files for each linter
- **Easy integration**: Simple API for integration into larger systems

## Installation

### 1. Clone or Download the Project

```bash
git clone <repository-url>
cd code-linter-service
```

### 2. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 3. Install Linter Tools

#### Python (flake8)
```bash
pip install flake8
```

#### Java (Checkstyle)
- **Option 1**: Download Checkstyle JAR
  ```bash
  # Download from https://github.com/checkstyle/checkstyle/releases
  wget https://github.com/checkstyle/checkstyle/releases/download/checkstyle-10.12.4/checkstyle-10.12.4-all.jar
  ```

- **Option 2**: Install via package manager (Linux/Mac)
  ```bash
  # Ubuntu/Debian
  sudo apt-get install checkstyle
  
  # macOS
  brew install checkstyle
  ```

#### C++ (clang-tidy)
```bash
# Ubuntu/Debian
sudo apt-get install clang-tidy

# CentOS/RHEL
sudo yum install clang-tools-extra

# macOS
brew install llvm

# Windows
# Install LLVM from https://llvm.org/builds/
```

#### C (cppcheck)
```bash
# Ubuntu/Debian  
sudo apt-get install cppcheck

# CentOS/RHEL
sudo yum install cppcheck

# macOS
brew install cppcheck

# Windows
# Download from http://cppcheck.sourceforge.net/
```

## Usage

### Command Line Interface

#### Basic Usage
```bash
# Lint a Python file
python main.py -l python -f examples/sample.py

# Lint Java code directly
python main.py -l java -c "public class Test { int x=1; }"

# Lint C++ code with JSON output
python main.py -l cpp -f examples/sample.cpp --json

# Lint C code with verbose output
python main.py -l c -f examples/sample.c -v
```

#### Create Sample Files
```bash
python main.py --create-samples
```

### Programmatic Usage

#### Quick helper function

```python
from src.analyzer import analyze_code

python_code = """
def hello():
  print("Hello World")
"""

result = analyze_code(python_code, "python")
print(result["staticStyleAnalysisResults"])
```

#### Using the service class directly

```python
from src.linter_service import CodeLinterService

linter = CodeLinterService()

code = """
def greet():
  print("Hi")
"""

result = linter.lint_code(code, "python")
print(result["staticStyleAnalysisResults"])
```

### Expected Output Format

The service returns a JSON object with the following structure:

```json
{
  "language": "python",
  "filename": "temp_code.py",
  "linter_used": "flake8",
  "staticStyleAnalysisResults": "temp_code.py:2:1: E302 expected 2 blank lines, found 1"
}
```

For errors:
```json
{
  "error": "Unsupported language: javascript. Supported: ['python', 'java', 'cpp', 'c']",
  "staticStyleAnalysisResults": null
}
```

## Configuration

### Custom Configuration Files

Each linter can use custom configuration files:

- **Python (flake8)**: `config/flake8.cfg` 
- **Java (Checkstyle)**: `config/checkstyle_google.xml`
- **C++ (clang-tidy)**: `config/clang-tidy.yml`
- **C (cppcheck)**: `config/cppcheck.xml`

### Programmatic Configuration

```python
from src.linters import PythonLinter

# Configure Python linter
python_linter = PythonLinter()
python_linter.set_config_file("/path/to/custom/flake8.cfg")

# Configure Java linter
from src.linters import JavaLinter
java_linter = JavaLinter()
java_linter.set_checkstyle_jar("/path/to/checkstyle.jar")
java_linter.set_config_file("/path/to/custom/checkstyle.xml")
```

## Project Structure

```
code-linter-service/
├── src/
│   ├── __init__.py
│   ├── analyzer.py              # Convenience function: analyze_code
│   ├── linter_service.py          # Main service class
│   └── linters/
│       ├── __init__.py
│       ├── base_linter.py         # Abstract base class
│       ├── python_linter.py       # flake8 integration
│       ├── java_linter.py         # Checkstyle integration
│       ├── cpp_linter.py          # clang-tidy integration
│       └── c_linter.py            # cppcheck integration
├── tools/                         # Auxiliary executables (e.g., clang-tidy wrapper)
├── config/
│   ├── flake8.cfg                 # Python linter config
│   ├── checkstyle_google.xml      # Java linter config
│   ├── clang-tidy.yml             # C++ linter config
│   └── cppcheck.xml               # C linter config
├── examples/
│   ├── sample.py                  # Sample Python code
│   ├── Sample.java                # Sample Java code
│   ├── sample.cpp                 # Sample C++ code
│   └── sample.c                   # Sample C code
├── main.py                        # Command-line interface
├── requirements.txt               # Python dependencies
└── README.md                      # This file
```

## Supported Languages and Linters

| Language | Linter | Style Guide | Installation |
|----------|--------|-------------|--------------|
| Python | flake8 | PEP 8 | `pip install flake8` |
| Java | Checkstyle | Google Java Style | Download JAR or package manager |
| C++ | clang-tidy | Google/LLVM | Install LLVM/Clang tools |
| C | cppcheck | Static analysis | Package manager |

## Troubleshooting

### Common Issues

1. **"Linter command not found"**: Ensure the linter tool is installed and in PATH
2. **"Java not found"**: Install Java JDK/JRE for Checkstyle
3. **Permission errors**: Ensure write permissions for temporary files
4. **Timeout errors**: Large files may timeout (30s limit)

### Checking Installation

```bash
# Check if linters are available
flake8 --version
java -version
checkstyle -version  # or java -jar checkstyle.jar -version
clang-tidy --version
cppcheck --version
```

## API Reference

### CodeLinterService

#### Methods

- `lint_code(code: str, language: str, filename: Optional[str] = None) -> Dict[str, Any]`
  - Lint code using appropriate linter
  - Returns: Dictionary with `staticStyleAnalysisResults` key

- `get_supported_languages() -> List[str]`
  - Returns: List of supported language strings

- `is_language_supported(language: str) -> bool`
  - Check if language is supported

### Helper Functions

- `analyze_code(code: str, language: str, filename: Optional[str] = None) -> Dict[str, Any]`
  - Quick wrapper that reuses a shared `CodeLinterService` instance to analyze code
  - Returns: Same payload as `lint_code`, including `staticStyleAnalysisResults`

## License

This project is provided as-is for educational and development purposes.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request