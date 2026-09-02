"""
Layer 9 — Progress Tracking & Project Mode Service
Agent 3.9 (Summary Engineer)
"""
from app.services.firestore_service import (
    create_document, get_document, update_document, now_iso
)
from app.services.resource_service import get_resources

DEFAULT_TASKS = [
    {"id": "understand_challenge", "title": "Understand the challenge requirements", "done": True},
    {"id": "setup_repo_auth", "title": "Configure Firebase Auth & Firestore rules", "done": True},
    {"id": "build_resource_system", "title": "Ingest study & lab resources", "done": False},
    {"id": "connect_gemini", "title": "Integrate Gemini 3.6 / 2.5 Flash companion", "done": False},
    {"id": "build_learning_path", "title": "Generate AI learning path & recommendations", "done": False},
    {"id": "deploy_cloud_run", "title": "Deploy container to Google Cloud Run", "done": False},
    {"id": "record_demo", "title": "Record demo & submit #AccelerateAIwithCloudRun", "done": False}
]

def _doc(uid):
    return f"users/{uid}/progress/dashboard"

def _ensure_progress(uid, token):
    doc, err = get_document(_doc(uid), token)
    if doc:
        return doc, None
    data = {
        "userId": uid,
        "projectTasks": DEFAULT_TASKS,
        "currentTask": "Ingest study & lab resources",
        "completionPercent": 28,
        "updatedAt": now_iso()
    }
    return create_document(f"users/{uid}/progress", token, data, doc_id="dashboard")

def get_progress(uid, token):
    doc, err = _ensure_progress(uid, token)
    if err:
        return None, err
    resources, _ = get_resources(uid, token)
    doc["resourcesCount"] = len(resources) if resources else 0
    tasks = doc.get("projectTasks", DEFAULT_TASKS)
    done_count = sum(1 for t in tasks if t.get("done"))
    doc["milestonesCompleted"] = done_count
    doc["completionPercent"] = round((done_count / len(tasks)) * 100) if tasks else 0
    return doc, None

def toggle_project_task(uid, token, task_id):
    doc, err = _ensure_progress(uid, token)
    if err:
        return None, err
    tasks = doc.get("projectTasks", DEFAULT_TASKS)
    for t in tasks:
        if t.get("id") == task_id:
            t["done"] = not t.get("done", False)
            break
    done_count = sum(1 for t in tasks if t.get("done"))
    next_task = next((t.get("title") for t in tasks if not t.get("done")), "All milestones complete! 🎉")
    update_payload = {
        "projectTasks": tasks,
        "currentTask": next_task,
        "completionPercent": round((done_count / len(tasks)) * 100) if tasks else 0,
        "milestonesCompleted": done_count,
        "updatedAt": now_iso()
    }
    return update_document(_doc(uid), token, update_payload)
