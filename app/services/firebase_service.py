import urllib.request
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
