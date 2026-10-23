# Tussie Norway — prosjekter og nettsider

Personlig prosjektoversikt på **https://tussienorway.github.io/**. Siden henter offentlige repoer fra GitHub API-et og viser hvilke som har GitHub Pages aktivert. Nye Pages-sider kommer automatisk med.

## Funksjoner

- Søk i navn, beskrivelse, språk og emner.
- Sorter på sist oppdatert, navn eller stjerner.
- Se nøkkeltall, språk, emner og oppdateringstid for prosjektene.
- Åpne nettsider og GitHub-repoer direkte fra kortene.
- Repoer uten nettside ligger samlet i en egen, utfoldbar liste.
- Sist hentede data lagres i nettleseren og vises hvis GitHub API-et ikke svarer eller har nådd oppslagsgrensen.
- Responsiv visning, tastaturfokus, hoppelenke og støtte for redusert bevegelse.

## Teknisk

Dette er en statisk side uten byggesteg eller eksterne JavaScript-avhengigheter. Alt ligger i `index.html`; GitHub sitt offentlige API er datakilden, og `localStorage` holder en lokal reservekopi.

GitHub Pages publiserer `main` fra rotmappen i repoet `tussienorway/tussienorway.github.io`.
