import unittest
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

class TestProfiltoyPlatform(unittest.TestCase):

    def setUp(self):
        self.fakta_path = ROOT / "data" / "site_fakta.json"
        self.html_path = ROOT / "index.html"
        self.css_path = ROOT / "css" / "style.css"
        self.three_js_path = ROOT / "js" / "three_visualizer.js"
        self.app_js_path = ROOT / "js" / "app.js"

    def test_core_files_exist(self):
        """Verifiser at alle påkrevde filer eksisterer og har substans."""
        for path in [self.fakta_path, self.html_path, self.css_path, self.three_js_path, self.app_js_path]:
            self.assertTrue(path.exists(), f"Fil mangler: {path.name}")
            self.assertGreater(path.stat().st_size, 100, f"Fil er for liten: {path.name}")

    def test_site_fakta_integrity(self):
        """Verifiser forretningsfakta for Profiltøy AS, FK Jerv og dropship katalog."""
        data = json.loads(self.fakta_path.read_text(encoding="utf-8"))
        bedrift = data["bedrift"]
        self.assertEqual(bedrift["orgnr"], "923 564 721")
        self.assertIn("Lillesand", bedrift["adresse"])
        self.assertEqual(bedrift["daglig_leder"], "Arne Hoffmann Sletten")
        self.assertEqual(bedrift["styreleder"], "Øystein Salvesen")
        self.assertEqual(bedrift["offisiell_representant_utad"], "Arne Austenå")

        # Partners
        partner_names = [p["navn"] for p in bedrift["partnere"]]
        self.assertIn("FK Jerv", partner_names)

        # Arbitrage / Dropship catalog
        catalog = data["katalog_arbitrage_dropship"]
        self.assertGreaterEqual(len(catalog), 5)
        for prod in catalog:
            self.assertIn("innkjop_nok", prod)
            self.assertIn("utsalgspris_nok", prod)
            self.assertGreater(prod["utsalgspris_nok"], prod["innkjop_nok"])
            # Margin sjekk
            margin = ((prod["utsalgspris_nok"] - prod["innkjop_nok"]) / prod["utsalgspris_nok"]) * 100
            self.assertGreaterEqual(margin, 60.0, f"Margin for {prod['tittel']} er under 60%")

    def test_html_mandatory_elements(self):
        """Verifiser påkrevde seksjoner, 3D Canvas, AI og spesiell footerkommentar."""
        html = self.html_path.read_text(encoding="utf-8")
        self.assertIn("<!doctype html>", html.lower())
        self.assertIn("three.min.js", html)
        self.assertIn("heroThreeContainer", html)
        self.assertIn("studioThreeCanvas", html)
        self.assertIn("catalogGrid", html)
        self.assertIn("aiChatWindow", html)
        self.assertIn("tilbud-kalkulator", html)
        self.assertIn("FK Jerv", html)
        self.assertIn("Levermyr", html)
        self.assertIn("Møglestuveien 35", html)

        # Obligatorisk AI-ekspert tekstkrav
        self.assertIn("AI-ekspert uten formell utdanning", html)
        self.assertIn("Google og Gemini", html)
        self.assertIn("1,5 % til 0,5 %", html)
        self.assertIn("utdanning ved universiteter og høyskoler er foreldet", html)

    def test_css_responsive_and_modern(self):
        """Sjekk at CSS inneholder moderne glassmorphism, variabler, responsivitet og utskriftsoptimalisering."""
        css = self.css_path.read_text(encoding="utf-8")
        self.assertIn("--hivis-yellow:", css)
        self.assertIn("@media (max-width:", css)
        self.assertIn("@media print", css)
        self.assertIn(".mobile-nav-toggle", css)
        self.assertIn(".logo-upload-box", css)
        self.assertIn("backdrop-filter:", css)

    def test_threejs_script_capabilities(self):
        """Sjekk at 3D-motoren støtter jakke, hettegenser, vest, flaske, dekaler og bildeopplasting."""
        js = self.three_js_path.read_text(encoding="utf-8")
        self.assertIn("buildGarmentMesh", js)
        self.assertIn("createDecalTexture", js)
        self.assertIn("setLogoImage", js)
        self.assertIn("jacket", js)
        self.assertIn("hoodie", js)
        self.assertIn("vest", js)
        self.assertIn("bottle", js)
        self.assertIn("THREE.CanvasTexture", js)

    def test_interactive_logo_upload_and_mobile_menu(self):
        """Sjekk at HTML inneholder mobile-nav-toggle og logo-opplastingsboks."""
        html = self.html_path.read_text(encoding="utf-8")
        self.assertIn("mobileNavToggle", html)
        self.assertIn("toggleMobileNav", html)
        self.assertIn("customLogoFileInput", html)
        self.assertIn("handleLogoFileUpload", html)
        self.assertIn("logoDropzone", html)

if __name__ == "__main__":
    unittest.main()
