"""Agder Bilberging AI - Kjerne- og forretningslogikk.

Verifiserte data fra Agder Bilberging AS (Grimstad, E18 Agder).
Modulen håndterer:
- Triage av ulykker og havari
- Posisjonsanalyse og responstidsberegning for E18 Agder
- TMA-krav (sikring med støtputebil)
- Båt- og spesialtransportkalkyle
- Strukturert oppdragsformatering
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FAKTA_PATH = ROOT / "data" / "site_fakta.json"

# Nøkkelord for klassifisering
HENDELSE_ORD = {
    "tungberging": (
        "vogntog", "lastebil", "trailer", "semi", "buss", "anleggsmaskin",
        "graver", "hjullaster", "akselbrudd", "velt", "velte", "tungt", "tømmerbil"
    ),
    "tma_sikring": (
        "e18", "motorvei", "kjørefelt", "midt autovern", "tunnel",
        "påkjørsel", "varsling", "dirigering", "pute", "støtpute", "tma"
    ),
    "bat_transport": (
        "båt", "bat", "skjærgårdsjeep", "daycruiser", "snekke", "seilbåt",
        "marina", "gjestehavn", "opplag", "båtløft", "kraning", "brygge"
    ),
    "terreng_vinsj": (
        "grøft", "groft", "utfor", "skråning", "myr", "snøfonn", "snofonn",
        "hyttefelt", "skogsvei", "isete", "fastkjørt", "offroad"
    ),
    "akutt_berging": (
        "flatt batteri", "starthjelp", "punktering", "dekk", "feilfylling",
        "bensin", "diesel", "nøkkel", "utelåst", "elbil", "stans", "motorstopp"
    )
}


def last_fakta(path: Path | None = None) -> dict:
    target = path or FAKTA_PATH
    return json.loads(target.read_text(encoding="utf-8"))


def _fold(text: str) -> str:
    if not text:
        return ""
    text = text.lower().replace("ø", "o").replace("æ", "ae").replace("å", "a")
    text = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def _match_keyword(kw: str, folded_text: str) -> bool:
    folded_kw = _fold(kw).strip()
    if not folded_kw:
        return False
    # Spesiell håndtering for båt/bat for å unngå kollisjon med batteri/debatt
    if folded_kw in ("bat", "bat "):
        return bool(re.search(r"\b(bat|baten|bater|batene|battransport|batloft)\b", folded_text))
    # Sammensatte norske ord som f.eks. "Grimstadtunnelen", "motorveibru", "tømmerbil"
    if folded_kw in ("tunnel", "motorvei", "vogntog", "lastebil", "stotpute", "tommerbil", "skogsvei"):
        return folded_kw in folded_text
    pattern = r"(?<!\w)" + re.escape(folded_kw) + r"(?!\w)"
    return bool(re.search(pattern, folded_text))


def klassifiser_hendelse(tekst: str, fakta: dict | None = None) -> dict:
    """Klassifiser hendelsestype og vurder behov for TMA-sikringsbil."""
    fakta = fakta or last_fakta()
    folded = _fold(tekst)

    treff_kategorier = []
    for kat, ordliste in HENDELSE_ORD.items():
        if any(_match_keyword(w, folded) for w in ordliste):
            treff_kategorier.append(kat)

    # Spesifikk sjekk for motorvei/E18 sikring (TMA er påkrevd av HMS-hensyn)
    krever_tma = any(_match_keyword(kw, folded) for kw in ("e18", "motorvei", "tunnel", "kjorefelt", "venstre felt", "hoyre felt", "stotpute", "tma"))

    # Bestem primærkategori
    if "tungberging" in treff_kategorier:
        primar = "tungberging"
        anbefalt_bil = "Scania R580 8x4 Tungberger (TUNG-01)"
    elif "bat_transport" in treff_kategorier:
        primar = "bat_transport"
        anbefalt_bil = "Iveco Eurocargo med kran og båtvugge (KRAN-04)"
    elif "terreng_vinsj" in treff_kategorier:
        primar = "terreng_vinsj"
        anbefalt_bil = "Toyota Land Cruiser 4x4 Offroad (4X4-05)"
    elif "akutt_berging" in treff_kategorier:
        primar = "akutt_berging"
        anbefalt_bil = "MAN TGL Flakbil med elbil-skates (FLAK-03)"
    else:
        primar = "akutt_berging"  # Standard berging/veihjelp
        anbefalt_bil = "MAN TGL Flakbil (FLAK-03)"

    return {
        "kategori": primar,
        "alle_treff": treff_kategorier,
        "krever_tma_sikring": krever_tma,
        "tma_bil": "Mercedes-Benz Atego TMA Støtputebil (PUTE-02)" if krever_tma else None,
        "anbefalt_primarressurs": anbefalt_bil,
        "sikkerhetsadvarsel": "TMA-støtputebil rykker ut i tospann for å skjerme ulykkesstedet på E18." if krever_tma else "Normal varsling og blitzlys tilstrekkelig."
    }


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Beregner avstand i km med Haversine-formelen."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(r * c, 2)


def beregn_nodhjelp_posisjon(lat: float | None, lng: float | None, fakta: dict | None = None) -> dict:
    """Beregner nærmeste base, avstand og estimert ankomsttid (ETA)."""
    if lat is None or lng is None:
        return {
            "status": "mangler_posisjon",
            "lat": None,
            "lng": None,
            "avstand_base_km": None,
            "eta_min": None,
            "narmeste_e18_punkt": "Ukjent (GPS mangler)",
            "avstand_e18_punkt_km": None,
            "innenfor_dekningsomraade": False,
            "anbefalt_rute": "Posisjon mangler. Nødsentralen må innhente posisjon manuelt."
        }

    fakta = fakta or last_fakta()
    base = fakta["posisjon"]
    avstand_base = haversine_km(lat, lng, base["lat"], base["lng"])

    # Finn nærmeste E18-punkt
    punkter = fakta["dekningsomraade"]["kritiske_punkter"]
    narmeste = min(punkter, key=lambda p: haversine_km(lat, lng, p["lat"], p["lng"]))
    avstand_punkt = haversine_km(lat, lng, narmeste["lat"], narmeste["lng"])

    # Estimert kjøretid: snitt 70 km/t utrykning + 8 min klargjøring
    eta_minutter = max(10, int(8 + (avstand_base / 70.0) * 60))

    # Er det i kjerneområdet? (Under 75 km fra Grimstad)
    innenfor = avstand_base <= 75.0

    return {
        "status": "posisjonert",
        "lat": lat,
        "lng": lng,
        "avstand_base_km": avstand_base,
        "narmeste_e18_punkt": narmeste["navn"],
        "avstand_e18_punkt_km": avstand_punkt,
        "eta_min": eta_minutter,
        "innenfor_dekningsomraade": innenfor,
        "anbefalt_rute": f"Utrykning fra {base['navn']} via E18 mot {narmeste['navn']} (ca. {eta_minutter} min)"
    }


def kalkuler_bat_og_spesialtransport(lengde_fot: float, vekt_tonn: float, distanse_km: float = 15.0) -> dict:
    """Beregner utstyrsvalg og prisanslag for båttransport i Agder-skjærgården."""
    if lengde_fot <= 0 or vekt_tonn <= 0:
        return {
            "gyldig": False,
            "feil": "Båtlengde og vekt må være positive tall over 0."
        }

    if lengde_fot > 36 or vekt_tonn > 10.0:
        return {
            "gyldig": True,
            "klasse": "tung_spesialtransport",
            "krever_dispensasjon": True,
            "anbefalt_utstyr": "Scania R580 8x4 med lavbygd maskinhenger og følgebil",
            "pris_anslag_kr": None,
            "grunn": "Fartøyet overskrider standardmål. Krever manuell befaring og dispensasjonssøknad til Statens vegvesen."
        }

    # Standardbåt (inntil 24 fot og 2.5 tonn)
    if lengde_fot <= 24 and vekt_tonn <= 2.5:
        klasse = "standard_bat"
        bil = "Iveco Eurocargo med båtvugge (KRAN-04)"
        grunnpris = 2800
        km_sats = 45
        kraning = 1200
    else:
        # Stor båt / cabincruiser (25-36 fot eller 2.5-10 tonn)
        klasse = "tung_bat"
        bil = "Scania R580 med tung kran og spesialramme"
        grunnpris = 4500
        km_sats = 65
        kraning = 2500

    totalt_kr = int(grunnpris + kraning + (distanse_km * km_sats))

    return {
        "gyldig": True,
        "klasse": klasse,
        "krever_dispensasjon": False,
        "lengde_fot": lengde_fot,
        "vekt_tonn": vekt_tonn,
        "distanse_km": distanse_km,
        "anbefalt_bil": bil,
        "estimat_kr": totalt_kr,
        "spesifikasjon": {
            "grunngebyr_kr": grunnpris,
            "kraning_og_stropping_kr": kraning,
            "transport_kr": int(distanse_km * km_sats),
            "forsikring_inkludert": "Godsansvarsforsikring inntil 2 000 000 kr"
        }
    }


def valider_telefon(tlf: str) -> bool:
    """Validerer norsk telefonnummer (8 siffer, eller +47/0047)."""
    if not tlf:
        return False
    clean = re.sub(r"[\s\-\(\)]", "", tlf)
    if clean.startswith("+47"):
        clean = clean[3:]
    elif clean.startswith("0047"):
        clean = clean[4:]
    return bool(re.match(r"^[49]\d{7}$", clean) or re.match(r"^\d{8}$", clean))


def opprett_nodanrop(
    tekst: str,
    posisjon: dict | None = None,
    kundenavn: str | None = None,
    telefon: str | None = None,
    registreringsnummer: str | None = None,
    fakta: dict | None = None
) -> dict:
    """Bygger et komplett, strukturert nødanrop tilpasset vaktsentralen."""
    fakta = fakta or last_fakta()
    triage = klassifiser_hendelse(tekst, fakta)

    lat = posisjon.get("lat") if posisjon else None
    lng = posisjon.get("lng") if posisjon else None
    pos_data = beregn_nodhjelp_posisjon(lat, lng, fakta)

    mangler = []
    if not kundenavn or len(kundenavn.strip()) < 2:
        mangler.append("kundenavn")
    if not telefon or not valider_telefon(telefon):
        mangler.append("gyldig_telefon")
    if not tekst or len(tekst.strip()) < 5:
        mangler.append("beskrivelse_av_uhell")

    # Prioritering
    er_e18 = triage["krever_tma_sikring"]
    if er_e18 or "kollisjon" in _fold(tekst) or "skade" in _fold(tekst):
        prioritet = "P1_KRITISK"
    elif "motorstopp" in _fold(tekst) or "punktering" in _fold(tekst):
        prioritet = "P2_HASTER"
    else:
        prioritet = "P3_NORMAL"

    vakt_dispatch_sms = (
        f"[AGDER BILBERGING VAKT] {prioritet}: {triage['kategori'].upper()} | "
        f"Kunde: {kundenavn or 'Ikke oppgitt'} ({telefon or 'Mangler'}) | "
        f"Regnr: {registreringsnummer or 'Ukjent'} | "
        f"Sted: {pos_data['narmeste_e18_punkt']} ({pos_data['avstand_base_km'] or '?'} km) | "
        f"Bil: {triage['anbefalt_primarressurs']}"
    )

    return {
        "status": "opprettet" if not mangler else "ufullstendig",
        "prioritet": prioritet,
        "mangler": mangler,
        "triage": triage,
        "posisjon": pos_data,
        "kunde": {
            "navn": kundenavn,
            "telefon": telefon,
            "regnr": registreringsnummer.upper() if registreringsnummer else None
        },
        "tekst": tekst.strip(),
        "vakt_dispatch_sms": vakt_dispatch_sms,
        "vakttelefon": fakta["telefon_dognvakt"],
        "viking_sentral": fakta["telefon_viking"]
    }
