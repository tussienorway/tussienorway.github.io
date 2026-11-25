# Svarflyt – Grok showroom (konseptprototype)

Gren: `svarflyt/grok-showroom` · Mappe: `/svarflyt.no/` · Planlagt URL: https://tussienorway.github.io/svarflyt.no/ (blir live først når PR-en er godkjent og merget av Thomas).

Siden er tydelig merket «Konseptprototype laget av Thomas Austenaa – ikke offisiell Svarflyt-side».

## Eksisterende arbeid jeg fant
Før jeg begynte, sjekket jeg grener, PR-er, commits og filer (25.11.2026, kl. 22.50 norsk tid). Det fantes ingen `/svarflyt.no/`-mappe, ingen grener eller commits som nevner Svarflyt, og ingen Svarflyt-repo under `tussienorway`. De eneste åpne grenene er `codex/local-app-links` (PR #2) og `codex/website-oversikt-ux-20261023` (merget). Ingen AGY-filer ble overskrevet. Alt mitt ligger i `/svarflyt.no/`, og ingenting utenfor mappen er endret.

## Hva som er laget
- **`index.html`**: forside med header, hero, systemstripe, interaktiv demo med tre faner, tre tjenestekort med Før/Etter, tillegg for søk/AI-synlighet, pilotmodell i tre steg, Sikkerhet & GDPR (4 punkter, merket som forslag som Svarflyt må bekrefte), «Folkene bak» med plassholderbilde og faktaboks, booking og kontaktskjema, og en footer med foretaksnavn, org.nr. og e-post. JSON-LD for Organization, 3× Service og FAQPage.
- **`personvern.html`**: utkast til personvernerklæring etter GDPR art. 13, med [klammer] der Svarflyt må fylle inn.
- **`assets/lib.js`**: felles hjelpefunksjoner (API-kall, nedlasting, bookingkomponenten `renderSlots`).
- **`assets/resepsjonist.js`**: AI-resepsjonisten (mikrofon, stemmedeteksjon, STT/TTS, samtale, overføring, samtalelogg).
- **`tests/fixtures/`**: norsk testlyd (WebM og WAV) til STT-testene.
- **`assets/app.js`**: ren JavaScript uten avhengigheter: faner med tastaturstyring, de tre demoene, en gjenbrukbar bookingkomponent (brukes både i demoen og i «Book 15 min kartlegging»), kontaktskjema, og nedlasting av CSV, JSON og .ics.
- **`assets/styles.css`**: rolig nordisk B2B-stil, responsiv ned til 375 px, synlig fokus, støtte for redusert bevegelse.
- **`worker/worker.js`**: kildekoden til Cloudflare Worker-en (`svarflyt-api`) som er deployet på https://svarflyt-api.tussienorway.workers.dev.
- **`tests/e2e.py`**: Playwright-test mot den ekte Worker-en.

### Demoene (alt er ekte AI, ingen faste svar)
1. **Kundesvar**: AI-en lager et svarutkast basert bare på bedriftsinformasjonen som er limt inn. Den lister det som må sjekkes, og lover ikke noe som ikke står der. Brukeren redigerer og trykker «Godkjenn», og ingenting sendes.
2. **Mindre dobbeltarbeid**: henter ut 16 felt og varelinjer som JSON. Worker-en kontrollerer svaret selv: mod11-sjekk av org.nr., 11-sifret kontonummer, e-post, datoer, at forfall kommer etter fakturadato, og at eks. mva + mva = totalsum. Eksempelfakturaen har med vilje feil totalsum, så flagget vises. Resultatet kan lastes ned som CSV (semikolon, UTF-8 med BOM for Excel) eller JSON.
3. **Timebestilling**: fritekst som «kan jeg komme tirsdag etter lunsj?» tolkes av AI-en ut fra dagens dato i Europe/Oslo. Worker-en lager ledige tider (hverdager, opptatte tider i KV trekkes fra), brukeren velger og bekrefter, og får en bekreftelse og en .ics-fil med riktig tidssone.

4. **AI-resepsjonist** (fane 4, lagt til 25.11.2026 etter at Thomas så [Ringli](https://www.ringli.no)): man trykker «Ring resepsjonisten» og snakker norsk, og resepsjonisten svarer med stemme for eksempelbedriften «Bergen Fysioterapi». Bedriftsinformasjonen kan redigeres. Den svarer på spørsmål fra den teksten, booker time (samme bookingkomponent: tid → bekreftelse → .ics på 60 min), tar imot beskjed (navn, telefon, sak lagres i KV) og simulerer «overføring til menneske» med egen tilstand. Utskriften vises live, og når man legger på, lages en samtalelogg (oppsummering, årsak, innringer, utfall, oppfølging, hastegrad, stemning, varighet og svartid) som kan lastes ned som .txt.
   - Tale inn: mikrofonen tas opp med MediaRecorder. Enkel stemmedeteksjon merker når man tar en pause (ca. 1,1 s stille), eller man trykker «Ferdig å snakke». Lyden sendes til `/api/stt` (Whisper large-v3-turbo, `language: "no"`). Feiler Whisper to ganger, brukes nettleserens SpeechRecognition (nb-NO).
   - Tale ut: nettleserens norske stemme (speechSynthesis nb-NO; den beste er Microsoft Edge sine «Natural»-stemmer). Finnes ingen norsk stemme, brukes `/api/tts` (Deepgram Aura-1 på Workers AI), som har engelsk uttale.
   - Tekst virker alltid: feltet «Skriv i stedet» fungerer med og uten samtale. Avslått eller manglende mikrofon gir en vennlig melding og tekstmodus.
   - Det sendes ingen SMS, e-post eller ekte overføring.

### Backend
- Cloudflare Worker + Workers AI + KV (`svarflyt-proto`). Ingen API-nøkler i klientkoden.
- Modell: `@cf/google/gemma-4-26b-a4b-it`, valgt fra Workers AI-katalogen 25.11.2026 (flerspråklig, rask og billig, med JSON-modus). Reserve: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.
- CORS er låst til `https://tussienorway.github.io`, og andre opprinnelser får 403. Rate limit er 8 forespørsler i minuttet per IP (i minnet), med lengdegrenser på all input, honeypot på kontaktskjemaet og en systeminstruks som holder modellen til oppgaven og avviser forsøk på å endre rollen.
- Kontakt og booking lagres i KV med 90 dagers levetid. Ingen e-post sendes.
- Endepunkter: `POST /api/kundesvar`, `/api/uttrekk`, `/api/booking/tolk`, `/api/booking/bekreft`, `/api/kontakt`, `/api/resepsjonist`, `/api/samtale/oppsummer`, `/api/stt` (rå lyd, maks 2 MB), `/api/tts`, og `GET /api/helse`.
- Tale: `@cf/openai/whisper-large-v3-turbo` (STT) og `@cf/deepgram/aura-1` (TTS-reserve). Katalogen 25.11.2026 har ingen TTS med norsk: Aura-1 og Aura-2 er engelsk/spansk, og MeloTTS er avviklet fra 20.11.2026 og mangler norsk.
- Rate limit er hevet til 30 forespørsler i minuttet per IP, fordi en talesamtale bruker to kall per tur.
- Resepsjonist-svarene er korte (maks ca. 35 ord, 350 tokens) for lav ventetid. Det brukes ikke strømming ennå.

## Tester (siste kjøring 25.11.2026, kl. 23.15 norsk tid)
`python svarflyt.no/tests/e2e.py` serverer filene lokalt under `https://tussienorway.github.io/svarflyt.no/` via Playwright-ruting, slik at CORS testes mot den ekte Worker-en. Hele testpakken ble kjørt på nytt etter alle CSS- og JS-endringer. Resultat: **28/28 bestått**.
- Tidligere 16: forside, JSON-LD, kundesvar, godkjenn, uttrekk, sumflagg, CSV, JSON, booking-tolkning, booking, .ics, kontaktskjema, mobil 375 px, mobilmeny, personvern og ingen konsollfeil.
- Nye 12: STT transkriberer en norsk lydfil · TTS returnerer audio/mpeg · resepsjonisten svarer fra bedriftsinfo («890 kroner») · viser ledige tider · booker time · .ics (60 min, riktig tittel) · samtalelogg lages · ingen konsollfeil · **talesamtale med falsk mikrofon som spiller en ekte norsk lydfil**: talen blir forstått, AI-en svarer, samtalelogg etter at man legger på, ingen JS-feil · avslått mikrofon gir tekstmodus.
- Manuelle API-sjekker: «Kan jeg få snakke med et menneske?» gir `overfor`, og en beskjed med navn og telefon gir `beskjed` med lagret referanse. En fremmed opprinnelse får 403.
- Alle testoppføringer i KV ble slettet etterpå (KV er tomt), og et søk etter nøkler/tokens i mappen ga ingen treff.

Målte svartider: Whisper STT 1,2–3 s, resepsjonist-svar 1,4–3 s, TTS 0,3–0,5 s, så en tur tar totalt ca. 3–5 s. Kundesvar ca. 3 s, booking-tolkning 2–9 s.

## Trenger avklaring med Svarflyt
- De fire sikkerhetspunktene er forslag, ikke noe Svarflyt har lovet (se HTML-kommentar).
- Navn, roller og bilde i «Folkene bak» er plassholdere.
- Personvernerklæringen er et utkast med [klammer].
- Workers AI kjører globalt hos Cloudflare, så «lagring i EØS» gjelder ikke for selve prototypen.

- Den norske stemmen kommer fra nettleseren: Edge (Windows/Mac) har de beste norske stemmene, Chrome på Android og Safari på Mac/iPhone har norsk, mens Chrome på Linux ofte mangler norsk og da faller tilbake til en engelsk stemme.

## Anbefalte forbedringer
1. Bruk Cloudflare sin Rate Limiting-binding eller Durable Objects i stedet for minnebasert grense, og legg på Turnstile for skjemaene.
2. En liten admin-visning (bak Cloudflare Access) for å lese og slette henvendelser og bookinger.
3. Koble booking til en ekte kalender (Google/Microsoft) og send bekreftelse når Svarflyt ønsker det.
4. Streaming av AI-svar, så teksten vises mens den skrives.
5. Egen innholdsseksjon med kundecase når Svarflyt har piloter å vise til.
6. Strøm resepsjonist-svarene og start opplesningen setning for setning, for under 2 s til første ord.
7. Ekte telefonnummer via SIP/Twilio og Workers AI, med norsk TTS fra en ekstern leverandør (for eksempel Azure Neural nb-NO) når det er avklart.
8. Fjern `noindex` og legg siden i sitemap først når innholdet er godkjent av Svarflyt.
