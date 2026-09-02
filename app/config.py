"""
Google Academy Companion — Central Configuration
Pure-Python .env parser (Zero C/Rust dependencies).
"""
import os

def _load_env():
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())

_load_env()

class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "academy-companion-secret-dev-2026")
    FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "genuine-plate-507315-u9")
    FIREBASE_API_KEY = os.environ.get("FIREBASE_API_KEY", "")
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    FIRESTORE_BASE_URL = (
        f"https://firestore.googleapis.com/v1/projects/"
        f"{os.environ.get('FIREBASE_PROJECT_ID', 'genuine-plate-507315-u9')}"
        f"/databases/(default)/documents"
    )
    FIREBASE_TOKEN_INFO_URL = "https://oauth2.googleapis.com/tokeninfo"
    MAX_RESOURCE_SIZE = 50 * 1024  # 50 KB Limit
