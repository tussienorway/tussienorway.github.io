import os
import re
import unittest

DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LINDAL_DIR = os.path.join(DIR, "lindal-modul")
INDEX_PATH = os.path.join(LINDAL_DIR, "index.html")

class TestLindalDOM(unittest.TestCase):
    def test_dom_ids_matching(self):
        with open(INDEX_PATH, "r", encoding="utf-8") as f:
            html = f.read()

        html_ids = set(re.findall(r'id=["\']([^"\']+)["\']', html))
        self.assertGreater(len(html_ids), 20, "For få element-ID-er funnet i HTML")

        js_files = ["geo.js", "sun.js", "data.js", "viewer3d.js", "planner.js", "ai.js", "main.js"]
        missing = []
        for js_name in js_files:
            js_path = os.path.join(LINDAL_DIR, "js", js_name)
            with open(js_path, "r", encoding="utf-8") as f:
                content = f.read()
            used_ids = set(re.findall(r'(?:\$\(|getElementById\()["\']([^"\']+)["\']', content))
            for uid in used_ids:
                if uid not in html_ids:
                    missing.append((js_name, uid))

        self.assertEqual(missing, [], f"Manglende ID-er i index.html som kalles av JS: {missing}")

    def test_forms_and_buttons(self):
        with open(INDEX_PATH, "r", encoding="utf-8") as f:
            html = f.read()
        self.assertIn('id="contactForm"', html)
        self.assertIn('id="heroSearch"', html)
        self.assertIn('id="btnToContact"', html)
        self.assertIn('id="btnAutoDesc"', html)
        self.assertIn('id="btnReset3D"', html)
        self.assertIn('id="btnOptimize"', html)
        self.assertIn('id="btnPlay"', html)
        self.assertIn('id="btnReport"', html)
        self.assertIn('Arne Austenå', html)
        self.assertIn('Daglig leder', html)

if __name__ == "__main__":
    unittest.main()
