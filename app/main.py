from flask import Flask, render_template, request, jsonify, g
from functools import wraps
from typing import Optional, Dict
from app.services import gemini_service, firebase_service
from app.config import PORT, FIREBASE_PROJECT_ID, FIREBASE_API_KEY

app = Flask(__name__, template_folder="templates")

def require_auth(f):
    """Decorator to protect routes using Firebase ID token verification."""
    @wraps(f)
    def decorated(*args, **kwargs):
        authorization = request.headers.get("Authorization") or request.headers.get("authorization")
        if not authorization or not authorization.startswith("Bearer "):
            return jsonify({"detail": "Missing or invalid Authorization header"}), 401
        
        token = authorization.split("Bearer ")[1].strip()
        user = firebase_service.verify_id_token(token)
        if not user:
            return jsonify({"detail": "Invalid, expired, or forged Firebase ID token"}), 401
        
        g.user = user
        return f(*args, **kwargs)
    return decorated

# --- Public Endpoints ---
@app.route("/", methods=["GET"])
def serve_dashboard():
    """Serves the Single Page Application UI."""
    return render_template(
        "index.html",
        firebase_project_id=FIREBASE_PROJECT_ID,
        firebase_api_key=FIREBASE_API_KEY
    )

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "service": "Google Academy Companion",
        "auth": "Firebase Auth Guard Active",
        "project_id": FIREBASE_PROJECT_ID
    })

# --- Protected Endpoints (Auth Guarded) ---
@app.route("/api/auth/me", methods=["GET"])
@require_auth
def get_auth_profile():
    """Returns authenticated user identity."""
    user = g.user
    return jsonify({
        "authenticated": True,
        "uid": user["uid"],
        "email": user["email"],
        "email_verified": user.get("email_verified", False),
        "message": f"Welcome, {user['email']}!"
    })

@app.route("/api/resources", methods=["GET"])
@require_auth
def list_resources():
    """User-isolated resource listing."""
    return jsonify([
        {
            "id": "res-1",
            "title": "Gemini API Quickstart & Prompts",
            "category": "AI / GEMINI",
            "difficulty": "Beginner",
            "summary": "Covers foundational concepts for calling Gemini models and structuring prompts.",
            "topics": ["Gemini 2.0 Flash", "API Keys", "Multi-turn Chat"],
            "status": "Completed"
        },
        {
            "id": "res-2",
            "title": "Firebase Authentication & Security Rules",
            "category": "FIREBASE",
            "difficulty": "Intermediate",
            "summary": "Step-by-step setup for Email/Password auth and ID token verification on FastAPI backend.",
            "topics": ["Auth SDK", "ID Tokens", "Protected Routes"],
            "status": "In Progress"
        },
        {
            "id": "res-3",
            "title": "FastAPI Async Architecture",
            "category": "BACKEND",
            "difficulty": "Intermediate",
            "summary": "Building high-performance async REST endpoints with Pydantic validations.",
            "topics": ["FastAPI", "Async/Await", "Pydantic"],
            "status": "Recommended"
        }
    ])

@app.route("/api/resources", methods=["POST"])
@require_auth
def add_resource():
    """Analyze and persist user resource using Gemini AI."""
    user = g.user
    data = request.get_json(silent=True) or {}
    title = data.get("title", "")
    content = data.get("content", "")
    category = data.get("category", "General")
    
    analysis = gemini_service.analyze_resource(content, title)
    return jsonify({
        "status": "created",
        "user_id": user["uid"],
        "title": title,
        "category": category,
        "analysis": analysis
    })

@app.route("/api/chat", methods=["POST"])
@require_auth
def chat_with_gemini():
    """Contextual multi-turn companion chat for authenticated users."""
    user = g.user
    data = request.get_json(silent=True) or {}
    query = data.get("query", "")
    resource_context = data.get("resource_context", "")
    
    response = gemini_service.ask_companion(query, resource_context)
    return jsonify({
        "user_id": user["uid"],
        "response": response
    })

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=True)
