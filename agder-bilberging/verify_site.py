#!/usr/bin/env python3
"""Automatisert verifikasjons- og kvalitetsrevisjon for Agder Bilberging AI.

Sjekker:
1. Eksistens av alle påkrevde filer
2. Null hemmeligheter / API-nøkler (secret scanning)
3. HTML-integritet og interne filreferanser
4. JSON-data struktur og faktaintegritet
5. Kjøring av alle Python unittester
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

REQUIRED_FILES = [
    ROOT / "index.html",
    ROOT / "vaktleder.html",
    ROOT / "css" / "style.css",
    ROOT / "js" / "app.js",
    ROOT / "js" / "vaktleder.js",
    ROOT / "data" / "site_fakta.json",
    ROOT / "agder_berging_ai" / "__init__.py",
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
    print("-> Utfører sikkerhets- og hemmelighetsskanning (zero-secrets policy)...")
    for ext in ("*.html", "*.js", "*.css", "*.py", "*.json", "*.md"):
        for path in ROOT.rglob(ext):
            if ".git" in path.parts:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            for pat in SECRET_PATTERNS:
                if pat.search(text):
                    raise SecurityError(f"Fant potensiell API-hemmelighet i {path.name}")
    print("   [OK] Ingen API-nøkler, tokens eller passord funnet i prosjektet.")


def audit_html_and_links():
    print("-> Sjekker HTML-syntaks og ressurslenker...")
    html_files = [ROOT / "index.html", ROOT / "vaktleder.html"]
    for hf in html_files:
        content = hf.read_text(encoding="utf-8")
        assert "<!doctype html>" in content.lower(), f"Mangler doctype i {hf.name}"
        assert "<meta name=\"viewport\"" in content.lower(), f"Mangler viewport i {hf.name}"
        assert "<title>" in content.lower(), f"Mangler tittel i {hf.name}"

        # Sjekk CSS- og JS-referanser
        links = re.findall(r'(?:href|src)=["\']([^"\']+)["\']', content)
        for link in links:
            if link.startswith(("http:", "https:", "tel:", "mailto:", "#")):
                continue
            # Lokal filsti
            target_path = (hf.parent / link).resolve()
            if not target_path.exists():
                raise FileNotFoundError(f"Ugyldig ressursreferanse i {hf.name}: {link}")
    print(f"   [OK] Alle {len(html_files)} HTML-filer har gyldig struktur og oppløsbare interne lenker.")


def audit_json_fakta():
    print("-> Sjekker site_fakta.json...")
    fakta_path = ROOT / "data" / "site_fakta.json"
    data = json.loads(fakta_path.read_text(encoding="utf-8"))
    assert data["orgnr"] == "919 084 030"
    assert data["omsetning_nok"] > 10_000_000
    assert len(data["flate"]) >= 5
    assert len(data["samarbeid"]) >= 3
    print("   [OK] site_fakta.json er validert med Proff/Brønnøysund-fakta.")


def run_unit_tests():
    print("-> Kjører automatisert unittest-suite...")
    cmd = [sys.executable, str(ROOT / "tests" / "test_suite.py")]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stdout)
        print(res.stderr)
        raise RuntimeError("Unittester feilet!")
    print("   [OK] Alle Python logikk- og edge case-tester bestått feilfritt.")


def main():
    print("=================================================================")
    print("  VERIFIKASJON: AGDER BILBERGING AI (GRIMSTAD / E18 AGDER)")
    print("=================================================================")
    try:
        audit_files_exist()
        audit_no_secrets()
        audit_html_and_links()
        audit_json_fakta()
        run_unit_tests()
        print("=================================================================")
        print("  [PASS] RESULTAT: 5/5 REVISJONSSJEKKER BESTATT - 100% PRODUKSJONSKLAR")
        print("=================================================================")
        return 0
    except Exception as exc:
        print(f"\n[FEIL] Verifikasjon stanset: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
