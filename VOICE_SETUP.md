# Sarvam Voice + Gemini AI Integration Setup

This setup integrates Sarvam voice capabilities with Google Gemini AI for intelligent voice conversations.

## Prerequisites

1. **Python 3.8+** installed
2. **Node.js 16+** installed  
3. **Google Gemini API Key**
4. **Sarvam API Key** (already configured: `sk_21ibglod_RsO0CQw48A7JvPKC9m2VWb6f`)

## Quick Start

### 1. Get Google Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create a new API key
3. Copy your API key

### 2. Set Environment Variable

**Windows (PowerShell):**
```powershell
$env:GEMINI_API_KEY="your_api_key_here"
```

**Windows (Command Prompt):**
```cmd
set GEMINI_API_KEY=your_api_key_here
```

**Linux/Mac:**
```bash
export GEMINI_API_KEY="your_api_key_here"
```

### 3. Test Gemini API

```bash
python test_gemini.py
```

### 4. Start Gemini Backend

**Option A: Use the batch file (Windows):**
```cmd
start_gemini_backend.bat
```

**Option B: Manual setup:**
```bash
# Create virtual environment
python -m venv gemini_env

# Activate it
# Windows:
gemini_env\Scripts\activate
# Linux/Mac:
source gemini_env/bin/activate

# Install requirements
pip install -r gemini_requirements.txt

# Start backend
python gemini_chat_backend.py
```

### 5. Start Frontend

```bash
cd frontend
npm start
```

### 6. Start Node.js Backend (for code execution)

```bash
npm run backend
```

## How It Works

1. **Voice Input**: Click 🎤 microphone button, speak your question
2. **Speech-to-Text**: Sarvam API converts speech to text (with browser fallback)
3. **AI Processing**: Gemini AI generates intelligent response
4. **Text-to-Speech**: Sarvam API converts response to speech (with browser fallback)
5. **Voice Output**: AI response is spoken back to you

## Features

- ✅ **Voice Conversation**: Complete hands-free coding assistance
- ✅ **Intelligent AI**: Google Gemini for advanced code understanding  
- ✅ **Fallback Support**: Browser speech APIs when Sarvam is unavailable
- ✅ **Multi-language**: Supports various programming languages
- ✅ **Real-time**: Fast response times with streaming
- ✅ **Error Handling**: Graceful degradation and error recovery

## Troubleshooting

### Common Issues

**1. "GEMINI_API_KEY not found"**
- Make sure you set the environment variable
- Restart your terminal after setting it

**2. "Import langchain_google_genai could not be resolved"**
- Make sure you installed requirements: `pip install -r gemini_requirements.txt`
- Activate your virtual environment

**3. "403 Forbidden from Sarvam API"**
- The system automatically falls back to browser speech APIs
- Check if Sarvam API key is valid

**4. "Connection refused on port 5000"**
- Make sure the Gemini backend is running
- Check if port 5000 is available

### Testing Components

**Test Gemini API:**
```bash
python test_gemini.py
```

**Test Sarvam API:**
- Open browser console
- Click microphone button
- Check for API errors

**Test Browser Fallback:**
- Works automatically if Sarvam fails
- Requires HTTPS or localhost

## API Endpoints

- **Gemini Backend**: `http://localhost:5000/chat`
- **Node.js Backend**: `http://localhost:3000/`
- **Frontend**: `http://localhost:3001/`

## Architecture

```
Frontend (React) ←→ Gemini Backend (Flask) ←→ Google Gemini AI
     ↓                                              ↑
Sarvam Voice APIs ←→ Browser Speech APIs (fallback)
```

Enjoy your AI-powered voice coding assistant! 🎉