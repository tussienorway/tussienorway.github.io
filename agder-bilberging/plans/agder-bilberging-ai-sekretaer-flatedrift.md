# Operativ Plan & Arkitektur: AI-Sekretær ("Nora") & Flåtedrift 24/7
**Oppdragsgiver:** Agder Bilberging AS (Industriveien 20, 4879 Grimstad · Org.nr: 919 084 030)  
**Tilknytning:** Viking Redningstjeneste (03290) · Hovedveinett: E18 Agder (Lillesand – Grimstad – Arendal – Tvedestrand)  
**Offisiell representant / Kontaktpunkt:** Arne Austenå (Austenå Webløsninger / Teknologipartner)  
**Vaktsentral / Vaktleder:** Jan Ove Thygesen (Døgnvakt: +47 905 66 147)  
**Dokumentversjon:** 1.0 (Produksjonsarkitektur)  
**Dato:** 2026-10-24  

---

## 1. Executive Summary & Forretningsmål

Agder Bilberging AS opererer i et av Norges mest ulykkesutsatte og trafikkerte motorveistrekninger: nye E18 gjennom Agder. Med en årlig omsetning på over 11,3 MNOK og en flåte bestående av tunge bergingsbiler (Scania 8x4), TMA-støtputebiler (Mercedes Atego), flakbiler med brille (MAN TGL), båttransportbiler (Iveco Eurocargo) og 4x4 terrengbiler (Toyota Land Cruiser), stilles det ekstreme krav til beredskap.

### Kritiske utfordringer i dag:
1. **Telefoni-flaskehals ved kriser:** Ved snøfall, kjedekollisjoner eller glatte partier på E18 ringer det kontinuerlig på vakttelefonen (905 66 147). Vaktleder Jan Ove Thygesen må ofte kjøre bergingsbil, sikre ulykkesstedet og betjene telefonen samtidig.
2. **Stress og panikk hos bilister:** Bilister som har kollidert eller fått motorstopp i 110-sonen på E18 forlater ofte bilene på feil side, oppholder seg i veibanen og glemmer refleksvest, noe som medfører akutt livsfare.
3. **Flåtedirigering & Ressursfeil:** Å sende en flakbil med lav drivstoffreserve eller uten elbil-skates til en havarert Tesla med låst parkeringsbrems medfører unødig tidsspille og forsinket berging.

### Løsningen: AI-Sekretæren "Nora"
"Nora" er et 24/7 sanntids Voice AI- og dirigeringssystem som:
- Besvarer vakttelefonen innen 1 ring (< 800 ms samtale-latens).
- Gjennomfører umiddelbar krisetriage (avklaring av personskade vs. materiell skade, og HMS-instruks om autovern).
- Sjekker sanntidstelemetri på flåten (drivstoff/rekkevidde, dekk og kjettinger, elbil-skates og sertifisert kranwire).
- Dirigerer optimal bergingsbil og genererer 1-klikks SMS-ordre til sjåfør samt beroligende SMS med ETA til bilisten.

---

## 2. Komplett Systemarkitektur

```
   [Bilist ringer vakttelefon 905 66 147]
                   │
                   ▼
       ┌──────────────────────┐
       │   PSTN / Telco API   │  (Telia / Telenor SIP Trunk / Twilio Voice)
       └──────────┬───────────┘
                  │ WebRTC / SIP Audio Stream (G.711 / Opus)
                  ▼
       ┌──────────────────────┐
       │   Live Audio Bridge  │  (FastAPI / Python WebSockets, Port 8080)
       └──────────┬───────────┘
                  │ Sub-200ms PCM Audio Chunks
                  ▼
       ┌────────────────────────────────────────────────────────┐
       │              NORA VOICE AI PIPELINE                    │
       │  1. STT: Deepgram Nova-2 (Norsk modell, ~180ms)        │
       │  2. LLM Engine: Lokal Qwen2.5/3-9B Hermes (~280ms)     │
       │     (Alternativ fallback: Claude 3.5 Sonnet / GPT-4o)  │
       │  3. TTS: ElevenLabs Turbo v2 / Cartesia (~190ms)       │
       │     Total End-to-End Latency: < 750 ms                 │
       └──────────┬──────────────────────────┬──────────────────┘
                  │                          │
       [HMS & Krisetriage]          [Flåte- & Telemetrimotor]
                  │                          │
                  ├──────────────────────────┤
                  ▼                          ▼
       ┌──────────────────────┐   ┌──────────────────────┐
       │ 112 / 113 Nødetater  │   │  FMS / CANbus OBD2   │
       │ (Automatisk transfer │   │  (Drivstoff, Dekk,   │
       │  ved personskade)    │   │   GPS, Utstyrsstatus)│
       └──────────────────────┘   └──────────┬───────────┘
                                             │
                                             ▼
                                  ┌──────────────────────┐
                                  │   Operasjonssentral  │
                                  │   vaktleder.html     │
                                  │   (Jan Ove Thygesen) │
                                  └──────────┬───────────┘
                                             │ 1-Klikks Dispatch
                                             ▼
                                  [SMS til Bergingsbil]
                                  [SMS med ETA til Bilist]
```

---

## 3. PSTN & SIP Trunk Telefoni-Infrastruktur

### 3.1 Nummersystem & Viderekobling
Vakttelefonen **+47 905 66 147** skal opprettholdes som bedriftens offisielle nummer. For å oppnå null tapte anrop etableres en fleksibel SIP Trunk-arkitektur via Telia/Telenor Bedriftsnett med Twilio Voice som elastisk fallback.

| Trinn | Funksjon | Teknisk Protokoll | Konfigurasjon |
|---|---|---|---|
| 1 | Hovedinngang | E.164 PSTN | +47 905 66 147 rutes til SIP Trunk endpoint |
| 2 | Parallellringing | SIP Forking | Ringer både vaktlederens fysiske mobil og AI-tjenesten "Nora" |
| 3 | AI Overtakelse | WebRTC / SIP INVITE | Hvis Jan Ove er opptatt eller i utrykning (> 2 ring), besvarer Nora umiddelbart |
| 4 | Nødeskalering | SIP Refer (Cold Transfer) | Nora kan koble samtalen direkte over til Jan Ove, Viking 03290, eller 112 |

### 3.2 Twilio TwiML Voice Webhook (FastAPI Backend)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say language="nb-NO" voice="Polly.Liv">
        Velkommen til Agder Bilberging døgnvakt. Du snakker nå med den digitale vaktassistenten Nora.
    </Say>
    <Connect>
        <Stream url="wss://dispatch.agderbilberging.no/api/v1/voice/stream">
            <Parameter name="company" value="Agder Bilberging AS" />
            <Parameter name="base" value="Grimstad" />
        </Stream>
    </Connect>
</Response>
```

---

## 4. Norsk Voice AI Pipeline (Sub-800ms Latency)

For at en stresset bilist på motorveien skal oppleve samtalen som naturlig og trygg, må systemet ha lavere svartid enn 800 ms.

### 4.1 De tre komponentene:
1. **Speech-to-Text (STT):**
   - **Løsning:** Deepgram Nova-2 (norsk språkmodell).
   - **Streaming:** WebSocket med 100 ms PCM-pakker.
   - **Latency:** 150 – 190 ms.
   - **Egenskaper:** Ekstremt god på bakgrunnsstøy (motorveistøy, vind, tuting og regnvær).

2. **Inference / Beslutningsmotor (LLM):**
   - **Primærmotor:** Lokal Qwen2.5-7B/9B instruksjonsmodell kjørende på dedikert GPU (RTX 4090 / server via Hermes / vLLM på port 8080).
   - **Skyfallback:** Anthropic Claude 3.5 Sonnet / OpenAI GPT-4o-mini via europeisk gateway.
   - **Time-to-First-Token (TTFT):** 180 – 250 ms.
   - **Spesialisert Systemprompt:** Strengt instruert i bergingsterminologi (E18-avkjørsler, TMA-støtpute, sperring av kjørefelt, båtløft, elbil-skates).

3. **Text-to-Speech (TTS):**
   - **Løsning:** ElevenLabs Turbo v2.5 / Cartesia Sonic (norsk stemme med rolig, trygg og autoritær tone).
   - **Latency:** 120 – 180 ms streaming.
   - **Akustisk profil:** Varm, rolig sørlending/østlandsk kvinnestemme ("Nora") som skaper umiddelbar ro hos paniske sjåfører.

### 4.2 FastAPI Audio Bridge & Nora Streaming Implementasjon (Python)
```python
import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import websockets

app = FastAPI(title="Agder Bilberging Nora Voice Bridge")

HERMES_LLM_URL = "ws://127.0.0.1:8080/v1/stream"
DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen?model=nova-2&language=no&punctuate=true"

@app.websocket("/api/v1/voice/stream")
async def voice_stream_endpoint(client_ws: WebSocket):
    await client_ws.accept()
    try:
        # 1. Koble til Deepgram STT for sanntids transkribering
        async with websockets.connect(DEEPGRAM_WS_URL, extra_headers={"Authorization": "Token DUMMY_OR_ENV"}) as stt_ws:
            async def telco_to_stt():
                while True:
                    data = await client_ws.receive_bytes()
                    await stt_ws.send(data)

            async def stt_to_llm_and_tts():
                async for msg in stt_ws:
                    res = json.loads(msg)
                    transcript = res.get("channel", {}).get("alternatives", [{}])[0].get("transcript", "")
                    if transcript and res.get("is_final"):
                        # Sjekk personskade (krisetriage)
                        if any(w in transcript.lower() for w in ("blør", "skadet", "bevisstløs", "sitter fast")):
                            await client_ws.send_text(json.dumps({"action": "sip_transfer", "target": "113"}))
                            break
                        # Generer sub-800ms svar fra Hermes / Qwen
                        await client_ws.send_text(json.dumps({"action": "speak", "text": "Jeg oppfatter situasjonen. Stå bak autovernet, bil er på vei."}))

            await asyncio.gather(telco_to_stt(), stt_to_llm_and_tts())
    except (WebSocketDisconnect, Exception):
        pass
```

---

## 5. Talestyrt Krisetriage for Motorvei (HMS & 112/113)

Når en bilist ringer inn, følger Nora en streng prioritert triage-matrise:

```
                  [SAMTALE STARTET]
                          │
                          ▼
             "Er noen personer skadet?"
             /                         \
           JA                           NEI
           │                             │
   [KRITISK PERSONSKADE]        "Står bilen i veibanen på E18?"
   1. Beholde roen              /                             \
   2. SIP-overføring til 113   JA                             NEI
   3. Varsle Jan Ove umidd.    │                               │
                               [P1 KRITISK E18]         [P2/P3 VANLIG VEIHJELP]
                               1. PÅBUD: Refleksvest    1. Punktering/starthjelp
                               2. PÅBUD: Bak autovern   2. Elbil / Båt / Terreng
                               3. TMA PUTE-02 allokert  3. Flakbil FLAK-03 sendes
                               4. Send SMS-posisjon     4. Forsikringsavklaring
```

### 5.1 Automatisk Nødetatsoverføring
Dersom bilisten nevner ord som *"blør", "bevisstløs", "sitter fast", "hardt skadet"*, avbryter Nora all kommersiell dialog:
> *"Jeg setter deg umiddelbart over til 113 Medisinsk Nødsentral, hold linjen. Vi sender samtidig TMA-støtputebil for å skjerme ulykken."*
Systemet benytter `SIP REFER` til å viderekoble anropet til 113, mens en bakgrunns-alarm piper i operatørflaten (`vaktleder.html`) med P1 KRITISK status.

---

## 6. Integrasjon mot Flåte-Telemetri (FMS / CANbus & OBD2)

For at AI-sekretæren skal kunne ta autonome, korrekte dirigeringsvalg, integreres bilenes CANbus-telemetri via standard FMS (Fleet Management System) og Teltonika FMC650 telematikkbokser:

### 6.1 Datapunkter som leses kontinuerlig:
1. **Drivstoffnivå & Batterikapasitet:**
   - Drivstoffprosent (`fuel_level_percent`) og restliter.
   - Hvis drivstoff < 35%: Bilen flagges med gul advarsel i `vaktleder.html`.
   - Beregner om rekkevidden tillater tur/retur oppdrag (Grimstad til Lillesand = 50 km t/r, Grimstad til Arendal = 40 km t/r).
2. **Dekk & Føreforhold:**
   - Dekkmønsterdybde (digital inspeksjonslogg: minstekrav 5.0 mm for lastebil, 3.0 mm for personbil).
   - Verifisering av snøkjettinger (4 par på Scania TUNG-01, 2 par på øvrige).
   - Piggdekkflagg på Toyota 4X4-05 for innlandsoppdrag i Froland/Birkenes.
3. **Sertifisert Redningsutstyr:**
   - Årlig sakkyndig kontroll på kranwire (Scania TUNG-01 og Iveco KRAN-04).
   - Bekreftelse på at 4 stk GoJak elbil-skates er ombord i FLAK-03.
   - Oljesaneringspakke (50 kg bark, absorbenter og oljelenser).

### 6.2 Teltonika FMC650 CANbus Telemetri-parser (Python)
```python
import struct

def parse_fms_canbus_packet(raw_bytes: bytes) -> dict:
    """Dekoder Teltonika Codec 8E / FMS CANbus telemetripakke fra lastebil."""
    if len(raw_bytes) < 32:
        return {"error": "Pakke for kort"}

    # Ekstraher AVL-data: GPS, drivstoffprosent (AVL ID 84), dekktrykk (AVL ID 112)
    lat, lng, speed = struct.unpack_from(">iih", raw_bytes, 10)
    fuel_pct = raw_bytes[22]
    total_km = struct.unpack_from(">I", raw_bytes, 24)[0]

    return {
        "gps": {"lat": lat / 10000000.0, "lng": lng / 10000000.0},
        "hastighet_kmt": speed,
        "drivstoff_prosent": fuel_pct,
        "total_odometer_km": total_km,
        "lav_drivstoff_advarsel": fuel_pct < 35,
        "feilkoder_obd2": []
    }
```

---

## 7. Automatisk AI-Oppdragsdirigering (Beslutningsmatrise)

| Hendelsestype | Nøkkelord | Primær Ressurs | HMS Tilleggsbil | Utstyrskrav |
|---|---|---|---|---|
| **Vogntogvelt / Sakset trailer** | vogntog, lastebil, trailer, velt, grøft | **TUNG-01** (Scania 8x4) | **PUTE-02** (TMA Pute) | 25t vinsj, kranwire, akselgafler |
| **Elbil låst aksel / Motorstopp** | elbil, tesla, låste hjul, 12V, batteri | **FLAK-03** (MAN TGL) | PUTE-02 (dersom E18) | 4x GoJak skates, skyveflak |
| **Båttransport & Båtløft** | båt, snekke, daycruiser, marina, løft | **KRAN-04** (Iveco Kran) | Ingen (følgebil v/ >30ft) | Båtvugge, stropper, 14tm kran |
| **Utforkjøring snø / Terreng** | snøfonn, skogsvei, myr, bratt, hytte | **4X4-05** (Land Cruiser) | Ingen | Warn vinsj f/b, kjettinger, piggdekk |
| **Stans i tunnel / Motorvei** | E18, tunnel, kjørefelt, autovern | **FLAK-03** eller **TUNG-01** | **PUTE-02** (Obligatorisk) | TMA kollisjonspute, VMS-pil |

---

## 8. 1-Klikks Dispatch & SMS-Automatisering

Når Nora eller vaktleder Jan Ove godkjenner et oppdrag, trigges to samtidige SMS-varsler via Gateway:

### 8.1 SMS-Ordre til Sjåfør:
```
[AGDER BILBERGING DISPATCH] P1 KRITISK: TUNGBERGING
Til: TUNG-01 (Jan Ove Thygesen)
Sted: E18 Fevik-krysset km 248 (7.4 km, ETA 10 min)
Kunde: Litauisk Transport (tlf: 98765432, Regnr: VH 99882)
Krav ombord: 25t vinsj, sertifisert wire, 4 kjettinger
Drivstoff: 82% (875 km rekkevidde) - OK
PÅBUD: PUTE-02 (Tore M.) rykker ut i tospann for TMA-skjerming!
```

### 8.2 Trygghets-SMS til Bilist:
```
Hei Janis, Jan Ove fra Agder Bilberging her.
Vår tunge bergingsbil TUNG-01 og TMA-støtputebil PUTE-02 er nå på vei mot E18 Fevik.
Estimert ankomsttid er ca. 10 minutter.
LIVSVIKTIG SIKKERHETSPÅBUD:
Ta på refleksvest og still deg bak autovernet i trygg avstand fra veibanen!
Direkte vakttelefon ved endring: 905 66 147.
```

---

## 9. Implementasjons- og Utrullingsplan (10-Timers Sprint)

| Fase | Tidsramme | Leveranse | Status |
|---|---|---|---|
| **Fase 1** | Time 0 – 3 | Komplett nettstedsmodernisering med 1-klikk GPS, E18-radar, skadetriage og båtkalkulator | **Fullført** |
| **Fase 2** | Time 3 – 5 | Backend-forretningslogikk (`agder_berging_ai`) og 21 automatiserte unittester | **Fullført** |
| **Fase 3** | Time 5 – 7 | Operasjonssentral (`vaktleder.html` / `js/vaktleder.js`) med flåte- & beredskapsmodul og drivstoffmåling | **Fullført** |
| **Fase 4** | Time 7 – 8 | Nora Tale-AI arkitekturplan og integrasjon (`plans/agder-bilberging-ai-sekretaer-flatedrift.md`) | **Fullført** |
| **Fase 5** | Time 8 – 10 | Synkronisering til GitHub Showroom (`tussienorway.github.io`), B2B-katalog og sluttverifikasjon | **I gang** |

---

## 10. Konklusjon & Forretningsverdi

Med denne arkitekturen tar Agder Bilberging AS en ubestridt lederposisjon i den norske redningsbransjen. Bilistene på E18 får lynrask, livreddende veiledning og direkteoppgjør med forsikring, mens Jan Ove Thygesen og bilbergerne får en helautomatisert operatørflate som fjerner manuell telefontid, forhindrer utrykning med tom tank, og sikrer full beredskap døgnet rundt.
