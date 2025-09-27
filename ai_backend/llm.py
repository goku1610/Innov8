from langchain_google_genai import GoogleGenerativeAI
import os
import json

def generate_response(prompt, system_prompt=None, temperature=0.7):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is required")
    
    # Combine system prompt and user prompt
    full_prompt = prompt
    if system_prompt:
        full_prompt = f"{system_prompt}\n\n{prompt}"
    
    llm = GoogleGenerativeAI(
        model="gemini-flash-latest", 
        google_api_key=api_key,
        temperature=temperature,
    )
    
    response = llm.invoke(full_prompt)
    response_text = response.content if hasattr(response, 'content') else str(response)
    
    # Parse JSON from LLM output
    try:
        json_match = response_text.split("```json")[1]
        if json_match:
            json_string = json_match.split("```")[0].strip()
            print("Extracted JSON from LLM output:", json_string)
            
            # Try to parse the JSON
            parsed_json = json.loads(json_string)
            print("Parsed JSON object:", parsed_json)
        else:
            print("No JSON block found in LLM output")
    except (IndexError, json.JSONDecodeError) as parse_error:
        print("Error parsing JSON from LLM output:", str(parse_error))
    
    return response_text

if __name__ == "__main__":
    print(generate_response("What is the name of this model?"))
