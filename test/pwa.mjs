// Serve dist/app su localhost e controlla che la PWA sia installabile:
// manifest valido, service worker attivo con la cache della build, nessun errore.
import { launch, collect, report } from './lib.mjs';
import { serve } from '../tools/serve.mjs';
import { fileURLToPath } from 'url';

const PORT = 8765;
const server = await serve(fileURLToPath(new URL('../dist/app', import.meta.url)), PORT);
const b = await launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = collect(p);
await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(2500);
const r = await p.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const l = document.querySelector('link[rel=manifest]');
  const m = l ? await (await fetch(l.href)).json() : null;
  const keys = await caches.keys();
  return { sw: !!(reg && (reg.active || reg.installing || reg.waiting)), manifest: m && { name: m.name, display: m.display, icons: m.icons.length }, keys, pwaFlag: !!window.NO_PWA };
});
console.log('  ', JSON.stringify(r));
if (!r.sw) errs.push('service worker non registrato');
if (!r.manifest || r.manifest.display !== 'standalone' || r.manifest.icons < 2) errs.push('manifest incompleto');
if (!r.pwaFlag) errs.push('NO_PWA non impostato nella versione app');
if (r.sw && !r.keys.some((k) => /^nightowl-[0-9a-f]{10}$/.test(k))) errs.push('cache del service worker senza impronta della build: ' + r.keys.join(','));
await b.close(); server.close();
report('PWA installabile', errs);
