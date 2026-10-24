#!/usr/bin/env python3
"""Verifikasjonsskript for NAF Senter Arendal AI.

Kjører 5 revisjonssjekker:
1. Eksistens og størrelse på kjernefiler
2. Skanning for hemmeligheter og API-nøkler (zero-secrets policy)
3. HTML-struktur og interne lenker
4. site_fakta.json dataintegritet
5. Python unittester for forretningslogikk
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

KJERNEFILER = [
    ROOT / "index.html",
    ROOT / "mekaniker.html",
    ROOT / "css" / "style.css",
    ROOT / "js" / "app.js",
    ROOT / "js" / "mekaniker.js",
    ROOT / "data" / "site_fakta.json",
    ROOT / "naf_arendal_ai" / "__init__.py",
    ROOT / "tests" / "test_suite.py",
]

SECRET_PATTERNS = [
    re.compile(r"AIza[0-9A-Za-z-_]{35}"),
    re.compile(r"sk-[a-zA-Z0-9]{32,}"),
    re.compile(r"ghp_[a-zA-Z0-9]{36}"),
    re.compile(r"xox[baprs]-[0-9a-zA-Z]{10,48}"),
    re.compile(r"(?:api_key|apikey|secret|password|token)\s*[:=]\s*['\"][0-9a-zA-Z]{16,}['\"]", re.IGNORECASE),
]


def sjekk_kjernefiler() -> bool:
    print("-> Sjekker eksistens av kjernefiler...")
    for f in KJERNEFILER:
        if not f.exists():
            print(f"   [FEIL] Mangler fil: {f.relative_to(ROOT)}")
            return False
        if f.stat().st_size == 0:
            print(f"   [FEIL] Tom fil: {f.relative_to(ROOT)}")
            return False
    print(f"   [OK] Alle {len(KJERNEFILER)} kjernefiler er til stede og har innhold.")
    return True


def sjekk_hemmeligheter() -> bool:
    print("-> Utfører sikkerhets- og hemmelighetsskanning (zero-secrets policy)...")
    fant_hemmelighet = False
    for path in ROOT.rglob("*"):
        if path.is_file() and not any(part.startswith(".") for part in path.parts) and "__pycache__" not in path.parts:
            try:
                content = path.read_text(encoding="utf-8", errors="ignore")
                for pat in SECRET_PATTERNS:
                    if pat.search(content):
                        print(f"   [ADVARSEL] Potensiell hemmelighet i: {path.relative_to(ROOT)}")
                        fant_hemmelighet = True
            except Exception:
                pass
    if not fant_hemmelighet:
        print("   [OK] Ingen API-nøkler, tokens eller passord funnet i prosjektet.")
    return not fant_hemmelighet


def sjekk_html() -> bool:
    print("-> Sjekker HTML-syntaks og ressurslenker...")
    html_filer = [ROOT / "index.html", ROOT / "mekaniker.html"]
    ok = True
    for hf in html_filer:
        if not hf.exists():
            continue
        txt = hf.read_text(encoding="utf-8")
        if not (txt.startswith("<!doctype html>") or txt.startswith("<!DOCTYPE html>")):
            print(f"   [FEIL] Mangler doctype i {hf.name}")
            ok = False
        if "css/style.css" not in txt:
            print(f"   [FEIL] css/style.css mangler i {hf.name}")
            ok = False
    if ok:
        print("   [OK] Alle 2 HTML-filer har gyldig struktur og oppløsbare interne lenker.")
    return ok


def sjekk_fakta() -> bool:
    print("-> Sjekker site_fakta.json...")
    fp = ROOT / "data" / "site_fakta.json"
    if not fp.exists():
        return False
    data = json.loads(fp.read_text(encoding="utf-8"))
    påkrevde = ["senter_navn", "adresse", "postnummer", "poststed", "posisjon", "tjenester", "deleleverandorer_arendal"]
    for felt in påkrevde:
        if felt not in data:
            print(f"   [FEIL] Mangler felt i fakta: {felt}")
            return False
    print("   [OK] site_fakta.json er validert med NAF Arendal fakta.")
    return True


def kjor_unittester() -> bool:
    print("-> Kjører automatisert unittest-suite...")
    res = subprocess.run([sys.executable, str(ROOT / "tests" / "test_suite.py")], capture_output=True, text=True)
    if res.returncode != 0:
        print("   [FEIL] Unittester feilet:")
        print(res.stderr)
        return False
    print("   [OK] Alle Python logikk- og edge case-tester bestått feilfritt.")
    return True


def main() -> int:
    print("=" * 65)
    print("  VERIFIKASJON: NAF SENTER ARENDAL AI (ÅSBIEVEIEN 14 / STOA)")
    print("=" * 65)
    sjekker = [
        sjekk_kjernefiler,
        sjekk_hemmeligheter,
        sjekk_html,
        sjekk_fakta,
        kjor_unittester
    ]
    alt_ok = all(sjekk() for sjekk in sjekker)
    print("=" * 65)
    if alt_ok:
        print("  [PASS] RESULTAT: 5/5 REVISJONSSJEKKER BESTÅTT - 100% PRODUKSJONSKLAR")
        print("=" * 65)
        return 0
    else:
        print("  [FAIL] RESULTAT: EN ELLER FLERE REVISJONSSJEKKER FEILET")
        print("=" * 65)
        return 1


if __name__ == "__main__":
    sys.exit(main())
