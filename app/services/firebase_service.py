"""Firebase Authentication & Token Verification Service (Pure Python / REST)."""
import requests
from typing import Optional, Dict
from app.config import FIREBASE_PROJECT_ID

GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"

def verify_id_token(id_token: str) -> Optional[Dict]:
    """
    Verifies a Firebase ID token using Google OAuth2 TokenInfo endpoint.
    Validates audience matching FIREBASE_PROJECT_ID if set.
    Returns decoded token dictionary if valid, None if invalid/expired.
    """
    if not id_token or not isinstance(id_token, str):
        return None
    
    try:
        response = requests.get(
            GOOGLE_TOKENINFO_URL,
            params={"id_token": id_token.strip()},
            timeout=10
        )
        if response.status_code != 200:
            return None
        
        token_data = response.json()
        
        # Verify audience matches project ID if configured
        aud = token_data.get("aud")
        if FIREBASE_PROJECT_ID and aud != FIREBASE_PROJECT_ID:
            print(f"⚠️ Token audience mismatch: {aud} != {FIREBASE_PROJECT_ID}")
            return None

        user_id = token_data.get("sub") or token_data.get("user_id")
        if not user_id:
            return None
            
        return {
            "uid": user_id,
            "email": token_data.get("email", ""),
            "email_verified": token_data.get("email_verified", "false") == "true" or token_data.get("email_verified") is True
        }
    except Exception as e:
        print(f"⚠️ Token verification error: {e}")
        return None
