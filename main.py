from langchain_google_genai import GoogleGenerativeAI
import os

api_key = os.getenv("GEMINI_API_KEY")


def generate_response(prompt,temperature):
    llm = GoogleGenerativeAI(
        model="gemini-flash-latest", 
        google_api_key=api_key,
        temperature=temperature,  # Controls randomness (0.0 to 1.0)
    )

    response = llm.invoke(
        prompt
    )
    return response

if __name__ == "__main__":
    print(generate_response("What are some of the pros and cons of Python as a programming language?",0.7))