# Code Execution Platform
A secure code execution platform with Docker sandboxing, built with React frontend and Node.js backend.
## Features
- **Monaco Editor**: Rich code editing experience with syntax highlighting
- **Multi-language Support**: Python, JavaScript, Java, C, C++
- **Docker Sandboxing**: Secure code execution with resource limits
- **Real-time Output**: See your code results instantly
- **Responsive Design**: Works on desktop and mobile
## Architecture

![Architecture Diagram](architecture.png)

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
This will create the following images:
- `python:3.9-custom`
- `node:18-custom`
- `openjdk:11-custom`
