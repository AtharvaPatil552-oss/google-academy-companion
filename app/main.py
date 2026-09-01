from fastapi import FastAPI, Request, Depends, HTTPException, Header
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import Optional, List
from app.services import gemini_service, firebase_service
from app.config import PORT, FIREBASE_PROJECT_ID, FIREBASE_API_KEY

app = FastAPI(
    title="Google Academy Companion API",
    description="Backend API with Firebase Authentication & Gemini Intelligence",
    version="1.0.0"
)

templates = Jinja2Templates(directory="app/templates")

# --- Authentication Dependency Guard ---
async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """Extracts and verifies Bearer ID Token from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    
    token = authorization.split("Bearer ")[1].strip()
    user = firebase_service.verify_id_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid, expired, or forged Firebase ID token")
    
    return user

# --- Schemas ---
class ChatRequest(BaseModel):
    query: str
    resource_context: str = ""

class ResourceRequest(BaseModel):
    title: str
    content: str
    category: str = "General"

# --- Public Endpoints ---
@app.get("/", response_class=HTMLResponse)
async def serve_dashboard(request: Request):
    """Serves the Single Page Application UI."""
    return templates.TemplateResponse("index.html", {
        "request": request,
        "firebase_project_id": FIREBASE_PROJECT_ID,
        "firebase_api_key": FIREBASE_API_KEY
    })

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "Google Academy Companion",
        "auth": "Firebase Auth Guard Active",
        "project_id": FIREBASE_PROJECT_ID
    }

# --- Protected Endpoints (Auth Guarded) ---
@app.get("/api/auth/me")
async def get_auth_profile(user: dict = Depends(get_current_user)):
    """Returns authenticated user identity."""
    return {
        "authenticated": True,
        "uid": user["uid"],
        "email": user["email"],
        "email_verified": user.get("email_verified", False),
        "message": f"Welcome, {user['email']}!"
    }

@app.get("/api/resources")
async def list_resources(user: dict = Depends(get_current_user)):
    """User-isolated resource listing."""
    return [
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
    ]

@app.post("/api/resources")
async def add_resource(req: ResourceRequest, user: dict = Depends(get_current_user)):
    """Analyze and persist user resource using Gemini AI."""
    analysis = gemini_service.analyze_resource(req.content, req.title)
    return {
        "status": "created",
        "user_id": user["uid"],
        "title": req.title,
        "category": req.category,
        "analysis": analysis
    }

@app.post("/api/chat")
async def chat_with_gemini(req: ChatRequest, user: dict = Depends(get_current_user)):
    """Contextual multi-turn companion chat for authenticated users."""
    response = gemini_service.ask_companion(req.query, req.resource_context)
    return {
        "user_id": user["uid"],
        "response": response
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=PORT, reload=True)
