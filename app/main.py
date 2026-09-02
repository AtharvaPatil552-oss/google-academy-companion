"""
Google Academy Companion — Main Application Router
Handles REST Endpoints for Layers 1 through 10
"""
from functools import wraps
from flask import Flask, request, jsonify, render_template
from app.config import Config
from app.services.firebase_service import verify_firebase_token

app = Flask(__name__)
app.config.from_object(Config)

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401
        token = auth_header[7:].strip()
        user = verify_firebase_token(token)
        if not user:
            return jsonify({"error": "Invalid or expired token"}), 401
        request.uid = user.get("sub") or user.get("user_id") or "test-user-123"
        request.token = token
        return f(*args, **kwargs)
    return decorated

# ── Public Routes ─────────────────────────────────────────

@app.route("/")
def index():
    return render_template(
        "index.html",
        firebase_api_key=Config.FIREBASE_API_KEY,
        firebase_project_id=Config.FIREBASE_PROJECT_ID
    )

@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "system": "Google Academy Companion", "version": "1.0.0"})

# ── Auth Check ───────────────────────────────────────────

@app.route("/api/auth/me")
@require_auth
def auth_me():
    return jsonify({"uid": request.uid, "authenticated": True})

# ── Resources API ────────────────────────────────────────

@app.route("/api/resources", methods=["GET"])
@require_auth
def list_resources():
    from app.services.resource_service import get_resources
    docs, err = get_resources(request.uid, request.token)
    if err:
        return jsonify({"error": "Failed to retrieve resources"}), 500
    return jsonify({"resources": docs})

@app.route("/api/resources", methods=["POST"])
@require_auth
def create_resource_route():
    from app.services.resource_service import create_resource
    payload = request.get_json(silent=True) or {}
    doc, err = create_resource(request.uid, request.token, payload)
    if err:
        status_code = 400 if "validation" in str(err) else 500
        return jsonify(err), status_code
    return jsonify({"resource": doc}), 201

@app.route("/api/resources/<resource_id>", methods=["GET"])
@require_auth
def get_single_resource(resource_id):
    from app.services.resource_service import get_resource
    doc, err = get_resource(request.uid, request.token, resource_id)
    if err or not doc:
        return jsonify({"error": "Resource not found"}), 404
    return jsonify({"resource": doc})

@app.route("/api/resources/<resource_id>", methods=["DELETE"])
@require_auth
def delete_single_resource(resource_id):
    from app.services.resource_service import delete_resource
    ok, err = delete_resource(request.uid, request.token, resource_id)
    if not ok:
        return jsonify({"error": "Failed to delete"}), 404
    return jsonify({"deleted": True})

@app.route("/api/resources/<resource_id>/analyze", methods=["POST"])
@require_auth
def analyze_single_resource(resource_id):
    from app.services.intelligence_service import process_resource_intelligence
    res, err = process_resource_intelligence(request.uid, request.token, resource_id)
    if err:
        return jsonify({"error": "Analysis failed"}), 500
    return jsonify({"intelligence": res})

@app.route("/api/resources/<resource_id>/intelligence", methods=["GET"])
@require_auth
def get_resource_intel(resource_id):
    from app.services.intelligence_service import get_resource_intelligence
    res, err = get_resource_intelligence(request.uid, request.token, resource_id)
    if err:
        return jsonify({"error": "Not found"}), 404
    return jsonify({"intelligence": res})

# ── Multi-turn Conversations & Chat ──────────────────────

@app.route("/api/chat", methods=["POST"])
@require_auth
def quick_chat():
    from app.services.gemini_service import chat_with_context
    from app.services.resource_service import get_resources
    payload = request.get_json(silent=True) or {}
    question = payload.get("question", "").strip()
    if not question:
        return jsonify({"error": "Question is required"}), 400
    resources, _ = get_resources(request.uid, request.token)
    reply = chat_with_context(question, resources)
    return jsonify({"answer": reply})

@app.route("/api/conversations", methods=["GET"])
@require_auth
def list_convs():
    from app.services.conversation_service import get_conversations
    docs, err = get_conversations(request.uid, request.token)
    if err:
        return jsonify({"conversations": []})
    return jsonify({"conversations": docs})

@app.route("/api/conversations", methods=["POST"])
@require_auth
def create_conv():
    from app.services.conversation_service import create_conversation
    payload = request.get_json(silent=True) or {}
    doc, err = create_conversation(request.uid, request.token, payload.get("title", "New Chat"))
    if err:
        return jsonify({"error": "Failed to create chat"}), 500
    return jsonify({"conversation": doc}), 201

@app.route("/api/conversations/<conv_id>/messages", methods=["POST"])
@require_auth
def send_conv_message(conv_id):
    from app.services.conversation_service import send_message
    payload = request.get_json(silent=True) or {}
    text = payload.get("text", "").strip()
    if not text:
        return jsonify({"error": "Message text is required"}), 400
    result, err = send_message(request.uid, request.token, conv_id, text)
    if err:
        return jsonify({"error": "Failed to process message"}), 500
    return jsonify(result)

# ── Learning Path & Recommendations ──────────────────────

@app.route("/api/learning/path", methods=["GET"])
@require_auth
def get_path():
    from app.services.learning_service import get_learning_path
    doc, err = get_learning_path(request.uid, request.token)
    if err:
        return jsonify({"steps": []})
    return jsonify(doc or {"steps": []})

@app.route("/api/learning/path/generate", methods=["POST"])
@require_auth
def generate_path_route():
    from app.services.learning_service import generate_path
    payload = request.get_json(silent=True) or {}
    doc, err = generate_path(request.uid, request.token, payload.get("goal", "Complete Challenge"))
    if err:
        return jsonify({"error": "Generation failed"}), 500
    return jsonify({"path": doc})

@app.route("/api/learning/recommendations", methods=["GET"])
@require_auth
def get_recs():
    from app.services.learning_service import get_recommendations_for_user
    task = request.args.get("task", "")
    recs = get_recommendations_for_user(request.uid, request.token, task)
    return jsonify({"recommendations": recs})

# ── Progress & Project Checklist ─────────────────────────

@app.route("/api/progress", methods=["GET"])
@require_auth
def get_user_progress():
    from app.services.progress_service import get_progress
    doc, err = get_progress(request.uid, request.token)
    if err:
        return jsonify({"error": "Failed to load progress"}), 500
    return jsonify(doc)

@app.route("/api/progress/project/task", methods=["POST"])
@require_auth
def toggle_task_route():
    from app.services.progress_service import toggle_project_task
    payload = request.get_json(silent=True) or {}
    task_id = payload.get("taskId")
    if not task_id:
        return jsonify({"error": "taskId required"}), 400
    doc, err = toggle_project_task(request.uid, request.token, task_id)
    if err:
        return jsonify({"error": "Failed to toggle task"}), 500
    return jsonify({"progress": doc})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
