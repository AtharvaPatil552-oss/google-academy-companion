"""
Layer 3 — Resource Service with Firestore Persistence
Agent 3.10 (Resource Engineer)
"""
from app.services.firestore_service import (
    create_document, list_documents, get_document,
    delete_document, update_document, now_iso
)
from app.services.resource_validator import validate_resource

def _col(uid):
    return f"users/{uid}/resources"

def _doc(uid, rid):
    return f"users/{uid}/resources/{rid}"

def create_resource(uid, token, data):
    valid, errors = validate_resource(data)
    if not valid:
        return None, {"error": "validation_failed", "details": errors}
    
    resource_payload = {
        "title": data.get("title", "").strip(),
        "content": data.get("content", "").strip(),
        "url": data.get("url", "").strip(),
        "category": data.get("category", "General"),
        "userId": uid,
        "createdAt": now_iso(),
        "status": "active",
        "intelligence": {}
    }
    doc, err = create_document(_col(uid), token, resource_payload)
    if err:
        return None, err
    return doc, None

def get_resources(uid, token):
    docs, err = list_documents(_col(uid), token)
    if err:
        return [], err
    return docs, None

def get_resource(uid, token, resource_id):
    doc, err = get_document(_doc(uid, resource_id), token)
    if err:
        return None, err
    if doc and doc.get("userId") and doc.get("userId") != uid:
        return None, {"error": True, "status": 403, "message": "Forbidden"}
    return doc, None

def delete_resource(uid, token, resource_id):
    doc, err = get_document(_doc(uid, resource_id), token)
    if err:
        return False, err
    if not doc or (doc.get("userId") and doc.get("userId") != uid):
        return False, {"error": True, "status": 404, "message": "Not found"}
    return delete_document(_doc(uid, resource_id), token)

def update_resource(uid, token, resource_id, data):
    data["updatedAt"] = now_iso()
    doc, err = update_document(_doc(uid, resource_id), token, data)
    if err:
        return None, err
    return doc, None
