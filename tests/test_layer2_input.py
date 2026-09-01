import unittest
import json
from unittest.mock import patch
from app.main import app
from app.services.resource_service import reset_store_for_testing

class TestLayer2ResourceInput(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        reset_store_for_testing()
        self.auth_headers = {"Authorization": "Bearer valid-mock-token"}

    @patch("app.services.firebase_service.verify_id_token", return_value={"uid": "user_abc123", "email": "dev@academy.org"})
    def test_create_valid_text_resource(self, mock_auth):
        payload = {
            "title": "Cloud Run Overview & Best Practices",
            "category": "GOOGLE CLOUD",
            "resource_type": "TEXT",
            "content": "Cloud Run is a managed compute platform to run containers directly on Google Cloud.",
            "tags": ["cloudrun", "containers", "serverless"]
        }
        resp = self.client.post("/api/resources", json=payload, headers=self.auth_headers)
        self.assertEqual(resp.status_code, 201)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "created")
        self.assertEqual(data["resource"]["title"], "Cloud Run Overview & Best Practices")
        self.assertEqual(data["resource"]["user_id"], "user_abc123")

    @patch("app.services.firebase_service.verify_id_token", return_value={"uid": "user_abc123", "email": "dev@academy.org"})
    def test_create_valid_url_resource(self, mock_auth):
        payload = {
            "title": "Gemini API Python Quickstart",
            "category": "AI / GEMINI",
            "resource_type": "URL",
            "url": "ai.google.dev/gemini-api/docs",
            "content": "Official documentation link for Gemini API."
        }
        resp = self.client.post("/api/resources", json=payload, headers=self.auth_headers)
        self.assertEqual(resp.status_code, 201)
        data = json.loads(resp.data)
        self.assertTrue(data["resource"]["url"].startswith("https://"))

    @patch("app.services.firebase_service.verify_id_token", return_value={"uid": "user_abc123", "email": "dev@academy.org"})
    def test_validation_rejects_missing_title(self, mock_auth):
        payload = {"content": "Content without title"}
        resp = self.client.post("/api/resources", json=payload, headers=self.auth_headers)
        self.assertEqual(resp.status_code, 400)
        data = json.loads(resp.data)
        self.assertIn("Title is required.", data["details"])

    @patch("app.services.firebase_service.verify_id_token", return_value={"uid": "user_abc123", "email": "dev@academy.org"})
    def test_validation_rejects_short_title(self, mock_auth):
        payload = {"title": "ab", "content": "Valid content length"}
        resp = self.client.post("/api/resources", json=payload, headers=self.auth_headers)
        self.assertEqual(resp.status_code, 400)
        data = json.loads(resp.data)
        self.assertTrue(any("at least 3 characters" in err for err in data["details"]))

    @patch("app.services.firebase_service.verify_id_token", return_value={"uid": "user_abc123", "email": "dev@academy.org"})
    def test_validation_rejects_invalid_url(self, mock_auth):
        payload = {"title": "Bad Link", "url": "not-a-real-url"}
        resp = self.client.post("/api/resources", json=payload, headers=self.auth_headers)
        self.assertEqual(resp.status_code, 400)

    @patch("app.services.firebase_service.verify_id_token", return_value={"uid": "user_abc123", "email": "dev@academy.org"})
    def test_validation_rejects_oversized_content(self, mock_auth):
        payload = {"title": "Huge Document", "content": "A" * 60000}
        resp = self.client.post("/api/resources", json=payload, headers=self.auth_headers)
        self.assertEqual(resp.status_code, 400)
        data = json.loads(resp.data)
        self.assertTrue(any("exceeds maximum size" in err for err in data["details"]))

    def test_resource_endpoints_require_auth(self):
        resp = self.client.get("/api/resources")
        self.assertEqual(resp.status_code, 401)
        resp = self.client.post("/api/resources", json={"title": "Test"})
        self.assertEqual(resp.status_code, 401)

if __name__ == "__main__":
    unittest.main()
