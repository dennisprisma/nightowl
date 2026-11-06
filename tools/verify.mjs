// Verifica logica dei casi: soluzione unica e risolvibilità.
import fs from 'fs';
const src = fs.readFileSync(new URL('../src/cases.js', import.meta.url), 'utf8');
const window = {}; eval(src);
const cases = window.NO_CASES;
let ok = true;
for (const c of cases) {
  const S = c.suspects.map(s => s.id), Wp = c.weapons.map(w => w.id), Pp = c.places.map(p => p.id);
  const acts = [];
  c.places.forEach(p => acts.push({ id: 'p:' + p.id, f: p.f || [], x: p.x || [], lie: false }));
  c.suspects.forEach(s => s.qa.forEach((q, i) => acts.push({ id: `q:${s.id}:${i}`, f: q.f || [], x: q.x || [], lie: !!q.lie })));
  const byId = Object.fromEntries(acts.map(a => [a.id, a]));
  // controlli di coerenza
  const errs = [];
  for (const a of acts) for (const f of a.f) {
    const [k, sign, id] = [f[0], f[1], f.slice(2)];
    const list = k === 'S' ? S : k === 'W' ? Wp : Pp;
    if (!list.includes(id)) errs.push(`${a.id}: fatto sconosciuto ${f}`);
    if (!a.lie) { // i fatti veri non devono contraddire la soluzione
      const sol = k === 'S' ? c.solution.s : k === 'W' ? c.solution.w : c.solution.p;
      if (sign === '-' && id === sol) errs.push(`${a.id}: esclude la soluzione (${f})`);
      if (sign === '+' && id !== sol) errs.push(`${a.id}: indica la cosa sbagliata (${f})`);
    }
    for (const x of a.x) if (!byId[x] || !byId[x].lie) errs.push(`${a.id}: smentisce ${x} che non è una bugia`);
  }
  const liars = c.suspects.filter(s => s.qa.some(q => q.lie));
  if (liars.length !== 1) errs.push(`bugiardi: ${liars.length}`);
  const lieActs = acts.filter(a => a.lie);
  for (const l of lieActs) if (!acts.some(a => a.x.includes(l.id))) errs.push(`bugia ${l.id} mai smentita`);
  const solve = (set) => {
    const facts = new Set();
    for (const a of set) { if (a.lie) { if (!set.some(b => b.x.includes(a.id))) return -1; continue; } a.f.forEach(f => facts.add(f)); }
    const cand = [];
    for (const s of S) for (const w of Wp) for (const p of Pp) {
      let good = true;
      for (const f of facts) {
        const k = f[0], sign = f[1], id = f.slice(2), v = k === 'S' ? s : k === 'W' ? w : p;
        if (sign === '+' && v !== id) good = false;
        if (sign === '-' && v === id) good = false;
      }
      if (good) cand.push(s + '/' + w + '/' + p);
    }
    return cand;
  };
  const all = solve(acts);
  const solStr = `${c.solution.s}/${c.solution.w}/${c.solution.p}`;
  if (!(all.length === 1 && all[0] === solStr)) errs.push(`con tutti gli indizi: ${JSON.stringify(all)}`);
  // ricerca del numero minimo di azioni e conteggio dei sottoinsiemi risolutivi entro 8
  const n = acts.length; let min = 99; const cnt = {};
  const rec = (start, chosen) => {
    if (chosen.length) { const r = solve(chosen); if (r !== -1 && r.length === 1) { min = Math.min(min, chosen.length); cnt[chosen.length] = (cnt[chosen.length] || 0) + 1; } }
    if (chosen.length >= 6) return;
    for (let i = start; i < n; i++) { chosen.push(acts[i]); rec(i + 1, chosen); chosen.pop(); }
  };
  rec(0, []);
  // probabilità che un giocatore che sceglie 8 azioni a caso risolva
  let wins = 0; const N = 20000;
  for (let t = 0; t < N; t++) { const pick = [...acts].sort(() => Math.random() - 0.5).slice(0, 8); const r = solve(pick); if (r !== -1 && r.length === 1) wins++; }
  // dimensioni testi
  const words = (t) => t.split(/\s+/).length;
  console.log(`${c.id.padEnd(13)} min=${min} risolutivi≤6=${JSON.stringify(cnt)} casuale8=${(wins / N * 100).toFixed(1)}%  intro=${c.intro.map(words).reduce((a, b) => a + b)}w`);
  if (errs.length) { ok = false; console.log('  ERRORI:\n  ' + errs.join('\n  ')); }
}
console.log(ok ? 'TUTTO OK' : 'CI SONO ERRORI');
