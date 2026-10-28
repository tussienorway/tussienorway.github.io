"""Dependency-free checks for the contribution identity pages.

Run: python -m unittest discover -s tests -v
These checks do not claim to validate the entire pre-existing showroom site.
"""
import json
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://tussienorway.github.io"
PAGES = {"/": "index.html", "/about/": "about/index.html", "/open-source/odysseus/": "open-source/odysseus/index.html"}


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tags = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


class ContributionSiteTests(unittest.TestCase):
    def test_metadata_landmarks_and_ids(self):
        for url, filename in PAGES.items():
            with self.subTest(url=url):
                text = (ROOT / filename).read_text(encoding="utf-8")
                p = Page(text)
                self.assertEqual(sum(t == "h1" for t, _ in p.tags), 1)
                self.assertEqual(sum(t == "main" for t, _ in p.tags), 1)
                canonical = [a["href"] for t, a in p.tags if t == "link" and a.get("rel") == "canonical"]
                self.assertEqual(canonical, [BASE + url])
                self.assertTrue(any(t == "meta" and a.get("name") == "description" and a.get("content") for t, a in p.tags))
                self.assertTrue(any(t == "html" and a.get("lang") == "nb" for t, a in p.tags))
                ids = [a["id"] for _, a in p.tags if "id" in a]
                self.assertEqual(len(ids), len(set(ids)))
                self.assertNotRegex(text, r'(?i)<meta[^>]+content=["\'][^"\']*noindex')

    def test_new_page_internal_links_and_fragments(self):
        for filename in ["about/index.html", "open-source/odysseus/index.html"]:
            with self.subTest(page=filename):
                text = (ROOT / filename).read_text(encoding="utf-8")
                p = Page(text)
                ids = {a["id"] for _, a in p.tags if "id" in a}
                for _, attrs in p.tags:
                    href = attrs.get("href", "")
                    if not href or urlparse(href).scheme:
                        continue
                    if href.startswith("#"):
                        self.assertIn(href[1:], ids)
                        continue
                    path = ROOT / href.lstrip("/") if href.startswith("/") else ROOT / filename / ".." / href
                    if path.is_dir():
                        path = path / "index.html"
                    self.assertTrue(path.is_file(), f"Broken internal link: {filename}: {href}")

    def test_sitemap_and_robots(self):
        tree = ElementTree.parse(ROOT / "sitemap.xml")
        urls = [e.text for e in tree.findall("{*}url/{*}loc")]
        self.assertEqual(set(urls), {BASE + p for p in PAGES})
        self.assertEqual(len(urls), len(set(urls)))
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        self.assertIn("Sitemap: " + BASE + "/sitemap.xml", robots)
        self.assertNotIn("Disallow: /", robots)

    def test_profile_identity_not_affiliation(self):
        text = (ROOT / "about/index.html").read_text(encoding="utf-8")
        match = re.search(r'<script type="application/ld\+json">(.*?)</script>', text, re.S)
        self.assertIsNotNone(match, "ProfilePage JSON-LD is missing")
        assert match is not None
        data = json.loads(match.group(1))
        self.assertEqual(data["@type"], "ProfilePage")
        person = data["mainEntity"]
        self.assertEqual(person["name"], "tussienorway")
        self.assertEqual(person["sameAs"], ["https://github.com/tussienorway"])
        self.assertNotIn("memberOf", person)
        self.assertNotIn("affiliation", person)

    def test_validation_is_scoped_and_sourced(self):
        data = json.loads((ROOT / "open-source/odysseus/evidence.json").read_text(encoding="utf-8"))
        self.assertEqual(data["local_tests"]["passed"], 44)
        self.assertEqual(data["runtime"]["synthetic_facts_after"], 2)
        self.assertEqual(data["pr_status_at_check"], "open, not merged")
        text = (ROOT / "open-source/odysseus/index.html").read_text(encoding="utf-8")
        self.assertIn(data["pull_request"], text)
        self.assertIn(data["commit"], text)
        self.assertIn("ikke merget", text)
        self.assertIn("ikke hele prosjektet eller upstream-CI", text)

    def test_homepage_render_targets_and_credible_copy(self):
        text = (ROOT / "index.html").read_text(encoding="utf-8")
        p = Page(text)
        ids = {a["id"] for _, a in p.tags if "id" in a}
        targets = set(re.findall(r"\$\('#([^']+)'\)", text))
        self.assertFalse(targets - ids, f"Missing DOM targets: {targets - ids}")
        self.assertNotIn("totalPublicPages + 104", text)
        self.assertNotIn('href="b2b-showroom/dispatch.html"', text)
        self.assertNotIn("Offisielle Verifiserte Utvidelser", text)
        self.assertNotIn("Nasjonal referanseløsning", text)
        self.assertIn('href="/open-source/odysseus/"', text)


if __name__ == "__main__":
    unittest.main()
