"""NAF Senter Arendal AI - Kjerne- og forretningslogikk.

Verifiserte data for NAF Senter Arendal (Åsbieveien 14, 4848 Arendal).
Modulen håndterer:
- Kjøretøyoppslag, elbil/fossil-differensiering og EU-kontrollberegning
- AI Delesøk og lokal grossist-lagerstatus i Arendal (Meca, Mekonomen, Romnes)
- AI OBD2 DTC feilkodetriage for verkstedmekanikerne
- PKK (Periodisk kjøretøykontroll) feilgradsbedømmelse (Grad 1, 2, 3)
- NAF Medlemsfordeler og priskalkyler
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT = Path(__file__).resolve().parents[1]
FAKTA_PATH = ROOT / "data" / "site_fakta.json"

# Norske elbilskilter
ELBIL_PREFIXER = ("EL", "EK", "EV", "EB", "EC", "ED", "EE", "EF")


def last_fakta(path: Optional[Path] = None) -> Dict[str, Any]:
    target = path or FAKTA_PATH
    return json.loads(target.read_text(encoding="utf-8"))


def _fold(text: str) -> str:
    if not text:
        return ""
    text = text.lower().replace("ø", "o").replace("æ", "ae").replace("å", "a")
    text = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def valider_og_normaliser_regnr(regnr: str) -> Optional[str]:
    """Validerer og normaliserer et norsk bilregistreringsnummer (f.eks. 'EK 12345' -> 'EK12345')."""
    if not regnr:
        return None
    clean = re.sub(r"[\s\-\.]", "", regnr).upper()
    # Norsk standard: 2 bokstaver + 5 siffer (eller 4 siffer for tilhengere/motorsykler)
    if re.match(r"^[A-Z]{2}\d{4,5}$", clean):
        return clean
    return None


def sla_opp_kjoretoy(regnr: str) -> Dict[str, Any]:
    """
    Kjøretøyoppslag med drivlinje-deteksjon, EU-kontrollfrist og NAF-anbefalinger.
    (Støtter full offline-deterministisk vurdering for Arendal-senteret).
    """
    clean_reg = valider_og_normaliser_regnr(regnr)
    if not clean_reg:
        return {
            "gyldig": False,
            "feil": "Ugyldig registreringsnummer. Oppgi 2 bokstaver og 5 siffer (f.eks. EK 12345)."
        }

    prefix = clean_reg[:2]
    siste_siffer = int(clean_reg[-1])

    er_elbil = prefix in ELBIL_PREFIXER
    drivlinje = "Elektrisk (Elbil)" if er_elbil else "Fossil (Bensin/Diesel/Hybrid)"

    # Fastsett kontrollmåned etter siste siffer i kjennemerket iht. Statens vegvesen reglene
    # 1: januar, 2: februar ... 0: oktober (nov/des er åpne)
    kontroll_mnd_nr = 10 if siste_siffer == 0 else siste_siffer
    if kontroll_mnd_nr > 10:
        kontroll_mnd_nr = 10

    mnd_navn = [
        "", "Januar", "Februar", "Mars", "April", "Mai", "Juni",
        "Juli", "August", "September", "Oktober", "November", "Desember"
    ]
    kontroll_mnd_tekst = mnd_navn[kontroll_mnd_nr]

    # Spesifikke testanbefalinger for biltypen
    if er_elbil:
        fokusomrader = [
            "Høyspenningssikkerhet og ladeinntak",
            "NAF Aviloo Batterihelse-test (State of Health)",
            "Bremseskiver bak (ofte utsatt for rust pga. regenerativ bremsing)",
            "Forstillingsslitasje pga. høy egenvekt"
        ]
        anbefalt_test = "NAF Aviloo Elbil Batteritest + EU-kontroll"
    else:
        fokusomrader = [
            "Avgassmåling (CO/HC for bensin, k-verdi røykgass for diesel)",
            "Partikkelfilter (DPF) og EGR-ventil status",
            "Bremsevæskekokepunkt og bremsevirkning",
            "Understellsrust og foringer i oppheng"
        ]
        anbefalt_test = "EU-kontroll + NAF Eierskifte/Garantiutløpstest"

    return {
        "gyldig": True,
        "regnr": clean_reg,
        "drivlinje": drivlinje,
        "er_elbil": er_elbil,
        "kontrollmåned": kontroll_mnd_tekst,
        "anbefalt_test": anbefalt_test,
        "fokusomrader": fokusomrader,
        "senter_lokasjon": "Åsbieveien 14, 4848 Arendal (Stoa)"
    }


# Lokalt grossistlager og deledatabase for Arendal-mekanikerne
DELE_KATALOG = {
    "brems": {
        "komponent": "Bremseskiver & Klosser (Foran)",
        "oem_eksempel": "09.9772.11 / P 85 020 (Brembo)",
        "leverandor": "Meca Arendal (Stoa)",
        "lagerstatus": "PÅ LAGER (Stoa)",
        "budtid_min": 25,
        "veiledende_pris_kr": 2150,
        "normtid_timer": 1.2
    },
    "bremsevaske": {
        "komponent": "Bremsevæske DOT 4 LV (Lavviskositet)",
        "oem_eksempel": "Castrol React DOT4 / Motul",
        "leverandor": "Mekonomen Arendal (Vesterveien)",
        "lagerstatus": "PÅ LAGER (Arendal)",
        "budtid_min": 20,
        "veiledende_pris_kr": 380,
        "normtid_timer": 0.6
    },
    "baerearm": {
        "komponent": "Bærearm / Bærekule (Nedre forstilling)",
        "oem_eksempel": "Lemförder 38442 01",
        "leverandor": "Meca Arendal (Stoa)",
        "lagerstatus": "PÅ LAGER (Stoa)",
        "budtid_min": 25,
        "veiledende_pris_kr": 1890,
        "normtid_timer": 1.5
    },
    "hjullager": {
        "komponent": "Hjullagersett med integrert ABS-magnetring",
        "oem_eksempel": "SKF VKBA 3643",
        "leverandor": "Romnes Agder (Arendal)",
        "lagerstatus": "PÅ LAGER (Arendal)",
        "budtid_min": 35,
        "veiledende_pris_kr": 1650,
        "normtid_timer": 1.4
    },
    "fjaer": {
        "komponent": "Chassisfjær (Brudd på nedre vinding)",
        "oem_eksempel": "Lesjöfors 4082931 / Sachs",
        "leverandor": "Mekonomen Arendal",
        "lagerstatus": "PÅ LAGER (Arendal)",
        "budtid_min": 30,
        "veiledende_pris_kr": 1250,
        "normtid_timer": 1.6
    },
    "stotdemper": {
        "komponent": "Gass-støtdemper (Lekkasje/svetting)",
        "oem_eksempel": "Bilstein B4 22-151056",
        "leverandor": "Hellanor / NDS Group Sør",
        "lagerstatus": "Fjernlager (Levering kl 11:30)",
        "budtid_min": 60,
        "veiledende_pris_kr": 1490,
        "normtid_timer": 1.5
    },
    "egr": {
        "komponent": "EGR-ventil med kjøler (Sotet / hengt seg)",
        "oem_eksempel": "Wahler 710327D / VAG OEM",
        "leverandor": "Meca Arendal (Stoa)",
        "lagerstatus": "PÅ LAGER (Stoa)",
        "budtid_min": 25,
        "veiledende_pris_kr": 4200,
        "normtid_timer": 2.8
    },
    "dpf": {
        "komponent": "Differansetrykksensor DPF",
        "oem_eksempel": "Bosch 0 281 006 005",
        "leverandor": "Romnes Agder (Arendal)",
        "lagerstatus": "PÅ LAGER (Arendal)",
        "budtid_min": 30,
        "veiledende_pris_kr": 980,
        "normtid_timer": 0.7
    },
    "12v_batteri": {
        "komponent": "12V Startbatteri AGM 70Ah / 760A",
        "oem_eksempel": "Varta Silver Dynamic AGM E39",
        "leverandor": "Meca Arendal (Stoa)",
        "lagerstatus": "PÅ LAGER (Stoa)",
        "budtid_min": 25,
        "veiledende_pris_kr": 2490,
        "normtid_timer": 0.5
    }
}


def finn_bildeler_ai(symptom_eller_del: str, regnr: Optional[str] = None) -> Dict[str, Any]:
    """
    AI-støttet delesøk for NAF Senter Arendal.
    Matcher fritekst og feilbeskrivelser mot lokale grossistlagre på Stoa/Arendal.
    """
    folded = _fold(symptom_eller_del)
    clean_reg = valider_og_normaliser_regnr(regnr) if regnr else None

    # Søk i katalog
    treff_nokkel = None
    if any(k in folded for k in ("brems", "skive", "kloss", "bremsekloss", "rust")):
        treff_nokkel = "brems"
    elif any(k in folded for k in ("baerearm", "baerekule", "slark", "forstilling")):
        treff_nokkel = "baerearm"
    elif any(k in folded for k in ("hjullager", "hvinelyd", "rumling", "abs")):
        treff_nokkel = "hjullager"
    elif any(k in folded for k in ("fjaer", "knekt", "vinding")):
        treff_nokkel = "fjaer"
    elif any(k in folded for k in ("demper", "stotdemper", "oljesvetting")):
        treff_nokkel = "stotdemper"
    elif any(k in folded for k in ("egr", "eksos", "sot", "ugjevn")):
        treff_nokkel = "egr"
    elif any(k in folded for k in ("dpf", "partikkelfilter", "regenerering", "differansetrykk")):
        treff_nokkel = "dpf"
    elif any(k in folded for k in ("batteri", "start", "flatt", "12v")):
        treff_nokkel = "12v_batteri"
    elif any(k in folded for k in ("bremsevaske", "kokepunkt")):
        treff_nokkel = "bremsevaske"

    if treff_nokkel:
        del_info = DELE_KATALOG[treff_nokkel]
        return {
            "funnet": True,
            "sokeord": symptom_eller_del,
            "regnr": clean_reg,
            "komponent": del_info["komponent"],
            "oem_referanse": del_info["oem_eksempel"],
            "grossist": del_info["leverandor"],
            "lagerstatus": del_info["lagerstatus"],
            "budtid_minutter": del_info["budtid_min"],
            "veiledende_pris_kr": del_info["veiledende_pris_kr"],
            "estimert_montering_timer": del_info["normtid_timer"],
            "bestillingsordre_tekst": (
                f"[NAF ARENDAL VERKSTED ORDRE] Del: {del_info['komponent']} | "
                f"Grossist: {del_info['leverandor']} | Regnr: {clean_reg or 'Venter'} | "
                f"Budtid: ~{del_info['budtid_min']} min til Åsbieveien 14"
            )
        }

    # Fallback for ukjente deler
    return {
        "funnet": False,
        "sokeord": symptom_eller_del,
        "regnr": clean_reg,
        "melding": "Ingen direkte OEM-match i lokalt hurtiglager. Søket sendes til grossistene Meca Stoa og Mekonomen Arendal for manuell ekspedering.",
        "anbefalt_grossist": "Meca Arendal (Stoa) tlf: 37 00 55 00",
        "estimert_levering": "1-2 timer ved ekspressbud"
    }


# OBD2 DTC Feilkoder for verksteddiagnose
OBD2_FEILKODER = {
    "P0420": {
        "tittel": "Katalysatoreffektivitet under terskel (Bank 1)",
        "arsak": "Defekt katalysator, eksoslekkasje før O2-sensor, eller defekt bakre lambdasonde.",
        "pkk_relevans": "Grad 2 mangel (avgasskrav overskrides ved PKK).",
        "tiltak": "Kontroller eksosanlegg for lekkasje med røykmaskin, test O2-sensor signal med diagnoseapparat.",
        "anbefalt_del": "Lambdasonde bak eller ny katalysator"
    },
    "P0300": {
        "tittel": "Tilfeldig / Flere sylindere feiltenning detektert",
        "arsak": "Slitte tennplugger, defekt coil, falskluft i innsug, lavt bensintrykk.",
        "pkk_relevans": "Grad 2 mangel (motorfeillampe MIL lyser under kontroll).",
        "tiltak": "Inspiser tennplugger og tennspoler, sjekk drivstoffkorreksjon (Fuel Trim STFT/LTFT).",
        "anbefalt_del": "Tennplugger / Coilsett"
    },
    "P0101": {
        "tittel": "Luftmassemåler (MAF) kretsområde / ytelse",
        "arsak": "Tilsmusset MAF-tråd, falskluft i slanger etter måler, eller defekt sensor.",
        "pkk_relevans": "Grad 2 mangel ved aktiv motorlampe.",
        "tiltak": "Rengjør MAF med godkjent sensorspray, inspiser gummibelger for sprekker.",
        "anbefalt_del": "Luftmassemåler (Bosch/Pierburg)"
    },
    "P2463": {
        "tittel": "Dieselpartikkelfilter (DPF) - For høy sotakkumulering",
        "arsak": "Mange småturer, defekt differansetrykksensor, eller termostat som ikke når driftstemperatur (>75°C).",
        "pkk_relevans": "Grad 2 mangel (tett partikkelfilter gir forhøyet partikkelutslipp).",
        "tiltak": "Tving service-regenerering via tester på landevei, sjekk differansetrykk ved 3000 rpm.",
        "anbefalt_del": "Differansetrykksensor / DPF Rensevæske"
    },
    "C0035": {
        "tittel": "Venstre forhjul ABS-hastighetssensor kretsfeil",
        "arsak": "Defekt ABS-føler, korrodert ledningsnett, eller sprukket magnetring på hjullager.",
        "pkk_relevans": "Grad 2 mangel (ABS-varsellampe lyser).",
        "tiltak": "Mål sensormotstand og sjekk hjulhastighet live med diagnose under prøvekjøring.",
        "anbefalt_del": "ABS-sensor / Nytt hjullager med magnetring"
    },
    "P0A80": {
        "tittel": "Erstatt Hybrid / Elbil Batteripakke (Celleubalanse)",
        "arsak": "Svak eller defekt celleblokk i fremdriftsbatteriet, ujevn spenning mellom moduler.",
        "pkk_relevans": "Grad 2 mangel ved varsellampe for fremdriftssystem.",
        "tiltak": "Gjennomfør NAF Aviloo State-of-Health batteritest for offisiell cellediagnose.",
        "anbefalt_del": "Aviloo SoH Test / Garantikrav mot bilimportør"
    }
}


def diagnostiser_feilkode_obd2(dtc_kode: str) -> Dict[str, Any]:
    """Diagnostiserer en OBD2 DTC-kode og gir tekniske reparasjonsråd på norsk."""
    clean_code = (dtc_kode or "").strip().upper()
    if clean_code in OBD2_FEILKODER:
        info = OBD2_FEILKODER[clean_code]
        return {
            "funnet": True,
            "kode": clean_code,
            "tittel": info["tittel"],
            "sannsynlig_arsak": info["arsak"],
            "pkk_vurdering": info["pkk_relevans"],
            "mekaniker_tiltak": info["tiltak"],
            "anbefalt_del": info["anbefalt_del"],
            "senter": "NAF Senter Arendal (Diagnoseavdelingen)"
        }

    return {
        "funnet": False,
        "kode": clean_code,
        "tittel": f"Generisk feilkode: {clean_code}",
        "melding": "Feilkoden finnes ikke i hurtigbasen. Kobles opp mot NAF Senter Arendals diagnoseutstyr (Bosch KTS / Autel MaxiSys) for dypere feilsøking.",
        "pkk_vurdering": "Enhver aktiv motorlampe (MIL) for avgassrelaterte feil gir normalt Grad 2 på PKK."
    }


def evaluer_pkk_mangel(komponent: str, funn_beskrivelse: str) -> Dict[str, Any]:
    """
    Klassifiserer en verkstedobservasjon etter Statens vegvesens offisielle PKK-mangelgrader.
    Grad 1: Merknad (godkjent).
    Grad 2: Mangel (ikke godkjent, etterkontroll påkrevd innen 2 måneder).
    Grad 3: Farlig mangel (kjøreforbud på stedet).
    """
    folded = _fold(funn_beskrivelse)

    # Farlig mangel (Grad 3)
    if any(k in folded for k in ("bremsesvikt", "pedal i bunn", "brudd i styrestag", "aksel knekt", "dekk eksplosjon", "akutt fare")):
        grad = 3
        betydning = "FARLIG MANGEL (KJØREFORBUD)"
        krav = "Kjøretøyet ilegges bruksforbud på stedet. Kan ikke forlate NAF Senter Arendal før utbedret."
        godkjent = False
    # Ikke godkjent (Grad 2)
    elif any(k in folded for k in ("slitt under minstemal", "rust over 50", "knekt fjaer", "slark", "feiltenning", "mil lyser", "abs lyser", "lekkasje", "mønster under", "monster under")):
        grad = 2
        betydning = "IKKE GODKJENT (ETTERKONTROLL PÅKREVD)"
        krav = "Bilen er ikke godkjent. Må utbedres og etterkontrolleres hos NAF Senter Arendal innen 2 måneder."
        godkjent = False
    # Mindre feil (Grad 1)
    else:
        grad = 1
        betydning = "MINDRE FEIL (GODKJENT MED MERKNAD)"
        krav = "Mangel må rettes av eier så snart som mulig, men krever ingen formell etterkontroll."
        godkjent = True

    return {
        "komponent": komponent,
        "funn": funn_beskrivelse,
        "grad": grad,
        "betydning": betydning,
        "krav_til_etterkontroll": krav,
        "pkk_godkjent": godkjent,
        "kontrollorgan": "NAF Senter Arendal (01)"
    }


def beregn_servicepris(tjeneste_id: str, er_medlem: bool = True) -> Dict[str, Any]:
    """Returnerer medlems- og ikke-medlemspris for tjenester ved NAF Senter Arendal."""
    fakta = last_fakta()
    tjenester = {t["id"]: t for t in fakta.get("tjenester", [])}

    if tjeneste_id not in tjenester:
        return {
            "gyldig": False,
            "feil": f"Ukjent tjeneste '{tjeneste_id}'."
        }

    tj = tjenester[tjeneste_id]
    pris_medlem = tj["pris_medlem"]
    pris_ikke_medlem = tj["pris_ikke_medlem"]
    rabatt_kr = pris_ikke_medlem - pris_medlem
    rabatt_pst = round((rabatt_kr / pris_ikke_medlem) * 100)

    valgt_pris = pris_medlem if er_medlem else pris_ikke_medlem

    return {
        "gyldig": True,
        "tjeneste_id": tjeneste_id,
        "tjeneste_navn": tj["navn"],
        "varighet_minutter": tj["varighet_min"],
        "er_medlem": er_medlem,
        "gjeldende_pris_kr": valgt_pris,
        "pris_medlem_kr": pris_medlem,
        "pris_ikke_medlem_kr": pris_ikke_medlem,
        "medlemsrabatt_kr": rabatt_kr,
        "medlemsrabatt_prosent": rabatt_pst,
        "beskrivelse": tj["beskrivelse"]
    }
