# nightowl 🦉

Un delitto ogni notte nella New York degli anni '30.
Esamina i luoghi, interroga i sospettati, collega gli indizi con il filo rosso e accusa
**chi**, **con cosa** e **dove**, prima di finire i fiammiferi.

Si gioca nel browser e si installa su iPhone come un'app, senza Mac né Xcode.

## Installarlo su iPhone

1. Apri in Safari l'indirizzo del gioco: `https://<tuo-utente>.github.io/nightowl/`
2. Tocca **Condividi** → **Aggiungi alla schermata Home**.

Si apre a tutto schermo con l'icona del gufo e, dopo la prima apertura, funziona anche offline.
Quando pubblichi una nuova versione, l'app si aggiorna da sola alla riapertura successiva.

## Pubblicazione automatica (una sola volta)

Nel repository su GitHub: **Settings → Pages → Source: GitHub Actions**.
Da lì in poi ogni modifica su `main` viene pubblicata da sola in un paio di minuti
(lo stato si vede nella scheda **Actions**).

## Lavorarci con Claude Code

Apri Claude Code (anche dall'app Claude o da claude.ai/code), scegli questo repository e chiedi
quello che vuoi cambiare. Le istruzioni per Claude sono in [`CLAUDE.md`](CLAUDE.md).

Comandi principali per lo sviluppo:

```bash
npm install && npx playwright install chromium
npm test          # verifica casi, animazioni, partita completa e PWA
npm run serve     # prova in locale su http://localhost:8765
```

## Due versioni

- **App (PWA)**, in `dist/app`: quella da installare. Le domande libere ai sospettati e la classifica
  non ci sono, perché richiedono Claude.
- **claude.ai**, in `dist/artifact/index.html`: la stessa pagina pensata per girare dentro claude.ai,
  dove le domande libere (risponde Claude nei panni del sospettato) e la classifica funzionano.
