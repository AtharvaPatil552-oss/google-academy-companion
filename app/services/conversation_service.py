"""
Layer 5 — Multi-Turn Conversation Service
Agent 3.8 (Conversation Engineer)
"""
from app.services.firestore_service import (
    create_document, get_document, list_documents,
    update_document, delete_document, now_iso
)
from app.services.gemini_service import chat_with_context
from app.services.resource_service import get_resources

def _col(uid):
    return f"users/{uid}/conversations"

def _doc(uid, cid):
    return f"users/{uid}/conversations/{cid}"

def create_conversation(uid, token, title="New Chat"):
    data = {
        "userId": uid,
        "title": title,
        "messages": [],
        "createdAt": now_iso(),
        "updatedAt": now_iso()
    }
    return create_document(_col(uid), token, data)

def get_conversations(uid, token):
    return list_documents(_col(uid), token)

def get_conversation(uid, token, conv_id):
    return get_document(_doc(uid, conv_id), token)

def send_message(uid, token, conv_id, user_text):
    conv, err = get_conversation(uid, token, conv_id)
    if err or not conv:
        return None, err or {"error": True, "status": 404, "message": "Conversation not found"}

    messages = conv.get("messages", [])
    messages.append({"role": "user", "text": user_text, "timestamp": now_iso()})

    resources, _ = get_resources(uid, token)
    ai_response = chat_with_context(user_text, resources, messages[:-1])
    messages.append({"role": "model", "text": ai_response, "timestamp": now_iso()})

    update_payload = {"messages": messages, "updatedAt": now_iso()}
    if len(messages) <= 2:
        update_payload["title"] = user_text[:40]

    updated, u_err = update_document(_doc(uid, conv_id), token, update_payload)
    if u_err:
        return None, u_err
    return {"response": ai_response, "messages": messages}, None

def delete_conversation(uid, token, conv_id):
    return delete_document(_doc(uid, conv_id), token)
