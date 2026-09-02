"""
Layer 8 — Personalized Learning Path Service
Agent 3.12 (Recommendation Engineer)
"""
from app.services.firestore_service import (
    create_document, get_document, update_document, now_iso
)
from app.services.gemini_service import generate_learning_path, get_recommendations
from app.services.resource_service import get_resources

def _doc(uid):
    return f"users/{uid}/learningPath/current"

def get_learning_path(uid, token):
    doc, err = get_document(_doc(uid), token)
    if err and err.get("status") == 404:
        return {"steps": [], "goal": ""}, None
    if err:
        return None, err
    return doc, None

def generate_path(uid, token, goal="Complete Google Academy Challenge"):
    resources, _ = get_resources(uid, token)
    steps = generate_learning_path(resources or [], goal)
    data = {
        "userId": uid,
        "steps": steps,
        "goal": goal,
        "generatedAt": now_iso()
    }
    existing, _ = get_document(_doc(uid), token)
    if existing:
        return update_document(_doc(uid), token, data)
    return create_document(f"users/{uid}/learningPath", token, data, doc_id="current")

def get_recommendations_for_user(uid, token, current_task=""):
    resources, _ = get_resources(uid, token)
    return get_recommendations(resources or [], current_task)
