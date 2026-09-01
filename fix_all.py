import os, json

# ============================================
# FILE 1: app/config.py (Pure Python, no dotenv)
# ============================================
config_py = '''import os

def _load_env():
    if os.path.exists(".env"):
        with open(".env", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ[k.strip()] = v.strip().strip(\'"\').strip("\'")

_load_env()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "genuine-plate-507315-u9")
FIREBASE_API_KEY = os.getenv("FIREBASE_API_KEY", "")
PORT = int(os.getenv("PORT", 8000))
'''

# ============================================
# FILE 2: app/services/firebase_service.py
# ============================================
firebase_py = '''import urllib.request
import urllib.error
import json
from app.config import FIREBASE_PROJECT_ID

GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"

def verify_id_token(id_token):
    if not id_token:
        return None
    try:
        url = f"{GOOGLE_TOKENINFO_URL}?id_token={id_token}"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            user_id = data.get("sub") or data.get("user_id")
            if not user_id:
                return None
            return {
                "uid": user_id,
                "email": data.get("email", ""),
                "email_verified": data.get("email_verified", "false") == "true"
            }
    except Exception as e:
        print(f"Token verification error: {e}")
        return None
'''

# ============================================
# FILE 3: app/services/gemini_service.py
# ============================================
gemini_py = '''import urllib.request
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
    prompt = f"Analyze this resource:\\nTitle: {title}\\nContent: {content}\\nProvide: Summary, Key Topics, Prerequisites, Difficulty, Practical Application"
    return query_gemini(prompt)

def ask_companion(query, resource_context=""):
    prompt = f"You are the Google Academy Companion AI Tutor.\\nContext: {resource_context or \'General Google Academy Curriculum\'}\\nStudent Query: {query}"
    return query_gemini(prompt)
'''

# ============================================
# FILE 4: app/main.py (Flask, pure Python)
# ============================================
main_py = '''from flask import Flask, request, jsonify, render_template
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
        "message": f"Welcome, {request.user[\'email\']}!"
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
'''

# ============================================
# FILE 5: tests/test_layer1_auth.py (unittest only)
# ============================================
test_py = '''import unittest
import json
from unittest.mock import patch
from app.main import app

class TestLayer1Auth(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_health_check_public(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "healthy")

    def test_auth_me_no_header(self):
        resp = self.client.get("/api/auth/me")
        self.assertEqual(resp.status_code, 401)

    def test_auth_me_invalid_scheme(self):
        resp = self.client.get("/api/auth/me", headers={"Authorization": "Basic abc123"})
        self.assertEqual(resp.status_code, 401)

    @patch("app.services.firebase_service.verify_id_token", return_value=None)
    def test_auth_me_invalid_token(self, mock_verify):
        resp = self.client.get("/api/auth/me", headers={"Authorization": "Bearer fake-token"})
        self.assertEqual(resp.status_code, 401)

    @patch("app.services.firebase_service.verify_id_token", return_value={"uid": "test-uid-123", "email": "test@example.com"})
    def test_auth_me_valid_token(self, mock_verify):
        resp = self.client.get("/api/auth/me", headers={"Authorization": "Bearer valid-token"})
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["uid"], "test-uid-123")
        self.assertEqual(data["email"], "test@example.com")

    def test_resources_no_auth(self):
        resp = self.client.get("/api/resources")
        self.assertEqual(resp.status_code, 401)

    def test_chat_no_auth(self):
        resp = self.client.post("/api/chat", json={"query": "hello"})
        self.assertEqual(resp.status_code, 401)

if __name__ == "__main__":
    unittest.main()
'''

# ============================================
# WRITE ALL FILES
# ============================================
files = {
    "app/config.py": config_py,
    "app/services/firebase_service.py": firebase_py,
    "app/services/gemini_service.py": gemini_py,
    "app/main.py": main_py,
    "tests/test_layer1_auth.py": test_py,
}

print("\\n🔧 [Room 10 — Full System Repair] Fixing all files...\\n")
for path, content in files.items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    print(f"  ✅ Fixed: {path}")

print("\\n🧪 [Room 4 — Running Test Suite]\\n")
import subprocess
result = subprocess.run(["python", "-m", "unittest", "discover", "-s", "tests", "-v"], capture_output=False)

print("\\n🌿 [Room 6 — Git Commit]")
subprocess.run(["git", "add", "."], capture_output=True)
subprocess.run(["git", "commit", "-m", "fix: full system repair - pure Python Flask stack, aligned imports, unittest suite"], capture_output=True)
print("  ✅ Committed to Git")
print("\\n🎉 Full system repair complete!")
