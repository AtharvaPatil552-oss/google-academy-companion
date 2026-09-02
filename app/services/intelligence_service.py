"""
Layer 7 — Resource Intelligence Service
Agent 3.11 (Knowledge Engineer)
"""
from app.services.gemini_service import analyze_resource
from app.services.resource_service import get_resource, update_resource
from app.services.firestore_service import now_iso

def process_resource_intelligence(uid, token, resource_id):
    resource, err = get_resource(uid, token, resource_id)
    if err or not resource:
        return None, err or {"error": True, "status": 404, "message": "Resource not found"}

    intelligence = analyze_resource(resource)
    intelligence["processedAt"] = now_iso()

    updated, u_err = update_resource(uid, token, resource_id, {"intelligence": intelligence})
    if u_err:
        return None, u_err
    return intelligence, None

def get_resource_intelligence(uid, token, resource_id):
    resource, err = get_resource(uid, token, resource_id)
    if err or not resource:
        return None, err or {"error": True, "status": 404, "message": "Not found"}
    return resource.get("intelligence", {}), None
