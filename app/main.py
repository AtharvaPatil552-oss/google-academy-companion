from flask import Flask, request, jsonify, render_template
from functools import wraps
from app.config import PORT, FIREBASE_PROJECT_ID, FIREBASE_API_KEY
from app.services import gemini_service, firebase_service, resource_service
from app.services.resource_validator import validate_resource_input

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
    return jsonify({"status": "healthy", "service": "Google Academy Companion", "auth": "Firebase Auth Enabled", "layer": "Layer 2 - Input System Active"})

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
    user_uid = request.user["uid"]
    resources = resource_service.get_user_resources(user_uid)
    return jsonify(resources), 200

@app.route("/api/resources", methods=["POST"])
@require_auth
def add_resource():
    data = request.get_json() or {}
    is_valid, errors, sanitized = validate_resource_input(data)
    
    if not is_valid:
        return jsonify({
            "error": "Validation failed",
            "details": errors
        }), 400
    
    user_uid = request.user["uid"]
    created_resource = resource_service.create_user_resource(user_uid, sanitized)
    
    return jsonify({
        "status": "created",
        "resource": created_resource
    }), 201

@app.route("/api/chat", methods=["POST"])
@require_auth
def chat_with_gemini():
    data = request.get_json() or {}
    query = data.get("query", "").strip()
    if not query:
        return jsonify({"error": "Query cannot be empty"}), 400
        
    response = gemini_service.ask_companion(query, data.get("resource_context", ""))
    return jsonify({"user_id": request.user["uid"], "response": response}), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=True)
