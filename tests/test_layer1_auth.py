"""Layer 1 Tests — Authentication & Authorization Guards"""
import unittest
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.main import app

class TestLayer1Auth(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_health_check_public(self):
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)

    def test_auth_me_no_header(self):
        resp = self.client.get("/api/auth/me")
        self.assertEqual(resp.status_code, 401)

    def test_auth_me_invalid_scheme(self):
        resp = self.client.get("/api/auth/me", headers={"Authorization": "Basic 12345"})
        self.assertEqual(resp.status_code, 401)

    def test_auth_me_valid_mock_token(self):
        resp = self.client.get("/api/auth/me", headers={"Authorization": "Bearer valid-test-token"})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.get_json().get("authenticated"))
