"""
Layer 3 — Firestore REST Client (Pure Python)
Agent 3.5 (Firestore Engineer)
Communicates with Firestore via REST API passing user ID tokens.
"""
import json
import urllib.request
import urllib.error
import uuid
from datetime import datetime, timezone
from app.config import Config

def to_fs_value(value):
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, str):
        return {"stringValue": value}
    if isinstance(value, list):
        return {"arrayValue": {"values": [to_fs_value(v) for v in value]}}
    if isinstance(value, dict):
        return {"mapValue": {"fields": {k: to_fs_value(v) for k, v in value.items()}}}
    if value is None:
        return {"nullValue": None}
    return {"stringValue": str(value)}

def from_fs_value(value):
    if "stringValue" in value:
        return value["stringValue"]
    if "integerValue" in value:
        return int(value["integerValue"])
    if "doubleValue" in value:
        return float(value["doubleValue"])
    if "booleanValue" in value:
        return value["booleanValue"]
    if "timestampValue" in value:
        return value["timestampValue"]
    if "arrayValue" in value:
        return [from_fs_value(v) for v in value["arrayValue"].get("values", [])]
    if "mapValue" in value:
        return {k: from_fs_value(v) for k, v in value["mapValue"].get("fields", {}).items()}
    if "nullValue" in value:
        return None
    return None

def dict_to_fs(data: dict) -> dict:
    return {"fields": {k: to_fs_value(v) for k, v in data.items()}}

def fs_to_dict(document: dict) -> dict:
    fields = document.get("fields", {})
    result = {k: from_fs_value(v) for k, v in fields.items()}
    name = document.get("name", "")
    if name:
        result["_id"] = name.rstrip("/").split("/")[-1]
    return result

def _firestore_request(method, path, token, body=None, params=""):
    url = f"{Config.FIRESTORE_BASE_URL}/{path}{params}"
    data = json.dumps(body).encode("utf-8") if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8") if e.fp else ""
        return {"error": True, "status": e.code, "message": err_body}
    except Exception as e:
        return {"error": True, "status": 500, "message": str(e)}

def create_document(collection_path, token, data, doc_id=None):
    if doc_id is None:
        doc_id = uuid.uuid4().hex[:20]
    params = f"?documentId={doc_id}"
    result = _firestore_request("POST", collection_path, token, dict_to_fs(data), params)
    if isinstance(result, dict) and result.get("error"):
        return None, result
    return fs_to_dict(result), None

def get_document(doc_path, token):
    result = _firestore_request("GET", doc_path, token)
    if isinstance(result, dict) and result.get("error"):
        return None, result
    return fs_to_dict(result), None

def list_documents(collection_path, token, page_size=100):
    params = f"?pageSize={page_size}"
    result = _firestore_request("GET", collection_path, token, params=params)
    if isinstance(result, dict) and result.get("error"):
        return [], result
    docs = result.get("documents", [])
    return [fs_to_dict(d) for d in docs], None

def update_document(doc_path, token, data):
    mask = "&".join(f"updateMask.fieldPaths={k}" for k in data.keys())
    params = f"?{mask}" if mask else ""
    result = _firestore_request("PATCH", doc_path, token, dict_to_fs(data), params)
    if isinstance(result, dict) and result.get("error"):
        return None, result
    return fs_to_dict(result), None

def delete_document(doc_path, token):
    result = _firestore_request("DELETE", doc_path, token)
    if isinstance(result, dict) and result.get("error"):
        return False, result
    return True, None

def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
