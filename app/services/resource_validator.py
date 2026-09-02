"""
Layer 2 — Resource Ingestion Validator
Agent 3.14 (Validation Engineer)
"""
import re
from urllib.parse import urlparse
from app.config import Config

ALLOWED_CATEGORIES = {"AI", "Firebase", "Cloud", "Project", "General", "Other"}

def validate_resource(data: dict):
    errors = []
    if not isinstance(data, dict):
        return False, ["Payload must be a JSON object"]

    title = data.get("title", "").strip()
    if not title:
        errors.append("Title is required")
    elif len(title) < 3:
        errors.append("Title must be at least 3 characters")
    elif len(title) > 200:
        errors.append("Title cannot exceed 200 characters")

    content = data.get("content", "").strip()
    url = data.get("url", "").strip()

    if not content and not url:
        errors.append("Either 'content' or 'url' must be provided")

    if content and len(content.encode("utf-8")) > Config.MAX_RESOURCE_SIZE:
        errors.append(f"Content exceeds maximum size of {Config.MAX_RESOURCE_SIZE // 1024} KB")

    if url:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            errors.append("Invalid URL format (must begin with http:// or https://)")

    category = data.get("category", "General")
    if category not in ALLOWED_CATEGORIES:
        data["category"] = "General"

    if errors:
        return False, errors
    return True, []
