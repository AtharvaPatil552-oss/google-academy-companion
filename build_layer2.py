import os, json, subprocess

# =======================================================
# 1. app/services/resource_validator.py (Agent 3.14)
# =======================================================
validator_py = '''import re
from typing import Tuple, List, Dict, Any

ALLOWED_CATEGORIES = [
    "AI / GEMINI",
    "FIREBASE",
    "GOOGLE CLOUD",
    "PROJECT / IDEATHON",
    "GENERAL"
]

ALLOWED_TYPES = ["TEXT", "URL", "DOCUMENT", "NOTE"]

URL_REGEX = re.compile(
    r'^(https?:\/\/)?'  # http:// or https://
    r'([a-zA-Z0-9.-]+(\.[a-zA-Z]{2,})+)'  # domain
    r'(:\d+)?(\/.*)?$',  # port & path
    re.IGNORECASE
)

MAX_TITLE_LENGTH = 120
MIN_TITLE_LENGTH = 3
MAX_CONTENT_LENGTH = 50000  # 50 KB max per note to prevent DOS
MIN_CONTENT_LENGTH = 5

def sanitize_string(val: str) -> str:
    """Strips leading/trailing whitespace and dangerous null bytes."""
    if not val:
        return ""
    return val.strip().replace("\x00", "")

def validate_resource_input(data: Dict[str, Any]) -> Tuple[bool, List[str], Dict[str, Any]]:
    """
    Validates and sanitizes incoming resource payload.
    Returns: (is_valid, error_list, sanitized_data)
    """
    errors = []
    if not isinstance(data, dict):
        return False, ["Payload must be a JSON object"], {}

    title = sanitize_string(data.get("title", ""))
    content = sanitize_string(data.get("content", ""))
    category = sanitize_string(data.get("category", "GENERAL")).upper()
    resource_type = sanitize_string(data.get("resource_type", "TEXT")).upper()
    url = sanitize_string(data.get("url", ""))

    # 1. Title Validation
    if not title:
        errors.append("Title is required.")
    elif len(title) < MIN_TITLE_LENGTH:
        errors.append(f"Title must be at least {MIN_TITLE_LENGTH} characters.")
    elif len(title) > MAX_TITLE_LENGTH:
        errors.append(f"Title cannot exceed {MAX_TITLE_LENGTH} characters.")

    # 2. Content Validation
    if not content and not url:
        errors.append("Either content body or a valid URL must be provided.")
    if content:
        if len(content) < MIN_CONTENT_LENGTH and not url:
            errors.append(f"Content must be at least {MIN_CONTENT_LENGTH} characters.")
        elif len(content) > MAX_CONTENT_LENGTH:
            errors.append(f"Content exceeds maximum size of {MAX_CONTENT_LENGTH} characters.")

    # 3. Category Whitelist
    if category not in ALLOWED_CATEGORIES:
        # Default to GENERAL if close or invalid
        category = "GENERAL"

    # 4. Resource Type Whitelist
    if resource_type not in ALLOWED_TYPES:
        resource_type = "TEXT"

    # 5. URL Validation if provided
    if url:
        if not (url.startswith("http://") or url.startswith("https://")):
            url = "https://" + url
        if not URL_REGEX.match(url):
            errors.append("Invalid URL format. Must be a valid web address.")

    sanitized = {
        "title": title,
        "content": content,
        "category": category,
        "resource_type": resource_type,
        "url": url,
        "tags": [t.strip().lower() for t in data.get("tags", []) if isinstance(t, str) and t.strip()][:10]
    }

    return len(errors) == 0, errors, sanitized
'''

# =======================================================
# 2. app/services/resource_service.py (Agent 3.10)
# =======================================================
resource_service_py = '''import time
import uuid
from typing import Dict, List, Optional

# In-memory user-isolated resource store (prepares for Firestore in Layer 3)
_USER_RESOURCES_STORE: Dict[str, List[Dict]] = {}

def get_user_resources(uid: str) -> List[Dict]:
    """Returns all resources strictly isolated to the authenticated user UID."""
    return _USER_RESOURCES_STORE.get(uid, [])

def create_user_resource(uid: str, sanitized_data: Dict) -> Dict:
    """Creates and stores a validated learning resource for the authenticated user."""
    resource_id = f"res_{uuid.uuid4().hex[:10]}"
    timestamp = int(time.time())
    
    resource_doc = {
        "id": resource_id,
        "user_id": uid,
        "title": sanitized_data["title"],
        "content": sanitized_data["content"],
        "category": sanitized_data["category"],
        "resource_type": sanitized_data["resource_type"],
        "url": sanitized_data["url"],
        "tags": sanitized_data["tags"],
        "difficulty": "Unrated",
        "status": "Ready",
        "created_at": timestamp,
        "summary": sanitized_data["content"][:140] + ("..." if len(sanitized_data["content"]) > 140 else "")
    }

    if uid not in _USER_RESOURCES_STORE:
        _USER_RESOURCES_STORE[uid] = []
    
    _USER_RESOURCES_STORE[uid].insert(0, resource_doc)
    return resource_doc

def reset_store_for_testing():
    """Helper to clear test state."""
    global _USER_RESOURCES_STORE
    _USER_RESOURCES_STORE = {}
'''

# =======================================================
# 3. app/main.py (Agent 3.13 & 3.4 — Updated Routes)
# =======================================================
main_py = '''from flask import Flask, request, jsonify, render_template
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
'''

# =======================================================
# 4. tests/test_layer2_input.py (Room 4 & 5 Test Suite)
# =======================================================
test_layer2_py = '''import unittest
import json
from unittest.mock import patch
from app.main import app
from app.services.resource_service import reset_store_for_testing

class TestLayer2ResourceInput(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        reset_store_for_testing()
        self.auth_headers = {"Authorization": "Bearer valid-mock-token"}

    @patch("app.services.firebase_service.verify_id_token", return_value={"uid": "user_abc123", "email": "dev@academy.org"})
    def test_create_valid_text_resource(self, mock_auth):
        payload = {
            "title": "Cloud Run Overview & Best Practices",
            "category": "GOOGLE CLOUD",
            "resource_type": "TEXT",
            "content": "Cloud Run is a managed compute platform to run containers directly on Google Cloud.",
            "tags": ["cloudrun", "containers", "serverless"]
        }
        resp = self.client.post("/api/resources", json=payload, headers=self.auth_headers)
        self.assertEqual(resp.status_code, 201)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "created")
        self.assertEqual(data["resource"]["title"], "Cloud Run Overview & Best Practices")
        self.assertEqual(data["resource"]["user_id"], "user_abc123")

    @patch("app.services.firebase_service.verify_id_token", return_value={"uid": "user_abc123", "email": "dev@academy.org"})
    def test_create_valid_url_resource(self, mock_auth):
        payload = {
            "title": "Gemini API Python Quickstart",
            "category": "AI / GEMINI",
            "resource_type": "URL",
            "url": "ai.google.dev/gemini-api/docs",
            "content": "Official documentation link for Gemini API."
        }
        resp = self.client.post("/api/resources", json=payload, headers=self.auth_headers)
        self.assertEqual(resp.status_code, 201)
        data = json.loads(resp.data)
        self.assertTrue(data["resource"]["url"].startswith("https://"))

    @patch("app.services.firebase_service.verify_id_token", return_value={"uid": "user_abc123", "email": "dev@academy.org"})
    def test_validation_rejects_missing_title(self, mock_auth):
        payload = {"content": "Content without title"}
        resp = self.client.post("/api/resources", json=payload, headers=self.auth_headers)
        self.assertEqual(resp.status_code, 400)
        data = json.loads(resp.data)
        self.assertIn("Title is required.", data["details"])

    @patch("app.services.firebase_service.verify_id_token", return_value={"uid": "user_abc123", "email": "dev@academy.org"})
    def test_validation_rejects_short_title(self, mock_auth):
        payload = {"title": "ab", "content": "Valid content length"}
        resp = self.client.post("/api/resources", json=payload, headers=self.auth_headers)
        self.assertEqual(resp.status_code, 400)
        data = json.loads(resp.data)
        self.assertTrue(any("at least 3 characters" in err for err in data["details"]))

    @patch("app.services.firebase_service.verify_id_token", return_value={"uid": "user_abc123", "email": "dev@academy.org"})
    def test_validation_rejects_invalid_url(self, mock_auth):
        payload = {"title": "Bad Link", "url": "not-a-real-url"}
        resp = self.client.post("/api/resources", json=payload, headers=self.auth_headers)
        self.assertEqual(resp.status_code, 400)

    @patch("app.services.firebase_service.verify_id_token", return_value={"uid": "user_abc123", "email": "dev@academy.org"})
    def test_validation_rejects_oversized_content(self, mock_auth):
        payload = {"title": "Huge Document", "content": "A" * 60000}
        resp = self.client.post("/api/resources", json=payload, headers=self.auth_headers)
        self.assertEqual(resp.status_code, 400)
        data = json.loads(resp.data)
        self.assertTrue(any("exceeds maximum size" in err for err in data["details"]))

    def test_resource_endpoints_require_auth(self):
        resp = self.client.get("/api/resources")
        self.assertEqual(resp.status_code, 401)
        resp = self.client.post("/api/resources", json={"title": "Test"})
        self.assertEqual(resp.status_code, 401)

if __name__ == "__main__":
    unittest.main()
'''

# =======================================================
# Write all files
# =======================================================
files = {
    "app/services/resource_validator.py": validator_py,
    "app/services/resource_service.py": resource_service_py,
    "app/main.py": main_py,
    "tests/test_layer2_input.py": test_layer2_py
}

print("\n🚀 [Room 3 — Development] Writing Layer 2 Implementation...")
for path, content in files.items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    print(f"  ✍️ [Created]: {path}")

print("\n🧪 [Room 4 & 5] Running Full Test Suites (Layer 1 + Layer 2)...")
result = subprocess.run(["python", "-m", "unittest", "discover", "-s", "tests", "-v"])

print("\n🌿 [Room 6 — Integration] Committing Layer 2 to Git...")
subprocess.run(["git", "add", "."], capture_output=True)
subprocess.run(["git", "commit", "-m", "feat(layer2): implement multi-type resource ingestion, validation engine, and test suite 📥✅"], capture_output=True)
print("  ✅ Committed Layer 2 to Git!")
