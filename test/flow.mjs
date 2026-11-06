// Partita completa sul caso della notte, come la farebbe un giocatore su iPhone:
// apertura → home → viaggio → fascicolo → luogo → interrogatorio → bacheca → taccuino → accusa → risultato → archivio.
// Gli id vengono letti dal caso del giorno, quindi il test funziona qualunque sia la data.
// Uso: node test/flow.mjs [url]   (default: dist/artifact/index.html; screenshot in test/out/)
//      NIGHT_OFFSET=3 node test/flow.mjs   → gioca il caso di 3 notti dopo (sposta l'orologio della pagina)
import { launch, fileUrl, collect, report, PHONE, OUT } from './lib.mjs';

const url = process.argv[2] || fileUrl('dist/artifact/index.html');
const b = await launch(['--autoplay-policy=no-user-gesture-required']);
const p = await b.newPage(PHONE);
const errs = collect(p, { warnings: true });
const offset = Number(process.env.NIGHT_OFFSET || 0);
if (offset) await p.addInitScript((shift) => {
  const D = Date;
  class ShiftedDate extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + shift); } static now() { return D.now() + shift; } }
  window.Date = ShiftedDate;
}, offset * 864e5);
const shot = (n) => p.screenshot({ path: `${OUT}flow_${n}.png` });
const wait = (ms) => p.waitForTimeout(ms);
const check = async (cond, msg) => { if (!(await p.evaluate(cond))) errs.push('controllo fallito: ' + msg); };

await p.goto(url); await wait(2500); await shot('01_apertura');
await p.mouse.click(200, 400); await wait(1500); await shot('02_home');
await check(() => !document.getElementById('home').classList.contains('hidden'), 'la home non compare dopo il tocco');

const c = await p.evaluate(() => { const c = NOGame.caseForNight(NOGame.nightNumber()); return { id: c.id, title: c.title, sol: c.solution, place: c.places[0].id, sus: c.suspects[0].id }; });
console.log(`  caso della notte: ${c.title} (${c.id})`);

await p.click('[data-act="open-daily"]'); await wait(1500); await shot('03_viaggio');
await check(() => NOScene.inTrip(), 'il viaggio verso il caso non parte');
await wait(5200); await shot('04_arrivo'); await wait(2200); await shot('05_fascicolo');
for (let i = 0; i < 3; i++) { await p.click('#dossier'); await wait(400); }
await p.evaluate(() => { const s = document.querySelector('.scroll'); if (s) s.scrollTop = 99999; }); await wait(300);
await p.click('[data-act="start"]'); await wait(700); await shot('06_luoghi');

await p.click(`[data-act="place"][data-id="${c.place}"]`); await wait(500);
await p.click('[data-act="exam"]'); await wait(300); await p.click('.clue'); await wait(500); await shot('07_indizio');
await p.click('#sheet-bg', { position: { x: 20, y: 20 } }); await wait(400);

await p.click('[data-tab="sospettati"]'); await wait(400);
await p.click(`[data-act="sus"][data-id="${c.sus}"]`); await wait(500);
await p.click('[data-act="ask"][data-i="0"]'); await wait(3500); await shot('08_interrogatorio');
await p.click('#sheet-bg', { position: { x: 20, y: 20 } }); await wait(400);

await p.click('[data-tab="bacheca"]'); await wait(400);
const notes = await p.$$('[data-act="note"]');
if (notes.length > 1) { await notes[0].click(); await wait(150); await (await p.$$('[data-act="note"]'))[1].click(); await wait(400); }
await shot('09_bacheca');

await p.click('[data-tab="taccuino"]'); await wait(300);
await p.click(`[data-k="S:${c.sol.s}"]`); await wait(300); await shot('10_taccuino');

await p.click('[data-act="accuse"]'); await wait(500);
for (const [g, id] of [['s', c.sol.s], ['w', c.sol.w], ['p', c.sol.p]]) { await p.click(`[data-act="pick"][data-g="${g}"][data-id="${id}"]`); await wait(150); }
await shot('11_accusa');
await p.click('[data-act="accuse-confirm"]'); await wait(400);
await p.click('[data-act="accuse-go"]'); await wait(2500); await shot('12_risultato');
await check(() => { const r = NOGame.state().plays['n' + NOGame.nightNumber()]?.result; return !!(r && r.win); }, 'l\'accusa corretta non risulta vinta');

await p.click('[data-act="home"]'); await wait(1200); await shot('13_home_dopo');
await p.click('#btn-menu'); await wait(500); await shot('14_menu');
await p.click('.menu-list [data-act="archive"]'); await wait(500); await shot('15_archivio');

await b.close();
report('partita completa', errs);
