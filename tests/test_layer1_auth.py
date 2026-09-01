import pytest
from unittest.mock import patch
from app.main import app

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def test_health_check(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.get_json()
    assert data["status"] == "healthy"
    assert data["service"] == "Google Academy Companion"

def test_serve_dashboard(client):
    response = client.get("/")
    assert response.status_code == 200

def test_auth_me_unauthorized_missing_header(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    data = response.get_json()
    assert "Missing or invalid Authorization header" in data["detail"]

def test_auth_me_unauthorized_invalid_token(client):
    with patch("app.services.firebase_service.verify_id_token", return_value=None):
        response = client.get("/api/auth/me", headers={"Authorization": "Bearer invalid_token"})
        assert response.status_code == 401
        data = response.get_json()
        assert "Invalid, expired, or forged Firebase ID token" in data["detail"]

def test_auth_me_success(client):
    mock_user = {"uid": "user-123", "email": "student@example.com", "email_verified": True}
    with patch("app.services.firebase_service.verify_id_token", return_value=mock_user):
        response = client.get("/api/auth/me", headers={"Authorization": "Bearer valid_token"})
        assert response.status_code == 200
        data = response.get_json()
        assert data["authenticated"] is True
        assert data["uid"] == "user-123"
        assert data["email"] == "student@example.com"

def test_list_resources(client):
    mock_user = {"uid": "user-123", "email": "student@example.com"}
    with patch("app.services.firebase_service.verify_id_token", return_value=mock_user):
        response = client.get("/api/resources", headers={"Authorization": "Bearer valid_token"})
        assert response.status_code == 200
        data = response.get_json()
        assert isinstance(data, list)
        assert len(data) > 0

def test_add_resource(client):
    mock_user = {"uid": "user-123", "email": "student@example.com"}
    with patch("app.services.firebase_service.verify_id_token", return_value=mock_user), \
         patch("app.services.gemini_service.analyze_resource", return_value="Mocked Analysis"):
        response = client.post(
            "/api/resources",
            headers={"Authorization": "Bearer valid_token"},
            json={"title": "Test Resource", "content": "Content body", "category": "Testing"}
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["status"] == "created"
        assert data["user_id"] == "user-123"
        assert data["analysis"] == "Mocked Analysis"

def test_chat_with_gemini(client):
    mock_user = {"uid": "user-123", "email": "student@example.com"}
    with patch("app.services.firebase_service.verify_id_token", return_value=mock_user), \
         patch("app.services.gemini_service.ask_companion", return_value="Mocked Response"):
        response = client.post(
            "/api/chat",
            headers={"Authorization": "Bearer valid_token"},
            json={"query": "How does Firebase token verification work?"}
        )
        assert response.status_code == 200
        data = response.get_json()
        assert data["user_id"] == "user-123"
        assert data["response"] == "Mocked Response"
