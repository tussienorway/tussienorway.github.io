# Svarflyt-forside (Tussie)

Gren: `svarflyt/tussie-forside`
Mappe: `/svarflyt/`
Forhåndsvisning, når Thomas har godkjent merge: https://tussienorway.github.io/svarflyt/

Ikke merge uten Thomas. Merge publiserer siden.

## Hva denne grenen tar

En roligere, redaksjonell forhåndsvisning av den offentlige forsiden. Den skal kunne sammenlignes med https://svarflyt.no/ i morgen tidlig.

Den tar ikke:

- Groks interaktive produktdemo (kundesvar, uttrekk, timebestilling, Cloudflare Worker) i `/svarflyt.no/` på `svarflyt/grok-showroom`
- AGY sitt simulerte showroom, også i `/svarflyt.no/`
- Filer under `agy-smart-kit/` og `agy-swarm/`
- Endringer på `main`

## Kilder

Tekst og løfter er strammet fra det som sto offentlig på https://svarflyt.no/ 25. november 2026:

- Slagord: «Få AI på jobb. Uten å ansette.»
- Prinsipp: «Behovet først. Verktøyene etterpå.»
- Kontakt: Jonathan@svarflyt.no
- Fem områder: kundesvar, mindre dobbeltarbeid, bli funnet, timebestilling, hjelp i gang
- Ingen lovnad om plass i søkeresultatene
- Ingenting sendes uten at en person har sagt ja

Org.nr, adresse, priser, kunder og personverntekst er bevisst utelatt. Et treff i Enhetsregisteret på et liknende navn er ikke brukt.

## Hva siden ikke gjør

- Ingen skjema, ingen lagring, ingen analyseverktøy
- Eneste handling ut er `mailto:` og lenken til den offisielle siden
- `noindex`, så forhåndsvisningen ikke konkurrerer med svarflyt.no
- Logo og palmebilde fra den offisielle siden er ikke kopiert

Antigravity CLI (`agy`) ble forsøkt 25. november 2026. Kontoen svarte `RESOURCE_EXHAUSTED`. Siden er derfor skrevet direkte, etter briefen i arbeidskopien.

## Test

```bash
python3 svarflyt/tests/check_forside.py
```

Åpne `svarflyt/index.html` i en nettleser, også på smal bredde. Sjekk at menyen lukkes med Escape, og at tjenestene kan åpnes med tastatur.
