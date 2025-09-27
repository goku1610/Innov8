from flask import Flask, request, jsonify
from flask_cors import CORS
from langchain_google_genai import GoogleGenerativeAI
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend requests

# Get API key from environment variable or set it directly for testing
api_key = os.getenv("GEMINI_API_KEY") or "AIzaSyCGUt2wYtG0XwWqeBwIunTOu4ErIQLLjJ0"

if not api_key:
    print("Warning: GEMINI_API_KEY not found in environment variables")
    print("Please set your Gemini API key: export GEMINI_API_KEY='your_key_here'")
else:
    print(f"✅ Using Gemini API key: {api_key[:10]}...{api_key[-4:]}")

# Configure LLM with optimized parameters for chat
llm = GoogleGenerativeAI(
    model="gemini-2.5-flash",  # Updated to latest model
    google_api_key=api_key,
    temperature=0.7,  # Balanced creativity and consistency
    max_output_tokens=1024,  # Reasonable response length
    top_p=0.8,
    top_k=40,
    candidate_count=1,
    stop_sequences=None,
    safety_settings=None,
    generation_config=None
)

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        
        if not data or 'message' not in data:
            return jsonify({'error': 'Message is required'}), 400
        
        user_message = data['message'].strip()
        
        if not user_message:
            return jsonify({'error': 'Message cannot be empty'}), 400
        
        # Create a context-aware prompt for coding assistance
        system_context = """You are an AI coding assistant that helps developers with programming questions and problems. 
        You specialize in:
        - Algorithm explanations and optimization
        - Code debugging and troubleshooting
        - Best practices and design patterns
        - Language-specific guidance
        - Problem-solving approaches like Two Sum, data structures, etc.
        
        Provide clear, concise, and helpful responses. If the user asks about coding problems, 
        explain the approach, time/space complexity, and provide example code when appropriate.
        
        Keep responses conversational but informative."""
        
        # Combine system context with user message
        full_prompt = f"{system_context}\n\nUser Question: {user_message}\n\nResponse:"
        
        # Generate response using Gemini
        response = llm.invoke(full_prompt)
        
        return jsonify({
            'response': response,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        print(f"Error in chat endpoint: {str(e)}")
        return jsonify({
            'error': 'Failed to process chat message',
            'details': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'Gemini AI Chat Backend'})

if __name__ == '__main__':
    print("Starting Gemini AI Chat Backend...")
    print(f"API Key configured: {'Yes' if api_key else 'No'}")
    app.run(host='0.0.0.0', port=5000, debug=True)