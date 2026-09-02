"""Layer 3 Tests — Firestore SerDe & Mocked Persistence"""
import unittest
from unittest.mock import patch
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.services.firestore_service import to_fs_value, from_fs_value
from app.main import app

class TestLayer3Firestore(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.headers = {"Authorization": "Bearer valid-test-token"}

    def test_serde_primitives(self):
        self.assertEqual(from_fs_value(to_fs_value("hello")), "hello")
        self.assertEqual(from_fs_value(to_fs_value(42)), 42)
        self.assertEqual(from_fs_value(to_fs_value(True)), True)

    @patch("app.services.resource_service.get_resources")
    def test_list_resources(self, mock_get):
        mock_get.return_value = ([{"title": "GCP Cloud Run"}], None)
        resp = self.client.get("/api/resources", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
