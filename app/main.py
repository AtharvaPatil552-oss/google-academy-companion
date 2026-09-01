from flask import Flask, request, jsonify, render_template
from functools import wraps
from app.config import PORT, FIREBASE_PROJECT_ID, FIREBASE_API_KEY
from app.services import gemini_service, firebase_service

app = Flask(__name__)

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401
        token = auth_header.split("Bearer ")[1].strip()
        user = firebase_service.verify_id_token(token)
        if not user:
            return jsonify({"error": "Invalid, expired, or forged Firebase ID token"}), 401
        request.user = user
        return f(*args, **kwargs)
    return decorated

@app.route("/")
def serve_dashboard():
    return render_template("index.html", firebase_api_key=FIREBASE_API_KEY)

@app.route("/api/health")
def health_check():
    return jsonify({"status": "healthy", "service": "Google Academy Companion", "auth": "Firebase Auth Enabled"})

@app.route("/api/auth/me")
@require_auth
def get_auth_profile():
    return jsonify({
        "authenticated": True,
        "uid": request.user["uid"],
        "email": request.user["email"],
        "message": f"Welcome, {request.user['email']}!"
    })

@app.route("/api/resources", methods=["GET"])
@require_auth
def list_resources():
    return jsonify([
        {"id": "res-1", "title": "Gemini API Quickstart", "category": "AI / GEMINI", "difficulty": "Beginner", "summary": "Foundational concepts for calling Gemini models.", "topics": ["Gemini 3.6 Flash", "API Keys", "Multi-turn Chat"], "status": "Completed"},
        {"id": "res-2", "title": "Firebase Auth Guide", "category": "FIREBASE", "difficulty": "Beginner", "summary": "Email/Password authentication setup.", "topics": ["Auth SDK", "ID Tokens", "Protected Routes"], "status": "In Progress"}
    ])

@app.route("/api/resources", methods=["POST"])
@require_auth
def add_resource():
    data = request.get_json()
    analysis = gemini_service.analyze_resource(data.get("content", ""), data.get("title", ""))
    return jsonify({"status": "created", "user_id": request.user["uid"], "title": data.get("title"), "analysis": analysis})

@app.route("/api/chat", methods=["POST"])
@require_auth
def chat_with_gemini():
    data = request.get_json()
    response = gemini_service.ask_companion(data.get("query", ""), data.get("resource_context", ""))
    return jsonify({"user_id": request.user["uid"], "response": response})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=True)
