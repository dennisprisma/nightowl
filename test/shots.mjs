// Screenshot per controllare a occhio le animazioni (in test/out/).
// Uso:
//   node test/shots.mjs apertura [tempi=1,3,5.5,7.5,9,10.5,12.4,13.8,15,17] [larghezza=390] [altezza=844]
//   node test/shots.mjs viaggio <idCaso|tutti> [tempi=1.2,2.6,4.4,6.6] [larghezza] [altezza]
//   node test/shots.mjs ritratti
import { launch, fileUrl, OUT } from './lib.mjs';

const [what = 'apertura', a, b2, w = 390, h = 844] = process.argv.slice(2);
const br = await launch();
const p = await br.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 2 });
const saved = [];
if (what === 'ritratti') {
  await p.setViewportSize({ width: 900, height: 1400 });
  await p.goto(fileUrl('test/portraits.html')); await p.waitForTimeout(300);
  await p.screenshot({ path: OUT + 'ritratti.png', fullPage: true }); saved.push('ritratti.png');
} else {
  await p.goto(fileUrl('test/scene.html'));
  await p.addScriptTag({ path: new URL('../src/cases.js', import.meta.url).pathname });
  if (what === 'apertura') {
    const times = (a || '1,3,5.5,7.5,9,10.5,12.4,13.8,15,17').split(',').map(Number);
    for (const t of times) { await p.evaluate((t) => NOScene.renderAt(t), t); const f = `apertura_${String(t).replace('.', '_')}_${w}x${h}.png`; await p.screenshot({ path: OUT + f }); saved.push(f); }
  } else if (what === 'viaggio') {
    const ids = !a || a === 'tutti' ? await p.evaluate(() => NO_CASES.map((c) => c.id)) : a.split(',');
    const times = (b2 || '1.2,2.6,4.4,6.6').split(',').map(Number);
    for (const id of ids) for (const t of times) {
      await p.evaluate(({ id, t }) => { const c = NO_CASES.find((x) => x.id === id); NOScene.renderTripAt({ id, n: 1, title: c.title, where: c.where, year: c.year }, t); }, { id, t });
      const f = `viaggio_${id}_${String(t).replace('.', '_')}.png`; await p.screenshot({ path: OUT + f }); saved.push(f);
    }
  } else { console.log('uso: apertura | viaggio <id|tutti> | ritratti'); process.exitCode = 1; }
}
await br.close();
console.log(saved.length + ' immagini in test/out/');
