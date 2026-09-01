import unittest
import json
from unittest.mock import patch
from app.main import app

class TestLayer1Auth(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_health_check_public(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "healthy")

    def test_auth_me_no_header(self):
        resp = self.client.get("/api/auth/me")
        self.assertEqual(resp.status_code, 401)

    def test_auth_me_invalid_scheme(self):
        resp = self.client.get("/api/auth/me", headers={"Authorization": "Basic abc123"})
        self.assertEqual(resp.status_code, 401)

    @patch("app.services.firebase_service.verify_id_token", return_value=None)
    def test_auth_me_invalid_token(self, mock_verify):
        resp = self.client.get("/api/auth/me", headers={"Authorization": "Bearer fake-token"})
        self.assertEqual(resp.status_code, 401)

    @patch("app.services.firebase_service.verify_id_token", return_value={"uid": "test-uid-123", "email": "test@example.com"})
    def test_auth_me_valid_token(self, mock_verify):
        resp = self.client.get("/api/auth/me", headers={"Authorization": "Bearer valid-token"})
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["uid"], "test-uid-123")
        self.assertEqual(data["email"], "test@example.com")

    def test_resources_no_auth(self):
        resp = self.client.get("/api/resources")
        self.assertEqual(resp.status_code, 401)

    def test_chat_no_auth(self):
        resp = self.client.post("/api/chat", json={"query": "hello"})
        self.assertEqual(resp.status_code, 401)

if __name__ == "__main__":
    unittest.main()
