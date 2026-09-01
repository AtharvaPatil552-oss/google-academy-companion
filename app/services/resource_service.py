import time
import uuid
from typing import Dict, List, Optional

# In-memory user-isolated resource store (prepares for Firestore in Layer 3)
_USER_RESOURCES_STORE: Dict[str, List[Dict]] = {}

def get_user_resources(uid: str) -> List[Dict]:
    """Returns all resources strictly isolated to the authenticated user UID."""
    return _USER_RESOURCES_STORE.get(uid, [])

def create_user_resource(uid: str, sanitized_data: Dict) -> Dict:
    """Creates and stores a validated learning resource for the authenticated user."""
    resource_id = f"res_{uuid.uuid4().hex[:10]}"
    timestamp = int(time.time())
    
    resource_doc = {
        "id": resource_id,
        "user_id": uid,
        "title": sanitized_data["title"],
        "content": sanitized_data["content"],
        "category": sanitized_data["category"],
        "resource_type": sanitized_data["resource_type"],
        "url": sanitized_data["url"],
        "tags": sanitized_data["tags"],
        "difficulty": "Unrated",
        "status": "Ready",
        "created_at": timestamp,
        "summary": sanitized_data["content"][:140] + ("..." if len(sanitized_data["content"]) > 140 else "")
    }

    if uid not in _USER_RESOURCES_STORE:
        _USER_RESOURCES_STORE[uid] = []
    
    _USER_RESOURCES_STORE[uid].insert(0, resource_doc)
    return resource_doc

def reset_store_for_testing():
    """Helper to clear test state."""
    global _USER_RESOURCES_STORE
    _USER_RESOURCES_STORE = {}
