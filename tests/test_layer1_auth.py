from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app

client = TestClient(app)


def test_health_check():
    """Verify public health endpoint returns 200 OK and expected payload."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "Google Academy Companion"
    assert "project_id" in data


def test_serve_dashboard():
    """Verify dashboard template renders successfully."""
    response = client.get("/")
    assert response.status_code == 200
    assert "Google Academy Companion" in response.text


def test_unauthenticated_protected_routes():
    """Verify all protected endpoints reject requests lacking Authorization header with 401."""
    protected_routes = [
        ("GET", "/api/auth/me"),
        ("GET", "/api/resources"),
        ("POST", "/api/resources"),
        ("POST", "/api/chat"),
    ]
    for method, endpoint in protected_routes:
        if method == "GET":
            response = client.get(endpoint)
        else:
            response = client.post(endpoint, json={})
        assert response.status_code == 401, f"Expected 401 for {method} {endpoint}"
        assert response.json()["detail"] == "Missing or invalid Authorization header"


def test_invalid_authorization_scheme():
    """Verify non-Bearer auth schemes are rejected with 401."""
    headers = {"Authorization": "Basic dXNlcjpwYXNz"}
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"] == "Missing or invalid Authorization header"


def test_invalid_firebase_id_token():
    """Verify invalid or expired Bearer tokens return 401 token error."""
    headers = {"Authorization": "Bearer invalid_mock_token_123"}
    with patch("app.services.firebase_service.verify_id_token", return_value=None):
        response = client.get("/api/auth/me", headers=headers)
        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid, expired, or forged Firebase ID token"


def test_authenticated_user_profile():
    """Verify valid Firebase token grants access to user identity endpoint."""
    mock_user = {
        "uid": "test_user_789",
        "email": "student@example.com",
        "email_verified": True,
    }
    headers = {"Authorization": "Bearer valid_mock_token"}
    with patch("app.services.firebase_service.verify_id_token", return_value=mock_user):
        response = client.get("/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is True
        assert data["uid"] == "test_user_789"
        assert data["email"] == "student@example.com"
