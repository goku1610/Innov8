# Code Execution Platform

A secure code execution platform with Docker sandboxing, built with React frontend and Node.js backend.

## Features

- **Monaco Editor**: Rich code editing experience with syntax highlighting
- **Multi-language Support**: Python, JavaScript, Java, C, C++
- **Docker Sandboxing**: Secure code execution with resource limits
- **Real-time Output**: See your code results instantly
- **Responsive Design**: Works on desktop and mobile

## Architecture

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
- `gcc:latest-custom`

### 3. Start the Backend Server

```bash
# Start the backend server
npm run backend
```

The backend will run on `http://localhost:3000`

### 4. Start the Frontend (in a new terminal)

```bash
# Start the React development server
npm run frontend
```

The frontend will run on `http://localhost:3001`

### 5. Alternative: Run Both Together

```bash
# Run both backend and frontend concurrently
npm run dev
```

## Usage

1. Open your browser and go to `http://localhost:3001`
2. Select a programming language from the dropdown
3. Write your code in the Monaco Editor
4. Click "Run Code" to execute
5. View the output in the right panel

## Supported Languages

| Language | File Extension | Docker Image |
|----------|---------------|--------------|
| Python   | .py           | python:3.9-custom |
| JavaScript | .js         | node:18-custom |
| Java     | .java         | openjdk:11-custom |
| C        | .c            | gcc:latest-custom |
| C++      | .cpp          | gcc:latest-custom |

## API Endpoints

### POST /run
Execute code in a sandboxed environment.

**Request Body:**
```json
{
  "language": "python",
  "code": "print('Hello, World!')"
}
```

**Response:**
```json
{
  "output": "Hello, World!\n",
  "error": ""
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Security Considerations

This platform implements several security measures:

1. **Container Isolation**: Each execution runs in a separate Docker container
2. **Resource Limits**: CPU and memory limits prevent resource exhaustion
3. **Network Isolation**: Containers have no network access
4. **Timeout Protection**: Code execution is limited by timeouts
5. **File Cleanup**: Temporary files are automatically removed

## Development

### Project Structure
```
├── backend/           # Node.js backend server
│   ├── server.js     # Main server file
│   └── package.json  # Backend dependencies
├── frontend/         # React frontend
│   ├── src/         # React source code
│   └── package.json # Frontend dependencies
├── docker/          # Docker images for each language
│   ├── python/     # Python Dockerfile
│   ├── node/       # Node.js Dockerfile
│   ├── java/       # Java Dockerfile
│   └── c/          # C/C++ Dockerfile
├── tmp/            # Temporary files (auto-created)
└── build-images.sh # Script to build Docker images
```

### Adding New Languages

1. Create a new Dockerfile in `docker/<language>/`
2. Add the language configuration to `backend/server.js`
3. Update the frontend language list in `frontend/src/App.tsx`
4. Rebuild Docker images with `./build-images.sh`

## Troubleshooting

### Common Issues

1. **Docker not running**: Make sure Docker is installed and running
2. **Port conflicts**: Change ports in the configuration if needed
3. **Permission errors**: Ensure Docker has proper permissions
4. **Image not found**: Run `./build-images.sh` to build required images

### Logs

- Backend logs: Check the terminal where you ran `npm run backend`
- Frontend logs: Check the browser console
- Docker logs: Use `docker logs <container_id>` for container-specific issues

## License

MIT License - feel free to use this project for learning and development.
