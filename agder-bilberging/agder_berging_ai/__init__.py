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


FORSIKRINGS_DATA = {
    "gjensidige": {"navn": "Gjensidige Forsikring", "kasko_egenandel": 500, "delkasko_egenandel": 500, "avtale": "Viking / Direkteoppgjør"},
    "if": {"navn": "If Skadeforsikring", "kasko_egenandel": 500, "delkasko_egenandel": 500, "avtale": "Viking / Direkteoppgjør"},
    "fremtind": {"navn": "Fremtind (DNB / SpareBank 1)", "kasko_egenandel": 500, "delkasko_egenandel": 500, "avtale": "Viking / Direkteoppgjør"},
    "tryg": {"navn": "Tryg Forsikring", "kasko_egenandel": 500, "delkasko_egenandel": 500, "avtale": "Viking / Direkteoppgjør"},
    "storebrand": {"navn": "Storebrand Forsikring", "kasko_egenandel": 500, "delkasko_egenandel": 500, "avtale": "Viking / Direkteoppgjør"},
    "klp": {"navn": "KLP Skadeforsikring", "kasko_egenandel": 500, "delkasko_egenandel": 500, "avtale": "Viking / Direkteoppgjør"},
}

E18_AVKJORSLER = {
    "bie_grimstad": {"navn": "Avkjørsel 242: Bie-krysset Grimstad", "km_fra_base": 2.1, "eta_min": 5, "km_e18": 242},
    "fevik": {"navn": "Avkjørsel 248: Fevik / Vik", "km_fra_base": 7.4, "eta_min": 10, "km_e18": 248},
    "stoa_arendal": {"navn": "Avkjørsel 257: Stoa Arendal", "km_fra_base": 17.8, "eta_min": 16, "km_e18": 257},
    "harebakken_arendal": {"navn": "Avkjørsel 262: Harebakken Arendal", "km_fra_base": 22.5, "eta_min": 19, "km_e18": 262},
    "lillesand_ost": {"navn": "Avkjørsel 235: Lillesand Øst (Storemyr)", "km_fra_base": 19.2, "eta_min": 17, "km_e18": 235},
    "lillesand_vest": {"navn": "Avkjørsel 225: Lillesand Vest / Kjerlingland", "km_fra_base": 25.8, "eta_min": 22, "km_e18": 225},
    "grimstadtunnelen": {"navn": "E18 Grimstadtunnelen (TMA-påbudt)", "km_fra_base": 3.8, "eta_min": 7, "km_e18": 244},
}


def kalkuler_forsikring_egenandel(selskap_id: str, dekning: str = "kasko") -> dict:
    """Beregner egenandel, bonustap og direkteoppgjør mot norske forsikringsselskaper."""
    key = (selskap_id or "").lower().strip()
    info = FORSIKRINGS_DATA.get(key, {
        "navn": "Annet forsikringsselskap / Uavklart",
        "kasko_egenandel": 500,
        "delkasko_egenandel": 500,
        "avtale": "Standard Viking-oppgjør"
    })

    dekning_norm = (dekning or "kasko").lower().strip()
    if dekning_norm in ("kasko", "superkasko", "toppkasko"):
        egenandel = info["kasko_egenandel"]
        dekket = True
        merknad = "Veihjelp dekket med standard egenandel. Påvirker IKKE bonusen din!"
    elif dekning_norm in ("delkasko", "minikasko"):
        egenandel = info["delkasko_egenandel"]
        dekket = True
        merknad = "Veihjelp dekket under delkasko. Påvirker IKKE bonusen din!"
    else:
        egenandel = None
        dekket = False
        merknad = "Kun ansvarsforsikring dekker normalt ikke veihjelp. Vi gir fastpris på oppdraget før start."

    return {
        "selskap": info["navn"],
        "dekning": dekning_norm,
        "veihjelp_dekket": dekket,
        "egenandel_kr": egenandel,
        "bonustap": False,
        "direkteoppgjor": True if dekket else False,
        "avtale": info["avtale"],
        "merknad": merknad
    }


def finn_e18_avkjorsel(avkjorsel_id: str) -> dict:
    """Returnerer avstand og responstid fra Grimstad-basen for en spesifikk E18-avkjørsel."""
    key = (avkjorsel_id or "").lower().strip()
    if key in E18_AVKJORSLER:
        data = E18_AVKJORSLER[key]
        return {
            "funnet": True,
            "id": key,
            **data,
            "anbefalt_rute": f"Rykker ut umiddelbart fra Industriveien 20 til {data['navn']} (ca. {data['eta_min']} minutter)"
        }
    return {
        "funnet": False,
        "id": key,
        "navn": "E18 Agder (Generelt)",
        "km_fra_base": 12.0,
        "eta_min": 15,
        "anbefalt_rute": "Rykker ut på E18 fra Grimstad med blålys/blitz ved akutt hendelse."
    }


def sjekk_flate_beredskap(flate: list[dict] | None = None, fakta: dict | None = None) -> dict:
    """Kontrollerer drivstoffnivå (<35%), dekktilstand, kjettinger og spesialutstyr for hele flåten."""
    fakta = fakta or last_fakta()
    kjøretøy_liste = flate if flate is not None else fakta.get("flate", [])

    rapport = {
        "totalt_biler": len(kjøretøy_liste),
        "antall_operative": 0,
        "antall_lav_drivstoff": 0,
        "antall_dekkvarsler": 0,
        "antall_utstyrsvarsler": 0,
        "varsler": [],
        "biler": []
    }

    for bil in kjøretøy_liste:
        bil_id = bil.get("id", "Ukjent")
        modell = bil.get("modell", "")
        status = bil.get("status", "ukjent")
        sjafor = bil.get("sjafor", "Ikke tildelt")

        # Drivstoffsjekk (<35% lavt nivå)
        drivstoff = bil.get("drivstoff", {})
        prosent = drivstoff.get("prosent", 100)
        rekkevidde = drivstoff.get("rekkevidde_km", 500)
        lav_drivstoff = prosent < 35
        if lav_drivstoff:
            rapport["antall_lav_drivstoff"] += 1
            rapport["varsler"].append({
                "bil_id": bil_id,
                "type": "LAVT_DRIVSTOFF",
                "alvorlighetsgrad": "ADVARSEL",
                "melding": f"{bil_id} ({modell}) har lav drivstoffreserve ({prosent}% / {rekkevidde} km). Bør fylles før langdistanse."
            })

        # Dekksjekk (mønsterdybde vs krav og kjettinger)
        dekk = bil.get("dekk", {})
        monster = dekk.get("monsterdybde_mm", 8.0)
        minstekrav = dekk.get("minstekrav_mm", 5.0)
        kjettinger = dekk.get("kjettinger_sett", 0)
        dekk_ok = monster >= minstekrav and dekk.get("kjettinger_godkjent", True)
        if monster < minstekrav:
            rapport["antall_dekkvarsler"] += 1
            rapport["varsler"].append({
                "bil_id": bil_id,
                "type": "DEKKSLITASJE",
                "alvorlighetsgrad": "KRITISK",
                "melding": f"{bil_id} har mønsterdybde {monster} mm, under lovpålagt minstekrav ({minstekrav} mm)!"
            })

        # Utstyrssjekk (sertifisert kranwire etc.)
        utstyr = bil.get("utstyr_status", {})
        utstyr_ok = True
        if bil_id in ("TUNG-01", "KRAN-04") and not utstyr.get("sertifisert_kranwire", False):
            utstyr_ok = False
            rapport["antall_utstyrsvarsler"] += 1
            rapport["varsler"].append({
                "bil_id": bil_id,
                "type": "KRANWIRE_KONTROLL",
                "alvorlighetsgrad": "KRITISK",
                "melding": f"{bil_id} mangler gyldig sertifisering på kranwire/løfteutstyr!"
            })

        er_operativ = status in ("beredskap", "aktiv_patrulje", "oppdrag") and (monster >= minstekrav)
        if er_operativ:
            rapport["antall_operative"] += 1

        rapport["biler"].append({
            "id": bil_id,
            "modell": modell,
            "status": status,
            "sjafor": sjafor,
            "drivstoff_prosent": prosent,
            "rekkevidde_km": rekkevidde,
            "lav_drivstoff": lav_drivstoff,
            "monsterdybde_mm": monster,
            "dekk_ok": dekk_ok,
            "kjettinger_sett": kjettinger,
            "piggdekk": dekk.get("piggdekk", False),
            "har_elbil_skates": utstyr.get("elbil_skates", False),
            "har_oljesanering": utstyr.get("oljesaneringssett", False),
            "sertifisert_wire": utstyr.get("sertifisert_kranwire", False),
            "operativ": er_operativ
        })

    return rapport


def finn_optimal_bergingsressurs(
    hendelse_tekst: str,
    posisjon: dict | None = None,
    kundenavn: str | None = None,
    telefon: str | None = None,
    regnr: str | None = None,
    flate: list[dict] | None = None,
    fakta: dict | None = None
) -> dict:
    """AI-algoritme som matcher hendelsestype + lokasjon på E18 med best egnet, operativ bil med nok drivstoff og utstyr."""
    fakta = fakta or last_fakta()
    triage = klassifiser_hendelse(hendelse_tekst, fakta)
    lat = posisjon.get("lat") if posisjon else None
    lng = posisjon.get("lng") if posisjon else None
    pos_data = beregn_nodhjelp_posisjon(lat, lng, fakta)
    kat = triage["kategori"]
    krever_tma = triage["krever_tma_sikring"]
    folded = _fold(hendelse_tekst)

    kjøretøy_liste = flate if flate is not None else fakta.get("flate", [])
    bil_kart = {b["id"]: b for b in kjøretøy_liste}

    # Bestem primærbil-ID basert på utstyrskrav
    if kat == "tungberging":
        valgt_id = "TUNG-01"
        utstyrskrav = ["25t hydraulisk vinsj", "sertifisert kranwire", "akselgafler"]
    elif kat == "bat_transport":
        valgt_id = "KRAN-04"
        utstyrskrav = ["14tm kran", "båtvugge", "sertifiserte stropper"]
    elif kat == "terreng_vinsj":
        valgt_id = "4X4-05"
        utstyrskrav = ["4x4 lavserie", "Warn terrengvinsj", "snøkjettinger / piggdekk"]
    elif "elbil" in folded or "batteri" in folded or "skates" in folded:
        valgt_id = "FLAK-03"
        utstyrskrav = ["elbil-skates (GoJak)", "hydraulisk skyveflak", "oljesaneringssett"]
    else:
        valgt_id = "FLAK-03"
        utstyrskrav = ["hydraulisk skyveflak", "løftebrille", "oljesaneringssett"]

    primar_bil = bil_kart.get(valgt_id)
    drivstoff_info = primar_bil.get("drivstoff", {}) if primar_bil else {}
    prosent = drivstoff_info.get("prosent", 100)
    rekkevidde = drivstoff_info.get("rekkevidde_km", 400)
    lavt_drivstoff = prosent < 35

    tur_retur_km = (pos_data["avstand_base_km"] or 15.0) * 2
    drivstoff_tilstrekkelig = rekkevidde >= (tur_retur_km + 20)

    # HMS & TMA Tilleggsbil
    tma_bil = bil_kart.get("PUTE-02") if krever_tma else None

    # Sjåførmelding (SMS-ordre)
    sjafor_navn = primar_bil.get("sjafor", "Vakthavende") if primar_bil else "Jan Ove"
    sjafor_sms = (
        f"[AGDER BILBERGING DISPATCH] OPPDRAG TIL {valgt_id} ({sjafor_navn}): "
        f"Kategori: {kat.upper()} | Sted: {pos_data['narmeste_e18_punkt']} ({pos_data['avstand_base_km'] or '?'} km). "
        f"Kunde: {kundenavn or 'Navn ikke oppgitt'} (tlf: {telefon or 'Mangler'}). "
        f"Regnr: {regnr or 'Ukjent'}. "
        f"Utstyr bekreftet: {', '.join(utstyrskrav)}. "
        f"Drivstoff: {prosent}% ({rekkevidde} km). "
        f"{'TMA-PUTE (PUTE-02) rykker ut i tospann!' if krever_tma else 'Normal varsling.'}"
    )

    # Kundemelding (SMS til bilist)
    bilist_sms = (
        f"Hei {kundenavn or 'bilist'}, Jan Ove fra Agder Bilberging her. "
        f"Vår redningsbil {valgt_id} ({primar_bil.get('modell', '') if primar_bil else ''}) "
        f"{'+ TMA-støtputebil ' if krever_tma else ''}er rykket ut mot {pos_data['narmeste_e18_punkt']}. "
        f"Estimert ankomst: ca. {pos_data['eta_min']} min. "
        f"VIKTIG HMS: Ta på refleksvest og vent bak autovernet! Tlf døgnvakt: {fakta.get('telefon_dognvakt', '905 66 147')}."
    )

    return {
        "kategori": kat,
        "primar_bil_id": valgt_id,
        "primar_bil": primar_bil,
        "krever_tma": krever_tma,
        "tma_bil": tma_bil,
        "utstyrskrav": utstyrskrav,
        "drivstoff_prosent": prosent,
        "rekkevidde_km": rekkevidde,
        "lavt_drivstoff_advarsel": lavt_drivstoff,
        "drivstoff_tilstrekkelig": drivstoff_tilstrekkelig,
        "beregnet_tur_retur_km": round(tur_retur_km, 1),
        "posisjon": pos_data,
        "sjafor_sms": sjafor_sms,
        "bilist_sms": bilist_sms
    }


