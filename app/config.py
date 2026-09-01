import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "genuine-plate-507315-u9")
FIREBASE_API_KEY = os.getenv("FIREBASE_API_KEY", "")
PORT = int(os.getenv("PORT", "8000"))

if not GEMINI_API_KEY:
    print("⚠️ Warning: GEMINI_API_KEY is not set in .env")
