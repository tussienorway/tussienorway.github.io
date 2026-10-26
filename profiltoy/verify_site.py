#!/usr/bin/env python3
"""Automatisert verifikasjons- og kvalitetsrevisjon for Profiltøy AS (Lillesand) B2B Plattform.

Sjekker:
1. Eksistens av alle påkrevde kjernefiler
2. Null hemmeligheter / API-nøkler (zero-secrets policy)
3. HTML-integritet, CSS og ressurslenker
4. Faktualitet, forretningsdata og arbitrage-katalog
5. Kjøring av alle automatiserte enhetstester
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

REQUIRED_FILES = [
    ROOT / "index.html",
    ROOT / "css" / "style.css",
    ROOT / "js" / "three_visualizer.js",
    ROOT / "js" / "app.js",
    ROOT / "data" / "site_fakta.json",
    ROOT / "tests" / "test_suite.py",
]

SECRET_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9]{20,}", re.IGNORECASE),
    re.compile(r"ghp_[a-zA-Z0-9]{20,}", re.IGNORECASE),
    re.compile(r"AIzaSy[a-zA-Z0-9_\-]{30,}", re.IGNORECASE),
    re.compile(r"bearer\s+[a-zA-Z0-9_\-\.]{30,}", re.IGNORECASE),
    re.compile(r"-----BEGIN (RSA|EC|PRIVATE) KEY-----"),
]


def audit_files_exist():
    print("-> Sjekker eksistens av kjernefiler...")
    for f in REQUIRED_FILES:
        if not f.exists():
            raise FileNotFoundError(f"Mangler påkrevd fil: {f}")
        if f.stat().st_size == 0:
            raise ValueError(f"Fil er tom: {f}")
    print(f"   [OK] Alle {len(REQUIRED_FILES)} kjernefiler er til stede og har innhold.")


def audit_no_secrets():
    print("-> Utfører sikkerhetsskanning (zero-secrets policy)...")
    for ext in ("*.html", "*.js", "*.css", "*.py", "*.json", "*.md"):
        for path in ROOT.rglob(ext):
            if ".git" in path.parts:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            for pat in SECRET_PATTERNS:
                if pat.search(text):
                    raise ValueError(f"Fant potensiell API-hemmelighet i {path.name}")
    print("   [OK] Ingen API-nøkler, passord eller hemmeligheter funnet i kildekoden.")


def audit_html_and_links():
    print("-> Sjekker HTML-syntaks og ressurslenker...")
    html_files = [ROOT / "index.html"]
    for hf in html_files:
        content = hf.read_text(encoding="utf-8")
        assert "<!doctype html>" in content.lower(), f"Mangler doctype i {hf.name}"
        assert '<meta name="viewport"' in content.lower(), f"Mangler viewport i {hf.name}"
        assert "<title>" in content.lower(), f"Mangler tittel i {hf.name}"

        # Sjekk interne lenker (href/src)
        links = re.findall(r'(?:href|src)=["\']([^"\']+)["\']', content)
        for link in links:
            if link.startswith(("http:", "https:", "tel:", "mailto:", "#", "../")):
                continue
            target_path = (hf.parent / link).resolve()
            if not target_path.exists():
                raise FileNotFoundError(f"Ugyldig ressursreferanse i {hf.name}: {link}")
    print(f"   [OK] Alle interne filreferanser er gyldige og oppløselige.")


def audit_json_fakta():
    print("-> Sjekker site_fakta.json...")
    fakta_path = ROOT / "data" / "site_fakta.json"
    data = json.loads(fakta_path.read_text(encoding="utf-8"))
    assert data["bedrift"]["orgnr"] == "923 564 721", "Ugyldig orgnr"
    assert len(data["katalog_arbitrage_dropship"]) >= 5, "Mangler produkter i arbitragekatalogen"
    print("   [OK] site_fakta.json er validert med offisielle Brønnøysund-fakta.")


def run_unit_tests():
    print("-> Kjører automatisert unittest-suite...")
    cmd = [sys.executable, str(ROOT / "tests" / "test_suite.py")]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stdout)
        print(res.stderr)
        raise RuntimeError("Enhetstester feilet!")
    print("   [OK] Alle enhetstester bestått (100% grønt).")


def main():
    print("=" * 65)
    print("PROFILTØY AS · SYSTEMREVISJON OG VERIFIKASJON")
    print("=" * 65)
    try:
        audit_files_exist()
        audit_no_secrets()
        audit_html_and_links()
        audit_json_fakta()
        run_unit_tests()
        print("=" * 65)
        print(">> ALLE VERIFIKASJONSSTEG VELLYKKET GJENNOMFØRT!")
        print("=" * 65)
    except Exception as e:
        print(f"\n[FEIL] Verifikasjon stoppet med feil: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
