import requests
import json
from app.config import GEMINI_API_KEY

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY is not set in .env")

# Using the fast & free Gemini 2.0 Flash endpoint
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={GEMINI_API_KEY}"

def generate_text(prompt: str) -> str:
    """Core helper function to query Gemini API."""
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ]
    }
    
    response = requests.post(GEMINI_URL, headers=headers, json=payload)
    
    if response.status_code != 200:
        return f"Error from Gemini API ({response.status_code}): {response.text}"
    
    data = response.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        return "No response generated."

def analyze_resource(content: str, title: str = "Resource") -> str:
    """Extracts summary, key topics, prerequisites, and relevance for a learning material."""
    prompt = f"""
You are the Google Academy Companion AI. Analyze the following learning resource.

Resource Title: {title}
Resource Content:
{content}

Provide a structured response containing:
1. Summary (2-3 sentences)
2. Key Topics (bullet points)
3. Prerequisites (what to learn first)
4. Difficulty Level (Beginner / Intermediate / Advanced)
5. Practical Application (how this helps build cloud/AI projects)
"""
    return generate_text(prompt)

def ask_companion(query: str, resource_context: str = "") -> str:
    """Answers user queries with contextual knowledge from their resource collection."""
    prompt = f"""
You are the Google Academy Companion AI tutor. Help the student understand concepts, debug code, and navigate their learning path.

Context from student's saved resources:
{resource_context if resource_context else "No specific resource context provided."}

Student Question:
{query}
"""
    return generate_text(prompt)
