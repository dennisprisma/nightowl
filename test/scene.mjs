// Controlla tutti i fotogrammi delle due animazioni, senza screenshot:
//  1) apertura (vicoli → città → studio) su 4 formati di schermo
//  2) viaggio verso ciascun caso (fuori dalla finestra → luogo del delitto)
// Fallisce se un fotogramma lancia un errore o se un caso non ha il suo luogo.
// I tempi di disegno sono solo indicativi (Chromium headless disegna senza GPU, molto più lento di un iPhone).
import { launch, fileUrl, collect, report } from './lib.mjs';

const VIEWPORTS = [[390, 844], [844, 390], [1280, 800], [375, 667]];

const b = await launch();
const errs = [];
for (const [w, h] of VIEWPORTS) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const pe = collect(p, { warnings: true });
  await p.goto(fileUrl('test/scene.html'));
  await p.addScriptTag({ path: new URL('../src/cases.js', import.meta.url).pathname });
  const dense = w === 390; // controllo fitto sul formato iPhone, più rado sugli altri
  const r = await p.evaluate(({ dense }) => {
    const out = { errs: [], ms: [] };
    const time = (label, fn) => {
      const a = performance.now();
      try { fn(); } catch (e) { out.errs.push(label + ': ' + e.message); }
      out.ms.push(performance.now() - a);
    };
    for (let t = 0; t <= NOScene.END_T + 2; t += dense ? 0.02 : 0.05) time('apertura@' + t.toFixed(2), () => NOScene.renderAt(t));
    const venues = NOScene.venueIds();
    for (const c of NO_CASES) {
      if (!venues.includes(c.id)) out.errs.push(`il caso "${c.id}" non ha un luogo in VENUES (scene.js)`);
      if (!c.headline || !c.neon) out.errs.push(`il caso "${c.id}" non ha headline/neon`);
      const info = { id: c.id, n: 1, title: c.title, where: c.where, year: c.year, headline: c.headline };
      for (let t = 0; t <= 7.4; t += dense ? 0.05 : 0.12) time(c.id + '@' + t.toFixed(2), () => NOScene.renderTripAt(info, t));
    }
    const s = out.ms.sort((a, b) => a - b);
    return { errs: out.errs.slice(0, 8), n: s.length, med: s[s.length >> 1], p95: s[Math.floor(s.length * 0.95)] };
  }, { dense });
  console.log(`  ${w}x${h}  ${r.n} fotogrammi, disegno mediano ${r.med.toFixed(1)} ms, p95 ${r.p95.toFixed(1)} ms`);
  errs.push(...r.errs.map((e) => `${w}x${h} ${e}`), ...pe.map((e) => `${w}x${h} ${e}`));
  await p.close();
}
await b.close();
report('animazioni (apertura + viaggi)', errs);
