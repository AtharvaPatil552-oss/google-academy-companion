"""
Layer 4 — Gemini AI Service (REST urllib implementation)
Agent 3.7 (Gemini Integration Engineer)
"""
import json
import urllib.request
import urllib.error
from app.config import Config

def _gemini_call(contents, temperature=0.7, max_tokens=2048):
    if not Config.GEMINI_API_KEY:
        return "Gemini API key is not configured in .env"

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{Config.GEMINI_MODEL}:generateContent?key={Config.GEMINI_API_KEY}"
    )
    body = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens
        }
    }
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            candidates = result.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                return parts[0].get("text", "") if parts else ""
            return "No response generated."
    except Exception as e:
        return f"[AI Response unavailable: {str(e)}]"

def chat_with_context(question, resources=None, conversation_history=None):
    system_context = (
        "You are the Google Academy Companion AI. You help learners master Google Cloud, "
        "Gemini, and Firebase. Provide structured, accurate, and direct guidance."
    )
    if resources:
        res_summary = "\n".join(
            f"- [{r.get('category','General')}] {r.get('title','Untitled')}: {r.get('content','')[:180]}"
            for r in resources[:8]
        )
        system_context += f"\n\nUser Study Context:\n{res_summary}"

    contents = [
        {"role": "user", "parts": [{"text": system_context}]},
        {"role": "model", "parts": [{"text": "Understood. I am your Academy Companion."}]}
    ]

    if conversation_history:
        for msg in conversation_history[-10:]:
            role = "user" if msg.get("role") == "user" else "model"
            contents.append({"role": role, "parts": [{"text": msg.get("text", "")}]})

    contents.append({"role": "user", "parts": [{"text": question}]})
    return _gemini_call(contents)

def analyze_resource(resource):
    title = resource.get("title", "Untitled")
    content = resource.get("content", "")[:2500]
    prompt = (
        f"Analyze this study resource and return ONLY valid JSON with keys: "
        f"summary, keyTopics (list), prerequisites (list), difficulty (Beginner/Intermediate/Advanced), "
        f"relevance, nextStep.\n\nResource:\nTitle: {title}\nContent: {content}"
    )
    res = _gemini_call([{"role": "user", "parts": [{"text": prompt}]}], temperature=0.2)
    try:
        clean = res.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        return json.loads(clean)
    except Exception:
        return {
            "summary": res[:300],
            "keyTopics": ["Google Cloud", "AI"],
            "prerequisites": ["Basic Programming"],
            "difficulty": "Intermediate",
            "relevance": "Directly supports project implementation",
            "nextStep": "Review implementation guide"
        }

def generate_learning_path(resources, goal="Complete Challenge"):
    res_list = "\n".join(f"- {r.get('title')} ({r.get('category')})" for r in resources[:15])
    prompt = (
        f"Create a step-by-step learning sequence for goal: '{goal}'. "
        f"Return ONLY valid JSON array of objects with keys: step (int), title, resource, status ('upcoming'), reason.\n\n"
        f"Resources:\n{res_list}"
    )
    res = _gemini_call([{"role": "user", "parts": [{"text": prompt}]}], temperature=0.3)
    try:
        clean = res.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        return json.loads(clean)
    except Exception:
        return [
            {"step": 1, "title": "Understand the Architecture", "resource": "Overview", "status": "upcoming", "reason": "Foundation"},
            {"step": 2, "title": "Connect Gemini & Cloud Run", "resource": "API Docs", "status": "upcoming", "reason": "Implementation"}
        ]

def get_recommendations(resources, current_task=""):
    res_list = "\n".join(f"- {r.get('title')}" for r in resources[:10])
    prompt = (
        f"Current Task: {current_task}\n"
        f"Resources:\n{res_list}\n"
        f"Recommend top 3 next actions. Return ONLY valid JSON array with keys: title, reason, priority."
    )
    res = _gemini_call([{"role": "user", "parts": [{"text": prompt}]}], temperature=0.4)
    try:
        clean = res.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        return json.loads(clean)
    except Exception:
        return [{"title": "Explore Gemini Models", "reason": "Required for Core AI feature", "priority": "high"}]
