"""Layer 7, 8, 9 Tests — Intelligence, Learning Path, Progress"""
import unittest
from unittest.mock import patch
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.main import app

class TestLayer789Advanced(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.headers = {"Authorization": "Bearer valid-test-token"}

    @patch("app.services.learning_service.get_learning_path")
    def test_get_learning_path(self, mock_get_path):
        mock_get_path.return_value = ({"steps": [{"step": 1, "title": "Setup"}]}, None)
        resp = self.client.get("/api/learning/path", headers=self.headers)
        self.assertEqual(resp.status_code, 200)

    @patch("app.services.progress_service.toggle_project_task")
    def test_toggle_project_task(self, mock_toggle):
        mock_toggle.return_value = ({"completionPercent": 40}, None)
        resp = self.client.post("/api/progress/project/task", headers=self.headers, json={"taskId": "connect_gemini"})
        self.assertEqual(resp.status_code, 200)
