"""Layer 4 & 5 Tests — Gemini AI & Conversation Flow"""
import unittest
from unittest.mock import patch
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.main import app

class TestLayer45AI(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.headers = {"Authorization": "Bearer valid-test-token"}

    @patch("app.services.gemini_service.chat_with_context")
    def test_quick_chat_route(self, mock_chat):
        mock_chat.return_value = "Gemini Flash is designed for high-frequency AI workloads."
        resp = self.client.post("/api/chat", headers=self.headers, json={"question": "What is Gemini?"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("answer", resp.get_json())
