from groq import Groq

def generate_response(prompt, system_prompt=None):
    client = Groq()
    
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    
    completion = client.chat.completions.create(
        model="meta-llama/llama-4-scout-17b-16e-instruct",
        messages=messages,
        temperature=1,
        max_completion_tokens=1024,
        top_p=1,
        stream=False
    )
    return completion.choices[0].message.content

if __name__ == "__main__":
    print(generate_response("What is the name of this model?"))
