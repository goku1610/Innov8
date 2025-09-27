"""
Test script to verify Gemini API key and functionality
Run this before starting the chat backend to ensure everything works
"""

import os
from langchain_google_genai import GoogleGenerativeAI

def test_gemini_api():
    print("Testing Gemini API integration...")
    
    # Check for API key
    api_key = os.getenv("GEMINI_API_KEY")
    
    if not api_key:
        print("❌ ERROR: GEMINI_API_KEY not found in environment variables")
        print("Please set your API key:")
        print("Windows: set GEMINI_API_KEY=your_key_here")
        print("Linux/Mac: export GEMINI_API_KEY=your_key_here")
        return False
    
    print(f"✅ API Key found: {api_key[:10]}...{api_key[-4:]}")
    
    try:
        # Initialize LLM
        llm = GoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=api_key,
            temperature=0.7,
            max_output_tokens=512
        )
        
        print("✅ LLM initialized successfully")
        
        # Test API call
        test_prompt = "Hello! Can you help me with a simple Python coding question?"
        print(f"🧪 Testing with prompt: '{test_prompt}'")
        
        response = llm.invoke(test_prompt)
        print(f"✅ API call successful!")
        print(f"📝 Response: {response[:100]}...")
        
        return True
        
    except Exception as e:
        print(f"❌ ERROR: {str(e)}")
        print("Common issues:")
        print("- Invalid API key")
        print("- Network connection problems")
        print("- Gemini API quota exceeded")
        return False

if __name__ == "__main__":
    success = test_gemini_api()
    
    if success:
        print("\n🎉 Gemini API test successful! You can now start the chat backend.")
    else:
        print("\n💥 Gemini API test failed. Please fix the issues above.")
    
    input("\nPress Enter to exit...")