# Svarflyt – Grok showroom (konseptprototype)

Gren: `svarflyt/grok-showroom` · Mappe: `/svarflyt.no/` · Planlagt URL: https://tussienorway.github.io/svarflyt.no/ (blir live først når PR-en er godkjent og merget av Thomas).

Siden er tydelig merket «Konseptprototype laget av Thomas Austenaa – ikke offisiell Svarflyt-side».

## Eksisterende arbeid jeg fant
Før jeg begynte, sjekket jeg grener, PR-er, commits og filer (25.11.2026, kl. 22.50 norsk tid). Det fantes ingen `/svarflyt.no/`-mappe, ingen grener eller commits som nevner Svarflyt, og ingen Svarflyt-repo under `tussienorway`. De eneste åpne grenene er `codex/local-app-links` (PR #2) og `codex/website-oversikt-ux-20261023` (merget). Ingen AGY-filer ble overskrevet. Alt mitt ligger i `/svarflyt.no/`, og ingenting utenfor mappen er endret.

## Hva som er laget
- **`index.html`**: forside med header, hero, systemstripe, interaktiv demo med tre faner, tre tjenestekort med Før/Etter, tillegg for søk/AI-synlighet, pilotmodell i tre steg, Sikkerhet & GDPR (4 punkter, merket som forslag som Svarflyt må bekrefte), «Folkene bak» med plassholderbilde og faktaboks, booking og kontaktskjema, og en footer med foretaksnavn, org.nr. og e-post. JSON-LD for Organization, 3× Service og FAQPage.
- **`personvern.html`**: utkast til personvernerklæring etter GDPR art. 13, med [klammer] der Svarflyt må fylle inn.
- **`assets/app.js`**: ren JavaScript uten avhengigheter: faner med tastaturstyring, de tre demoene, en gjenbrukbar bookingkomponent (brukes både i demoen og i «Book 15 min kartlegging»), kontaktskjema, og nedlasting av CSV, JSON og .ics.
- **`assets/styles.css`**: rolig nordisk B2B-stil, responsiv ned til 375 px, synlig fokus, støtte for redusert bevegelse.
- **`worker/worker.js`**: kildekoden til Cloudflare Worker-en (`svarflyt-api`) som er deployet på https://svarflyt-api.tussienorway.workers.dev.
- **`tests/e2e.py`**: Playwright-test mot den ekte Worker-en.

### Demoene (alt er ekte AI, ingen faste svar)
1. **Kundesvar**: AI-en lager et svarutkast basert bare på bedriftsinformasjonen som er limt inn. Den lister det som må sjekkes, og lover ikke noe som ikke står der. Brukeren redigerer og trykker «Godkjenn», og ingenting sendes.
2. **Mindre dobbeltarbeid**: henter ut 16 felt og varelinjer som JSON. Worker-en kontrollerer svaret selv: mod11-sjekk av org.nr., 11-sifret kontonummer, e-post, datoer, at forfall kommer etter fakturadato, og at eks. mva + mva = totalsum. Eksempelfakturaen har med vilje feil totalsum, så flagget vises. Resultatet kan lastes ned som CSV (semikolon, UTF-8 med BOM for Excel) eller JSON.
3. **Timebestilling**: fritekst som «kan jeg komme tirsdag etter lunsj?» tolkes av AI-en ut fra dagens dato i Europe/Oslo. Worker-en lager ledige tider (hverdager, opptatte tider i KV trekkes fra), brukeren velger og bekrefter, og får en bekreftelse og en .ics-fil med riktig tidssone.

### Backend
- Cloudflare Worker + Workers AI + KV (`svarflyt-proto`). Ingen API-nøkler i klientkoden.
- Modell: `@cf/google/gemma-4-26b-a4b-it`, valgt fra Workers AI-katalogen 25.11.2026 (flerspråklig, rask og billig, med JSON-modus). Reserve: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.
- CORS er låst til `https://tussienorway.github.io`, og andre opprinnelser får 403. Rate limit er 8 forespørsler i minuttet per IP (i minnet), med lengdegrenser på all input, honeypot på kontaktskjemaet og en systeminstruks som holder modellen til oppgaven og avviser forsøk på å endre rollen.
- Kontakt og booking lagres i KV med 90 dagers levetid. Ingen e-post sendes.
- Endepunkter: `POST /api/kundesvar`, `/api/uttrekk`, `/api/booking/tolk`, `/api/booking/bekreft`, `/api/kontakt`, `GET /api/helse`.

## Tester (25.11.2026)
`python svarflyt.no/tests/e2e.py` serverer filene lokalt under `https://tussienorway.github.io/svarflyt.no/` via Playwright-ruting, slik at CORS testes mot den ekte Worker-en. Resultat: **16/16 bestått**:
forside laster · JSON-LD gyldig · kundesvar gir AI-utkast · godkjenn-status · uttrekk gir felt · uttrekk flagger feil sum · CSV-nedlasting · JSON-nedlasting · booking tolker fritekst · booking bekreftet · .ics-nedlasting · kontaktskjema lagrer · ingen horisontal scroll på 375 px · mobilmeny · personvern.html · ingen konsollfeil.
I tillegg ga en forespørsel fra en fremmed opprinnelse 403. Testoppføringene (1 kontakt, 1 booking) ble slettet fra KV etterpå, og et søk etter nøkler/tokens i mappen ga ingen treff.

Svartider målt: kundesvar ca. 3 s, booking-tolkning ca. 2–9 s.

## Trenger avklaring med Svarflyt
- De fire sikkerhetspunktene er forslag, ikke noe Svarflyt har lovet (se HTML-kommentar).
- Navn, roller og bilde i «Folkene bak» er plassholdere.
- Personvernerklæringen er et utkast med [klammer].
- Workers AI kjører globalt hos Cloudflare, så «lagring i EØS» gjelder ikke for selve prototypen.

## Anbefalte forbedringer
1. Bruk Cloudflare sin Rate Limiting-binding eller Durable Objects i stedet for minnebasert grense, og legg på Turnstile for skjemaene.
2. En liten admin-visning (bak Cloudflare Access) for å lese og slette henvendelser og bookinger.
3. Koble booking til en ekte kalender (Google/Microsoft) og send bekreftelse når Svarflyt ønsker det.
4. Streaming av AI-svar, så teksten vises mens den skrives.
5. Egen innholdsseksjon med kundecase når Svarflyt har piloter å vise til.
6. Fjern `noindex` og legg siden i sitemap først når innholdet er godkjent av Svarflyt.
