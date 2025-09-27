from langchain_google_genai import GoogleGenerativeAI
import os

api_key = os.getenv("GEMINI_API_KEY")

# Configure LLM with multiple parameters
llm = GoogleGenerativeAI(
    model="gemini-flash-latest", 
    google_api_key=api_key,
    temperature=0.7,  # Controls randomness (0.0 to 1.0)
    max_output_tokens=2048,  # Maximum tokens in response
    top_p=0.8,  # Nucleus sampling parameter
    top_k=40,  # Top-k sampling parameter
    candidate_count=1,  # Number of response candidates
    stop_sequences=None,  # Stop generation at these sequences
    safety_settings=None,  # Custom safety settings
    generation_config=None  # Additional generation config
)

# Test with different parameters
print("=== Default Parameters ===")
response = llm.invoke(
    "What are some of the pros and cons of Python as a programming language?"
)
print(response)

# Create a more creative version with higher temperature
print("\n=== Creative Response (High Temperature) ===")
creative_llm = GoogleGenerativeAI(
    model="gemini-flash-latest", 
    google_api_key=api_key,
    temperature=0.9,
    max_output_tokens=1024,
    top_p=0.95
)

creative_response = creative_llm.invoke(
    "Write a creative story about a Python developer discovering a magical programming language."
)
print(creative_response)

# Create a more focused version with lower temperature
print("\n=== Focused Response (Low Temperature) ===")
focused_llm = GoogleGenerativeAI(
    model="gemini-flash-latest", 
    google_api_key=api_key,
    temperature=0.1,
    max_output_tokens=512,
    top_p=0.5
)

focused_response = focused_llm.invoke(
    "Explain Python's memory management in technical terms."
)
print(focused_response)