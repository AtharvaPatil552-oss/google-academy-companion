import unittest
from unittest.mock import patch
from app.main import app

class TestLayer1Auth(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()

    def test_public_dashboard_route(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)

    def test_health_check_endpoint(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data.get("status"), "healthy")
        self.assertIn("project_id", data)

    def test_unauthenticated_protected_route_returns_401(self):
        response = self.client.get("/api/auth/me")
        self.assertEqual(response.status_code, 401)
        data = response.get_json()
        self.assertEqual(data.get("detail"), "Missing or invalid Authorization header")

    def test_invalid_bearer_token_returns_401(self):
        with patch("app.services.firebase_service.verify_id_token", return_value=None):
            response = self.client.get(
                "/api/auth/me",
                headers={"Authorization": "Bearer invalid_mock_token"}
            )
            self.assertEqual(response.status_code, 401)
            data = response.get_json()
            self.assertEqual(data.get("detail"), "Invalid, expired, or forged Firebase ID token")

    def test_authenticated_get_auth_profile(self):
        mock_user = {
            "uid": "usr_abc123",
            "email": "student@example.com",
            "email_verified": True
        }
        with patch("app.services.firebase_service.verify_id_token", return_value=mock_user):
            response = self.client.get(
                "/api/auth/me",
                headers={"Authorization": "Bearer valid_token_123"}
            )
            self.assertEqual(response.status_code, 200)
            data = response.get_json()
            self.assertTrue(data.get("authenticated"))
            self.assertEqual(data.get("uid"), "usr_abc123")
            self.assertEqual(data.get("email"), "student@example.com")

    def test_authenticated_list_resources(self):
        mock_user = {"uid": "usr_abc123", "email": "student@example.com"}
        with patch("app.services.firebase_service.verify_id_token", return_value=mock_user):
            response = self.client.get(
                "/api/resources",
                headers={"Authorization": "Bearer valid_token_123"}
            )
            self.assertEqual(response.status_code, 200)
            data = response.get_json()
            self.assertIsInstance(data, list)
            self.assertGreater(len(data), 0)

    def test_authenticated_add_resource(self):
        mock_user = {"uid": "usr_abc123", "email": "student@example.com"}
        with patch("app.services.firebase_service.verify_id_token", return_value=mock_user):
            with patch("app.services.gemini_service.analyze_resource", return_value="Mocked analysis summary"):
                response = self.client.post(
                    "/api/resources",
                    headers={"Authorization": "Bearer valid_token_123"},
                    json={
                        "title": "Cloud Run Intro",
                        "content": "Containerized serverless deployment",
                        "category": "CLOUD"
                    }
                )
                self.assertEqual(response.status_code, 200)
                data = response.get_json()
                self.assertEqual(data.get("status"), "created")
                self.assertEqual(data.get("user_id"), "usr_abc123")
                self.assertEqual(data.get("analysis"), "Mocked analysis summary")

    def test_authenticated_chat_with_gemini(self):
        mock_user = {"uid": "usr_abc123", "email": "student@example.com"}
        with patch("app.services.firebase_service.verify_id_token", return_value=mock_user):
            with patch("app.services.gemini_service.ask_companion", return_value="Mocked AI companion response"):
                response = self.client.post(
                    "/api/chat",
                    headers={"Authorization": "Bearer valid_token_123"},
                    json={"query": "How do I use Gemini 2.0 Flash?"}
                )
                self.assertEqual(response.status_code, 200)
                data = response.get_json()
                self.assertEqual(data.get("user_id"), "usr_abc123")
                self.assertEqual(data.get("response"), "Mocked AI companion response")

if __name__ == "__main__":
    unittest.main()
