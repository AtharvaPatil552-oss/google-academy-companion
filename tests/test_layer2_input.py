"""Layer 2 Tests — Resource Ingestion & Validation Engine"""
import unittest
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.services.resource_validator import validate_resource

class TestLayer2Validation(unittest.TestCase):
    def test_valid_text_resource(self):
        valid, errors = validate_resource({"title": "Valid Resource", "content": "Sample content"})
        self.assertTrue(valid)
        self.assertEqual(len(errors), 0)

    def test_rejects_missing_title(self):
        valid, errors = validate_resource({"title": "", "content": "Sample content"})
        self.assertFalse(valid)

    def test_rejects_short_title(self):
        valid, errors = validate_resource({"title": "ab", "content": "Sample content"})
        self.assertFalse(valid)

    def test_rejects_invalid_url(self):
        valid, errors = validate_resource({"title": "Google Cloud", "url": "ftp://bad-url"})
        self.assertFalse(valid)
