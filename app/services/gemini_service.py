import urllib.request
import json
from app.config import GEMINI_API_KEY

GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={GEMINI_API_KEY}"

def query_gemini(prompt):
    if not GEMINI_API_KEY:
        return "Gemini API key is missing in .env"
    headers = {"Content-Type": "application/json"}
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    req = urllib.request.Request(GEMINI_URL, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as e:
        return f"Request failed: {str(e)}"

def analyze_resource(content, title="Resource"):
    prompt = f"Analyze this resource:\nTitle: {title}\nContent: {content}\nProvide: Summary, Key Topics, Prerequisites, Difficulty, Practical Application"
    return query_gemini(prompt)

def ask_companion(query, resource_context=""):
    prompt = f"You are the Google Academy Companion AI Tutor.\nContext: {resource_context or 'General Google Academy Curriculum'}\nStudent Query: {query}"
    return query_gemini(prompt)
