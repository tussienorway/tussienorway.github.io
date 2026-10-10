# tussienorway.github.io

Hovedsiden min på GitHub Pages: **https://tussienorway.github.io/**

Siden viser en *live* oversikt over alle nettsidene mine. Hver gang den åpnes, spør den GitHub sitt offentlige API
(`https://api.github.com/users/tussienorway/repos`) og lister alle repoer som har GitHub Pages slått på.
Nye sider dukker derfor opp automatisk, uten at denne siden må endres.

- Søk, sortering (sist oppdatert / navn) og «Oppdater»-knapp
- Siste resultat lagres i nettleseren (localStorage), så noe vises selv om GitHub sin grense på 60 oppslag i timen er nådd
- «Andre offentlige repoer» (uten nettside) ligger sammenslått nederst
- Ingen byggesteg: alt ligger i `index.html`. `.nojekyll` slår av Jekyll.

## Publisere
1. Lag et **offentlig** repo som heter nøyaktig `tussienorway.github.io`.
2. Last opp `index.html`, `README.md` og `.nojekyll`.
3. Settings → Pages → «Deploy from a branch» → `main` / `(root)`.

Merk: Private repoer og sider vises ikke (API-et uten innlogging ser bare offentlige repoer).
