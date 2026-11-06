# nightowl — guida per Claude

Gioco investigativo noir per iPhone: un delitto ogni notte nella New York degli anni '30.
Il giocatore esamina luoghi, interroga sospettati, collega indizi sulla bacheca e accusa
chi, con cosa e dove. Interfaccia e testi **in italiano**. Il proprietario lavora da iPhone,
senza Mac né Xcode: il gioco è una PWA pubblicata su GitHub Pages e installata da Safari
("Aggiungi alla schermata Home").

Rispondi all'utente in italiano, con parole semplici: non è uno sviluppatore.

## Comandi

```bash
npm install && npx playwright install chromium   # solo la prima volta (serve per i test)
npm test            # verifica casi + build + animazioni + partita completa + PWA (circa 2 minuti)
npm run build       # crea dist/app (PWA) e dist/artifact/index.html (versione claude.ai)
npm run verify      # solo la logica dei casi (veloce, nessun browser)
npm run serve       # build + server su http://localhost:8765
npm run shots -- apertura 3,9,13          # screenshot dell'apertura agli istanti indicati
npm run shots -- viaggio coney 2.6,6.6    # screenshot del viaggio verso un caso (oppure "tutti")
npm run shots -- ritratti                 # tutti i ritratti dei sospettati
npm run audio -- studio,molo              # WAV in test/out/ (ffmpeg per misurare il volume)
npm run video -- viaggi                   # video di anteprima (serve ffmpeg)
NIGHT_OFFSET=3 node test/flow.mjs         # gioca il caso di 3 notti dopo
```

Screenshot, WAV e video finiscono in `test/out/` (ignorata da git). Se Chromium di Playwright
non c'è, puoi indicare un browser con `CHROME=/percorso/chrome`.

**Dopo ogni modifica visiva guarda davvero gli screenshot** (apri le PNG): i test controllano
solo che non ci siano errori, non che sia bello.

## Pubblicazione

Ogni push su `main` avvia `.github/workflows/pages.yml`: verifica i casi, fa la build e pubblica
`dist/app` su GitHub Pages. Il service worker riceve un'impronta della build (`__BUILD__` in
`public/sw.js`), quindi l'app installata si aggiorna da sola alla riapertura successiva.
`dist/` non va mai committata.

## Struttura

| File | Cosa fa |
|---|---|
| `src/index.src.html` | HTML + tutto il CSS. Segnaposto `<!--PWA-->` e `<!--SCRIPTS-->` riempiti dalla build |
| `src/cases.js` | `NO_CASES` (7 casi) e `NO_QUESTIONS` (le 3 domande fisse) |
| `src/portraits.js` | `NOPortrait.svg(look, opts)`: foto segnaletiche generate da parametri |
| `src/scene.js` | `NOScene`: motore 2.5D su Canvas, apertura e viaggi verso i casi |
| `src/audio.js` | `NOAudio`: tutto l'audio sintetizzato con WebAudio, nessun file audio |
| `src/game.js` | `NOGame`: schermate, stato, salvataggi, rotazione dei casi, integrazione claude.ai |
| `public/` | manifest, icone, service worker della PWA (copiati in `dist/app`) |
| `tools/build.mjs` | unisce tutto in un unico `index.html` (ordine: cases, portraits, scene, audio, game) |
| `tools/verify.mjs` | verificatore logico dei casi |
| `test/*.mjs` | test con Playwright; `test/*.html` sono pagine di prova per scena, audio, ritratti |

Nessuna dipendenza a runtime: un solo file HTML, funziona offline. Unica risorsa esterna: Google Fonts
(Playfair Display, Special Elite). Non introdurre framework o bundler senza chiederlo.

## Il gioco (game.js)

- **Una notte, un caso.** `EPOCH` = 6 novembre 2026 = notte 1. `ORDER` stabilisce la rotazione dei 7 casi.
  `NOGame.caseForNight(n)`, `NOGame.nightNumber()`.
- **Fiammiferi:** 8 azioni per caso (`MAXA`), massimo 3 domande per sospettato (`MAXQ`).
  Punteggio: vittoria = 100 + 15 per fiammifero avanzato.
- **Stato** in `localStorage['nightowl.v1']`: `S.plays['n'+notte]` per la partita del giorno,
  `S.plays['p:'+id]` per le anteprime dell'archivio, `S.stats`, `S.settings`.
  Se cambi la forma dei dati, mantieni compatibili i salvataggi esistenti.
- **Flusso:** apertura → home (studio) → tocco sul caso → viaggio → fascicolo (macchina da scrivere)
  → schede Luoghi / Sospettati / Bacheca / Taccuino → accusa → rapporto finale con timbro e condivisione.
- **Solo su claude.ai** (`window.claude.use`): `sample` per le domande libere (Claude risponde nei panni
  del sospettato, formato `RISPOSTA:` / `APPUNTO:`), `db` + `user` per la classifica (`board/<uid>`).
  Nella PWA (`window.NO_PWA = true`) queste funzioni non ci sono e l'interfaccia le nasconde.
  Tutto deve funzionare anche senza.

## I casi (cases.js) — regole che il verificatore impone

Ogni caso: 5 sospettati, 5 armi, 5 luoghi, **una sola soluzione** (`solution: {s, w, p}`), `explanation`,
`neon` (scritta dell'insegna) e `headline` (titolo del giornale nello studio, due righe separate da `|`).

- Ogni indizio (domanda `qa` o luogo) ha `f`: i fatti logici che se ne ricavano, es. `'S-hazel'`
  (Hazel esclusa), `'W+piede'` (l'arma è il piede di porco), `'P-palco'`.
- **Esattamente un bugiardo** per caso: una sua risposta ha `lie: true`. Un altro indizio deve smentirla
  con `x: ['q:<sospettato>:<indice>']`. I fatti veri non possono mai contraddire la soluzione.
- La soluzione deve essere ricavabile con le azioni disponibili; il verificatore calcola il minimo
  di azioni necessarie (oggi 4–5 su 8) e quanto si vince tirando a caso. Tienilo così: né banale né impossibile.
- `look` dei sospettati: vedi le opzioni in `portraits.js` (g, age, face, hair, hc, skin, fh, glasses, hat, ex).
- **Un caso nuovo richiede anche:** una voce in `VENUES` dentro `scene.js` (il luogo del viaggio)
  e il suo id in `ORDER` in `game.js`. `test/scene.mjs` fallisce se manca il luogo.

## Le animazioni (scene.js)

Motore 2.5D fatto a mano: `proj(x,y,z)` con piano vicino `NEAR` e clipping (`path3`, `poly3`, `line3`),
pittore per l'ordine di disegno, edifici dello skyline disegnati una volta su canvas in cache.

- **Apertura** (uguale ogni sera, `END_T` = 15,8 s): ripresa A sul detective nel vicolo (0–5 s), stacco
  su un lampo, ripresa B bassa sotto la sopraelevata con il treno (5–8,2 s), ripresa C che sale sopra
  la città e rientra dalla finestra nello studio (8,6–15,8 s); poi si accende la lampada e si aprono gli
  occhi del gufo. **Il nome "nightowl" non deve mai comparire nell'animazione** (richiesta esplicita).
  L'insegna del vicolo dice "JAZZ"; solo il giornale sulla scrivania mostra il caso della notte.
- **Viaggio verso il caso** (`trip`): la camera esce dalla finestra (`TRIP_OUT` = 2 s), stacco con lampo,
  arrivo sul luogo (`TRIP_DEST` = 4,6 s) con meteo e suono propri, il titolo si scrive a macchina,
  poi `onDone`. Prima apertura del caso = viaggio completo; riaperture = solo l'arrivo (`{short:true}`).
  "Salta" chiama `skipTrip`; "Studio" chiama `toOffice`.
- `VENUES[id]`: `kind` (club, paper, hotel, pier, theater, lunapark, tower), `weather`
  (rain, wind, fog, snow), `cue` (suono d'arrivo), `H` (altezza edificio), `path` (camera da → a),
  `police`, `ground`.
- **Segnali verso l'audio** con `opts.onCue(nome, valore)`: step, match, train, radio (vicinanza della
  radio jazz 0–1), lamp, key, weather, più il suono d'arrivo di ogni luogo.
- Per i test: `renderAt(t)`, `renderTripAt(info, t)`, `venueIds()`, `frame(dt)`, `pause(true)`.

## L'audio (audio.js)

Pioggia, tuoni e treno sono buffer stereo pre-generati; compressore e riverbero a convoluzione con
risposta generata; jazz "da grammofono" sintetizzato (piano elettrico FM, contrabbasso, spazzole, vibrafono,
giro di Do minore). Modalità: `outside` (strada), `office` (studio, jazz), `focus` (indagine).
`setWeather`, `setProximity`, `click(tipo)`.
**Pensato per l'altoparlante dell'iPhone:** tuoni e basso hanno medie frequenze udibili; volume
complessivo intorno a -18 LUFS, picchi sotto -3 dBFS (`npm run audio`, poi `ffmpeg -af ebur128=peak=true`).
Niente suoni stridenti né "bip" ripetuti: l'utente li ha già bocciati una volta.

## Trappole già incontrate

- In `build.mjs` usa sempre **funzioni** come secondo argomento di `replace()`: il JS contiene `$'`
  e simili, che con una stringa rompono il file finale.
- Un `createRadialGradient` con raggio negativo lancia un'eccezione e ferma l'animazione: proteggi
  i raggi con `Math.max(0.1, …)`. `safeRender` tiene vivo il ciclo ma nasconde l'errore: per questo
  `renderAt`/`renderTripAt` usano `render()` diretto e i test li vedono.
- Gradienti con bordo netto sulle nuvole sembrano bolle di sapone: usa sbuffi morbidi.
- I fiocchi di neve vanno limitati in dimensione (0,6–2,4 px) o, vicini alla camera, diventano enormi.
- Inquadrature finali dei viaggi: controlla che l'insegna del luogo non sia tagliata, in verticale e in orizzontale.
- Formato di riferimento: iPhone in verticale, 390×844. Controlla anche 844×390 e 375×667.
- Il timbro "CASO CHIUSO" nel rapporto finale copre in parte l'etichetta "CHI": da sistemare.

## Idee in sospeso (proposte, non ancora decise dall'utente)

- Città in 3D vero con Three.js/WebGL (ora si possono installare librerie).
- Domande libere e classifica anche nella PWA: richiedono un piccolo backend (per esempio una funzione
  serverless con la chiave API di Claude, a pagamento a consumo, e un database per la classifica).
  Mai mettere chiavi API nel codice del client.
- Luoghi illustrati nello stesso stile delle animazioni, meccanica "metti a confronto le prove",
  tutorial nella prima notte, altri casi.
