# Code Execution Platform
A secure code execution platform with Docker sandboxing, built with React frontend and Node.js backend.
## Features
- **Monaco Editor**: Rich code editing experience with syntax highlighting
- **Multi-language Support**: Python, JavaScript, Java, C, C++
- **Docker Sandboxing**: Secure code execution with resource limits
- **Real-time Output**: See your code results instantly
- **Responsive Design**: Works on desktop and mobile
## Architecture
![Architecture Diagram](Agent%20Architecture.png)
### Frontend (React + TypeScript)
- Monaco Editor for code editing
- Language selection dropdown
- Real-time code execution
- Output display with syntax highlighting
### Backend (Node.js + Express)
- RESTful API with `/run` endpoint
- Docker container execution
- Resource limits (CPU, memory, network)
- Timeout handling
### Security Features
- Docker container isolation
- Network isolation (`--network=none`)
- Resource limits (`--cpus=0.5 --memory=256m`)
- Execution timeouts
- Temporary file cleanup
## Prerequisites
- Node.js (v16 or higher)
- Docker
- npm or yarn
## Setup Instructions
### 1. Install Dependencies
```bash
# Install root dependencies
npm install
# Install frontend dependencies
cd frontend && npm install && cd ..
```
### 2. Build Docker Images
```bash
# Build all required Docker images
./build-images.sh
```
### 3. Start Backend Server
```bash
node backend/server.js
```
### 4. Start Frontend Development Server
```bash
cd frontend
npm start
```
## Project Structure
```
Innov8/
├── frontend/                # React frontend
│   ├── src/
│   │   ├── App.tsx         # Main application component
│   │   ├── CodeEditor.tsx  # Monaco editor wrapper
│   │   └── api.ts          # Backend API client
│   └── package.json
├── backend/                 # Node.js backend
│   ├── server.js           # Express server
│   └── executors/          # Language-specific executors
├── docker/                  # Docker configurations
│   ├── python/
│   ├── javascript/
│   ├── java/
│   ├── c/
│   └── cpp/
└── build-images.sh         # Script to build all images
```
## Usage
1. Open your browser and navigate to `http://localhost:3000`
2. Select a programming language from the dropdown
3. Write your code in the editor
4. Click "Run" to execute
5. View the output in the results panel
## API Reference
### POST /run
Execute code in a sandboxed environment.
**Request Body:**
```json
{
  "code": "print('Hello, World!')",
  "language": "python"
}
```
**Response:**
```json
{
  "success": true,
  "output": "Hello, World!\n",
  "executionTime": 234
}
```
## Supported Languages
- Python 3.9
- JavaScript (Node.js)
- Java 11
- C (GCC)
- C++ (G++)
## Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License
This project is open source and available under the MIT License.
