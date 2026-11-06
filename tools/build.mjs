// Costruisce le due versioni del gioco a partire da src/:
//   dist/artifact/index.html  pagina unica per claude.ai (domande libere e classifica attive)
//   dist/app/                 PWA installabile (index.html + public/: manifest, icone, service worker)
// Uso: node tools/build.mjs
import fs from 'fs';
import crypto from 'crypto';

const at = (p) => new URL('../' + p, import.meta.url);
const R = (p) => fs.readFileSync(at(p), 'utf8');
const W = (p, s) => { fs.mkdirSync(new URL('.', at(p)), { recursive: true }); fs.writeFileSync(at(p), s); };

// Ordine importante: game.js usa tutto ciò che viene prima.
const files = ['src/cases.js', 'src/portraits.js', 'src/scene.js', 'src/audio.js', 'src/game.js'];
const js = files.map((f) => `/* ${f} */\n` + R(f).replace(/<\/script/gi, '<\\/script')).join('\n');
const tpl = R('src/index.src.html');
const scripts = (pwa) => `<script>${pwa ? 'window.NO_PWA=true;' : ''}</script>\n<script>\n${js}\n</script>`;
const pwaHead = `<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icon-180.png">\n<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">`;

// ATTENZIONE: sempre funzioni come secondo argomento di replace(), mai stringhe.
// Il JS contiene sequenze come $' e $& che replace() interpreterebbe come pattern speciali.
const artifact = tpl.replace('<!--PWA-->', () => '').replace('<!--SCRIPTS-->', () => scripts(false));
const app = tpl.replace('<!--PWA-->', () => pwaHead).replace('<!--SCRIPTS-->', () => scripts(true));
W('dist/artifact/index.html', artifact);
W('dist/app/index.html', app);

// File statici della PWA; il service worker riceve l'impronta della build.
const build = crypto.createHash('sha1').update(app).update(R('public/manifest.webmanifest')).digest('hex').slice(0, 10);
for (const f of fs.readdirSync(at('public'))) {
  const src = at('public/' + f);
  if (f === 'sw.js') W('dist/app/sw.js', fs.readFileSync(src, 'utf8').replace(/__BUILD__/g, () => build));
  else fs.copyFileSync(src, at('dist/app/' + f));
}

const kb = (p) => (fs.statSync(at(p)).size / 1024).toFixed(0) + ' KB';
console.log(`ok  artifact ${kb('dist/artifact/index.html')}  app ${kb('dist/app/index.html')}  build ${build}`);
