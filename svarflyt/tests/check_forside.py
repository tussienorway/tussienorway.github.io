#!/usr/bin/env python3
"""Static checks for the Svarflyt front-page preview. No network."""

from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "assets" / "styles.css").read_text(encoding="utf-8")
js = (root / "assets" / "site.js").read_text(encoding="utf-8")

required = [
    "Forhåndsvisning. Ikke den offisielle siden.",
    "Få AI på jobb.",
    "Uten å ansette.",
    "Behovet først. Verktøyene etterpå.",
    "Jonathan@svarflyt.no",
    "Ingen kan love en bestemt plass",
    "Ingenting sendes",
    "noindex, nofollow",
    'lang="nb"',
    "mailto:Jonathan@svarflyt.no",
    "https://svarflyt.no/",
]
missing = [item for item in required if item not in html]
forbidden = ["937440669", "org.nr", "gtag", "googletagmanager", "clarity.ms", "facebook.net"]
found_forbidden = [item for item in forbidden if item in html.lower() or item in html]

errors = []
if missing:
    errors.append("mangler: " + ", ".join(missing))
if found_forbidden:
    errors.append("skal ikke være med: " + ", ".join(found_forbidden))
if "<h1" not in html or html.count("<h1") != 1:
    errors.append("skal ha nøyaktig én h1")
if "assets/styles.css" not in html or "assets/site.js" not in html:
    errors.append("relative asset-lenker mangler")
if "overflow-x" not in css and "box-sizing: border-box" not in css:
    errors.append("css mangler box-sizing")
if "prefers-reduced-motion" not in css:
    errors.append("mangler reduced-motion")
if "nav-open" not in js or "Escape" not in js:
    errors.append("meny-js er ufullstendig")
if not (root / "assets" / "mark.svg").is_file():
    errors.append("mark.svg mangler")

if errors:
    print("FEIL")
    for err in errors:
        print("-", err)
    sys.exit(1)
print("ok", len(required), "krav")
