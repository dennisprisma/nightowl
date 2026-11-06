/* nightowl — scena animata: vicoli → città → studio del detective.
   Motore 2.5D su canvas: proiezione prospettica, poligoni con clipping
   sul piano vicino, "flat" disegnati in coordinate mondo. Stile cartoon:
   contorni neri spessi, colori piatti, luce color crema, unico accento rosso. */
window.NOScene = (function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const io = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  const sio = (t) => { t = clamp(t, 0, 1); return -(Math.cos(Math.PI * t) - 1) / 2; };
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function h3(a, b, c) { let n = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791); n = Math.imul(n ^ (n >>> 13), 0x5bd1e995); n ^= n >>> 15; return (n >>> 0) / 4294967296; }

  const INK = '#09090b';
  const CREAM = '#efe1bb';
  const RED = '#d0101c';
  const ZW = -95;            // parete della finestra dello studio
  const YO = -45.5;          // centro finestra (y verso il basso, terra = 0)
  const FLOOR = YO + 1.6;
  const CEIL = YO - 1.75;
  const WIN = { x1: -0.8, x2: 0.8, y1: YO - 1.0, y2: YO + 1.0 };
  const CAM_END = { x: 0, y: YO + 0.15, z: ZW - 3.6 };
  function fitEnd() { CAM_END.z = ZW - (W / H < 0.8 ? 4.35 : 3.6); }
  const A_END = 5.0, B_END = 8.2, C0 = 8.6; // inquadrature: detective, volo nel vicolo, gru verso lo studio
  const END_T = 15.8;
  const NEAR = 0.12;

  let cv, ctx, W = 0, H = 0, DPR = 1, F = 400;
  const cam = { x: 0, y: -1.65, z: 1, roll: 0 };
  let T = 0, clock = 0, last = 0, raf = 0, running = false, paused = false;
  let rate = 1, mode = 'intro', onDone = null, doneFired = false, reduce = false;
  let flash = 0, flashEvents = [], bolt = null, nextIdleFlash = 0;
  let owlOpen = 0, owlBlink = 0, nextBlink = 3, owlTurn = 0;
  let grainCanvas = null, vignette = null, grainPattern = null;
  let onThunder = null, onPhase = null, lastPhase = null;
  let skipFade = 0;
  let endClock = -1, lampLevel = 1, onLamp = null, lampFired = false, onCue = null, matchFired = false;
  let ROLL = 0, ZOOM = 1, caseInfo = null, titleFade = 0, typedChars = 0, lastProx = -1, stepSign = 0, trainFired = false;
  const SPARKS = [];

  /* ---------------------------------------------------------------- */
  /* Proiezione                                                        */
  function proj(x, y, z) {
    const s = F / (z - cam.z);
    return [W / 2 + (x - cam.x) * s, H / 2 + (y - cam.y) * s, s];
  }
  function lwFor(d) { return clamp(2.7 * Math.pow(10 / Math.max(d, 0.1), 0.6), 0.45, 3.4); }

  // poligono 3D con clipping sul piano vicino
  function path3(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const da = a[2] - cam.z, db = b[2] - cam.z;
      if (da >= NEAR) out.push(a);
      if ((da >= NEAR) !== (db >= NEAR)) {
        const t = (NEAR - da) / (db - da);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, cam.z + NEAR]);
      }
    }
    if (out.length < 3) return false;
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    const sp = out.map((p) => { const q = proj(p[0], p[1], p[2]); if (q[0] < minx) minx = q[0]; if (q[0] > maxx) maxx = q[0]; if (q[1] < miny) miny = q[1]; if (q[1] > maxy) maxy = q[1]; return q; });
    if (maxx < -80 || minx > W + 80 || maxy < -80 || miny > H + 80) return false;
    ctx.beginPath();
    ctx.moveTo(sp[0][0], sp[0][1]);
    for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1]);
    ctx.closePath();
    return true;
  }
  function poly3(pts, fill, stroke, lw) {
    if (!path3(pts)) return false;
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; ctx.stroke(); }
    return true;
  }
  function line3(a, b, stroke, lw) {
    let da = a[2] - cam.z, db = b[2] - cam.z;
    if (da < NEAR && db < NEAR) return;
    if (da < NEAR) { const t = (NEAR - da) / (db - da); a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, cam.z + NEAR]; }
    if (db < NEAR) { const t = (NEAR - db) / (da - db); b = [b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t, cam.z + NEAR]; }
    const p = proj(a[0], a[1], a[2]), q = proj(b[0], b[1], b[2]);
    if (Math.max(p[0], q[0]) < -20 || Math.min(p[0], q[0]) > W + 20 || Math.max(p[1], q[1]) < -20 || Math.min(p[1], q[1]) > H + 20) return;
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
    ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke();
  }
  // disegno "piatto" su un piano z = costante, in coordinate mondo
  let curS = 1, curD = 1;
  function setRoll(r) {
    ROLL = r || 0;
    const c = Math.cos(Math.abs(ROLL)), sn = Math.sin(Math.abs(ROLL));
    ZOOM = ROLL ? Math.max((W * c + H * sn) / W, (W * sn + H * c) / H) * 1.01 : 1;
  }
  function baseT() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (ROLL) { ctx.translate(W / 2, H / 2); ctx.rotate(ROLL); ctx.scale(ZOOM, ZOOM); ctx.translate(-W / 2, -H / 2); }
  }
  function flat(z, fn) {
    const d = z - cam.z;
    if (d < NEAR) return;
    const s = F / d;
    curS = s; curD = d;
    baseT(); ctx.transform(s, 0, 0, s, W / 2 - cam.x * s, H / 2 - cam.y * s);
    fn(s, d);
    baseT();
  }
  function vis(x1, y1, x2, y2) { // rettangolo mondo visibile nel flat corrente?
    const s = curS;
    const a = W / 2 + (x1 - cam.x) * s, b = W / 2 + (x2 - cam.x) * s;
    const c = H / 2 + (y1 - cam.y) * s, e = H / 2 + (y2 - cam.y) * s;
    return !(b < -70 || a > W + 70 || e < -70 || c > H + 70);
  }
  function LW(px) { return (px == null ? lwFor(curD) : px) / curS; }

  /* ---------------------------------------------------------------- */
  /* Mondo: isolati attorno al vicolo                                   */
  const BOXES = [];
  function box(x1, x2, z1, z2, h, o) { BOXES.push(Object.assign({ x1, x2, z1, z2, h, seed: BOXES.length * 977 + 13 }, o || {})); }
  // vicolo: pareti interne a x ≈ ±2
  box(-13, -2.1, 0, 18, 14, { adj: 'L', shop: 'DRUGS' });
  box(-12, -1.9, 18, 34, 18, { adj: 'L', fe: true });
  box(-12, -2.2, 37, 50, 12.5, { adj: 'L', fe: true });
  box(-12, -2.2, 50, 60, 12.5, { adj: 'L' });
  box(2.0, 15, 0, 16, 16.5, { adj: 'R', fe: true, shop: 'DINER' });
  box(1.9, 12, 16, 30, 12, { adj: 'R' });
  box(2.1, 12, 33, 50, 20, { adj: 'R', fe: true });
  box(2.1, 12, 50, 60, 20, { adj: 'R' });
  box(-12, 12, 60, 74, 15, { end: true });
  // fronte strada
  box(-27, -13, 0, 20, 22, { shop: 'HOTEL' });
  box(-44, -27, 0, 18, 11, { shop: 'PAWN' });
  box(-66, -44, 0, 22, 29, {});
  box(-92, -66, 0, 18, 15, { shop: 'BAR' });
  box(15, 30, 0, 18, 10, { shop: 'CAFE' });
  box(30, 47, 0, 20, 25, {});
  box(47, 70, 0, 16, 13, { shop: 'GARAGE' });
  box(70, 96, 0, 22, 20, {});
  // retro isolato
  box(-30, -12, 22, 50, 16, {}); box(-30, -12, 50, 74, 21, {});
  box(-55, -30, 22, 74, 13, {}); box(-92, -55, 24, 74, 17, {});
  box(12, 32, 20, 46, 14, {}); box(12, 32, 46, 74, 10, {});
  box(32, 60, 22, 74, 18, {}); box(60, 96, 24, 74, 12, {});
  BOXES.forEach((b) => {
    if (b.el) return;
    const r = rng(b.seed);
    const g = 30 + Math.floor(r() * 10);
    b.col = `rgb(${g},${g + 1},${g + 6})`;
    b.side = `rgb(${g - 6},${g - 5},${g})`;
    b.tank = !b.adj && r() < 0.55 || b.adj === 'R' && b.h > 15;
    b.tankX = lerp(b.x1 + 2, b.x2 - 2, r());
    b.tankZ = lerp(b.z1 + 3, b.z2 - 3, r());
    b.chim = r() < 0.6;
  });
  BOXES.push({ el: true, z1: 49.99, z2: 50.5, x1: -12, x2: 12, h: 0, seed: 1 });
  BOXES.sort((a, b) => b.z1 - a.z1 || Math.abs(b.x1 + b.x2) - Math.abs(a.x1 + a.x2));

  const LAMPS = [
    { x: -1.95, y: -3.6, z: 7, s: -1 },
    { x: 1.95, y: -3.6, z: 15, s: 1 },
    { x: -1.95, y: -3.6, z: 27, s: -1, flick: true },
    { x: 1.95, y: -3.6, z: 41, s: 1 },
    { x: -1.95, y: -3.6, z: 52, s: -1 },
    { x: 0, y: -3.3, z: 59.95, s: 0 },
  ];
  const STREETLAMPS = [-7, 8.5, -30, 33, -58, 60].map((x) => ({ x, z: -1.9 }));
  const PUDDLES = [{ x: -0.6, z: 9, r: 0.9 }, { x: 0.9, z: 22.5, r: 0.7 }, { x: -0.3, z: 33, r: 1.1 }, { x: 0.5, z: 46, r: 0.8 }];
  const LAUNDRY = [{ z: 20, y: -6.6 }, { z: 39, y: -7.0 }];

  // Skyline
  const SKY = [];
  (function buildSkyline() {
    const r = rng(1937);
    SKY.push({ t: 'empire', x: -26, z: 270, w: 34, h: 190 });
    SKY.push({ t: 'chrysler', x: 44, z: 236, w: 22, h: 168 });
    SKY.push({ t: 'gothic', x: -95, z: 318, w: 26, h: 132 });
    SKY.push({ t: 'slab', x: 108, z: 300, w: 32, h: 150 });
    const rows = [
      { z: 84, n: 30, a: 7, b: 17 }, { z: 104, n: 26, a: 10, b: 26 },
      { z: 118, n: 22, a: 18, b: 42 }, { z: 145, n: 20, a: 24, b: 58 }, { z: 175, n: 18, a: 30, b: 75 },
      { z: 205, n: 16, a: 34, b: 90 }, { z: 255, n: 16, a: 40, b: 105 }, { z: 340, n: 18, a: 50, b: 120 }, { z: 400, n: 22, a: 30, b: 95 },
    ];
    const types = ['flat', 'stepped', 'pyramid', 'dome', 'flat', 'stepped', 'antenna', 'crown'];
    [92, 112, 132, 162, 228].forEach((z, i) => SKY.push({ t: 'lights', z, seed: 500 + i }));
    [100, 190].forEach((z) => SKY.push({ t: 'mist', z }));
    rows.forEach((row, ri) => {
      const span = 260 + row.z * 0.25;
      for (let i = 0; i < row.n; i++) {
        const x = -span + (i + 0.5) * (2 * span / row.n) + (r() - 0.5) * 10;
        if (row.z > 200 && Math.abs(x + 26) < 24 && row.z < 300) continue;
        const w = 12 + r() * 16;
        let h = row.a + r() * (row.b - row.a);
        if (Math.abs(x) < 50 && row.z < 160) h *= 0.75;
        SKY.push({ t: types[Math.floor(r() * types.length)], x, z: row.z + (r() - 0.5) * 8, w, h, seed: ri * 100 + i });
      }
    });
    SKY.sort((a, b) => b.z - a.z);
  })();

  /* ---------------------------------------------------------------- */
  /* Canvas cache per gli edifici lontani                               */
  const KPX = 3.4;
  function skyColors(z) {
    const f = clamp((z - 110) / 300, 0, 1);
    const c = Math.round(lerp(40, 66, f)), c2 = Math.round(lerp(46, 74, f));
    return { body: `rgb(${c},${c + 2},${c2})`, dark: `rgb(${c - 8},${c - 7},${c2 - 6})`, line: `rgba(9,9,11,${lerp(0.95, 0.45, f)})`, win: lerp(0.95, 0.6, f) };
  }
  function shapeOf(b) {
    // contorno dell'edificio in coordinate locali (x centrato, y=0 a terra, verso l'alto negativo)
    const w = b.w, h = b.h, hw = w / 2, P = [];
    const R = rng((b.seed || 7) * 31 + 5);
    switch (b.t) {
      case 'empire': {
        P.push([-hw, 0], [-hw, -h * 0.55], [-hw * 0.78, -h * 0.55], [-hw * 0.78, -h * 0.72], [-hw * 0.55, -h * 0.72], [-hw * 0.55, -h * 0.86], [-hw * 0.34, -h * 0.86], [-hw * 0.34, -h * 0.94], [-hw * 0.2, -h * 0.94], [-hw * 0.2, -h], [-hw * 0.09, -h], [-hw * 0.05, -h * 1.12], [-0.6, -h * 1.12], [0, -h * 1.24], [0.6, -h * 1.12], [hw * 0.05, -h * 1.12], [hw * 0.09, -h], [hw * 0.2, -h], [hw * 0.2, -h * 0.94], [hw * 0.34, -h * 0.94], [hw * 0.34, -h * 0.86], [hw * 0.55, -h * 0.86], [hw * 0.55, -h * 0.72], [hw * 0.78, -h * 0.72], [hw * 0.78, -h * 0.55], [hw, -h * 0.55], [hw, 0]);
        break;
      }
      case 'chrysler': {
        P.push([-hw, 0], [-hw, -h * 0.62], [-hw * 0.72, -h * 0.62], [-hw * 0.72, -h * 0.78]);
        const steps = 5;
        for (let i = 0; i < steps; i++) {
          const k = 1 - i / steps, yb = -h * (0.78 + i * 0.035);
          P.push([-hw * 0.72 * k, yb], [-hw * 0.72 * k * 0.86, yb - h * 0.035]);
        }
        P.push([-1, -h * 1.0], [0, -h * 1.22], [1, -h * 1.0]);
        for (let i = steps - 1; i >= 0; i--) {
          const k = 1 - i / steps, yb = -h * (0.78 + i * 0.035);
          P.push([hw * 0.72 * k * 0.86, yb - h * 0.035], [hw * 0.72 * k, yb]);
        }
        P.push([hw * 0.72, -h * 0.78], [hw * 0.72, -h * 0.62], [hw, -h * 0.62], [hw, 0]);
        break;
      }
      case 'gothic': {
        P.push([-hw, 0], [-hw, -h * 0.7], [-hw * 0.6, -h * 0.7], [-hw * 0.6, -h * 0.86], [-hw * 0.3, -h * 0.9], [0, -h * 1.08], [hw * 0.3, -h * 0.9], [hw * 0.6, -h * 0.86], [hw * 0.6, -h * 0.7], [hw, -h * 0.7], [hw, 0]);
        break;
      }
      case 'slab': P.push([-hw, 0], [-hw, -h * 0.8], [-hw * 0.7, -h * 0.8], [-hw * 0.7, -h], [hw * 0.7, -h], [hw * 0.7, -h * 0.9], [hw, -h * 0.9], [hw, 0]); break;
      case 'stepped': { const a = 0.65 + R() * 0.15; P.push([-hw, 0], [-hw, -h * a], [-hw * 0.7, -h * a], [-hw * 0.7, -h * 0.88], [-hw * 0.4, -h * 0.88], [-hw * 0.4, -h], [hw * 0.4, -h], [hw * 0.4, -h * 0.88], [hw * 0.7, -h * 0.88], [hw * 0.7, -h * a], [hw, -h * a], [hw, 0]); break; }
      case 'pyramid': P.push([-hw, 0], [-hw, -h * 0.86], [-hw * 0.85, -h * 0.86], [0, -h * 1.04], [hw * 0.85, -h * 0.86], [hw, -h * 0.86], [hw, 0]); break;
      case 'dome': { P.push([-hw, 0], [-hw, -h * 0.85], [-hw * 0.6, -h * 0.85]); for (let i = 0; i <= 8; i++) { const a = Math.PI + (i / 8) * Math.PI; P.push([Math.cos(a) * hw * 0.6, -h * 0.85 + Math.sin(a) * hw * 0.5]); } P.push([hw * 0.6, -h * 0.85], [hw, -h * 0.85], [hw, 0]); break; }
      case 'antenna': P.push([-hw, 0], [-hw, -h], [-0.4, -h], [-0.2, -h * 1.18], [0.2, -h * 1.18], [0.4, -h], [hw, -h], [hw, 0]); break;
      case 'crown': P.push([-hw, 0], [-hw, -h], [-hw * 0.8, -h * 1.05], [-hw * 0.5, -h], [-hw * 0.25, -h * 1.07], [0, -h], [hw * 0.25, -h * 1.07], [hw * 0.5, -h], [hw * 0.8, -h * 1.05], [hw, -h], [hw, 0]); break;
      default: P.push([-hw, 0], [-hw, -h], [hw, -h], [hw, 0]);
    }
    return P;
  }
  function cacheBuilding(b) {
    const P = shapeOf(b);
    let minY = 0; P.forEach((p) => { if (p[1] < minY) minY = p[1]; });
    const tankH = b.t === 'flat' ? 7 : 0;
    const top = minY - tankH - 2, wpx = Math.ceil((b.w + 4) * KPX), hpx = Math.ceil((-top + 1) * KPX);
    const c = document.createElement('canvas'); c.width = wpx; c.height = hpx;
    const g = c.getContext('2d');
    g.setTransform(KPX, 0, 0, KPX, (b.w / 2 + 2) * KPX, (-top) * KPX);
    const col = skyColors(b.z);
    g.beginPath(); g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]); g.closePath();
    g.fillStyle = col.body; g.fill();
    // ombra laterale (volume)
    g.save(); g.clip();
    g.fillStyle = col.dark; g.fillRect(b.w * 0.18, minY, b.w, -minY);
    // finestre
    const R = rng((b.seed || 3) * 7 + 11);
    const cols = Math.max(2, Math.floor(b.w / 2.6)), rows = Math.floor(b.h / 3.4);
    for (let r = 1; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const x = -b.w / 2 + (k + 0.5) * (b.w / cols) - 0.5, y = -r * 3.4;
        const lit = R() < 0.2;
        if (lit) { g.fillStyle = `rgba(239,225,187,${col.win * (0.55 + R() * 0.45)})`; g.fillRect(x, y, 1, 1.5); }
        else if (R() < 0.5) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x, y, 1, 1.5); }
      }
    }
    if (b.t === 'chrysler') { // corona ad archi
      g.strokeStyle = 'rgba(239,225,187,0.55)'; g.lineWidth = 0.35;
      for (let i = 0; i < 5; i++) { const yb = -b.h * (0.78 + i * 0.035), k = 1 - i / 5; g.beginPath(); g.arc(0, yb + 2, b.w * 0.36 * k, Math.PI, 0); g.stroke(); }
    }
    if (b.t === 'empire') { g.fillStyle = 'rgba(239,225,187,0.35)'; g.fillRect(-b.w * 0.06, -b.h * 1.02, b.w * 0.12, b.h * 0.08); }
    g.restore();
    g.lineJoin = 'round'; g.strokeStyle = col.line; g.lineWidth = 0.55;
    g.beginPath(); g.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) g.lineTo(P[i][0], P[i][1]); g.closePath(); g.stroke();
    if (tankH) { // cisterna sul tetto
      const tx = (R() - 0.5) * b.w * 0.5, ty = -b.h;
      g.fillStyle = col.dark; g.strokeStyle = col.line; g.lineWidth = 0.4;
      g.beginPath(); g.moveTo(tx - 1.6, ty); g.lineTo(tx - 1.2, ty - 2.5); g.moveTo(tx + 1.6, ty); g.lineTo(tx + 1.2, ty - 2.5); g.stroke();
      g.fillRect(tx - 1.8, ty - 6, 3.6, 3.6); g.strokeRect(tx - 1.8, ty - 6, 3.6, 3.6);
      g.beginPath(); g.moveTo(tx - 2, ty - 6); g.lineTo(tx, ty - 7.2); g.lineTo(tx + 2, ty - 6); g.closePath(); g.fill(); g.stroke();
    }
    b.cache = c; b.cw = wpx / KPX; b.ch = hpx / KPX; b.ox = b.w / 2 + 2; b.oy = -top;
    b.tw = []; // finestre che si accendono e spengono
    for (let i = 0; i < 3; i++) b.tw.push({ x: (R() - 0.5) * b.w * 0.8, y: -3.4 * (1 + Math.floor(R() * (rows - 2))), p: R() * 20, f: 6 + R() * 14 });
  }

  /* ---------------------------------------------------------------- */
  /* Pioggia                                                            */
  const DROPS = [];
  const RAIN_V = [2.2, 15.5, 0];
  function spawnDrop(p, anyY) {
    const inOffice = cam.z < ZW;
    const dmin = inOffice ? (ZW + 0.3 - cam.z) : 0.7;
    const dmax = inOffice ? dmin + 26 : 22;
    const d = dmin + Math.pow(Math.random(), 1.6) * (dmax - dmin);
    const hw = (W / 2 / F) * d * 1.15, hh = (H / 2 / F) * d * 1.15;
    let x = cam.x + (Math.random() * 2 - 1) * hw;
    const inAlley = stage === 'main' && !inOffice && cam.z > -1 && cam.z < 60 && cam.y > -12;
    if (inAlley) x = clamp(x, -1.9, 1.9);
    p.x = x; p.z = cam.z + d;
    p.y = anyY ? cam.y + (Math.random() * 2 - 1) * hh : cam.y - hh - Math.random() * 2;
    p.l = 0.7 + Math.random() * 0.6;
  }
  function initRain() {
    DROPS.length = 0;
    const n = Math.round(clamp(W * H / 1900, 200, 520));
    for (let i = 0; i < n; i++) { const p = {}; spawnDrop(p, true); DROPS.push(p); }
  }
  function updateRain(dt) {
    const inOffice = cam.z < ZW;
    const V = weather === 'snow' ? [0.5, 1.5] : weather === 'wind' ? [6.5, 13.5] : weather === 'fog' ? [0.8, 8] : RAIN_V;
    for (const p of DROPS) {
      p.x += V[0] * dt + (weather === 'snow' ? Math.sin(clock * 1.3 + p.l * 9) * 0.6 * dt : 0); p.y += V[1] * dt;
      const d = p.z - cam.z;
      const tooNear = inOffice ? p.z < ZW + 0.2 : d < 0.5;
      if (tooNear || d > 60 || p.y > 0.2 || (p.y - cam.y) * F / d > H / 2 + 30) { spawnDrop(p, d > 60 || tooNear); }
    }
  }
  function drawRain() {
    const L = [];
    if (!office()) {
      LAMPS.forEach((l) => { if (lampInt(l) > 0.5) L.push([l.s === 0 ? 0 : l.x * 0.85, l.y + 0.9, l.z, 2.7]); });
      if (cam.z < 0) STREETLAMPS.forEach((l) => L.push([l.x, -5.2, l.z, 3.6]));
      L.push([0, -1.5, 59.4, 2.4]);
    }
    const dim = new Path2D(), lit = new Path2D(), red = new Path2D();
    const NE = !office() && neonOn() ? [0, -4.9, 59.4, 3.4] : null;
    for (const p of DROPS) {
      const d = p.z - cam.z; if (d < 0.4) continue;
      const s = F / d;
      const x = W / 2 + (p.x - cam.x) * s, y = H / 2 + (p.y - cam.y) * s;
      const k = 0.032 * p.l;
      let li = false;
      for (const q of L) { const dx = p.x - q[0], dy = p.y - q[1], dz = p.z - q[2]; if (dx * dx + dy * dy * 0.6 + dz * dz < q[3] * q[3]) { li = true; break; } }
      let rd = false; if (!li && NE) { const dx = p.x - NE[0], dy = p.y - NE[1], dz = p.z - NE[2]; rd = dx * dx * 0.5 + dy * dy + dz * dz < NE[3] * NE[3]; }
      const P = li ? lit : rd ? red : dim;
      const vx = weather === 'wind' ? 6.5 : RAIN_V[0];
      P.moveTo(x, y); P.lineTo(x - vx * k * s, y - RAIN_V[1] * k * s);
    }
    if (weather === 'snow') {
      ctx.fillStyle = 'rgba(236,238,244,0.85)';
      for (const p of DROPS) { const d = p.z - cam.z; if (d < 0.4) continue; const s = F / d, r = clamp(0.018 * s * p.l, 0.6, 2.4); ctx.beginPath(); ctx.arc(W / 2 + (p.x - cam.x) * s, H / 2 + (p.y - cam.y) * s, r, 0, TAU); ctx.fill(); }
      return;
    }
    const wv = weather === 'wind' ? 3 : 1;
    ctx.strokeStyle = weather === 'fog' ? 'rgba(225,221,205,0.14)' : 'rgba(225,221,205,0.28)'; ctx.lineWidth = 1; ctx.stroke(dim);
    ctx.strokeStyle = 'rgba(252,240,208,0.8)'; ctx.lineWidth = 1.3; ctx.stroke(lit);
    ctx.strokeStyle = 'rgba(255,90,90,0.75)'; ctx.lineWidth = 1.3; ctx.stroke(red);
  }
  const RIPPLES = [];
  function updateRipples(dt) {
    if (weather !== 'snow' && cam.z > -2 && cam.z < 60 && cam.y > -8 && RIPPLES.length < 26 && Math.random() < dt * 30) {
      RIPPLES.push({ x: (Math.random() * 2 - 1) * 1.8, z: cam.z + 1.5 + Math.random() * 14, a: 0 });
    }
    for (let i = RIPPLES.length - 1; i >= 0; i--) { RIPPLES[i].a += dt * 1.8; if (RIPPLES[i].a > 1) RIPPLES.splice(i, 1); }
  }

  /* ---------------------------------------------------------------- */
  /* Fulmini                                                            */
  function addFlash(t0, strength, withBolt) { flashEvents.push({ t0, s: strength, bolt: withBolt, done: false }); }
  function flashEnv(dt) {
    if (dt < 0) return 0;
    if (dt < 0.05) return 1;
    if (dt < 0.11) return 0.25;
    if (dt < 0.17) return 0.85;
    return 0.85 * Math.exp(-(dt - 0.17) * 6.5);
  }
  function makeBolt() {
    const pts = [];
    let x = W * (0.2 + Math.random() * 0.6), y = -10;
    const bottom = H * (0.45 + Math.random() * 0.15);
    pts.push([x, y]);
    const branches = [];
    while (y < bottom) {
      x += (Math.random() - 0.5) * W * 0.09; y += H * (0.03 + Math.random() * 0.04);
      pts.push([x, y]);
      if (Math.random() < 0.22) { const br = [[x, y]]; let bx = x, by = y; for (let i = 0; i < 4; i++) { bx += (Math.random() - 0.3) * W * 0.06 * (Math.random() < 0.5 ? -1 : 1); by += H * 0.03; br.push([bx, by]); } branches.push(br); }
    }
    return { pts, branches };
  }
  function scheduleIntroFlashes() {
    flashEvents = [];
    addFlash(0.7, 1.0, false);
    addFlash(2.6, 0.45, false);
    addFlash(4.93, 1.25, true);
    addFlash(6.9, 0.55, false);
    addFlash(C0 + 3.9, 1.0, true);
    nextIdleFlash = END_T + 7 + Math.random() * 6;
  }
  function updateFlash(t, wallClock) {
    let f = 0;
    for (const e of flashEvents) {
      const dt = (e.wall ? wallClock : t) - e.t0;
      if (dt >= 0 && !e.done) {
        e.done = true;
        if (e.bolt) bolt = { b: makeBolt(), t0: e.t0, wall: e.wall };
        if (onThunder) onThunder(e.s, 0.35 + Math.random() * 1.1);
      }
      f += e.s * flashEnv(dt);
    }
    flashEvents = flashEvents.filter((e) => ((e.wall ? wallClock : t) - e.t0) < 3);
    flash = clamp(f, 0, 1.2);
    if (bolt && ((bolt.wall ? wallClock : t) - bolt.t0) > 0.45) bolt = null;
  }

  /* ---------------------------------------------------------------- */
  /* Camera                                                             */
  function camAt(t) {
    if (t < A_END) { // 1. il detective che arriva sotto la pioggia, inquadratura inclinata
      const k = sio(t / A_END);
      return { x: lerp(0.55, 0.12, k), y: -1.45 + 0.02 * Math.sin(t * 1.3), z: lerp(14, 21.6, k), roll: lerp(-0.05, -0.028, k) };
    }
    if (t < C0) { // 2. taglio sul lampo: volo basso dentro il vicolo
      const u = clamp((t - A_END) / (B_END - A_END), 0, 1), k = sio(u);
      return { x: lerp(0.9, 0, smooth(u)) + 0.15 * Math.sin(u * 4) * (1 - u), y: lerp(-0.85, -1.8, smooth(u)), z: lerp(23, 45, k), roll: 0.045 * (1 - smooth(u * 1.2)) };
    }
    // 3. gru all'indietro: la città intera, poi la finestra dello studio
    const p = io((t - C0) / (END_T - C0));
    return { x: 0, y: lerp(-1.8, CAM_END.y, smooth(p / 0.6)), z: lerp(45, CAM_END.z, p), roll: 0.018 * Math.sin(p * Math.PI) };
  }

  /* ---------------------------------------------------------------- */
  /* Disegno: cielo                                                     */
  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const f = flash;
    const top = `rgb(${Math.round(8 + 70 * f)},${Math.round(9 + 74 * f)},${Math.round(12 + 86 * f)})`;
    const mid = `rgb(${Math.round(20 + 80 * f)},${Math.round(22 + 84 * f)},${Math.round(29 + 92 * f)})`;
    const low = `rgb(${Math.round(44 + 70 * f)},${Math.round(44 + 72 * f)},${Math.round(50 + 76 * f)})`;
    g.addColorStop(0, top); g.addColorStop(0.55, mid); g.addColorStop(1, low);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // luna
    const mr = Math.min(W, H) * 0.075, mx = W * 0.74, my = H * 0.15 + clamp(-cam.y, 0, 50) * 0.6;
    const halo = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 4);
    halo.addColorStop(0, 'rgba(239,225,187,0.22)'); halo.addColorStop(1, 'rgba(239,225,187,0)');
    ctx.fillStyle = halo; ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fillStyle = '#e9dcb6'; ctx.fill();
    ctx.fillStyle = 'rgba(160,150,125,0.35)';
    [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.16], [-0.05, 0.4, 0.12], [0.35, -0.35, 0.09]].forEach((c) => { ctx.beginPath(); ctx.arc(mx + c[0] * mr, my + c[1] * mr, c[2] * mr, 0, TAU); ctx.fill(); });
    ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.stroke();
    // nuvole morbide, orlate dalla luna, accese dai lampi
    for (let i = 0; i < 4; i++) {
      const cx = ((clock * (6 + i * 2.5) + i * W * 0.37) % (W * 1.6)) - W * 0.3;
      const cy = H * (0.08 + i * 0.07) + clamp(-cam.y, 0, 50) * (0.3 + i * 0.1);
      const sc = Math.min(W, H) * (0.12 + 0.03 * i);
      const near = clamp(1 - Math.hypot(cx - mx, cy - my) / (W * 0.6), 0, 1);
      for (let k = 0; k < 6; k++) {
        const px = cx + (k - 2.5) * sc * 0.55, py = cy + Math.sin(k * 1.7 + i) * sc * 0.14, r = sc * (0.5 + 0.18 * Math.sin(k * 2.3 + i));
        const lift = 0.3 * near + flash * 0.9;
        const c0 = Math.round(12 + 60 * lift), c1 = Math.round(15 + 64 * lift);
        const g = ctx.createRadialGradient(px, py + r * 0.15, 0, px, py, r);
        g.addColorStop(0, `rgba(${c0},${c0 + 1},${c1},0.85)`); g.addColorStop(0.55, `rgba(${c0},${c0 + 1},${c1},0.55)`); g.addColorStop(1, `rgba(${c0},${c0 + 1},${c1},0)`);
        ctx.fillStyle = g; ctx.fillRect(px - r, py - r, r * 2, r * 2);
      }
    }
    drawBlimp();
  }
  function drawBlimp() {
    const z = 360, d = z - cam.z; if (d < 50) return;
    const x = -190 + ((clock * 3.2) % 420), y = -190;
    flat(z, () => {
      if (!vis(x - 40, y - 15, x + 40, y + 15)) return;
      ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(9,9,11,0.8)'; ctx.lineWidth = LW(1.2);
      // pinne
      ctx.fillStyle = '#3b3c44';
      ctx.beginPath(); ctx.moveTo(x - 26, y); ctx.lineTo(x - 36, y - 9); ctx.lineTo(x - 31, y); ctx.lineTo(x - 36, y + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
      // involucro
      const g = ctx.createLinearGradient(0, y - 9, 0, y + 9); g.addColorStop(0, '#6a6b73'); g.addColorStop(0.5, '#4a4b53'); g.addColorStop(1, '#2c2d33');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 32, 8.5, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(9,9,11,0.35)'; ctx.lineWidth = LW(0.8);
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.ellipse(x + i * 8, y, 1.2, 8.3 * Math.sqrt(1 - (i * 8 / 32) ** 2), 0, 0, TAU); ctx.stroke(); }
      // bordo di luna
      ctx.strokeStyle = 'rgba(239,225,187,0.35)'; ctx.lineWidth = LW(1); ctx.beginPath(); ctx.ellipse(x, y, 31.5, 8, 0, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      // gondola con finestrini
      ctx.fillStyle = '#25262b'; ctx.strokeStyle = 'rgba(9,9,11,0.9)'; ctx.lineWidth = LW(1);
      ctx.fillRect(x - 5, y + 7.6, 10, 2.6); ctx.strokeRect(x - 5, y + 7.6, 10, 2.6);
      ctx.fillStyle = 'rgba(239,225,187,0.9)'; for (let i = 0; i < 4; i++) ctx.fillRect(x - 4 + i * 2.3, y + 8.2, 1.2, 1);
      // luci di posizione
      if (Math.sin(clock * 4) > 0.2) { ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(x + 31, y, 0.9, 0, TAU); ctx.fill(); }
      if (Math.sin(clock * 4 + 2) > 0.2) { ctx.fillStyle = CREAM; ctx.beginPath(); ctx.arc(x - 33, y - 1, 0.7, 0, TAU); ctx.fill(); }
    });
  }
  function drawSearchlights() {
    const vis = smooth((-cam.y - 6) / 20);
    if (vis <= 0.01) return;
    [[-70, 340, 0.4], [95, 360, -0.3]].forEach(([x, z, ph], i) => {
      const p = proj(x, 0, z); if (!p) return;
      const ang = -Math.PI / 2 + Math.sin(clock * 0.35 + ph * 7) * 0.55 + (i ? 0.2 : -0.2);
      const L = H * 1.4, spread = 0.045;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(p[0], p[1], p[0] + Math.cos(ang) * L, p[1] + Math.sin(ang) * L);
      g.addColorStop(0, `rgba(239,225,187,${0.16 * vis})`); g.addColorStop(1, 'rgba(239,225,187,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(p[0], p[1]);
      ctx.lineTo(p[0] + Math.cos(ang - spread) * L, p[1] + Math.sin(ang - spread) * L);
      ctx.lineTo(p[0] + Math.cos(ang + spread) * L, p[1] + Math.sin(ang + spread) * L);
      ctx.closePath(); ctx.fill(); ctx.restore();
    });
  }
  function drawBolt() {
    if (!bolt) return;
    const b = bolt.b;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const draw = (pts, w) => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.lineWidth = w; ctx.stroke(); };
    ctx.strokeStyle = 'rgba(239,235,220,0.25)'; draw(b.pts, 10); b.branches.forEach((br) => draw(br, 5));
    ctx.strokeStyle = '#fbf6e8'; draw(b.pts, 2.4); b.branches.forEach((br) => draw(br, 1.2));
    ctx.restore();
  }
  function drawSkyline() {
    for (const b of SKY) {
      const d = b.z - cam.z; if (d < 2) continue;
      if (b.t === 'lights') { drawStreetLights(b, d); continue; }
      if (b.t === 'mist') { const gy = H / 2 + (0 - cam.y) * F / d; if (gy < H + 30 && gy > -30) { const hh = 14 * F / d; const g = ctx.createLinearGradient(0, gy - hh, 0, gy + 2); g.addColorStop(0, 'rgba(120,122,134,0)'); g.addColorStop(1, `rgba(${120 + flash * 60},${122 + flash * 60},${134 + flash * 60},0.22)`); ctx.fillStyle = g; ctx.fillRect(0, gy - hh, W, hh + 2); } continue; }
      if (!b.cache) cacheBuilding(b);
      const s = F / d;
      const x0 = W / 2 + (b.x - b.ox - cam.x) * s, y0 = H / 2 + (-b.oy - cam.y) * s;
      const w = b.cw * s, h = b.ch * s;
      if (x0 > W || x0 + w < 0 || y0 > H || y0 + h < 0) continue;
      ctx.drawImage(b.cache, x0, y0, w, h);
      // finestre che si accendono
      for (const tw of b.tw) {
        const on = Math.sin(clock * 6.283 / tw.f + tw.p) > 0.6;
        if (!on) continue;
        ctx.fillStyle = 'rgba(239,225,187,0.85)';
        ctx.fillRect(W / 2 + (b.x + tw.x - cam.x) * s, H / 2 + (tw.y - cam.y) * s, Math.max(1, 1 * s), Math.max(1, 1.5 * s));
      }
      if (b.t === 'empire' || b.t === 'chrysler') { // luce di segnalazione
        const on = Math.sin(clock * 3) > 0;
        const tipY = b.t === 'empire' ? -b.h * 1.24 : -b.h * 1.22;
        { const px = W / 2 + (b.x - cam.x) * s, py = H / 2 + (tipY - cam.y) * s; ctx.strokeStyle = 'rgba(120,122,132,0.85)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + b.h * 0.13 * s); ctx.stroke(); }
        if (on) { const px = W / 2 + (b.x - cam.x) * s, py = H / 2 + (tipY - cam.y) * s; const g = ctx.createRadialGradient(px, py, 0, px, py, 7); g.addColorStop(0, 'rgba(208,16,28,0.95)'); g.addColorStop(1, 'rgba(208,16,28,0)'); ctx.fillStyle = g; ctx.fillRect(px - 7, py - 7, 14, 14); }
      }
    }
    // foschia a terra
    const gy = H / 2 + (0 - cam.y) * F / 300;
    if (gy < H + 40) {
      const g = ctx.createLinearGradient(0, gy - H * 0.12, 0, gy + 10);
      g.addColorStop(0, 'rgba(60,62,72,0)'); g.addColorStop(1, `rgba(${60 + flash * 50},${62 + flash * 50},${72 + flash * 50},0.55)`);
      ctx.fillStyle = g; ctx.fillRect(0, gy - H * 0.12, W, H * 0.12 + 10);
    }
  }

  function drawStreetLights(b, d) {
    if (cam.y > -8) return;
    const s = F / d; const R = rng(b.seed);
    const span = 300 + b.z * 0.3;
    ctx.fillStyle = 'rgba(239,225,187,0.85)';
    const r = Math.max(0.6, 0.35 * s);
    for (let x = -span; x < span; x += 7 + R() * 6) {
      if (Math.sin(clock * (0.5 + R()) + x) > 0.97) continue;
      const sx = W / 2 + (x - cam.x) * s, sy = H / 2 + (-0.8 - cam.y) * s;
      if (sx < -5 || sx > W + 5) continue;
      ctx.globalAlpha = 0.5 + 0.5 * R();
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
  }

  function trainX() { // posizione della testa del treno (null se non passa)
    if (mode === 'intro' && T >= 5.0 && T <= 8.5) return lerp(-60, 70, (T - 5.0) / 3.2);
    return null;
  }
  function drawElBridge() {
    const Z = 50;
    if (Z - cam.z < NEAR) return;
    const tx = trainX();
    flat(Z, (s) => {
      if (!vis(-12, -13, 12, -7.5)) return;
      ctx.lineJoin = 'round'; ctx.strokeStyle = INK;
      // treno
      if (tx != null) {
        for (let c = 0; c < 4; c++) {
          const x = tx - c * 15;
          if (x > 14 || x + 14 < -14) continue;
          ctx.fillStyle = '#2b2d33'; ctx.lineWidth = LW();
          ctx.beginPath(); ctx.moveTo(x, -9.3); ctx.lineTo(x, -11.6); ctx.quadraticCurveTo(x, -12.2, x + 0.8, -12.2); ctx.lineTo(x + 13.2, -12.2); ctx.quadraticCurveTo(x + 14, -12.2, x + 14, -11.6); ctx.lineTo(x + 14, -9.3); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(239,225,187,0.9)'; for (let w = 0; w < 6; w++) { ctx.fillRect(x + 1 + w * 2.15, -11.3, 1.3, 1.1); }
          ctx.fillStyle = '#121216'; ctx.fillRect(x + 1, -9.5, 2.6, 0.4); ctx.fillRect(x + 10.4, -9.5, 2.6, 0.4);
          // scintille sotto le ruote
          if (Math.random() < 0.5) { const sx = x + (Math.random() < 0.5 ? 2.3 : 11.7); if (Math.abs(sx) < 14) SPARKS.push({ x: sx, y: -9.1, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 2, life: 0.5 + Math.random() * 0.4 }); }
        }
      }
      // impalcato e travatura
      ctx.fillStyle = '#26272d'; ctx.lineWidth = LW(); ctx.fillRect(-12, -9.25, 24, 1.05); ctx.strokeRect(-12, -9.25, 24, 1.05);
      ctx.beginPath();
      for (let x = -12; x < 12; x += 1.5) { ctx.moveTo(x, -8.2); ctx.lineTo(x + 1.5, -9.25); ctx.moveTo(x, -9.25); ctx.lineTo(x + 1.5, -8.2); }
      ctx.lineWidth = LW(1.2); ctx.stroke();
      ctx.fillStyle = '#151519'; ctx.fillRect(-12, -8.25, 24, 0.22);
      ctx.strokeStyle = neonOn() ? 'rgba(220,40,50,0.55)' : 'rgba(120,120,130,0.4)'; ctx.lineWidth = LW(1.4); ctx.beginPath(); ctx.moveTo(-12, -8.04); ctx.lineTo(12, -8.04); ctx.stroke();
      ctx.strokeStyle = 'rgba(239,225,187,0.25)'; ctx.beginPath(); ctx.moveTo(-12, -9.25); ctx.lineTo(12, -9.25); ctx.stroke();
      // scintille
      if (SPARKS.length) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (const p of SPARKS) { ctx.strokeStyle = `rgba(255,${180 + Math.floor(p.life * 70)},120,${Math.min(1, p.life * 1.6)})`; ctx.lineWidth = LW(1.4); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); }
        ctx.restore();
      }
    });
  }
  function updateSparks(dt) {
    for (let i = SPARKS.length - 1; i >= 0; i--) { const p = SPARKS[i]; p.vy += 9.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.life <= 0 || p.y > 0) SPARKS.splice(i, 1); }
    if (SPARKS.length > 160) SPARKS.splice(0, SPARKS.length - 160);
  }

  /* ---------------------------------------------------------------- */
  /* Treno sopraelevato                                                 */
  function drawEl() {
    const Z = 95;
    if (cam.y > -10) return;
    flat(Z, (s) => {
      ctx.lineJoin = 'round';
      // impalcato
      ctx.fillStyle = '#26272d'; ctx.fillRect(-400, -7.6, 800, 1.4);
      ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.strokeRect(-400, -7.6, 800, 1.4);
      // tralicci
      ctx.beginPath();
      for (let x = -396; x < 400; x += 12) { ctx.moveTo(x, -6.2); ctx.lineTo(x, 0); ctx.moveTo(x - 2, -6.2); ctx.lineTo(x + 2, -3.2); ctx.moveTo(x + 2, -6.2); ctx.lineTo(x - 2, -3.2); }
      ctx.lineWidth = LW(0.8); ctx.stroke();
      // treno
      const tx = ((clock * 16) % 520) - 260;
      for (let c = 0; c < 4; c++) {
        const x = tx - c * 15;
        ctx.fillStyle = '#2d2f36'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, -11.2, 14, 3.6, 0.8) : ctx.rect(x, -11.2, 14, 3.6); ctx.fill();
        ctx.lineWidth = LW(); ctx.stroke();
        ctx.fillStyle = 'rgba(239,225,187,0.85)';
        for (let w = 0; w < 6; w++) ctx.fillRect(x + 1 + w * 2.15, -10.5, 1.3, 1.3);
      }
      if (Math.sin(clock * 9) > 0.93) { ctx.fillStyle = 'rgba(251,246,232,0.9)'; ctx.beginPath(); ctx.arc(tx - 20, -7.6, 0.6, 0, TAU); ctx.fill(); }
    });
  }

  /* ---------------------------------------------------------------- */
  /* Isolati 3D                                                         */
  function drawFront(b) {
    if (cam.z >= b.z1 - NEAR) return;
    flat(b.z1, () => {
      const top = -b.h;
      if (!vis(b.x1 - 1, top - 1, b.x2 + 1, 0)) return;
      ctx.lineJoin = 'round';
      ctx.fillStyle = b.col; ctx.fillRect(b.x1, top, b.x2 - b.x1, b.h);
      // finestre
      const w = b.x2 - b.x1, cols = Math.max(1, Math.floor((w - 1.2) / 2.5)), floors = Math.floor((b.h - 1) / 3.2);
      const step = (w - 1.2) / cols;
      for (let f = 1; f < floors; f++) {
        for (let k = 0; k < cols; k++) {
          const wx = b.x1 + 0.6 + k * step + (step - 1.1) / 2, wy = -(f * 3.2 + 2.3);
          if (b.end && f === 1 && Math.abs(wx + 0.55) < 1.5) continue;
          const r = h3(b.seed, f, k);
          if (r < 0.24) {
            ctx.fillStyle = r < 0.06 ? '#f3dfa6' : CREAM; ctx.fillRect(wx, wy, 1.1, 1.6);
            if (r < 0.045) { // sagoma alla finestra
              ctx.fillStyle = '#121216'; ctx.beginPath(); ctx.arc(wx + 0.55, wy + 0.85, 0.22, 0, TAU); ctx.fill();
              ctx.fillRect(wx + 0.2, wy + 1.05, 0.7, 0.55);
              if (r < 0.025) { ctx.fillRect(wx + 0.22, wy + 0.62, 0.66, 0.07); ctx.fillRect(wx + 0.38, wy + 0.42, 0.34, 0.22); }
            } else if (r > 0.15) { ctx.fillStyle = 'rgba(20,20,24,0.55)'; for (let l = 0; l < 4; l++) ctx.fillRect(wx, wy + 0.1 + l * 0.2, 1.1, 0.07); }
          } else { ctx.fillStyle = '#15161a'; ctx.fillRect(wx, wy, 1.1, 1.6); }
          ctx.strokeStyle = INK; ctx.lineWidth = LW() * 0.55; ctx.strokeRect(wx, wy, 1.1, 1.6);
        }
      }
      // piano terra
      if (b.shop) {
        const sx = b.x1 + 0.8, sw = Math.min(w - 3.4, 7.5);
        ctx.fillStyle = 'rgba(239,225,187,0.82)'; ctx.fillRect(sx, -2.6, sw, 2.2);
        ctx.fillStyle = 'rgba(30,30,34,0.6)'; for (let i = 1; i < 4; i++) ctx.fillRect(sx + i * sw / 4 - 0.05, -2.6, 0.1, 2.2);
        ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.strokeRect(sx, -2.6, sw, 2.2);
        // tenda a strisce
        for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#2a2b31' : '#8f8a7d'; ctx.beginPath(); ctx.moveTo(sx + i * sw / 8, -3.2); ctx.lineTo(sx + (i + 1) * sw / 8, -3.2); ctx.lineTo(sx + (i + 1) * sw / 8 + 0.15, -2.75); ctx.lineTo(sx + i * sw / 8 + 0.15, -2.75); ctx.fill(); }
        ctx.strokeRect(sx, -3.2, sw, 0.45);
        // insegna
        ctx.fillStyle = '#141418'; ctx.fillRect(sx, -4.4, sw, 0.9); ctx.strokeRect(sx, -4.4, sw, 0.9);
        ctx.fillStyle = CREAM; ctx.font = `bold 0.66px "Playfair Display", Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(b.shop, sx + sw / 2, -3.93);
        // porta
        ctx.fillStyle = '#1a1a1e'; ctx.fillRect(sx + sw + 0.5, -2.5, 1.1, 2.5); ctx.strokeRect(sx + sw + 0.5, -2.5, 1.1, 2.5);
      } else if (b.end) {
        // porta di servizio illuminata
        ctx.fillStyle = 'rgba(239,225,187,0.92)'; ctx.fillRect(-0.6, -2.3, 1.2, 2.3);
        ctx.fillStyle = '#121216'; ctx.fillRect(-0.6, -2.3, 0.55, 2.3);
        ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.strokeRect(-0.6, -2.3, 1.2, 2.3);
        ctx.fillStyle = '#1d1e22'; ctx.fillRect(-1.0, -0.25, 2.0, 0.25); ctx.strokeRect(-1.0, -0.25, 2.0, 0.25);
        drawNeon();
        // cassette e casse
        ctx.fillStyle = '#2a2a2e'; ctx.fillRect(1.3, -0.9, 1.0, 0.9); ctx.strokeRect(1.3, -0.9, 1.0, 0.9); ctx.fillRect(1.45, -1.6, 0.8, 0.7); ctx.strokeRect(1.45, -1.6, 0.8, 0.7);
      } else {
        ctx.fillStyle = '#1a1a1e'; ctx.fillRect(b.x1 + w / 2 - 0.6, -2.4, 1.2, 2.4);
        ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.strokeRect(b.x1 + w / 2 - 0.6, -2.4, 1.2, 2.4);
      }
      // cornicione
      ctx.fillStyle = '#1b1c20'; ctx.fillRect(b.x1 - 0.25, top - 0.45, w + 0.5, 0.6);
      ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.strokeRect(b.x1 - 0.25, top - 0.45, w + 0.5, 0.6);
      ctx.strokeRect(b.x1, top, w, b.h);
    });
  }
  function neonOn() { return !(Math.sin(clock * 7.3) + Math.sin(clock * 3.1) > 1.75); }
  function drawNeon() {
    const txt = 'JAZZ';
    const y = -4.95, maxW = 3.9;
    ctx.save();
    let fs = 0.62;
    ctx.font = `italic 900 ${fs}px "Playfair Display", Georgia, serif`;
    let tw = ctx.measureText(txt).width; if (tw > maxW) { fs *= maxW / tw; ctx.font = `italic 900 ${fs}px "Playfair Display", Georgia, serif`; tw = ctx.measureText(txt).width; }
    const bw = tw + 0.5, bh = fs * 1.35;
    ctx.fillStyle = '#101013'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
    ctx.fillRect(-bw / 2, y - bh / 2, bw, bh); ctx.strokeRect(-bw / 2, y - bh / 2, bw, bh);
    ctx.beginPath(); ctx.moveTo(-bw / 2 + 0.2, y - bh / 2); ctx.lineTo(-bw / 2 + 0.4, y - bh / 2 - 0.6); ctx.moveTo(bw / 2 - 0.2, y - bh / 2); ctx.lineTo(bw / 2 - 0.4, y - bh / 2 - 0.6); ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const bph = (clock * 0.37) % 5, on = neonOn(), broken = bph > 2 && bph < 2.05 ? (txt.length > 3 ? 2 : -1) : -1;
    let x = -tw / 2;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i], cw = ctx.measureText(ch).width;
      const lit = on && i !== broken && ch !== ' ';
      if (lit) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(208,16,28,0.28)'; ctx.lineWidth = fs * 0.32; ctx.strokeText(ch, x, y);
        ctx.strokeStyle = 'rgba(255,60,60,0.65)'; ctx.lineWidth = fs * 0.11; ctx.strokeText(ch, x, y);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,205,198,0.96)'; ctx.fillText(ch, x, y);
      } else if (ch !== ' ') { ctx.strokeStyle = 'rgba(90,30,32,0.9)'; ctx.lineWidth = fs * 0.06; ctx.strokeText(ch, x, y); }
      x += cw;
    }
    if (on) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(0, y, 0, 0, y, 4.5); g.addColorStop(0, 'rgba(208,16,28,0.26)'); g.addColorStop(0.4, 'rgba(208,16,28,0.08)'); g.addColorStop(1, 'rgba(208,16,28,0)');
      ctx.fillStyle = g; ctx.fillRect(-4.5, y - 4.5, 9, 9);
    }
    ctx.restore();
  }
  function drawRoof(b) {
    if (cam.y >= -b.h - 0.2) return;
    const y = -b.h - 0.45;
    const d = (b.z1 + b.z2) / 2 - cam.z; if (d < NEAR) return;
    const lw = lwFor(d);
    poly3([[b.x1 - 0.25, y, b.z1], [b.x2 + 0.25, y, b.z1], [b.x2 + 0.25, y, b.z2], [b.x1 - 0.25, y, b.z2]], '#1b1c21', INK, lw);
    poly3([[b.x1 + 0.4, y, b.z1 + 0.4], [b.x2 - 0.4, y, b.z1 + 0.4], [b.x2 - 0.4, y, b.z2 - 0.4], [b.x1 + 0.4, y, b.z2 - 0.4]], '#212227', 'rgba(9,9,11,0.6)', lw * 0.5);
    if (b.chim) {
      const cx = lerp(b.x1 + 1, b.x2 - 1, h3(b.seed, 4, 4)), cz = lerp(b.z1 + 1, b.z2 - 1, h3(b.seed, 5, 5));
      flat(cz, () => { ctx.fillStyle = '#2b2c31'; ctx.fillRect(cx - 0.5, y - 1.6, 1, 1.6); ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.strokeRect(cx - 0.5, y - 1.6, 1, 1.6); ctx.fillStyle = '#1b1b1f'; ctx.fillRect(cx - 0.62, y - 1.75, 1.24, 0.25); });
    }
    if (b.tank) {
      flat(b.tankZ, () => {
        const x = b.tankX, base = y;
        ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
        ctx.beginPath(); ctx.moveTo(x - 1.2, base); ctx.lineTo(x - 1.0, base - 2.2); ctx.moveTo(x + 1.2, base); ctx.lineTo(x + 1.0, base - 2.2); ctx.moveTo(x - 1.2, base - 0.4); ctx.lineTo(x + 1.0, base - 2.0); ctx.stroke();
        ctx.fillStyle = '#3a3630'; ctx.fillRect(x - 1.4, base - 5.2, 2.8, 3.0); ctx.strokeRect(x - 1.4, base - 5.2, 2.8, 3.0);
        ctx.strokeStyle = 'rgba(9,9,11,0.7)'; ctx.lineWidth = LW() * 0.5; for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - 1.4, base - 5.2 + i); ctx.lineTo(x + 1.4, base - 5.2 + i); ctx.stroke(); }
        ctx.fillStyle = '#2a2724'; ctx.beginPath(); ctx.moveTo(x - 1.6, base - 5.2); ctx.lineTo(x, base - 6.6); ctx.lineTo(x + 1.6, base - 5.2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.stroke();
      });
    }
  }
  function drawInner(b) {
    // faccia interna verso il vicolo
    const L = b.adj === 'L';
    const xf = L ? b.x2 : b.x1;
    if (L ? cam.x <= xf : cam.x >= xf) return;
    const n = L ? 1 : -1;
    const dmid = (b.z1 + b.z2) / 2 - cam.z;
    if (b.z2 - cam.z < NEAR) return;
    const lw = lwFor(Math.max(dmid, 1));
    if (!poly3([[xf, -b.h, b.z1], [xf, -b.h, b.z2], [xf, 0, b.z2], [xf, 0, b.z1]], b.side, INK, lw)) return;
    const floors = Math.floor((b.h - 1) / 3.2);
    // mattoni
    for (let i = 0; i < 9; i++) {
      const bz = lerp(b.z1 + 0.5, b.z2 - 1, h3(b.seed, i, 1)), by = -lerp(0.6, b.h - 1, h3(b.seed, i, 2));
      for (let k = 0; k < 3; k++) {
        const oz = (k % 2) * 0.28, oy = k * 0.24;
        poly3([[xf + n * 0.01, by - oy, bz + oz], [xf + n * 0.01, by - oy, bz + oz + 0.5], [xf + n * 0.01, by - oy - 0.2, bz + oz + 0.5], [xf + n * 0.01, by - oy - 0.2, bz + oz]], null, 'rgba(9,9,11,0.55)', Math.max(0.6, lw * 0.35));
      }
    }
    // finestre
    for (let f = 1; f < floors; f++) {
      for (let z = b.z1 + 1.3; z < b.z2 - 1.4; z += 2.7) {
        const r = h3(b.seed + 1, f, Math.round(z));
        const y = -(f * 3.2 + 2.3);
        const lit = r < 0.22;
        poly3([[xf + n * 0.02, y, z], [xf + n * 0.02, y, z + 1.1], [xf + n * 0.02, y + 1.6, z + 1.1], [xf + n * 0.02, y + 1.6, z]], lit ? CREAM : '#141519', INK, lw * 0.6);
        if (lit && r > 0.12) for (let l = 0; l < 3; l++) poly3([[xf + n * 0.03, y + 0.15 + l * 0.25, z], [xf + n * 0.03, y + 0.15 + l * 0.25, z + 1.1], [xf + n * 0.03, y + 0.24 + l * 0.25, z + 1.1], [xf + n * 0.03, y + 0.24 + l * 0.25, z]], 'rgba(30,30,34,0.5)');
      }
    }
    // porta sul retro
    if (h3(b.seed, 9, 9) < 0.7) {
      const z = lerp(b.z1 + 2, b.z2 - 3, h3(b.seed, 9, 3));
      poly3([[xf + n * 0.02, -2.3, z], [xf + n * 0.02, -2.3, z + 1.1], [xf + n * 0.02, 0, z + 1.1], [xf + n * 0.02, 0, z]], '#18181c', INK, lw * 0.8);
    }
    // grondaia
    const gz = b.z1 + 0.35;
    line3([xf + n * 0.12, -b.h, gz], [xf + n * 0.12, 0, gz], '#0d0d10', Math.max(1.5, lw * 1.3));
    if (b.fe) drawFireEscape(b, xf, n, floors, lw);
  }
  function drawFireEscape(b, xf, n, floors, lw) {
    const zc = (b.z1 + b.z2) / 2, za = zc - 1.7, zb = zc + 1.7, D = 0.95;
    const col = '#0b0b0d', w = Math.max(1, lw * 0.85);
    const segs = [], plats = [];
    const S2 = (a, c, ww) => segs.push([a, c, ww]);
    for (let f = 1; f < floors; f++) {
      const y = -(f * 3.2 + 0.05);
      plats.push([[xf, y, za], [xf + n * D, y, za], [xf + n * D, y, zb], [xf, y, zb]]);
      S2([xf + n * D, y - 0.95, za], [xf + n * D, y - 0.95, zb], w);
      for (let k = 0; k <= 4; k++) { const z = lerp(za, zb, k / 4); S2([xf + n * D, y, z], [xf + n * D, y - 0.95, z], w * 0.7); }
      S2([xf, y - 0.95, za], [xf + n * D, y - 0.95, za], w);
      S2([xf, y - 0.95, zb], [xf + n * D, y - 0.95, zb], w);
      if (f < floors - 1) {
        const y2 = -((f + 1) * 3.2 + 0.05);
        const x1 = xf + n * 0.25, x2 = xf + n * 0.75;
        S2([x1, y, zb - 0.2], [x1, y2, za + 0.5], w);
        S2([x2, y, zb - 0.2], [x2, y2, za + 0.5], w);
        for (let k = 1; k < 6; k++) { const t = k / 6; const yy = lerp(y, y2, t), zz = lerp(zb - 0.2, za + 0.5, t); S2([x1, yy, zz], [x2, yy, zz], w * 0.6); }
      }
    }
    const y1 = -(3.2 + 0.05);
    S2([xf + n * 0.35, y1, za + 0.3], [xf + n * 0.35, y1 + 1.6, za + 0.3], w);
    S2([xf + n * 0.7, y1, za + 0.3], [xf + n * 0.7, y1 + 1.6, za + 0.3], w);
    // il lampo getta l'ombra della scala sul muro
    if (flash > 0.12 && !office()) {
      const dir = [-n * 0.55, 1, 0.3], a = Math.min(0.75, flash * 0.75);
      const sh = (P) => { const t = (xf + n * 0.015 - P[0]) / dir[0]; return [P[0] + dir[0] * t, P[1] + dir[1] * t, P[2] + dir[2] * t]; };
      for (const pl of plats) poly3(pl.map(sh), `rgba(0,0,0,${a * 0.55})`);
      for (const [p1, p2, ww] of segs) line3(sh(p1), sh(p2), `rgba(0,0,0,${a})`, ww * 1.4);
    }
    for (const pl of plats) poly3(pl, 'rgba(14,14,17,0.82)', col, w);
    for (const [p1, p2, ww] of segs) line3(p1, p2, col, ww);
  }
  function drawGap(x, z1, z2, L) {
    // vicolo laterale cieco
    const n = L ? 1 : -1, h = 16;
    if (L ? cam.x <= x : cam.x >= x) return;
    const d = (z1 + z2) / 2 - cam.z; if (d < NEAR) return;
    const lw = lwFor(d);
    poly3([[x, 0, z1], [L ? -2.1 : 2.1, 0, z1], [L ? -2.1 : 2.1, 0, z2], [x, 0, z2]], '#121317');
    poly3([[x, -h, z1], [x, -h, z2], [x, 0, z2], [x, 0, z1]], '#2a2b30', INK, lw);
    const lp = [x + n * 0.2, -3.3, (z1 + z2) / 2];
    const p = proj(lp[0], lp[1], lp[2]);
    const r = 2.4 * p[2]; if (!(r > 0)) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r); g.addColorStop(0, 'rgba(239,225,187,0.35)'); g.addColorStop(1, 'rgba(239,225,187,0)');
    ctx.fillStyle = g; ctx.fillRect(p[0] - r, p[1] - r, 2 * r, 2 * r); ctx.restore();
    ctx.fillStyle = CREAM; ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(1.2, 0.12 * p[2]), 0, TAU); ctx.fill();
  }

  function drawGround() {
    const big = 900;
    poly3([[-big, 0, -16], [big, 0, -16], [big, 0, 600], [-big, 0, 600]], '#121317');
    // strada
    if (cam.z < 0) {
      poly3([[-200, 0, -16], [200, 0, -16], [200, 0, -2.4], [-200, 0, -2.4]], '#17181c');
      poly3([[-200, 0, -2.4], [200, 0, -2.4], [200, 0, 0], [-200, 0, 0]], '#222328', INK, 1.2);
      const d = -8 - cam.z;
      if (d > NEAR) for (let x = -120; x < 120; x += 7) poly3([[x, 0, -8.15], [x + 3.2, 0, -8.15], [x + 3.2, 0, -7.85], [x, 0, -7.85]], 'rgba(239,225,187,0.22)');
    }
    // vicolo
    poly3([[-2.3, 0, 0], [2.3, 0, 0], [2.3, 0, 60], [-2.3, 0, 60]], '#111215');
    // ciottoli
    if (cam.y > -14) {
      const z0 = Math.max(0, Math.floor(cam.z)) , lw = 1;
      for (let z = Math.ceil(cam.z + 0.5); z < Math.min(60, cam.z + 34); z += 1.15) {
        if (z < 0) continue;
        const d = z - cam.z; if (d < 0.4) continue;
        line3([-2, 0, z], [2, 0, z], `rgba(9,9,11,${clamp(0.8 - d / 40, 0.1, 0.8)})`, Math.max(0.6, 2.4 / Math.sqrt(d)));
      }
      line3([0, 0, Math.max(0, cam.z + 0.3)], [0, 0, 60], 'rgba(9,9,11,0.8)', 1.6);
    }
    // pozzanghere con riflessi
    for (const pd of PUDDLES) {
      const d = pd.z - cam.z; if (d < 0.5) continue;
      const pts = []; for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; pts.push([pd.x + Math.cos(a) * pd.r * 1.3, 0, pd.z + Math.sin(a) * pd.r]); }
      if (!path3(pts)) continue;
      ctx.save(); ctx.clip();
      ctx.fillStyle = `rgba(${6 + flash * 140},${7 + flash * 140},${10 + flash * 150},0.62)`; ctx.fillRect(0, 0, W, H);
      // riflesso del lampione più vicino
      let best = null, bd = 1e9; for (const l of LAMPS) { const dd = Math.abs(l.z - pd.z); if (dd < bd) { bd = dd; best = l; } }
      if (best && bd < 6) {
        const p = proj(best.x, 0, pd.z), q = proj(best.x, 0, pd.z + 0.3);
        const gw = 0.5 * p[2];
        const g = ctx.createLinearGradient(p[0] - gw, 0, p[0] + gw, 0);
        g.addColorStop(0, 'rgba(239,225,187,0)'); g.addColorStop(0.5, 'rgba(239,225,187,0.55)'); g.addColorStop(1, 'rgba(239,225,187,0)');
        ctx.fillStyle = g; ctx.fillRect(p[0] - gw, 0, gw * 2, H);
      }
      ctx.restore();
      if (path3(pts)) { ctx.strokeStyle = 'rgba(200,200,212,0.16)'; ctx.lineWidth = 1; ctx.stroke(); }
    }
    // increspature
    ctx.strokeStyle = 'rgba(225,221,205,0.35)'; ctx.lineWidth = 1;
    for (const r of RIPPLES) {
      const d = r.z - cam.z; if (d < 0.5) continue;
      const p = proj(r.x, 0, r.z);
      const rx = (0.06 + r.a * 0.22) * p[2], ry = rx * clamp(-cam.y / d, 0.05, 1);
      ctx.globalAlpha = 1 - r.a; ctx.beginPath(); ctx.ellipse(p[0], p[1], rx, ry, 0, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // pozze di luce dei lampioni
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const pools = LAMPS.map((l) => ({ x: l.x * 0.6, z: l.z - (l.s === 0 ? 1.2 : 0), r: 2.2, a: 0.17 * lampInt(l) }))
      .concat(cam.z < 0 ? STREETLAMPS.map((l) => ({ x: l.x, z: l.z, r: 3.2, a: 0.14 })) : []);
    for (const pl of pools) {
      const d = pl.z - cam.z; if (d < 0.6) continue;
      const p = proj(pl.x, 0, pl.z);
      const rx = pl.r * p[2], ry = rx * clamp(-cam.y / d, 0.04, 1);
      if (p[0] + rx < 0 || p[0] - rx > W || p[1] - ry > H || p[1] + ry < 0) continue;
      ctx.save(); ctx.translate(p[0], p[1]); ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, `rgba(239,225,187,${pl.a})`); g.addColorStop(1, 'rgba(239,225,187,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.restore();
    drawWetReflections();
  }
  function drawWetReflections() {
    if (office()) return;
    const R = [];
    drawReflections(R, true);
  }
  function drawReflections(R, main) {
    if (main) {
    LAMPS.forEach((l) => R.push({ x: l.s === 0 ? 0 : l.x * 0.82, y: l.y, z: l.z - (l.s === 0 ? 0.6 : 0), a: 0.3 * lampInt(l), w: 0.2 }));
    R.push({ x: 0, y: -1.3, z: 59.6, a: 0.42, w: 0.55 });
    if (neonOn()) R.push({ x: 0, y: -4.95, z: 59.6, a: 0.36, w: 2.6, red: true });
    if (cam.z < 0) STREETLAMPS.forEach((l) => R.push({ x: l.x, y: -5.9, z: l.z - 1.2, a: 0.26, w: 0.35 }));
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const r of R) {
      const d = r.z - cam.z; if (d < 0.8 || r.a <= 0.01) continue;
      const p0 = proj(r.x, 0, r.z), p1 = proj(r.x, -r.y * 1.15, r.z);
      const w = Math.max(1.5, r.w * p0[2]), top = p0[1], bot = Math.min(H + 10, p1[1]);
      if (bot <= top || p0[0] < -w || p0[0] > W + w) continue;
      const g = ctx.createLinearGradient(0, top, 0, bot);
      const rc = r.red ? '220,30,40' : '239,225,187';
      g.addColorStop(0, `rgba(${rc},${r.a})`); g.addColorStop(0.35, `rgba(${rc},${r.a * 0.45})`); g.addColorStop(1, `rgba(${rc},0)`);
      ctx.fillStyle = g;
      const n = 12;
      for (let i = 0; i < n; i++) {
        const y0 = top + (bot - top) * i / n, y1 = top + (bot - top) * (i + 1) / n;
        const jx = Math.sin(clock * 3.1 + i * 1.9 + r.z) * w * 0.35 * (i / n + 0.2);
        const ww = w * (1 - i / n * 0.5);
        ctx.fillRect(p0[0] - ww / 2 + jx, y0, ww, y1 - y0 + 0.6);
      }
    }
    ctx.restore();
  }
  function lampInt(l) {
    if (!l.flick) return 1;
    const v = Math.sin(clock * 13) + Math.sin(clock * 31.7) + Math.sin(clock * 7.3);
    return v > 1.6 ? 0.15 : 1;
  }

  /* ---------------------------------------------------------------- */
  /* Oggetti del vicolo                                                 */
  function drawLamp(l) {
    const it = lampInt(l);
    flat(l.z, () => {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = INK; ctx.lineWidth = LW();
      const sx = l.s === 0 ? 0 : l.s * -2.0;
      const lx = l.s === 0 ? 0 : l.x + (l.s < 0 ? 0.35 : -0.35);
      if (l.s !== 0) { ctx.beginPath(); ctx.moveTo(l.s < 0 ? -2.0 : 2.0, l.y - 0.25); ctx.quadraticCurveTo(lx, l.y - 0.6, lx, l.y - 0.1); ctx.stroke(); }
      // paralume
      ctx.fillStyle = '#1b1b1f'; ctx.beginPath(); ctx.moveTo(lx - 0.38, l.y + 0.15); ctx.lineTo(lx - 0.12, l.y - 0.18); ctx.lineTo(lx + 0.12, l.y - 0.18); ctx.lineTo(lx + 0.38, l.y + 0.15); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = it > 0.5 ? CREAM : '#5a5648'; ctx.beginPath(); ctx.ellipse(lx, l.y + 0.18, 0.13, 0.09, 0, 0, TAU); ctx.fill();
      // alone
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(lx, l.y + 0.2, 0, lx, l.y + 0.2, 4.2);
      g.addColorStop(0, `rgba(239,225,187,${0.5 * it})`); g.addColorStop(0.12, `rgba(239,225,187,${0.2 * it})`); g.addColorStop(0.45, `rgba(239,225,187,${0.06 * it})`); g.addColorStop(1, 'rgba(239,225,187,0)');
      ctx.fillStyle = g; ctx.fillRect(lx - 4.2, l.y - 4, 8.4, 8.4);
      // cono di luce
      const c = ctx.createLinearGradient(0, l.y, 0, 0); c.addColorStop(0, `rgba(239,225,187,${0.16 * it})`); c.addColorStop(1, 'rgba(239,225,187,0)');
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(lx - 0.3, l.y + 0.18); ctx.lineTo(lx + 0.3, l.y + 0.18); ctx.lineTo(lx + 1.5, 0); ctx.lineTo(lx - 1.5, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    });
  }
  function drawStreetLamp(l) {
    flat(l.z, () => {
      if (!vis(l.x - 3, -8, l.x + 3, 0)) return;
      ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.fillStyle = '#1c1c20';
      ctx.fillRect(l.x - 0.1, -5.6, 0.2, 5.6); ctx.strokeRect(l.x - 0.1, -5.6, 0.2, 5.6);
      ctx.fillRect(l.x - 0.25, -0.5, 0.5, 0.5);
      ctx.beginPath(); ctx.moveTo(l.x - 0.45, -5.5); ctx.lineTo(l.x - 0.3, -6.3); ctx.lineTo(l.x + 0.3, -6.3); ctx.lineTo(l.x + 0.45, -5.5); ctx.closePath(); ctx.fillStyle = CREAM; ctx.fill(); ctx.stroke();
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(l.x, -5.9, 0, l.x, -5.9, 3.5); g.addColorStop(0, 'rgba(239,225,187,0.35)'); g.addColorStop(1, 'rgba(239,225,187,0)');
      ctx.fillStyle = g; ctx.fillRect(l.x - 3.5, -9.4, 7, 7); ctx.restore();
    });
  }
  function drawSign() {
    // insegna verticale HOTEL sul muro sinistro
    flat(22.5, () => {
      const x1 = -1.95, x2 = -0.95, y1 = -10.2, y2 = -4.6;
      ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.beginPath(); ctx.moveTo(-2, y1 + 0.3); ctx.lineTo(x1, y1 + 0.3); ctx.moveTo(-2, y2 - 0.3); ctx.lineTo(x1, y2 - 0.3); ctx.stroke();
      ctx.fillStyle = '#18181c'; ctx.fillRect(x1, y1, x2 - x1, y2 - y1); ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      const letters = 'HOTEL';
      ctx.font = `bold 0.82px "Playfair Display", Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const broken = Math.sin(clock * 2.1) + Math.sin(clock * 5.3) > 1.5;
      for (let i = 0; i < 5; i++) {
        const on = !(broken && i === 3);
        ctx.fillStyle = on ? CREAM : '#3a3832';
        ctx.fillText(letters[i], (x1 + x2) / 2, y1 + 0.65 + i * 1.08);
      }
      // lampadine
      for (let i = 0; i < 14; i++) { const t = i / 13; ctx.fillStyle = (Math.floor(clock * 4) + i) % 3 ? 'rgba(239,225,187,0.9)' : 'rgba(239,225,187,0.25)'; ctx.beginPath(); ctx.arc(x1 + 0.08, lerp(y1 + 0.15, y2 - 0.15, t), 0.05, 0, TAU); ctx.arc(x2 - 0.08, lerp(y1 + 0.15, y2 - 0.15, t), 0.05, 0, TAU); ctx.fill(); }
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient((x1 + x2) / 2, (y1 + y2) / 2, 0, (x1 + x2) / 2, (y1 + y2) / 2, 4); g.addColorStop(0, 'rgba(239,225,187,0.16)'); g.addColorStop(1, 'rgba(239,225,187,0)');
      ctx.fillStyle = g; ctx.fillRect(x1 - 4, y1 - 2, 8, 9.6); ctx.restore();
    });
  }
  function drawLaundry(L) {
    // corda con panni stesi
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([lerp(-2, 2, t), L.y + Math.sin(t * Math.PI) * 0.55 + Math.sin(clock * 1.3 + i) * 0.02, L.z]); }
    flat(L.z, () => {
      ctx.strokeStyle = INK; ctx.lineWidth = LW(1.2);
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      const R = rng(Math.round(L.z * 13));
      const items = [];
      for (let i = 0; i < 4; i++) items.push({ t: 0.12 + i * 0.22 + R() * 0.06, k: Math.floor(R() * 3), w: 0.42 + R() * 0.25 });
      items.forEach((it, j) => {
        const x = lerp(-2, 2, it.t), y = L.y + Math.sin(it.t * Math.PI) * 0.55;
        const sw = Math.sin(clock * 2 + j * 1.7) * 0.06;
        ctx.save(); ctx.translate(x, y); ctx.rotate(sw);
        ctx.fillStyle = ['#6e675b', '#45423d', '#5a564f'][it.k]; ctx.strokeStyle = INK; ctx.lineWidth = LW(1.4);
        ctx.beginPath();
        if (it.k === 0) { ctx.moveTo(-it.w, 0); ctx.lineTo(it.w, 0); ctx.lineTo(it.w + 0.15, 0.3); ctx.lineTo(it.w * 0.7, 0.35); ctx.lineTo(it.w * 0.7, 0.95); ctx.lineTo(-it.w * 0.7, 0.95); ctx.lineTo(-it.w * 0.7, 0.35); ctx.lineTo(-it.w - 0.15, 0.3); }
        else if (it.k === 1) { ctx.moveTo(-0.12, 0); ctx.lineTo(0.12, 0); ctx.lineTo(0.12, 0.55); ctx.lineTo(0.26, 0.68); ctx.lineTo(0.15, 0.78); ctx.lineTo(-0.12, 0.6); }
        else { ctx.moveTo(-it.w, 0); ctx.lineTo(it.w, 0); ctx.lineTo(it.w * 0.9, 0.75); ctx.lineTo(-it.w * 0.9, 0.75); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.fillRect(-0.04, -0.06, 0.08, 0.12);
        ctx.restore();
      });
    });
  }
  function drawTrash(x, z, withCat) {
    flat(z, () => {
      if (!vis(x - 1, -2, x + 1, 0.2)) return;
      ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.fillStyle = '#3b3c42'; ctx.beginPath(); ctx.moveTo(x - 0.34, -0.85); ctx.lineTo(x + 0.34, -0.85); ctx.lineTo(x + 0.3, 0); ctx.lineTo(x - 0.3, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); for (let i = 1; i < 4; i++) { ctx.moveTo(x - 0.33, -0.85 + i * 0.2); ctx.lineTo(x + 0.33, -0.85 + i * 0.2); } ctx.lineWidth = LW() * 0.5; ctx.stroke();
      ctx.lineWidth = LW(); ctx.fillStyle = '#2b2c31'; ctx.beginPath(); ctx.ellipse(x, -0.88, 0.4, 0.08, 0, 0, TAU); ctx.fill(); ctx.stroke();
      if (!withCat) { ctx.fillStyle = '#2b2c31'; ctx.beginPath(); ctx.ellipse(x + 0.5, -0.05, 0.4, 0.1, 0.3, 0, TAU); ctx.fill(); ctx.stroke(); return; }
      // gatto
      const cx = x + 0.02, cy = -0.95;
      const tail = Math.sin(clock * 2.2) * 0.25;
      ctx.fillStyle = '#0e0e11';
      ctx.beginPath(); ctx.ellipse(cx, cy - 0.22, 0.2, 0.25, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy - 0.52, 0.13, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - 0.12, cy - 0.57); ctx.lineTo(cx - 0.1, cy - 0.74); ctx.lineTo(cx - 0.02, cy - 0.62); ctx.moveTo(cx + 0.12, cy - 0.57); ctx.lineTo(cx + 0.1, cy - 0.74); ctx.lineTo(cx + 0.02, cy - 0.62); ctx.fill();
      ctx.strokeStyle = '#0e0e11'; ctx.lineWidth = LW(3); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx + 0.15, cy - 0.05); ctx.quadraticCurveTo(cx + 0.45, cy - 0.05, cx + 0.38 + tail * 0.4, cy - 0.4 - tail * 0.2); ctx.stroke();
      const blink = (clock % 4.3) < 0.15;
      if (!blink) { ctx.fillStyle = '#e8dc9a'; ctx.beginPath(); ctx.ellipse(cx - 0.05, cy - 0.53, 0.028, 0.02, 0, 0, TAU); ctx.ellipse(cx + 0.05, cy - 0.53, 0.028, 0.02, 0, 0, TAU); ctx.fill(); }
    });
  }
  function drawSteam() {
    const z = 27.5, x = 0.4;
    if (z - cam.z < 0.8) return;
    const p0 = proj(x, 0, z);
    // tombino
    const pts = []; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; pts.push([x + Math.cos(a) * 0.45, 0, z + Math.sin(a) * 0.35]); }
    poly3(pts, '#202126', INK, 1.2);
    flat(z, () => {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 7; i++) {
        const ph = ((clock * 0.35 + i / 7) % 1);
        const y = -ph * 3.2, r = 0.35 + ph * 1.1, xo = Math.sin(ph * 5 + i) * 0.3;
        const g = ctx.createRadialGradient(x + xo, y, 0, x + xo, y, r);
        const a = 0.09 * Math.sin(ph * Math.PI);
        g.addColorStop(0, `rgba(230,226,212,${a})`); g.addColorStop(1, 'rgba(230,226,212,0)');
        ctx.fillStyle = g; ctx.fillRect(x + xo - r, y - r, 2 * r, 2 * r);
      }
      ctx.restore();
    });
  }
  function drawCar() {
    const z = -8.2;
    if (cam.z > z - 1) return;
    const t = (T - (C0 + 3.1)) / 3.8;
    let x;
    if (mode === 'intro' && T < END_T) { if (t < 0 || t > 1) return; x = lerp(-34, 30, t); }
    else { const k = ((clock * 0.06) % 1); x = lerp(-90, 90, k); }
    flat(z, () => {
      if (!vis(x - 6, -3, x + 10, 0.5)) return;
      ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      // fari
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(x + 2.3, 0, x + 12, 0); g.addColorStop(0, 'rgba(239,225,187,0.35)'); g.addColorStop(1, 'rgba(239,225,187,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x + 2.25, -0.95); ctx.lineTo(x + 12, -1.9); ctx.lineTo(x + 12, 0.1); ctx.lineTo(x + 2.25, -0.75); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#1d1e23';
      ctx.beginPath();
      ctx.moveTo(x - 2.4, -0.45); ctx.quadraticCurveTo(x - 2.5, -1.15, x - 1.9, -1.2);
      ctx.lineTo(x - 1.3, -1.25); ctx.quadraticCurveTo(x - 1.1, -2.05, x - 0.2, -2.05); ctx.lineTo(x + 0.7, -2.05); ctx.quadraticCurveTo(x + 1.0, -2.0, x + 1.15, -1.3);
      ctx.lineTo(x + 2.0, -1.25); ctx.quadraticCurveTo(x + 2.45, -1.15, x + 2.4, -0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(239,225,187,0.55)'; ctx.beginPath(); ctx.moveTo(x - 1.05, -1.3); ctx.quadraticCurveTo(x - 0.9, -1.9, x - 0.2, -1.9); ctx.lineTo(x + 0.25, -1.9); ctx.lineTo(x + 0.25, -1.3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 0.4, -1.3); ctx.lineTo(x + 0.4, -1.9); ctx.lineTo(x + 0.65, -1.9); ctx.quadraticCurveTo(x + 0.9, -1.85, x + 1.0, -1.3); ctx.closePath(); ctx.fill(); ctx.stroke();
      [x - 1.45, x + 1.5].forEach((wx) => { ctx.fillStyle = '#0c0c0e'; ctx.beginPath(); ctx.arc(wx, -0.42, 0.42, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#cfc6ad'; ctx.beginPath(); ctx.arc(wx, -0.42, 0.22, 0, TAU); ctx.fill(); ctx.fillStyle = '#0c0c0e'; ctx.beginPath(); ctx.arc(wx, -0.42, 0.1, 0, TAU); ctx.fill(); });
      ctx.fillStyle = CREAM; ctx.beginPath(); ctx.arc(x + 2.2, -0.95, 0.16, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(208,16,28,0.8)'; ctx.fillRect(x - 2.45, -0.9, 0.12, 0.2);
    });
  }
  function drawHydrant() {
    flat(-1.2, () => {
      const x = 4.2;
      ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.fillStyle = '#3d3d43';
      ctx.fillRect(x - 0.18, -0.75, 0.36, 0.75); ctx.strokeRect(x - 0.18, -0.75, 0.36, 0.75);
      ctx.beginPath(); ctx.arc(x, -0.75, 0.2, Math.PI, 0); ctx.fill(); ctx.stroke();
      ctx.fillRect(x - 0.3, -0.55, 0.6, 0.14); ctx.strokeRect(x - 0.3, -0.55, 0.6, 0.14);
    });
  }

  function drawAlleyHaze() {
    if (office() || cam.y < -30) return;
    const d = 60 - cam.z; if (d < 2) return;
    const p = proj(0, -2.2, 60), r = 9 * p[2];
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r);
    g.addColorStop(0, 'rgba(239,225,187,0.14)'); g.addColorStop(0.4, 'rgba(239,225,187,0.05)'); g.addColorStop(1, 'rgba(239,225,187,0)');
    ctx.fillStyle = g; ctx.fillRect(p[0] - r, p[1] - r, r * 2, r * 2);
    ctx.restore();
  }
  // il detective: cammina verso di noi, la sua ombra sale sul muro, accende una sigaretta e alza lo sguardo
  const DET0 = { x: 0.35, z: 36 }, DET1 = { x: -1.0, z: 28.5 }, WALK_T = 3.2, STRIKE_T = 3.45, LOOK_T = 4.2;
  function detAt() {
    if (mode !== 'intro' || T >= A_END) return { x: DET1.x, z: DET1.z, walk: 0, ph: 0, look: 0, fi: 0, ember: 1 };
    const u = clamp(T / WALK_T, 0, 1);
    const st = T - STRIKE_T;
    const fi = st < 0 ? 0 : st < 0.06 ? st / 0.06 * 1.4 : st < 1.2 ? 1 - (st - 0.06) * 0.35 : Math.max(0, 0.6 - (st - 1.2) * 2);
    return { x: lerp(DET0.x, DET1.x, u), z: lerp(DET0.z, DET1.z, u), walk: u < 1 ? 1 : 0, ph: T * Math.PI * 1.75, look: smooth((T - LOOK_T) / 0.35), fi, ember: st > 0.5 ? 1 : 0 };
  }
  // sagoma per l'ombra (coordinate locali, metri)
  function silhouette(ph, walk) {
    const sw = Math.sin(ph) * 0.05 * walk;
    return [[-0.14 + sw, 0], [-0.09, -0.5], [-0.33 + sw * 0.4, -0.42], [-0.22, -0.95], [-0.27, -1.38], [-0.14, -1.47], [-0.1, -1.6], [-0.21, -1.68], [-0.11, -1.72], [-0.1, -1.86], [0.06, -1.86], [0.12, -1.72], [0.22, -1.68], [0.11, -1.6], [0.16, -1.47], [0.27, -1.36], [0.22, -0.95], [0.31 - sw * 0.4, -0.42], [0.1, -0.5], [0.15 - sw, 0]];
  }
  function drawDetShadow(d) {
    const L = LAMPS[3]; // lampione di destra a z = 41
    const it = lampInt(L) * clamp(1 - (Math.abs(d.z - L.z) - 2) / 24, 0, 1);
    if (it <= 0.02) return;
    const Lp = [1.62, -3.4, L.z], XW = -1.95;
    const bob = -Math.abs(Math.sin(d.ph)) * 0.025 * d.walk;
    const pts = silhouette(d.ph, d.walk).map(([lx, ly]) => {
      const P = [d.x + lx, ly + bob, d.z];
      const tw = (XW - Lp[0]) / (P[0] - Lp[0]), tf = (0 - Lp[1]) / (P[1] - Lp[1]);
      const t = Math.min(tw > 0 ? tw : 1e9, tf > 0 ? tf : 1e9);
      return [Lp[0] + (P[0] - Lp[0]) * t, Lp[1] + (P[1] - Lp[1]) * t, Lp[2] + (P[2] - Lp[2]) * t];
    });
    // pozza di luce sul muro dove cade l'ombra (stilizzata, come nei film)
    let cz = 0, cy = 0, nw = 0; for (const q of pts) if (q[0] < -1.9) { cz += q[2]; cy += q[1]; nw++; }
    if (nw > 3) {
      cz /= nw; cy /= nw;
      if (path3([[XW, -7, 18], [XW, -7, 34], [XW, 0, 34], [XW, 0, 18]])) {
        ctx.save(); ctx.clip();
        const c = proj(XW, cy - 0.3, cz), r = 3.4 * c[2];
        if (r > 0) {
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], r); g.addColorStop(0, `rgba(239,225,187,${0.2 * it})`); g.addColorStop(0.6, `rgba(239,225,187,${0.07 * it})`); g.addColorStop(1, 'rgba(239,225,187,0)');
          ctx.fillStyle = g; ctx.fillRect(c[0] - r, c[1] - r, 2 * r, 2 * r);
        }
        ctx.restore();
      }
    }
    if (path3(pts)) { ctx.fillStyle = `rgba(0,0,0,${0.78 * it})`; ctx.fill(); }
  }
  function drawDetective() {
    const d = detAt();
    if (d.z - cam.z < NEAR) return;
    drawDetShadow(d);
    const ember = d.ember || mode !== 'intro' ? 0.55 + 0.45 * Math.max(0, Math.sin(clock * 1.3)) : 0;
    const fi = d.fi, look = d.look;
    flat(d.z, () => {
      if (!vis(d.x - 1.2, -2.3, d.x + 1.2, 0.2)) return;
      const bob = -Math.abs(Math.sin(d.ph)) * 0.025 * d.walk, sw = Math.sin(d.ph) * d.walk;
      ctx.save(); ctx.translate(d.x, bob);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // gambe e scarpe che si alternano
      ctx.strokeStyle = '#0a0a0d'; ctx.lineWidth = 0.1;
      const lf = [-0.08 + sw * 0.02, -Math.max(0, sw) * 0.07], rf = [0.09 - sw * 0.02, -Math.max(0, -sw) * 0.07];
      ctx.beginPath(); ctx.moveTo(-0.06, -0.5); ctx.lineTo(lf[0], lf[1] - 0.03); ctx.moveTo(0.07, -0.5); ctx.lineTo(rf[0], rf[1] - 0.03); ctx.stroke();
      ctx.fillStyle = '#0a0a0d'; ctx.beginPath(); ctx.ellipse(lf[0], lf[1] - 0.015, 0.075, 0.028, 0, 0, TAU); ctx.ellipse(rf[0], rf[1] - 0.015, 0.075, 0.028, 0, 0, TAU); ctx.fill();
      // impermeabile che ondeggia
      const hs = sw * 0.025;
      ctx.fillStyle = '#121216'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.beginPath();
      ctx.moveTo(-0.33 + hs, -0.42); ctx.lineTo(-0.22, -0.95); ctx.lineTo(-0.27, -1.38); ctx.quadraticCurveTo(-0.22, -1.46, -0.1, -1.47);
      ctx.lineTo(0.12, -1.47); ctx.quadraticCurveTo(0.25, -1.45, 0.27, -1.36); ctx.lineTo(0.22, -0.95); ctx.lineTo(0.31 + hs, -0.42); ctx.closePath(); ctx.fill(); ctx.stroke();
      // riflessi bagnati sul tessuto
      ctx.strokeStyle = 'rgba(239,225,187,0.16)'; ctx.lineWidth = LW(1); ctx.beginPath(); ctx.moveTo(-0.22, -0.95); ctx.lineTo(0.22, -0.95); ctx.moveTo(0.0, -1.4); ctx.lineTo(-0.03 + hs, -0.45); ctx.moveTo(0.24, -1.3); ctx.lineTo(0.27 + hs, -0.5); ctx.stroke();
      // bavero alzato
      ctx.fillStyle = '#16161b'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.beginPath(); ctx.moveTo(-0.14, -1.46); ctx.lineTo(-0.09, -1.64); ctx.lineTo(0.0, -1.47); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.16, -1.46); ctx.lineTo(0.11, -1.64); ctx.lineTo(0.02, -1.47); ctx.closePath(); ctx.fill(); ctx.stroke();
      // testa (si alza quando guarda in camera)
      const hy = -0.03 * look;
      ctx.fillStyle = '#0c0c0f'; ctx.beginPath(); ctx.ellipse(0.01, -1.6 + hy, 0.085, 0.1, 0, 0, TAU); ctx.fill();
      // braccio: alzato solo per accendere e fumare
      const arm = mode !== 'intro' || T >= STRIKE_T - 0.35 ? 1 : 0;
      if (arm) { ctx.strokeStyle = '#121216'; ctx.lineWidth = LW(9); ctx.beginPath(); ctx.moveTo(0.22, -1.32); ctx.quadraticCurveTo(0.3, -1.12, 0.17, -1.42); ctx.lineTo(0.08, -1.55); ctx.stroke(); }
      // viso illuminato dal fiammifero o dalla brace, occhi che ci guardano
      const glow = Math.max(fi, ember * 0.35);
      if (glow > 0.05) {
        ctx.fillStyle = `rgba(214,170,120,${0.7 * Math.min(1, glow)})`; ctx.beginPath(); ctx.ellipse(0.04, -1.59 + hy, 0.05, 0.065, 0, -Math.PI / 2, Math.PI / 2); ctx.fill();
        if (look > 0.05) { ctx.fillStyle = `rgba(255,240,215,${look * Math.min(1, glow + 0.3)})`; ctx.beginPath(); ctx.arc(-0.025, -1.635 + hy, 0.009, 0, TAU); ctx.arc(0.045, -1.635 + hy, 0.009, 0, TAU); ctx.fill(); }
      }
      // fedora: la tesa si solleva con lo sguardo
      ctx.save(); ctx.translate(0.01, -1.69 + hy * 1.4); ctx.rotate(-0.12 * look);
      ctx.fillStyle = '#0d0d10'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.beginPath(); ctx.ellipse(0, 0, 0.21, 0.035 + 0.012 * look, -0.05, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.12, -0.01); ctx.quadraticCurveTo(-0.13, -0.16, -0.04, -0.17); ctx.lineTo(0, -0.13); ctx.lineTo(0.04, -0.17); ctx.quadraticCurveTo(0.12, -0.16, 0.11, -0.01); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(239,225,187,0.2)'; ctx.fillRect(-0.12, -0.05, 0.23, 0.02);
      ctx.restore();
      // fiamma del fiammifero
      if (fi > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0.1, -1.55, 0, 0.1, -1.55, 1.2);
        g.addColorStop(0, `rgba(255,214,150,${0.75 * fi})`); g.addColorStop(0.15, `rgba(255,190,120,${0.35 * fi})`); g.addColorStop(1, 'rgba(255,190,120,0)');
        ctx.fillStyle = g; ctx.fillRect(-1.1, -2.75, 2.4, 2.4);
        ctx.restore();
        ctx.fillStyle = `rgba(255,236,190,${Math.min(1, fi)})`; ctx.beginPath(); ctx.moveTo(0.12, -1.55); ctx.quadraticCurveTo(0.1, -1.6, 0.125, -1.64); ctx.quadraticCurveTo(0.15, -1.6, 0.13, -1.55); ctx.closePath(); ctx.fill();
      }
      // brace e fumo
      if (ember > 0) {
        ctx.fillStyle = `rgba(255,120,50,${0.6 + 0.4 * ember})`; ctx.beginPath(); ctx.arc(0.1, -1.565, 0.012 + 0.006 * ember, 0, TAU); ctx.fill();
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(0.1, -1.565, 0, 0.1, -1.565, 0.12); g.addColorStop(0, `rgba(255,120,50,${0.35 * ember})`); g.addColorStop(1, 'rgba(255,120,50,0)');
        ctx.fillStyle = g; ctx.fillRect(-0.02, -1.69, 0.24, 0.24); ctx.restore();
        ctx.lineWidth = LW(2); ctx.strokeStyle = 'rgba(225,220,205,0.16)';
        ctx.beginPath(); const px = 0.11, py = -1.58; ctx.moveTo(px, py);
        for (let i = 1; i <= 16; i++) ctx.lineTo(px + Math.sin(i * 0.55 - clock * 1.4) * 0.012 * i, py - i * 0.04);
        ctx.stroke();
      }
      ctx.restore();
    });
  }

  /* ---------------------------------------------------------------- */
  /* Lo studio                                                          */
  function office() { return stage === 'main' && cam.z < ZW - 0.02; }
  function drawOffice() {
    if (!office()) return;
    const fl = flash;
    // parete di fondo con il foro della finestra
    flat(ZW, () => {
      ctx.lineJoin = 'round';
      const X1 = -2.6, X2 = 2.6;
      ctx.beginPath(); ctx.rect(X1, CEIL, X2 - X1, FLOOR - CEIL); ctx.rect(WIN.x2 + 0.09, WIN.y1 - 0.09, -(WIN.x2 - WIN.x1 + 0.18), WIN.y2 - WIN.y1 + 0.18);
      ctx.fillStyle = '#26231f'; ctx.fill('evenodd');
      ctx.save(); ctx.clip('evenodd');
      ctx.fillStyle = 'rgba(255,240,210,0.035)'; for (let x = X1; x < X2; x += 0.22) ctx.fillRect(x, CEIL, 0.07, FLOOR - CEIL);
      ctx.fillStyle = '#1d1a17'; ctx.fillRect(X1, FLOOR - 0.95, X2 - X1, 0.95);
      ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.beginPath(); ctx.moveTo(X1, FLOOR - 0.95); ctx.lineTo(X2, FLOOR - 0.95); ctx.stroke();
      ctx.lineWidth = LW() * 0.6; for (let x = X1 + 0.3; x < X2; x += 0.62) ctx.strokeRect(x, FLOOR - 0.8, 0.5, 0.62);
      ctx.restore();
      // cornice della finestra
      ctx.fillStyle = '#16130f'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      const fx1 = WIN.x1 - 0.09, fy1 = WIN.y1 - 0.09, fw = WIN.x2 - WIN.x1 + 0.18, fh = WIN.y2 - WIN.y1 + 0.18;
      ctx.beginPath(); ctx.rect(fx1, fy1, fw, fh); ctx.rect(WIN.x2, WIN.y1, -(WIN.x2 - WIN.x1), WIN.y2 - WIN.y1); ctx.fill('evenodd'); ctx.stroke();
      // vetro
      ctx.fillStyle = `rgba(160,170,190,${0.06 + fl * 0.12})`; ctx.fillRect(WIN.x1, WIN.y1, WIN.x2 - WIN.x1, WIN.y2 - WIN.y1);
      ctx.save(); ctx.beginPath(); ctx.rect(WIN.x1, WIN.y1, WIN.x2 - WIN.x1, WIN.y2 - WIN.y1); ctx.clip();
      ctx.fillStyle = 'rgba(239,225,187,0.05)'; ctx.beginPath(); ctx.moveTo(WIN.x1 + 0.2, WIN.y1); ctx.lineTo(WIN.x1 + 0.6, WIN.y1); ctx.lineTo(WIN.x1 - 0.2, WIN.y2); ctx.lineTo(WIN.x1 - 0.6, WIN.y2); ctx.fill();
      // gocce sul vetro
      drawGlassDrops();
      ctx.restore();
      // telaio a ghigliottina
      ctx.fillStyle = '#16130f';
      ctx.fillRect(WIN.x1, YO + 0.02, WIN.x2 - WIN.x1, 0.07); ctx.strokeRect(WIN.x1, YO + 0.02, WIN.x2 - WIN.x1, 0.07);
      ctx.fillRect(-0.025, WIN.y1, 0.05, WIN.y2 - WIN.y1); ctx.strokeRect(-0.025, WIN.y1, 0.05, WIN.y2 - WIN.y1);
      // veneziana raccolta
      ctx.fillStyle = '#b9ae94'; ctx.fillRect(WIN.x1 - 0.04, WIN.y1 - 0.02, WIN.x2 - WIN.x1 + 0.08, 0.3);
      ctx.strokeStyle = 'rgba(9,9,11,0.75)'; ctx.lineWidth = LW() * 0.45;
      for (let y = WIN.y1 + 0.02; y < WIN.y1 + 0.28; y += 0.035) { ctx.beginPath(); ctx.moveTo(WIN.x1 - 0.04, y); ctx.lineTo(WIN.x2 + 0.04, y); ctx.stroke(); }
      ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.strokeRect(WIN.x1 - 0.04, WIN.y1 - 0.02, WIN.x2 - WIN.x1 + 0.08, 0.3);
      ctx.lineWidth = LW() * 0.5; ctx.beginPath(); ctx.moveTo(WIN.x1 + 0.2, WIN.y1 + 0.28); ctx.lineTo(WIN.x1 + 0.2, YO - 0.1); ctx.moveTo(WIN.x1 + 0.28, WIN.y1 + 0.28); ctx.lineTo(WIN.x1 + 0.28, YO - 0.25); ctx.stroke();
      ctx.fillStyle = '#b9ae94'; ctx.beginPath(); ctx.ellipse(WIN.x1 + 0.2, YO - 0.07, 0.025, 0.05, 0, 0, TAU); ctx.ellipse(WIN.x1 + 0.28, YO - 0.22, 0.025, 0.05, 0, 0, TAU); ctx.fill();
      // davanzale
      ctx.fillStyle = '#211d18'; ctx.fillRect(WIN.x1 - 0.2, WIN.y2 + 0.09, WIN.x2 - WIN.x1 + 0.4, 0.07); ctx.lineWidth = LW(); ctx.strokeRect(WIN.x1 - 0.2, WIN.y2 + 0.09, WIN.x2 - WIN.x1 + 0.4, 0.07);
      // ritaglio di giornale incorniciato
      const nx = -1.95, ny = YO - 0.98;
      ctx.fillStyle = '#100e0c'; ctx.fillRect(nx - 0.05, ny - 0.05, 0.95, 0.7); ctx.strokeRect(nx - 0.05, ny - 0.05, 0.95, 0.7);
      ctx.fillStyle = '#cdbf9c'; ctx.fillRect(nx, ny, 0.85, 0.6);
      ctx.fillStyle = '#1a1714'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const hl = ((caseInfo && caseInfo.headline) || 'DELITTO A HARLEM').split('|');
      ctx.font = `900 ${hl.length > 1 ? 0.072 : 0.085}px "Playfair Display", Georgia, serif`;
      hl.forEach((ln, i) => ctx.fillText(ln, nx + 0.425, ny + 0.035 + i * 0.08));
      const ry = ny + 0.04 + hl.length * 0.08;
      ctx.fillRect(nx + 0.06, ry, 0.73, 0.012);
      ctx.fillStyle = 'rgba(26,23,20,0.55)'; for (let i = 0; i < 6; i++) { if (ry + 0.04 + i * 0.05 > ny + 0.57) break; ctx.fillRect(nx + 0.06, ry + 0.04 + i * 0.05, 0.34, 0.018); ctx.fillRect(nx + 0.45, ry + 0.04 + i * 0.05, 0.34, 0.018); }
      ctx.fillStyle = '#4a443a'; ctx.fillRect(nx + 0.45, ry + 0.04, 0.34, 0.14);
      // bacheca di sughero
      drawCorkBoard();
      // luce a strisce da una finestra fuori campo: il marchio del noir
      ctx.save(); ctx.beginPath(); ctx.rect(X1, CEIL, X2 - X1, FLOOR - CEIL); ctx.rect(WIN.x2 + 0.09, WIN.y1 - 0.09, -(WIN.x2 - WIN.x1 + 0.18), WIN.y2 - WIN.y1 + 0.18); ctx.clip('evenodd');
      ctx.globalCompositeOperation = 'lighter';
      const sa = 0.055 + 0.015 * Math.sin(clock * 0.9) + fl * 0.28;
      ctx.translate(1.75, YO + 0.05); ctx.rotate(-0.38);
      for (let i = 0; i < 10; i++) { ctx.fillStyle = `rgba(226,222,204,${sa * (1 - Math.abs(i - 4.5) / 9)})`; ctx.fillRect(-0.95, -0.9 + i * 0.18, 1.9, 0.09); }
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(X1, CEIL, X2 - X1, FLOOR - CEIL); ctx.rect(WIN.x2 + 0.09, WIN.y1 - 0.09, -(WIN.x2 - WIN.x1 + 0.18), WIN.y2 - WIN.y1 + 0.18); ctx.clip('evenodd');
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(-1.6, YO - 0.15); ctx.rotate(0.3);
      for (let i = 0; i < 7; i++) { ctx.fillStyle = `rgba(226,222,204,${(sa * 0.55) * (1 - Math.abs(i - 3) / 6)})`; ctx.fillRect(-0.6, -0.6 + i * 0.17, 1.2, 0.08); }
      ctx.restore();
    });
    // soffitto, pavimento, pareti laterali
    const Z2 = ZW - 9;
    poly3([[-2.6, CEIL, ZW], [2.6, CEIL, ZW], [2.6, CEIL, Z2], [-2.6, CEIL, Z2]], '#15130f', INK, 2);
    poly3([[-2.6, FLOOR, ZW], [2.6, FLOOR, ZW], [2.6, FLOOR, Z2], [-2.6, FLOOR, Z2]], '#1e1914', INK, 2);
    for (let x = -2.6; x <= 2.6; x += 0.2) line3([x, FLOOR, ZW], [x, FLOOR, Z2], 'rgba(9,9,11,0.55)', 1);
    // tappeto
    poly3([[-1.35, FLOOR - 0.005, ZW - 0.5], [1.35, FLOOR - 0.005, ZW - 0.5], [1.35, FLOOR - 0.005, ZW - 3.3], [-1.35, FLOOR - 0.005, ZW - 3.3]], '#2b221c', INK, 2);
    poly3([[-1.2, FLOOR - 0.01, ZW - 0.62], [1.2, FLOOR - 0.01, ZW - 0.62], [1.2, FLOOR - 0.01, ZW - 3.15], [-1.2, FLOOR - 0.01, ZW - 3.15]], null, 'rgba(201,183,143,0.25)', 1.2);
    [-1, 1].forEach((s) => {
      const x = 2.6 * s;
      poly3([[x, CEIL, ZW], [x, CEIL, Z2], [x, FLOOR, Z2], [x, FLOOR, ZW]], '#221f1b', INK, 2);
      poly3([[x, FLOOR - 0.95, ZW], [x, FLOOR - 0.95, Z2], [x, FLOOR, Z2], [x, FLOOR, ZW]], '#1a1714', INK, 1.5);
    });
    // porta con vetro smerigliato (parete destra)
    poly3([[2.59, FLOOR - 2.15, ZW - 2.0], [2.59, FLOOR - 2.15, ZW - 3.0], [2.59, FLOOR, ZW - 3.0], [2.59, FLOOR, ZW - 2.0]], '#1a1612', INK, 2);
    if (poly3([[2.58, FLOOR - 2.0, ZW - 2.1], [2.58, FLOOR - 2.0, ZW - 2.9], [2.58, FLOOR - 1.1, ZW - 2.9], [2.58, FLOOR - 1.1, ZW - 2.1]], 'rgba(205,195,170,0.55)', INK, 1.5)) {
      // scritta al contrario (vista dall'interno)
      const p1 = proj(2.58, FLOOR - 1.7, ZW - 2.5);
      ctx.save(); ctx.translate(p1[0], p1[1]); ctx.scale(-0.5, 1); ctx.fillStyle = 'rgba(20,18,15,0.7)'; ctx.font = `bold ${Math.max(6, 0.11 * p1[2])}px "Special Elite", "Courier New", monospace`; ctx.textAlign = 'center'; ctx.fillText('INVESTIGAZIONI', 0, 0); ctx.fillText('PRIVATE', 0, 0.14 * p1[2]); ctx.restore();
    }
    // luce della finestra sul pavimento (strisce della veneziana)
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const la = 0.035 + fl * 0.32;
    for (let i = 0; i < 6; i++) {
      const z1 = ZW - 0.25 - i * 0.36, z2 = z1 - 0.2;
      poly3([[-0.85 - i * 0.05, FLOOR - 0.012, z1], [0.85 + i * 0.05, FLOOR - 0.012, z1], [0.9 + i * 0.05, FLOOR - 0.012, z2], [-0.9 - i * 0.05, FLOOR - 0.012, z2]], `rgba(200,210,230,${la})`);
    }
    ctx.restore();
    // schedario + gufo
    drawCabinet();
    drawCoatRack();
    drawChair();
    drawDesk();
    drawFan();
    drawDustAndSmoke();
    if (lampLevel < 1) { ctx.fillStyle = `rgba(0,0,0,${0.32 * (1 - lampLevel)})`; ctx.fillRect(0, 0, W, H); }
    // luce ambientale del lampo
    if (fl > 0.01) { ctx.fillStyle = `rgba(190,200,225,${fl * 0.16})`; ctx.fillRect(0, 0, W, H); }
  }
  const MOTES = [];
  for (let i = 0; i < 46; i++) MOTES.push({ x: -1.3 + Math.random() * 1.3, y: -1.25 + Math.random() * 1.15, vx: (Math.random() - 0.5) * 0.02, vy: (Math.random() - 0.5) * 0.015, r: 0.0035 + Math.random() * 0.005, p: Math.random() * 6 });
  function drawDustAndSmoke() {
    const top = FLOOR - 0.8, z = ZW - 1.32;
    if (z - cam.z < NEAR) return;
    flat(z, () => {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      // fumo stratificato sotto il soffitto
      for (let i = 0; i < 4; i++) {
        const sx = -1.6 + ((clock * (0.035 + i * 0.012) + i * 0.9) % 3.4), sy = CEIL + 0.55 + i * 0.22 + Math.sin(clock * 0.3 + i) * 0.05, r = 0.7 + i * 0.12;
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r); g.addColorStop(0, `rgba(225,220,205,${0.03 * lampLevel})`); g.addColorStop(1, 'rgba(225,220,205,0)');
        ctx.save(); ctx.translate(sx, sy); ctx.scale(1, 0.35); ctx.translate(-sx, -sy); ctx.fillStyle = g; ctx.fillRect(sx - r, sy - r, r * 2, r * 2); ctx.restore();
      }
      // polvere che brilla nella luce della lampada
      if (lampLevel > 0.05) for (const m of MOTES) {
        m.x += m.vx * 0.016 + Math.sin(clock * 0.7 + m.p) * 0.0004; m.y += m.vy * 0.016 + Math.cos(clock * 0.5 + m.p) * 0.0003;
        if (m.x < -1.35) m.x = -0.05; if (m.x > -0.02) m.x = -1.3; if (m.y < -1.3) m.y = -0.12; if (m.y > -0.1) m.y = -1.25;
        const dx = m.x + 0.66, dy = m.y + 0.45, k = clamp(1 - Math.hypot(dx * 0.9, dy) / 0.75, 0, 1);
        if (k <= 0) continue;
        ctx.fillStyle = `rgba(255,244,214,${0.55 * k * lampLevel * (0.6 + 0.4 * Math.sin(clock * 2 + m.p))})`;
        ctx.beginPath(); ctx.arc(m.x, top + m.y, m.r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    });
  }
  const GLASS = [];
  for (let i = 0; i < 70; i++) GLASS.push({ x: Math.random(), y: Math.random(), r: 0.006 + Math.random() * 0.016, v: Math.random() < 0.12 ? 0.02 + Math.random() * 0.06 : 0 });
  function drawGlassDrops() {
    for (const g of GLASS) {
      if (g.v) { g.y += g.v * 0.016; if (g.y > 1.05) { g.y = -0.05; g.x = Math.random(); } }
      const x = lerp(WIN.x1, WIN.x2, g.x), y = lerp(WIN.y1, WIN.y2, g.y);
      ctx.fillStyle = 'rgba(210,215,225,0.28)'; ctx.beginPath(); ctx.arc(x, y, g.r, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,250,235,0.55)'; ctx.beginPath(); ctx.arc(x - g.r * 0.3, y - g.r * 0.35, g.r * 0.3, 0, TAU); ctx.fill();
      if (g.v) { ctx.fillStyle = 'rgba(210,215,225,0.12)'; ctx.fillRect(x - g.r * 0.4, y - 0.12, g.r * 0.8, 0.12); }
    }
  }
  function drawCorkBoard() {
    const x1 = 0.98, x2 = 1.98, y1 = YO - 0.95, y2 = YO - 0.2;
    ctx.fillStyle = '#100e0c'; ctx.fillRect(x1 - 0.05, y1 - 0.05, x2 - x1 + 0.1, y2 - y1 + 0.1);
    ctx.fillStyle = '#5b4d3d'; ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; const R = rng(77); for (let i = 0; i < 120; i++) ctx.fillRect(lerp(x1, x2, R()), lerp(y1, y2, R()), 0.012, 0.012);
    ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.strokeRect(x1 - 0.05, y1 - 0.05, x2 - x1 + 0.1, y2 - y1 + 0.1);
    const notes = [[1.08, YO - 0.88, 0.22, 0.27, 1], [1.42, YO - 0.9, 0.2, 0.15, 0], [1.72, YO - 0.85, 0.2, 0.26, 1], [1.15, YO - 0.52, 0.24, 0.18, 0], [1.52, YO - 0.6, 0.22, 0.28, 1], [1.8, YO - 0.48, 0.14, 0.2, 0]];
    const pins = [];
    notes.forEach((n, i) => {
      ctx.save(); ctx.translate(n[0] + n[2] / 2, n[1] + n[3] / 2); ctx.rotate((i % 2 ? 1 : -1) * 0.06);
      ctx.fillStyle = n[4] ? '#d8ccb0' : '#c9b78f'; ctx.fillRect(-n[2] / 2, -n[3] / 2, n[2], n[3]);
      ctx.strokeStyle = INK; ctx.lineWidth = LW() * 0.5; ctx.strokeRect(-n[2] / 2, -n[3] / 2, n[2], n[3]);
      if (n[4]) { ctx.fillStyle = '#3d3a35'; ctx.fillRect(-n[2] / 2 + 0.025, -n[3] / 2 + 0.025, n[2] - 0.05, n[3] * 0.62); ctx.fillStyle = '#16151a'; ctx.beginPath(); ctx.arc(0, -n[3] * 0.12, n[2] * 0.16, 0, TAU); ctx.fill(); ctx.fillRect(-n[2] * 0.25, -n[3] * 0.0, n[2] * 0.5, n[3] * 0.2); }
      else { ctx.fillStyle = 'rgba(20,18,15,0.6)'; for (let l = 0; l < 3; l++) ctx.fillRect(-n[2] / 2 + 0.03, -n[3] / 2 + 0.04 + l * 0.04, n[2] - 0.06, 0.012); }
      ctx.restore();
      pins.push([n[0] + n[2] / 2, n[1] + 0.02]);
    });
    ctx.strokeStyle = RED; ctx.lineWidth = LW(1.4);
    ctx.beginPath(); [[0, 4], [4, 2], [2, 1], [4, 5], [0, 3]].forEach(([a, b]) => { ctx.moveTo(pins[a][0], pins[a][1]); ctx.lineTo(pins[b][0], pins[b][1]); }); ctx.stroke();
    pins.forEach((p) => { ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(p[0], p[1], 0.018, 0, TAU); ctx.fill(); });
  }
  function drawCabinet() {
    const z = ZW - 0.32, x1 = -1.52, x2 = -0.93, top = FLOOR - 1.32;
    poly3([[x1, top, z], [x2, top, z], [x2, top, ZW - 0.02], [x1, top, ZW - 0.02]], '#3a3832', INK, 2);
    flat(z, () => {
      ctx.lineJoin = 'round'; ctx.fillStyle = '#2f2e2b'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.fillRect(x1, top, x2 - x1, FLOOR - top); ctx.strokeRect(x1, top, x2 - x1, FLOOR - top);
      for (let i = 0; i < 3; i++) {
        const y = top + 0.07 + i * 0.41;
        ctx.fillStyle = '#353430'; ctx.fillRect(x1 + 0.05, y, x2 - x1 - 0.1, 0.36); ctx.strokeRect(x1 + 0.05, y, x2 - x1 - 0.1, 0.36);
        ctx.fillStyle = '#cdbf9c'; ctx.fillRect((x1 + x2) / 2 - 0.08, y + 0.07, 0.16, 0.06); ctx.lineWidth = LW() * 0.6; ctx.strokeRect((x1 + x2) / 2 - 0.08, y + 0.07, 0.16, 0.06);
        ctx.fillStyle = '#8c8577'; ctx.fillRect((x1 + x2) / 2 - 0.09, y + 0.19, 0.18, 0.04); ctx.lineWidth = LW();
      }
      // pila di fascicoli
      ctx.fillStyle = '#c9b78f'; ctx.fillRect(x2 - 0.28, top - 0.06, 0.24, 0.06); ctx.strokeRect(x2 - 0.28, top - 0.06, 0.24, 0.06);
      ctx.fillStyle = '#b8a67f'; ctx.fillRect(x2 - 0.26, top - 0.1, 0.22, 0.04); ctx.strokeRect(x2 - 0.26, top - 0.1, 0.22, 0.04);
    });
    drawOwl(-1.27, top, z - 0.04);
  }
  function drawOwl(x, y, z) {
    flat(z, () => {
      ctx.save(); ctx.translate(x, y);
      const sc = 0.5; ctx.scale(sc, sc);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LW() / sc;
      // corpo
      ctx.fillStyle = '#34343a';
      ctx.beginPath(); ctx.moveTo(-0.32, -0.02); ctx.bezierCurveTo(-0.46, -0.35, -0.4, -0.72, 0, -0.74); ctx.bezierCurveTo(0.4, -0.72, 0.46, -0.35, 0.32, -0.02); ctx.closePath(); ctx.fill(); ctx.stroke();
      // ali
      ctx.fillStyle = '#28282d';
      ctx.beginPath(); ctx.moveTo(-0.34, -0.5); ctx.quadraticCurveTo(-0.46, -0.2, -0.26, 0.0); ctx.quadraticCurveTo(-0.24, -0.3, -0.34, -0.5); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0.34, -0.5); ctx.quadraticCurveTo(0.46, -0.2, 0.26, 0.0); ctx.quadraticCurveTo(0.24, -0.3, 0.34, -0.5); ctx.fill(); ctx.stroke();
      // petto
      ctx.strokeStyle = 'rgba(207,195,163,0.45)'; ctx.lineWidth = LW() * 0.5 / sc;
      for (let r = 0; r < 3; r++) for (let k = -1; k <= 1; k++) { const px = k * 0.1 + (r % 2) * 0.05, py = -0.32 + r * 0.09; ctx.beginPath(); ctx.moveTo(px - 0.035, py); ctx.lineTo(px, py + 0.03); ctx.lineTo(px + 0.035, py); ctx.stroke(); }
      // testa (ruota leggermente)
      ctx.save(); ctx.translate(0, -0.74); ctx.rotate(owlTurn * 0.18); ctx.translate(owlTurn * 0.03, 0);
      ctx.strokeStyle = INK; ctx.lineWidth = LW() / sc; ctx.fillStyle = '#34343a';
      ctx.beginPath(); ctx.moveTo(-0.3, 0.05); ctx.bezierCurveTo(-0.34, -0.2, -0.3, -0.3, -0.28, -0.42); ctx.lineTo(-0.14, -0.3); ctx.quadraticCurveTo(0, -0.34, 0.14, -0.3); ctx.lineTo(0.28, -0.42); ctx.bezierCurveTo(0.3, -0.3, 0.34, -0.2, 0.3, 0.05); ctx.quadraticCurveTo(0, 0.12, -0.3, 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
      // dischi facciali
      ctx.fillStyle = '#45454c'; ctx.beginPath(); ctx.arc(-0.12, -0.13, 0.13, 0, TAU); ctx.arc(0.12, -0.13, 0.13, 0, TAU); ctx.fill();
      // occhi
      const open = clamp(owlOpen * (1 - owlBlink), 0, 1);
      [-0.12, 0.12].forEach((ex) => {
        ctx.fillStyle = '#0c0c0e'; ctx.beginPath(); ctx.arc(ex, -0.13, 0.085, 0, TAU); ctx.fill();
        if (open > 0.02) {
          ctx.save(); ctx.beginPath(); ctx.ellipse(ex, -0.13, 0.085, 0.085 * open, 0, 0, TAU); ctx.clip();
          const g = ctx.createRadialGradient(ex, -0.13, 0, ex, -0.13, 0.085); g.addColorStop(0, '#ff4a42'); g.addColorStop(0.55, RED); g.addColorStop(1, '#5c0509');
          ctx.fillStyle = g; ctx.fillRect(ex - 0.09, -0.22, 0.18, 0.18);
          ctx.fillStyle = '#060607'; ctx.beginPath(); ctx.arc(ex + owlTurn * 0.02, -0.13, 0.035, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,245,230,0.9)'; ctx.beginPath(); ctx.arc(ex - 0.025, -0.16, 0.014, 0, TAU); ctx.fill();
          ctx.restore();
        }
        ctx.strokeStyle = INK; ctx.lineWidth = LW() / sc; ctx.beginPath(); ctx.arc(ex, -0.13, 0.085, 0, TAU); ctx.stroke();
      });
      ctx.fillStyle = '#c9b78f'; ctx.beginPath(); ctx.moveTo(-0.035, -0.06); ctx.lineTo(0.035, -0.06); ctx.lineTo(0, 0.02); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
      // zampe
      ctx.strokeStyle = '#c9b78f'; ctx.lineWidth = LW(1.6) / sc;
      [-0.1, 0.1].forEach((fx) => { ctx.beginPath(); ctx.moveTo(fx - 0.05, 0); ctx.lineTo(fx - 0.06, 0.05); ctx.moveTo(fx, 0); ctx.lineTo(fx, 0.06); ctx.moveTo(fx + 0.05, 0); ctx.lineTo(fx + 0.06, 0.05); ctx.stroke(); });
      ctx.restore();
      // bagliore rosso
      if (owlOpen * (1 - owlBlink) > 0.1) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const ey = y - 0.74 * sc - 0.13 * sc;
        const g = ctx.createRadialGradient(x, ey, 0, x, ey, 0.32); g.addColorStop(0, `rgba(208,16,28,${0.28 * owlOpen * (1 - owlBlink)})`); g.addColorStop(1, 'rgba(208,16,28,0)');
        ctx.fillStyle = g; ctx.fillRect(x - 0.32, ey - 0.32, 0.64, 0.64); ctx.restore();
      }
    });
  }
  function drawCoatRack() {
    const z = ZW - 0.55, x = 1.5;
    // pozza d'acqua sotto il cappotto bagnato
    const pp = []; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; pp.push([x - 0.03 + Math.cos(a) * 0.26, FLOOR - 0.004, z + Math.sin(a) * 0.16]); }
    if (path3(pp)) { ctx.fillStyle = 'rgba(8,8,10,0.7)'; ctx.fill(); ctx.strokeStyle = `rgba(210,212,222,${0.18 + 0.2 * lampLevel})`; ctx.lineWidth = 1; ctx.stroke(); }
    flat(z, () => {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = INK;
      ctx.fillStyle = '#1b1713'; ctx.lineWidth = LW();
      ctx.fillRect(x - 0.025, FLOOR - 1.82, 0.05, 1.82); ctx.strokeRect(x - 0.025, FLOOR - 1.82, 0.05, 1.82);
      ctx.beginPath(); ctx.moveTo(x - 0.25, FLOOR); ctx.lineTo(x, FLOOR - 0.18); ctx.lineTo(x + 0.25, FLOOR); ctx.lineWidth = LW(3); ctx.stroke(); ctx.lineWidth = LW();
      // trench
      ctx.fillStyle = '#5d564a';
      ctx.beginPath(); ctx.moveTo(x - 0.05, FLOOR - 1.66); ctx.quadraticCurveTo(x - 0.3, FLOOR - 1.6, x - 0.3, FLOOR - 1.35); ctx.lineTo(x - 0.34, FLOOR - 0.55); ctx.lineTo(x + 0.28, FLOOR - 0.52); ctx.lineTo(x + 0.25, FLOOR - 1.35); ctx.quadraticCurveTo(x + 0.25, FLOOR - 1.6, x + 0.05, FLOOR - 1.66); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, FLOOR - 1.6); ctx.lineTo(x - 0.06, FLOOR - 0.55); ctx.moveTo(x - 0.3, FLOOR - 1.05); ctx.lineTo(x + 0.26, FLOOR - 1.05); ctx.lineWidth = LW() * 0.7; ctx.stroke();
      ctx.fillStyle = '#3f3a31'; ctx.fillRect(x - 0.31, FLOOR - 1.08, 0.58, 0.07);
      // tessuto bagnato e gocce che cadono
      ctx.strokeStyle = 'rgba(239,225,187,0.2)'; ctx.lineWidth = LW(1); ctx.beginPath(); ctx.moveTo(x - 0.22, FLOOR - 1.4); ctx.lineTo(x - 0.26, FLOOR - 0.6); ctx.moveTo(x + 0.18, FLOOR - 1.3); ctx.lineTo(x + 0.2, FLOOR - 0.62); ctx.stroke();
      [-0.24, 0.02, 0.21].forEach((ox, i) => { const ph = (clock * 0.85 + i * 0.37) % 1; if (ph > 0.92) return; const yy = FLOOR - 0.53 + ph * ph * 0.53; ctx.fillStyle = `rgba(220,222,230,${0.55 * (1 - ph * 0.5)})`; ctx.beginPath(); ctx.ellipse(x + ox, yy, 0.009, 0.016, 0, 0, TAU); ctx.fill(); });
      // fedora
      ctx.lineWidth = LW(); ctx.fillStyle = '#18181b';
      ctx.beginPath(); ctx.ellipse(x, FLOOR - 1.84, 0.2, 0.04, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 0.12, FLOOR - 1.85); ctx.quadraticCurveTo(x - 0.13, FLOOR - 2.02, x - 0.04, FLOOR - 2.03); ctx.lineTo(x, FLOOR - 1.99); ctx.lineTo(x + 0.04, FLOOR - 2.03); ctx.quadraticCurveTo(x + 0.13, FLOOR - 2.02, x + 0.12, FLOOR - 1.85); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a4740'; ctx.fillRect(x - 0.12, FLOOR - 1.9, 0.24, 0.035);
    });
  }
  function drawChair() {
    flat(ZW - 0.75, () => {
      const x = 0.5;
      ctx.lineJoin = 'round'; ctx.fillStyle = '#16120f'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.beginPath(); ctx.moveTo(x - 0.3, FLOOR - 0.5); ctx.lineTo(x - 0.3, FLOOR - 1.12); ctx.quadraticCurveTo(x - 0.3, FLOOR - 1.32, x - 0.1, FLOOR - 1.34); ctx.lineTo(x + 0.1, FLOOR - 1.34); ctx.quadraticCurveTo(x + 0.3, FLOOR - 1.32, x + 0.3, FLOOR - 1.12); ctx.lineTo(x + 0.3, FLOOR - 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(207,195,163,0.5)'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x - 0.26 + i * 0.13, FLOOR - 1.25, 0.012, 0, TAU); ctx.fill(); }
    });
  }
  function drawDesk() {
    const zf = ZW - 1.75, zb = ZW - 1.0, x1 = -1.08, x2 = 1.08, top = FLOOR - 0.8;
    poly3([[x1, top, zb], [x2, top, zb], [x2, top, zf], [x1, top, zf]], '#2b231c', INK, 2.6);
    // luce della lampada sul piano
    const lp = (ZW - 1.35 - cam.z > NEAR) ? proj(-0.66, top, ZW - 1.35) : null;
    if (lp && lp[2] > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const r = 0.9 * lp[2]; ctx.translate(lp[0], lp[1]); ctx.scale(1, 0.32);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, `rgba(239,225,187,${0.32 * lampLevel})`); g.addColorStop(1, 'rgba(239,225,187,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.restore();
    }
    // cartella del caso (piatta sul piano)
    const fz1 = ZW - 1.62, fz2 = ZW - 1.2;
    poly3([[-0.28, top - 0.004, fz2], [0.36, top - 0.004, fz2], [0.36, top - 0.004, fz1], [-0.28, top - 0.004, fz1]], '#c9b78f', INK, 2);
    poly3([[-0.28, top - 0.006, fz2], [-0.1, top - 0.006, fz2], [-0.08, top - 0.006, fz2 + 0.03], [-0.26, top - 0.006, fz2 + 0.03]], '#bba982', INK, 1.4);
    poly3([[0.0, top - 0.008, fz1 + 0.26], [0.26, top - 0.008, fz1 + 0.26], [0.26, top - 0.008, fz1 + 0.12], [0.0, top - 0.008, fz1 + 0.12]], null, RED, 1.8);
    poly3([[0.03, top - 0.008, fz1 + 0.2], [0.23, top - 0.008, fz1 + 0.2], [0.23, top - 0.008, fz1 + 0.18], [0.03, top - 0.008, fz1 + 0.18]], 'rgba(208,16,28,0.8)');
    // oggetti sul piano
    drawDeskLamp(-0.66, top, ZW - 1.32);
    drawTypewriter(0.02, top, ZW - 1.15);
    drawPhone(0.74, top, ZW - 1.3);
    drawGlass(-0.3, top, ZW - 1.5);
    drawAshtray(0.55, top, ZW - 1.62);
    // fronte della scrivania
    flat(zf, () => {
      ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.fillStyle = '#231c16'; ctx.fillRect(x1, top, x2 - x1, FLOOR - top); ctx.strokeRect(x1, top, x2 - x1, FLOOR - top);
      ctx.fillStyle = '#2d241c'; ctx.fillRect(x1 - 0.03, top - 0.05, x2 - x1 + 0.06, 0.06); ctx.strokeRect(x1 - 0.03, top - 0.05, x2 - x1 + 0.06, 0.06);
      [[x1 + 0.08, 0.6], [x2 - 0.68, 0.6]].forEach(([px, w]) => {
        for (let i = 0; i < 3; i++) {
          const y = top + 0.08 + i * 0.23;
          ctx.fillStyle = '#2a2119'; ctx.fillRect(px, y, w, 0.19); ctx.lineWidth = LW() * 0.8; ctx.strokeRect(px, y, w, 0.19);
          ctx.fillStyle = '#b39f72'; ctx.beginPath(); ctx.ellipse(px + w / 2, y + 0.095, 0.05, 0.018, 0, 0, TAU); ctx.fill();
        }
      });
      ctx.fillStyle = '#1b1510'; ctx.fillRect(-0.36, top + 0.1, 0.72, FLOOR - top - 0.1); ctx.lineWidth = LW(); ctx.strokeRect(-0.36, top + 0.1, 0.72, FLOOR - top - 0.1);
      // luce calda sul bordo
      const g = ctx.createLinearGradient(0, top - 0.05, 0, top + 0.3); g.addColorStop(0, `rgba(239,225,187,${0.1 * lampLevel})`); g.addColorStop(1, 'rgba(239,225,187,0)');
      ctx.fillStyle = g; ctx.fillRect(x1, top, x2 - x1, 0.3);
    });
  }
  function drawDeskLamp(x, top, z) {
    flat(z, () => {
      ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.fillStyle = '#b39f72'; ctx.beginPath(); ctx.ellipse(x, top - 0.015, 0.1, 0.025, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillRect(x - 0.012, top - 0.3, 0.024, 0.29); ctx.strokeRect(x - 0.012, top - 0.3, 0.024, 0.29);
      // paralume da banchiere
      ctx.fillStyle = '#2e3331';
      ctx.beginPath(); ctx.moveTo(x - 0.2, top - 0.3); ctx.quadraticCurveTo(x - 0.18, top - 0.42, x, top - 0.43); ctx.quadraticCurveTo(x + 0.18, top - 0.42, x + 0.2, top - 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = lampLevel > 0.5 ? CREAM : '#4a463c'; ctx.fillRect(x - 0.19, top - 0.305, 0.38, 0.018);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fl = (0.95 + Math.sin(clock * 17) * 0.02 + (Math.sin(clock * 0.7) > 0.995 ? -0.4 : 0)) * lampLevel;
      let g = ctx.createRadialGradient(x, top - 0.28, 0, x, top - 0.28, 1.2); g.addColorStop(0, `rgba(239,225,187,${0.32 * fl})`); g.addColorStop(1, 'rgba(239,225,187,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 1.2, top - 1.5, 2.4, 2.4);
      g = ctx.createLinearGradient(0, top - 0.3, 0, top); g.addColorStop(0, `rgba(239,225,187,${0.25 * fl})`); g.addColorStop(1, 'rgba(239,225,187,0.02)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 0.19, top - 0.3); ctx.lineTo(x + 0.19, top - 0.3); ctx.lineTo(x + 0.45, top); ctx.lineTo(x - 0.45, top); ctx.closePath(); ctx.fill();
      ctx.restore();
    });
  }
  function drawTypewriter(x, top, z) {
    flat(z, () => {
      ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.fillStyle = '#e8dcbc'; ctx.fillRect(x - 0.13, top - 0.33, 0.26, 0.2); ctx.strokeRect(x - 0.13, top - 0.33, 0.26, 0.2);
      ctx.fillStyle = 'rgba(30,28,24,0.6)'; for (let i = 0; i < 4; i++) ctx.fillRect(x - 0.1, top - 0.3 + i * 0.03, 0.2 - (i === 3 ? 0.08 : 0), 0.008);
      ctx.fillStyle = '#1a1a1d'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 0.24, top - 0.17, 0.48, 0.05, 0.02) : ctx.rect(x - 0.24, top - 0.17, 0.48, 0.05); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 0.2, top - 0.12); ctx.lineTo(x + 0.2, top - 0.12); ctx.lineTo(x + 0.25, top); ctx.lineTo(x - 0.25, top); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#cfc6ad'; for (let r = 0; r < 3; r++) for (let k = 0; k < 8; k++) { ctx.beginPath(); ctx.arc(x - 0.17 + k * 0.048 + r * 0.01, top - 0.09 + r * 0.03, 0.011, 0, TAU); ctx.fill(); }
      ctx.fillStyle = '#b39f72'; ctx.fillRect(x + 0.24, top - 0.17, 0.06, 0.012);
    });
  }
  function drawPhone(x, top, z) {
    flat(z, () => {
      ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.fillStyle = '#17171a';
      ctx.beginPath(); ctx.ellipse(x, top - 0.02, 0.09, 0.025, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillRect(x - 0.015, top - 0.32, 0.03, 0.3); ctx.strokeRect(x - 0.015, top - 0.32, 0.03, 0.3);
      ctx.beginPath(); ctx.moveTo(x - 0.05, top - 0.32); ctx.lineTo(x + 0.05, top - 0.32); ctx.lineTo(x + 0.04, top - 0.36); ctx.lineTo(x - 0.04, top - 0.36); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillRect(x + 0.04, top - 0.26, 0.04, 0.012);
      ctx.beginPath(); ctx.moveTo(x + 0.07, top - 0.3); ctx.lineTo(x + 0.11, top - 0.3); ctx.lineTo(x + 0.13, top - 0.18); ctx.lineTo(x + 0.09, top - 0.18); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.lineWidth = LW() * 0.7; ctx.beginPath(); ctx.moveTo(x + 0.08, top - 0.02); ctx.bezierCurveTo(x + 0.2, top, x + 0.25, top - 0.06, x + 0.3, top - 0.01); ctx.stroke();
    });
  }
  function drawGlass(x, top, z) {
    flat(z, () => {
      ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.fillStyle = 'rgba(200,190,160,0.25)'; ctx.beginPath(); ctx.moveTo(x - 0.05, top - 0.11); ctx.lineTo(x + 0.05, top - 0.11); ctx.lineTo(x + 0.045, top); ctx.lineTo(x - 0.045, top); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(190,150,80,0.55)'; ctx.fillRect(x - 0.046, top - 0.05, 0.092, 0.05);
      ctx.fillStyle = 'rgba(255,250,235,0.6)'; ctx.fillRect(x - 0.035, top - 0.1, 0.012, 0.08);
      // bottiglia
      ctx.fillStyle = 'rgba(40,36,30,0.9)'; ctx.beginPath(); ctx.moveTo(x - 0.2, top); ctx.lineTo(x - 0.2, top - 0.2); ctx.quadraticCurveTo(x - 0.2, top - 0.25, x - 0.165, top - 0.27); ctx.lineTo(x - 0.165, top - 0.33); ctx.lineTo(x - 0.135, top - 0.33); ctx.lineTo(x - 0.135, top - 0.27); ctx.quadraticCurveTo(x - 0.1, top - 0.25, x - 0.1, top - 0.2); ctx.lineTo(x - 0.1, top); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#cdbf9c'; ctx.fillRect(x - 0.19, top - 0.15, 0.08, 0.07);
    });
  }
  function drawAshtray(x, top, z) {
    flat(z, () => {
      ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.fillStyle = '#4a4740'; ctx.beginPath(); ctx.ellipse(x, top - 0.015, 0.08, 0.022, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8dcbc'; ctx.fillRect(x + 0.02, top - 0.035, 0.09, 0.014);
      ctx.fillStyle = 'rgba(255,120,60,0.9)'; ctx.fillRect(x + 0.105, top - 0.035, 0.012, 0.014);
      // fumo
      ctx.save(); ctx.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        ctx.beginPath(); let px = x + 0.11, py = top - 0.04; ctx.moveTo(px, py);
        for (let i = 1; i <= 14; i++) { const yy = py - i * 0.035; const xx = px + Math.sin(i * 0.6 - clock * 1.6 + k * 2) * 0.012 * i * 0.6; ctx.lineTo(xx, yy); }
        ctx.strokeStyle = `rgba(225,220,205,${0.18 - k * 0.07})`; ctx.lineWidth = LW(1.2 + k);
        ctx.stroke();
      }
      ctx.restore();
    });
  }
  function drawFan() {
    const z = ZW - 2.2, y = CEIL;
    flat(z, () => {
      ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.fillStyle = '#17150f'; ctx.fillRect(-0.015, y, 0.03, 0.36); ctx.strokeRect(-0.015, y, 0.03, 0.36);
      ctx.save(); ctx.translate(0, y + 0.42); ctx.scale(1, 0.22);
      const a0 = clock * 2.2;
      ctx.fillStyle = '#231f19';
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.rotate(a0 + i * Math.PI / 2);
        ctx.beginPath(); ctx.ellipse(0.32, 0, 0.3, 0.07, 0, 0, TAU); ctx.fill(); ctx.lineWidth = LW() * 1.2; ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
      ctx.fillStyle = '#2a2620'; ctx.beginPath(); ctx.ellipse(0, y + 0.42, 0.08, 0.05, 0, 0, TAU); ctx.fill(); ctx.stroke();
    });
  }

  /* ================================================================ */
  /* Il viaggio verso il caso: fuori dalla finestra, sopra la città,   */
  /* lampo, e la scena del delitto.                                    */
  const TRIP_OUT = 2.0, TRIP_DEST = 4.6, TRIP_HOLD = 0.7;
  let stage = 'main', trip = null, weather = 'rain', tripTyped = 0;

  const VENUES = {
    'blue-lantern': { kind: 'club', weather: 'rain', cue: 'siren', H: 13, path: [[-16, -36, -36], [0.6, -1.75, 25.5]], police: true, ground: 'street' },
    courier: { kind: 'paper', weather: 'wind', cue: 'siren', H: 40, path: [[16, -66, -55], [-0.5, -24, 6]], police: true, ground: 'street' },
    belvedere: { kind: 'hotel', weather: 'rain', cue: 'siren', H: 34, path: [[-18, -52, -45], [2.5, -7, 13]], police: true, ground: 'street' },
    molo17: { kind: 'pier', weather: 'fog', cue: 'foghorn', H: 12, path: [[12, -28, -40], [-3.4, -3.2, 19]], police: false, ground: 'pier' },
    bijou: { kind: 'theater', weather: 'rain', cue: 'siren', H: 24, path: [[-14, -40, -40], [0.6, -7, 15]], police: true, ground: 'street' },
    coney: { kind: 'lunapark', weather: 'snow', cue: 'musicbox', H: 16, path: [[16, -34, -40], [1.5, -5.5, 15]], police: false, ground: 'boardwalk' },
    aurora: { kind: 'tower', weather: 'wind', cue: 'gust', H: 232, path: [[-40, -262, -70], [3, -228, -2]], police: false, ground: 'none' },
  };
  function initBox(b) {
    const r = rng(b.seed);
    const g = 30 + Math.floor(r() * 10);
    b.col = b.col || `rgb(${g},${g + 1},${g + 6})`;
    b.side = `rgb(${g - 6},${g - 5},${g})`;
    b.tank = r() < 0.5; b.tankX = lerp(b.x1 + 2, b.x2 - 2, r()); b.tankZ = lerp(b.z1 + 3, b.z2 - 3, r()); b.chim = r() < 0.6;
    return b;
  }
  function buildVenue(id) {
    const V = Object.assign({ id }, VENUES[id] || VENUES['blue-lantern']);
    const R = rng(id.length * 7919 + id.charCodeAt(0) * 31);
    V.boxes = [];
    const half = V.kind === 'tower' ? 15 : V.kind === 'pier' ? 13 : 11;
    if (V.kind !== 'lunapark') V.boxes.push(initBox({ x1: -half, x2: half, z1: 40, z2: 62, h: V.H, seed: 4242, paint: V.kind, col: V.kind === 'club' ? '#34292a' : V.kind === 'hotel' ? '#3a393e' : V.kind === 'pier' ? '#2c2f33' : null }));
    // palazzi accanto
    const tall = V.kind === 'tower' ? [100, 185] : V.kind === 'pier' ? [6, 14] : V.kind === 'lunapark' ? [0, 0] : [10, 30];
    if (tall[1] > 0) {
      for (const sgn of [-1, 1]) {
        let x = half;
        for (let i = 0; i < 6; i++) {
          const w = 8 + R() * 10, h = tall[0] + R() * (tall[1] - tall[0]);
          const z1 = 40 + (i === 0 ? 0 : R() * 6);
          V.boxes.push(initBox({ x1: sgn < 0 ? -(x + w) : x, x2: sgn < 0 ? -x : x + w, z1, z2: z1 + 18, h, seed: Math.floor(R() * 1e6), shop: V.kind === 'tower' || i > 2 || R() < 0.6 ? null : ['DRUGS', 'DINER', 'BAR', 'CAFE'][Math.floor(R() * 4)] }));
          x += w + (R() < 0.3 ? 4 : 0);
        }
      }
    }
    V.boxes.forEach((b) => { if (b.paint) { b.tank = false; b.chim = false; } });
    V.boxes.sort((a, b) => b.z1 - a.z1 || Math.abs(b.x1 + b.x2) - Math.abs(a.x1 + a.x2));
    // luci che si riflettono sul bagnato
    V.lamps = V.kind === 'tower' ? [] : [{ x: -half - 1.5, z: 34 }, { x: half + 1.5, z: 34 }, { x: -half - 16, z: 34 }, { x: half + 16, z: 34 }];
    return V;
  }

  /* ---------- camera del viaggio */
  function camTrip(t) {
    if (t < TRIP_OUT) { // esce dalla finestra e accelera sopra i tetti
      const k = Math.pow(t / TRIP_OUT, 2.1);
      return { x: lerp(CAM_END.x, 0, k), y: lerp(CAM_END.y, YO - 7, k), z: lerp(CAM_END.z, ZW + 95, k), roll: 0.03 * Math.sin(k * Math.PI) };
    }
    const V = trip.venue, [A, B] = V.path;
    const u = clamp((t - TRIP_OUT) / TRIP_DEST, 0, 1), p = io(u);
    return {
      x: lerp(A[0], B[0], p) + Math.sin(u * 2.4) * 0.6 * (1 - u),
      y: lerp(A[1], B[1], smooth(Math.min(1, p * 1.12))),
      z: lerp(A[2], B[2], p),
      roll: lerp(0.035, -0.012, smooth(u)),
    };
  }

  /* ---------- piccoli attrezzi di disegno */
  function winGrid(x1, x2, y1, y2, cols, rows, seed, litP, ww, wh) {
    const sx = (x2 - x1) / cols, sy = (y2 - y1) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = x1 + c * sx + (sx - ww) / 2, y = y1 + r * sy + (sy - wh) / 2, v = h3(seed, r, c);
      if (v < litP) { ctx.fillStyle = v < litP * 0.3 ? '#f3dfa6' : CREAM; ctx.fillRect(x, y, ww, wh); if (v < litP * 0.15) { ctx.fillStyle = '#121216'; ctx.beginPath(); ctx.arc(x + ww / 2, y + wh * 0.5, ww * 0.2, 0, TAU); ctx.fill(); ctx.fillRect(x + ww * 0.25, y + wh * 0.62, ww * 0.5, wh * 0.38); } }
      else { ctx.fillStyle = '#141519'; ctx.fillRect(x, y, ww, wh); }
      ctx.strokeStyle = INK; ctx.lineWidth = LW() * 0.5; ctx.strokeRect(x, y, ww, wh);
    }
  }
  function neonText(txt, cx, cy, fs, maxW, opts) {
    opts = opts || {};
    ctx.save();
    const font = (s) => `${opts.italic === false ? '' : 'italic '}900 ${s}px "Playfair Display", Georgia, serif`;
    ctx.font = font(fs); let tw = ctx.measureText(txt).width;
    if (maxW && tw > maxW) { fs *= maxW / tw; ctx.font = font(fs); tw = ctx.measureText(txt).width; }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const on = opts.on !== false, col = opts.cream ? ['239,225,187', '255,248,225'] : ['208,16,28', '255,60,60'];
    const ph = (clock * 0.37) % 5, broken = opts.broken != null ? opts.broken : (ph > 2 && ph < 2.05 ? 1 : -1);
    let x = cx - tw / 2;
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i], cw = ctx.measureText(ch).width, lit = on && i !== broken && ch !== ' ';
      if (lit) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
        ctx.strokeStyle = `rgba(${col[0]},0.26)`; ctx.lineWidth = fs * 0.3; ctx.strokeText(ch, x, cy);
        ctx.strokeStyle = `rgba(${col[1]},0.6)`; ctx.lineWidth = fs * 0.1; ctx.strokeText(ch, x, cy);
        ctx.restore();
        ctx.fillStyle = opts.cream ? 'rgba(255,250,232,0.97)' : 'rgba(255,205,198,0.96)'; ctx.fillText(ch, x, cy);
      } else if (ch !== ' ') { ctx.strokeStyle = 'rgba(80,40,40,0.8)'; ctx.lineWidth = fs * 0.05; ctx.strokeText(ch, x, cy); }
      x += cw;
    }
    if (on && opts.glow !== false) {
      ctx.globalCompositeOperation = 'lighter';
      const r = Math.max(tw, fs * 3) * 0.9;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(${col[0]},0.22)`); g.addColorStop(1, `rgba(${col[0]},0)`);
      ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();
    return tw;
  }
  function bulbs(x1, y1, x2, y2, step, r, chase) {
    const per = 2 * ((x2 - x1) + (y2 - y1)), n = Math.floor(per / step);
    for (let i = 0; i < n; i++) {
      let d = i * step, x, y;
      if (d < x2 - x1) { x = x1 + d; y = y1; } else if ((d -= x2 - x1) < y2 - y1) { x = x2; y = y1 + d; } else if ((d -= y2 - y1) < x2 - x1) { x = x2 - d; y = y2; } else { d -= x2 - x1; x = x1; y = y2 - d; }
      const on = chase ? (Math.floor(clock * 8) + i) % 3 !== 0 : true;
      ctx.fillStyle = on ? 'rgba(255,240,200,0.95)' : 'rgba(110,100,80,0.6)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  }
  function glowAt(x, y, r, rgb, a) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
  }

  /* ---------- le sette facciate */
  const PAINT = {
    club(b) { // Blue Lantern, Harlem
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = -12.6; y < 0; y += 0.42) ctx.fillRect(-11, y, 22, 0.04);
      winGrid(-10.5, 10.5, -12.2, -7.2, 6, 2, 71, 0.45, 1.3, 1.9);
      // tenda e porta
      ctx.fillStyle = 'rgba(240,196,120,0.92)'; ctx.fillRect(-1.5, -3.1, 3, 3.1); ctx.fillStyle = '#1c1512'; ctx.fillRect(-0.05, -3.1, 0.1, 3.1);
      ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.strokeRect(-1.5, -3.1, 3, 3.1);
      glowAt(0, -1.5, 4, '240,196,120', 0.25);
      ctx.fillStyle = '#16141a'; ctx.beginPath(); ctx.moveTo(-3.4, -3.3); ctx.lineTo(3.4, -3.3); ctx.lineTo(3.8, -4.1); ctx.lineTo(-3.8, -4.1); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#16141a'; for (let x = -3.4; x < 3.4; x += 0.34) { ctx.beginPath(); ctx.moveTo(x, -3.3); ctx.lineTo(x + 0.17, -3.05); ctx.lineTo(x + 0.34, -3.3); ctx.fill(); }
      // insegna al neon e lanterna
      ctx.fillStyle = '#0f0f12'; ctx.fillRect(-4.6, -6.4, 9.2, 1.9); ctx.strokeRect(-4.6, -6.4, 9.2, 1.9);
      neonText('Blue Lantern', 0.5, -5.45, 1.05, 7.4);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,90,90,0.9)'; ctx.lineWidth = 0.07; ctx.strokeRect(-4.2, -6.0, 0.55, 0.85); ctx.beginPath(); ctx.moveTo(-3.92, -6.0); ctx.lineTo(-3.92, -6.25); ctx.stroke(); ctx.restore();
      // manifesti
      [-6.4, 4.6].forEach((x, i) => { ctx.fillStyle = '#d8ccb0'; ctx.fillRect(x, -3.0, 1.8, 2.4); ctx.strokeRect(x, -3.0, 1.8, 2.4); ctx.fillStyle = '#1a1714'; ctx.font = '900 0.42px "Playfair Display", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('JAZZ', x + 0.9, -2.55); ctx.beginPath(); ctx.arc(x + 0.9, -1.55, 0.36, 0, TAU); ctx.fill(); ctx.fillRect(x + 0.6, -1.25, 0.6, 0.55); ctx.font = '0.2px "Special Elite", monospace'; ctx.fillText(i ? 'ROZ CARTER' : 'C. BROOKS', x + 0.9, -0.82); });
    },
    paper(b) { // Manhattan Courier
      for (let x = -12; x <= 12; x += 2.4) { ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(x - 0.25, -40, 0.5, 40); }
      winGrid(-11.5, 11.5, -38.5, -6, 9, 10, 913, 0.42, 1.2, 1.9);
      // ingresso ad arco con porta girevole
      ctx.fillStyle = 'rgba(239,225,187,0.85)'; ctx.beginPath(); ctx.moveTo(-2.2, 0); ctx.lineTo(-2.2, -3.2); ctx.arc(0, -3.2, 2.2, Math.PI, 0); ctx.lineTo(2.2, 0); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.stroke();
      ctx.strokeStyle = 'rgba(20,20,24,0.8)'; ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = clock * 0.6 + i * Math.PI / 4; ctx.moveTo(0, -1.5); ctx.lineTo(Math.cos(a) * 1.6, -1.5); } ctx.stroke();
      glowAt(0, -2, 5, '239,225,187', 0.2);
      // orologio
      ctx.fillStyle = '#e8dcbc'; ctx.beginPath(); ctx.arc(0, -7, 1.1, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = LW(1.6); ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, -7.75); ctx.moveTo(0, -7); ctx.lineTo(0.5, -6.8); ctx.stroke();
      // insegna sul tetto
      ctx.strokeStyle = '#1a1b20'; ctx.lineWidth = LW(1.4); ctx.beginPath(); for (let x = -11; x <= 11; x += 1.4) { ctx.moveTo(x, -40); ctx.lineTo(x + 0.7, -45.5); ctx.lineTo(x + 1.4, -40); } ctx.stroke();
      ctx.fillStyle = '#0f0f12'; ctx.fillRect(-11.5, -46.4, 23, 2.2);
      neonText('THE MANHATTAN COURIER', 0, -45.3, 1.6, 21, { italic: false });
    },
    hotel(b) { // Belvedere
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(-11, -34, 22, 1.2); ctx.fillRect(-11, -6.5, 22, 0.6);
      winGrid(-10.5, 10.5, -32.5, -7.2, 7, 8, 531, 0.38, 1.4, 2.0);
      for (let x = -9; x <= 9; x += 3.6) { ctx.fillStyle = '#4a4950'; ctx.fillRect(x - 0.35, -6.2, 0.7, 6.2); ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.strokeRect(x - 0.35, -6.2, 0.7, 6.2); }
      ctx.fillStyle = 'rgba(240,210,150,0.9)'; ctx.fillRect(-2.4, -3.6, 4.8, 3.6); ctx.strokeRect(-2.4, -3.6, 4.8, 3.6); glowAt(0, -2, 5, '240,210,150', 0.25);
      // terrazza sul tetto con le lampadine
      ctx.strokeStyle = 'rgba(30,30,34,0.9)'; ctx.lineWidth = LW(1); ctx.beginPath(); ctx.moveTo(-10, -35.5); ctx.quadraticCurveTo(0, -34.6, 10, -35.5); ctx.stroke();
      for (let i = 0; i <= 14; i++) { const x = -10 + i * (20 / 14), y = -35.5 + 0.9 * (1 - Math.pow((x / 10), 2)); ctx.fillStyle = (Math.floor(clock * 2) + i) % 4 ? 'rgba(255,240,200,0.9)' : 'rgba(255,240,200,0.3)'; ctx.beginPath(); ctx.arc(x, y + 0.15, 0.13, 0, TAU); ctx.fill(); }
      // insegna verticale
      ctx.fillStyle = '#0f0f12'; ctx.fillRect(8.8, -27, 1.8, 12); ctx.strokeStyle = INK; ctx.strokeRect(8.8, -27, 1.8, 12);
      'HOTEL'.split('').forEach((ch, i) => neonText(ch, 9.7, -25.6 + i * 2.25, 1.6, null, { broken: -1, glow: i === 2 }));
    },
    pier(b) { // magazzino del molo 17 e taverna
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = LW(0.8); ctx.beginPath(); for (let x = -13; x < 13; x += 0.35) { ctx.moveTo(x, -12); ctx.lineTo(x, 0); } ctx.stroke();
      ctx.fillStyle = '#26292d'; ctx.beginPath(); ctx.moveTo(-13.4, -12); ctx.lineTo(0, -15); ctx.lineTo(13.4, -12); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.stroke();
      ctx.fillStyle = 'rgba(239,225,187,0.85)'; ctx.fillRect(-1.2, -5.5, 4.2, 5.5); ctx.fillStyle = '#2c2f33'; ctx.fillRect(-4.6, -5.5, 3.6, 5.5); ctx.strokeStyle = INK; ctx.strokeRect(-4.6, -5.5, 7.6, 5.5);
      glowAt(0.9, -2.5, 6, '239,225,187', 0.25);
      ctx.fillStyle = '#e8dcbc'; ctx.font = '900 1.6px "Playfair Display", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('MOLO 17', 0, -9);
      // taverna The Anchor
      ctx.fillStyle = '#1c1b1f'; ctx.fillRect(-13, -7.2, 7.2, 7.2); ctx.strokeRect(-13, -7.2, 7.2, 7.2);
      ctx.fillStyle = 'rgba(240,196,120,0.85)'; ctx.fillRect(-12.2, -3.2, 2.6, 2); ctx.fillRect(-9, -3.2, 2.2, 3.2);
      neonText('The Anchor', -9.4, -5.4, 0.9, 6);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,70,70,0.9)'; ctx.lineWidth = 0.09; ctx.beginPath(); ctx.moveTo(-9.4, -6.9); ctx.lineTo(-9.4, -6.2); ctx.arc(-9.4, -6.35, 0.35, 0.2, Math.PI - 0.2); ctx.stroke(); ctx.restore();
    },
    theater(b) { // Bijou, Broadway
      for (let i = 0; i < 4; i++) { const x = -8 + i * 5.3; ctx.fillStyle = h3(9, i, 1) < 0.5 ? CREAM : '#141519'; ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x, -14); ctx.arc(x + 1, -14, 1, Math.PI, 0); ctx.lineTo(x + 2, -10); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.stroke(); }
      winGrid(-10.5, 10.5, -22.5, -16, 6, 1, 77, 0.4, 1.3, 1.9);
      ctx.fillStyle = 'rgba(240,210,150,0.9)'; ctx.fillRect(-5, -3.4, 10, 3.4); ctx.strokeRect(-5, -3.4, 10, 3.4);
      ctx.fillStyle = '#1a1612'; for (let x = -5; x < 5; x += 2) ctx.fillRect(x + 0.95, -3.4, 0.1, 3.4);
      glowAt(0, -2, 7, '240,210,150', 0.3);
      // insegna verticale BIJOU
      ctx.fillStyle = '#0f0f12'; ctx.fillRect(-1.1, -21.5, 2.2, 13); ctx.strokeStyle = INK; ctx.strokeRect(-1.1, -21.5, 2.2, 13);
      bulbs(-1.0, -21.4, 1.0, -8.6, 0.42, 0.07, true);
      'BIJOU'.split('').forEach((ch, i) => neonText(ch, 0, -19.9 + i * 2.5, 1.9, null, { broken: -1, glow: i === 2 }));
      ['DRAMMA', 'IN TRE ATTI'].forEach((t, i) => { const x = i ? 6.8 : -8.8; ctx.fillStyle = '#d8ccb0'; ctx.fillRect(x, -3.1, 2, 2.7); ctx.strokeRect(x, -3.1, 2, 2.7); ctx.fillStyle = '#1a1714'; ctx.font = '900 0.3px "Playfair Display", Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText(t, x + 1, -2.6); ctx.beginPath(); ctx.arc(x + 1, -1.6, 0.4, 0, TAU); ctx.fill(); });
    },
    tower(b) { // Aurora Building, settantesimo piano
      const T0 = -b.h;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-15, T0, 4, b.h); ctx.fillRect(11, T0, 4, b.h);
      winGrid(-14, 14, -186, -60, 10, 30, 312, 0.25, 1.3, 1.8);
      // attico della festa
      ctx.fillStyle = 'rgba(244,214,150,0.92)'; ctx.fillRect(-11, -201, 22, 4.6); ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.strokeRect(-11, -201, 22, 4.6);
      ctx.fillStyle = '#16161a'; for (let i = 0; i < 9; i++) { const x = -10 + i * 2.4 + Math.sin(clock * 1.3 + i) * 0.3; ctx.beginPath(); ctx.arc(x, -199.4, 0.28, 0, TAU); ctx.fill(); ctx.fillRect(x - 0.32, -199.1, 0.64, 2.6); }
      for (let x = -11; x <= 11; x += 2.75) { ctx.fillStyle = '#1e1f24'; ctx.fillRect(x - 0.12, -201, 0.24, 4.6); }
      glowAt(0, -199, 14, '244,214,150', 0.2);
      // gradoni e corona
      ctx.fillStyle = '#2c2d33'; ctx.fillRect(-11, -214, 22, 13); ctx.strokeRect(-11, -214, 22, 13);
      ctx.fillRect(-7, -224, 14, 10); ctx.strokeRect(-7, -224, 14, 10);
      ctx.beginPath(); ctx.moveTo(-4, -224); ctx.lineTo(0, -232); ctx.lineTo(4, -224); ctx.closePath(); ctx.fill(); ctx.stroke();
      // ponteggi e gru
      ctx.strokeStyle = '#121216'; ctx.lineWidth = LW(1.2); ctx.beginPath();
      for (let y = -224; y < -201; y += 1.6) { ctx.moveTo(7, y); ctx.lineTo(13, y); } for (let x = 7; x <= 13; x += 1.5) { ctx.moveTo(x, -224); ctx.lineTo(x, -201); } ctx.stroke();
      ctx.lineWidth = LW(2); ctx.beginPath(); ctx.moveTo(10, -224); ctx.lineTo(10, -252); ctx.lineTo(-14, -252); ctx.moveTo(10, -252); ctx.lineTo(16, -252); ctx.lineTo(16, -250); ctx.stroke();
      ctx.lineWidth = LW(1); ctx.beginPath(); for (let x = -14; x < 10; x += 1.2) { ctx.moveTo(x, -252); ctx.lineTo(x + 0.6, -251); ctx.lineTo(x + 1.2, -252); } ctx.moveTo(10, -248); ctx.lineTo(-14, -252); ctx.moveTo(-11, -252); ctx.lineTo(-11, -238); ctx.stroke();
      ctx.fillStyle = '#1a1a1e'; ctx.fillRect(-11.6, -238, 1.2, 0.8);
      if (Math.sin(clock * 3) > 0) glowAt(10, -253, 1.6, '208,16,28', 0.8);
    },
  };
  function drawVenueFront(b) {
    flat(b.z1, () => {
      if (!vis(b.x1 - 3, -b.h - 30, b.x2 + 3, 0)) return;
      ctx.lineJoin = 'round';
      ctx.fillStyle = b.col; ctx.fillRect(b.x1, -b.h, b.x2 - b.x1, b.h);
      PAINT[b.paint](b);
      ctx.strokeStyle = INK; ctx.lineWidth = LW(); ctx.strokeRect(b.x1, -b.h, b.x2 - b.x1, b.h);
    });
  }

  /* ---------- oggetti della scena del delitto */
  function drawPoliceCar(x, z) {
    flat(z, () => {
      if (!vis(x - 4, -3, x + 4, 0.5)) return;
      const blink = Math.sin(clock * 9) > 0 ? 1 : 0.25;
      ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.fillStyle = '#18191d';
      ctx.beginPath(); ctx.moveTo(x - 2.5, -0.45); ctx.quadraticCurveTo(x - 2.6, -1.15, x - 2.0, -1.2); ctx.lineTo(x - 1.3, -1.25); ctx.quadraticCurveTo(x - 1.1, -2.05, x - 0.2, -2.05); ctx.lineTo(x + 0.8, -2.05); ctx.quadraticCurveTo(x + 1.1, -2.0, x + 1.25, -1.3); ctx.lineTo(x + 2.1, -1.25); ctx.quadraticCurveTo(x + 2.55, -1.15, x + 2.5, -0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d8d2c2'; ctx.fillRect(x - 1.2, -1.2, 2.3, 0.6); ctx.strokeRect(x - 1.2, -1.2, 2.3, 0.6);
      ctx.fillStyle = '#121216'; ctx.font = '900 0.34px "Playfair Display", Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('POLICE', x - 0.05, -0.9);
      ctx.fillStyle = 'rgba(239,225,187,0.5)'; ctx.fillRect(x - 1.05, -1.95, 0.9, 0.62); ctx.fillRect(x + 0.05, -1.95, 0.9, 0.62);
      [x - 1.5, x + 1.55].forEach((wx) => { ctx.fillStyle = '#0c0c0e'; ctx.beginPath(); ctx.arc(wx, -0.42, 0.42, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#cfc6ad'; ctx.beginPath(); ctx.arc(wx, -0.42, 0.2, 0, TAU); ctx.fill(); });
      ctx.fillStyle = CREAM; ctx.beginPath(); ctx.arc(x + 2.3, -0.95, 0.16, 0, TAU); ctx.fill(); ctx.stroke();
      // lampeggiante rosso
      ctx.fillStyle = `rgba(255,60,60,${blink})`; ctx.beginPath(); ctx.arc(x + 0.3, -2.18, 0.17, 0, TAU); ctx.fill(); ctx.stroke();
      glowAt(x + 0.3, -2.18, 3.2 * blink, '208,16,28', 0.45 * blink);
    });
  }
  function drawCop(x, z, lantern) {
    flat(z, () => {
      if (!vis(x - 1, -2.2, x + 1, 0.2)) return;
      ctx.lineJoin = 'round'; ctx.fillStyle = '#0d0d10'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.beginPath(); ctx.moveTo(x - 0.4, 0); ctx.lineTo(x - 0.34, -0.9); ctx.quadraticCurveTo(x - 0.3, -1.45, x, -1.5); ctx.quadraticCurveTo(x + 0.3, -1.45, x + 0.34, -0.9); ctx.lineTo(x + 0.4, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, -1.6, 0.11, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 0.15, -1.68); ctx.lineTo(x + 0.15, -1.68); ctx.lineTo(x + 0.13, -1.82); ctx.lineTo(x - 0.13, -1.82); ctx.closePath(); ctx.fill(); ctx.fillRect(x - 0.18, -1.7, 0.36, 0.04);
      ctx.fillStyle = 'rgba(239,225,187,0.5)'; ctx.beginPath(); ctx.arc(x, -1.76, 0.03, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(239,225,187,0.18)'; ctx.beginPath(); ctx.moveTo(x - 0.3, -1.0); ctx.lineTo(x - 0.36, -0.1); ctx.stroke();
      if (lantern) { ctx.fillStyle = 'rgba(255,230,170,0.95)'; ctx.fillRect(x + 0.32, -0.95, 0.12, 0.16); glowAt(x + 0.38, -0.87, 1.6, '255,220,160', 0.4 + 0.08 * Math.sin(clock * 9)); }
    });
  }
  function drawUmbrellas(x, z, n) {
    flat(z, () => {
      if (!vis(x - 3, -2.4, x + 3, 0.2)) return;
      for (let i = 0; i < n; i++) {
        const px = x + i * 0.9 - (n - 1) * 0.45, hgt = 1.65 + h3(i, 3, 7) * 0.2;
        ctx.fillStyle = '#0c0c0f'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
        ctx.beginPath(); ctx.moveTo(px - 0.24, 0); ctx.lineTo(px - 0.2, -hgt + 0.3); ctx.lineTo(px + 0.2, -hgt + 0.3); ctx.lineTo(px + 0.24, 0); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(px, -hgt + 0.15, 0.1, 0, TAU); ctx.fill();
        ctx.fillStyle = '#16161a'; ctx.beginPath(); ctx.moveTo(px - 0.6, -hgt - 0.05); ctx.quadraticCurveTo(px, -hgt - 0.65, px + 0.6, -hgt - 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(239,225,187,0.2)'; ctx.beginPath(); ctx.moveTo(px - 0.5, -hgt - 0.12); ctx.quadraticCurveTo(px, -hgt - 0.6, px + 0.5, -hgt - 0.12); ctx.stroke();
      }
    });
  }
  function drawShip() { // il Santa Lucia, dietro il magazzino
    flat(70, () => {
      if (!vis(4, -26, 70, 2)) return;
      ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      ctx.fillStyle = '#1b1c21'; ctx.beginPath(); ctx.moveTo(6, -2); ctx.lineTo(10, -11); ctx.lineTo(66, -11); ctx.lineTo(64, -2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#25262c'; ctx.fillRect(30, -17, 18, 6); ctx.strokeRect(30, -17, 18, 6);
      ctx.fillStyle = '#2b2c32'; ctx.fillRect(37, -25, 4, 8); ctx.strokeRect(37, -25, 4, 8); ctx.fillStyle = 'rgba(208,16,28,0.7)'; ctx.fillRect(37, -23.5, 4, 1);
      ctx.fillStyle = 'rgba(239,225,187,0.85)'; for (let i = 0; i < 9; i++) if (h3(i, 2, 5) < 0.6) { ctx.beginPath(); ctx.arc(14 + i * 5.5, -7, 0.45, 0, TAU); ctx.fill(); }
      for (let i = 0; i < 6; i++) ctx.fillRect(31 + i * 2.8, -15.5, 1.4, 1.3);
      ctx.fillStyle = '#d8ccb0'; ctx.font = '900 1.4px "Playfair Display", Georgia, serif'; ctx.textAlign = 'left'; ctx.fillText('SANTA LUCIA', 12, -9);
      ctx.strokeStyle = '#121216'; ctx.lineWidth = LW(1.2); ctx.beginPath(); ctx.moveTo(20, -11); ctx.lineTo(20, -30); ctx.moveTo(56, -11); ctx.lineTo(56, -27); ctx.moveTo(20, -30); ctx.lineTo(56, -27); ctx.stroke();
    });
  }
  function drawFerris() { // Luna Park: ruota panoramica e montagne russe spente
    flat(110, () => {
      if (!vis(-60, -70, 60, 2)) return;
      const cx = 12, cy = -36, R = 30, a0 = clock * 0.03;
      ctx.strokeStyle = 'rgba(40,41,48,0.95)'; ctx.lineWidth = LW(2.2);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, R * 0.92, 0, TAU); ctx.stroke();
      ctx.lineWidth = LW(1.2); ctx.beginPath(); for (let i = 0; i < 16; i++) { const a = a0 + i * TAU / 16; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); } ctx.stroke();
      ctx.lineWidth = LW(2); ctx.beginPath(); ctx.moveTo(cx - 9, 0); ctx.lineTo(cx, cy); ctx.lineTo(cx + 9, 0); ctx.stroke();
      for (let i = 0; i < 16; i++) { const a = a0 + i * TAU / 16, gx = cx + Math.cos(a) * R, gy = cy + Math.sin(a) * R; ctx.fillStyle = '#26272d'; ctx.fillRect(gx - 1.1, gy, 2.2, 1.6); const on = h3(i, 8, 1) < 0.2 && Math.sin(clock * 2 + i) > -0.3; if (on) { ctx.fillStyle = 'rgba(255,240,200,0.9)'; ctx.beginPath(); ctx.arc(gx, gy - 0.2, 0.35, 0, TAU); ctx.fill(); } }
      // montagne russe
      ctx.strokeStyle = 'rgba(36,37,43,0.95)'; ctx.lineWidth = LW(1.4); ctx.beginPath();
      for (let x = -60; x <= -18; x += 0.8) { const y = -10 - 12 * Math.abs(Math.sin((x + 60) / 9)); if (x === -60) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke(); ctx.beginPath(); for (let x = -60; x <= -18; x += 2) { const y = -10 - 12 * Math.abs(Math.sin((x + 60) / 9)); ctx.moveTo(x, y); ctx.lineTo(x, 0); } ctx.stroke();
    });
  }
  function drawGate() { // l'ingresso del Luna Park
    flat(40, () => {
      if (!vis(-14, -18, 14, 0.5)) return;
      ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = LW();
      [-8.5, 8.5].forEach((x) => { ctx.fillStyle = '#2a2b31'; ctx.fillRect(x - 1.6, -13, 3.2, 13); ctx.strokeRect(x - 1.6, -13, 3.2, 13); ctx.beginPath(); ctx.arc(x, -13, 1.6, Math.PI, 0); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(240,240,250,0.7)'; ctx.fillRect(x - 1.6, -13.1, 3.2, 0.2); });
      ctx.fillStyle = '#1f2025'; ctx.fillRect(-7, -12.6, 14, 2.4); ctx.strokeRect(-7, -12.6, 14, 2.4);
      ctx.fillStyle = 'rgba(240,240,250,0.75)'; ctx.fillRect(-7, -12.7, 14, 0.15);
      bulbs(-6.8, -12.4, 6.8, -10.4, 0.55, 0.07, false);
      neonText('LUNA PARK', 0, -11.4, 1.5, 12, { cream: true, broken: (clock * 0.5) % 6 < 0.08 ? 5 : -1, on: Math.sin(clock * 5) + Math.sin(clock * 2.3) < 1.6 });
      ctx.strokeStyle = '#141418'; ctx.lineWidth = LW(1.6); ctx.beginPath(); for (let x = -6.8; x <= 6.8; x += 0.7) { ctx.moveTo(x, 0); ctx.lineTo(x, -4.5); } ctx.moveTo(-6.8, -4.5); ctx.lineTo(6.8, -4.5); ctx.moveTo(-6.8, -2.5); ctx.lineTo(6.8, -2.5); ctx.stroke();
      ctx.fillStyle = '#26262b'; ctx.fillRect(-3.5, -3.2, 2.2, 3.2); ctx.strokeRect(-3.5, -3.2, 2.2, 3.2); ctx.fillStyle = 'rgba(239,225,187,0.8)'; ctx.fillRect(-3.2, -2.5, 1.6, 0.8);
      ctx.fillStyle = '#d8ccb0'; ctx.font = '0.28px "Special Elite", monospace'; ctx.textAlign = 'center'; ctx.fillText('CHIUSO', -2.4, -2.1);
    });
  }
  function drawDestGround(V) {
    const big = 400;
    if (V.ground === 'none') return;
    const snow = weather === 'snow';
    const base = V.ground === 'street' ? '#111215' : V.ground === 'pier' ? '#1d1a16' : snow ? '#3a3b42' : '#221e19';
    poly3([[-big, 0, -60], [big, 0, -60], [big, 0, 300], [-big, 0, 300]], base);
    if (V.ground === 'street') {
      poly3([[-big, 0, 33.6], [big, 0, 33.6], [big, 0, 40], [-big, 0, 40]], '#1c1d22', INK, 1.2);
      for (let x = -100; x < 100; x += 7) poly3([[x, 0, 22.9], [x + 3.2, 0, 22.9], [x + 3.2, 0, 23.2], [x, 0, 23.2]], 'rgba(239,225,187,0.2)');
    } else {
      // assi di legno
      for (let z = Math.ceil(cam.z + 0.5); z < 40; z += 0.9) { const d = z - cam.z; if (d < 0.5) continue; line3([-60, 0, z], [60, 0, z], `rgba(0,0,0,${clamp(0.7 - d / 60, 0.1, 0.7)})`, Math.max(0.6, 2 / Math.sqrt(d))); }
      if (snow) for (let i = 0; i < 40; i++) { const x = (h3(i, 1, 9) - 0.5) * 50, z = 5 + h3(i, 2, 9) * 33; if (z - cam.z < 3) continue; const p = proj(x, 0, z), r = (0.4 + 0.6 * h3(i, 3, 9)) * p[2]; ctx.fillStyle = 'rgba(230,232,240,0.18)'; ctx.beginPath(); ctx.ellipse(p[0], p[1], r, r * clamp(-cam.y / (z - cam.z), 0.05, 1), 0, 0, TAU); ctx.fill(); }
    }
  }
  function drawDestFog() {
    if (weather !== 'fog') return;
    for (let i = 0; i < 4; i++) {
      const y = H * (0.35 + i * 0.16), h = H * 0.28;
      const g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      g.addColorStop(0, 'rgba(160,162,170,0)'); g.addColorStop(0.5, `rgba(160,162,170,${0.16 + i * 0.03})`); g.addColorStop(1, 'rgba(160,162,170,0)');
      ctx.fillStyle = g; ctx.fillRect(0, y - h / 2, W, h);
    }
    for (let i = 0; i < 6; i++) {
      const x = ((clock * (8 + i * 3) + i * W * 0.4) % (W * 1.8)) - W * 0.4, y = H * (0.45 + 0.08 * Math.sin(i * 2.1)), r = Math.min(W, H) * (0.35 + 0.1 * (i % 3));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(170,172,180,0.14)'); g.addColorStop(1, 'rgba(170,172,180,0)');
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  function drawDest() {
    const V = trip.venue;
    drawDestGround(V);
    if (V.kind === 'lunapark') drawFerris();
    if (V.kind === 'pier') drawShip();
    for (const b of V.boxes) { if (b.paint) { drawRoof(b); drawVenueFront(b); } else { drawFront(b); drawRoof(b); } }
    if (V.kind === 'lunapark') drawGate();
    // riflessi sul bagnato
    if (V.ground !== 'none' && weather !== 'snow') {
      const R = V.lamps.map((l) => ({ x: l.x, y: -5.9, z: l.z, a: 0.26, w: 0.35 }));
      if (V.kind === 'club') R.push({ x: 0.5, y: -5.45, z: 39.8, a: 0.35, w: 5, red: true }, { x: 0, y: -1.5, z: 39.8, a: 0.4, w: 2.4 });
      if (V.kind === 'paper' || V.kind === 'hotel' || V.kind === 'theater') R.push({ x: 0, y: -2, z: 39.8, a: 0.4, w: 3.5 });
      if (V.kind === 'theater' || V.kind === 'hotel') R.push({ x: V.kind === 'hotel' ? 9.7 : 0, y: -15, z: 39.8, a: 0.3, w: 1.4, red: true });
      if (V.kind === 'pier') R.push({ x: -9.4, y: -5.4, z: 39.8, a: 0.3, w: 3, red: true }, { x: 0.9, y: -2.5, z: 39.8, a: 0.35, w: 3 });
      if (V.police) R.push({ x: 5.8, y: -2.2, z: 31.5, a: Math.sin(clock * 9) > 0 ? 0.45 : 0.1, w: 0.8, red: true });
      drawReflections(R);
    }
    const items = [];
    V.lamps.forEach((l) => items.push({ z: l.z, f: () => drawStreetLamp(l) }));
    if (V.police) { items.push({ z: 31.5, f: () => drawPoliceCar(5.5, 31.5) }); items.push({ z: 38.6, f: () => drawCop(2.2, 38.6, true) }); items.push({ z: 35, f: () => drawUmbrellas(-5, 35, 3) }); }
    if (V.kind === 'pier') items.push({ z: 37, f: () => drawCop(4.2, 37, true) });
    if (V.kind === 'lunapark') items.push({ z: 37, f: () => drawCop(-1.5, 37, true) });
    items.sort((a, b) => b.z - a.z).forEach((it) => { if (it.z - cam.z > NEAR) it.f(); });
  }

  /* ---------------------------------------------------------------- */
  /* Post-processing                                                    */
  function makeGrain() {
    grainCanvas = document.createElement('canvas'); grainCanvas.width = grainCanvas.height = 160;
    const g = grainCanvas.getContext('2d'); const id = g.createImageData(160, 160);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 26; }
    g.putImageData(id, 0, 0);
    grainPattern = ctx.createPattern(grainCanvas, 'repeat');
  }
  function makeVignette() {
    vignette = document.createElement('canvas'); vignette.width = Math.ceil(W); vignette.height = Math.ceil(H);
    const g = vignette.getContext('2d');
    const r = Math.hypot(W, H) / 2;
    const gr = g.createRadialGradient(W / 2, H / 2, r * 0.35, W / 2, H / 2, r);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.78)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  function post() {
    ctx.drawImage(vignette, 0, 0, W, H);
    ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = grainPattern;
    const ox = Math.floor(Math.random() * 160), oy = Math.floor(Math.random() * 160);
    ctx.translate(-ox, -oy); ctx.fillRect(0, 0, W + 160, H + 160); ctx.restore();
    // graffi di pellicola
    if (Math.random() < 0.08) { ctx.fillStyle = 'rgba(239,225,187,0.12)'; ctx.fillRect(Math.random() * W, 0, 1, H); }
    if (flash > 0.02 && !office()) { ctx.fillStyle = `rgba(230,234,245,${flash * 0.14})`; ctx.fillRect(0, 0, W, H); }
    // sfarfallio della pellicola
    const fk = (mode === 'intro' ? 0.045 : 0.02) * (0.5 + 0.5 * Math.sin(clock * 37)) * Math.random();
    if (fk > 0.004) { ctx.fillStyle = `rgba(0,0,0,${fk})`; ctx.fillRect(0, 0, W, H); }
    // polvere e peli sulla pellicola
    if (Math.random() < 0.35) { ctx.fillStyle = 'rgba(239,225,187,0.28)'; for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) { ctx.beginPath(); ctx.arc(Math.random() * W, Math.random() * H, 0.5 + Math.random() * 1.2, 0, TAU); ctx.fill(); } }
    if (Math.random() < 0.025) { const x = Math.random() * W, y = Math.random() * H; ctx.strokeStyle = 'rgba(15,15,15,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.bezierCurveTo(x + 8, y - 6, x + 14, y + 8, x + 22, y + 2); ctx.stroke(); }
  }
  function drawTitleCard() {
    if (!caseInfo || mode !== 'trip' || !trip || trip.t < TRIP_OUT + 1.3) return;
    const l1 = `N. ${caseInfo.n}  ·  ${String(caseInfo.where || '').toUpperCase()}  ·  ${caseInfo.year || ''}`, l2 = `«${caseInfo.title}»`;
    const total = l1.length + l2.length;
    const n = Math.min(total, Math.floor((trip.t - TRIP_OUT - 1.3) * 30));
    if (n <= 0) return;
    const fs = Math.min(W * 0.085, 40), y1 = (W > H ? H * 0.16 : H * 0.15), y2 = y1 + fs * 1.15;
    { const a = clamp(n / 8, 0, 1), g = ctx.createLinearGradient(0, 0, 0, y2 + fs * 1.6); g.addColorStop(0, `rgba(0,0,0,${0.7 * a})`); g.addColorStop(0.7, `rgba(0,0,0,${0.45 * a})`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, y2 + fs * 1.6); }
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(239,225,187,0.85)'; ctx.font = `${Math.round(Math.min(fs * 0.34, W * 0.032))}px "Special Elite", "Courier New", monospace`;
    ctx.fillText(l1.slice(0, n), W / 2, y1);
    if (n > l1.length) { ctx.fillStyle = CREAM; ctx.font = `italic 700 ${Math.round(fs)}px "Playfair Display", Georgia, serif`; ctx.fillText(l2.slice(0, n - l1.length), W / 2, y2); }
    ctx.restore();
    if (n !== tripTyped) { const ch = (l1 + l2)[n - 1]; tripTyped = n; if (ch && ch !== ' ' && onCue) onCue('key'); }
  }
  function letterbox() {
    let k = 0;
    if (mode === 'intro') k = T < END_T ? 1 - smooth((T - (END_T - 1.5)) / 1.5) : 0;
    if (mode === 'trip') k = smooth(trip.t / 0.6);
    if (k <= 0.001) return;
    const h = (W > H ? H * 0.11 : H * 0.085) * k;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h);
  }

  /* ---------------------------------------------------------------- */
  /* Fotogramma                                                         */
  function render() {
    setRoll(cam.roll || 0);
    baseT();
    drawSky();
    drawSearchlights();
    drawBolt();
    drawSkyline();
    if (stage === 'dest') { drawDest(); drawRain(); drawDestFog(); }
    else {
    drawGround();
    // isolati (dal più lontano)
    for (const b of BOXES) { if (b.el) { drawElBridge(); continue; } drawFront(b); drawRoof(b); if (b.adj) drawInner(b); }
    drawGap(-12, 34, 37, true); drawGap(12, 30, 33, false);
    if (cam.z < 0) { STREETLAMPS.forEach(drawStreetLamp); drawHydrant(); }
    drawCar();
    // vicolo (dal più lontano)
    const items = [];
    LAMPS.forEach((l) => items.push({ z: l.z, f: () => drawLamp(l) }));
    LAUNDRY.forEach((L) => items.push({ z: L.z, f: () => drawLaundry(L) }));
    items.push({ z: 22.5, f: drawSign });
    items.push({ z: 25.5, f: () => drawTrash(1.45, 25.5, true) });
    items.push({ z: 33.5, f: () => drawTrash(-1.45, 33.5, false) });
    items.push({ z: 27.5, f: drawSteam });
    items.push({ z: detAt().z, f: drawDetective });
    items.sort((a, b) => b.z - a.z).forEach((it) => { if (it.z - cam.z > NEAR) it.f(); });
    drawAlleyHaze();
    drawRain();
    drawOffice();
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    post();
    letterbox();
    drawTitleCard();
    // taglio di montaggio sul lampo
    if (mode === 'intro') { const cf = clamp(1 - Math.abs(T - A_END) / 0.1, 0, 1); if (cf > 0) { ctx.fillStyle = `rgba(244,246,252,${0.95 * cf})`; ctx.fillRect(0, 0, W, H); } }
    if (mode === 'trip') {
      const cf = trip.short ? 0 : clamp(1 - Math.abs(trip.t - TRIP_OUT) / 0.12, 0, 1); if (cf > 0) { ctx.fillStyle = `rgba(244,246,252,${0.95 * cf})`; ctx.fillRect(0, 0, W, H); }
      const fo = smooth((trip.t - (TRIP_OUT + TRIP_DEST)) / TRIP_HOLD); if (fo > 0) { ctx.fillStyle = `rgba(0,0,0,${0.85 * fo})`; ctx.fillRect(0, 0, W, H); }
      if (trip.short && trip.t < trip.start + 0.35) { ctx.fillStyle = `rgba(0,0,0,${1 - (trip.t - trip.start) / 0.35})`; ctx.fillRect(0, 0, W, H); }
    }
    // nero d'apertura
    if (mode === 'intro') {
      const a = (1 - smooth((T - 0.15) / 1.3)) * (1 - 0.8 * clamp(flash, 0, 1));
      if (a > 0.003) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, W, H); }
    }
    if (skipFade > 0) { ctx.fillStyle = `rgba(0,0,0,${skipFade})`; ctx.fillRect(0, 0, W, H); }
  }

  function lampAt(e) { if (e < 0.25) return 0; const k = e - 0.25; return k < 0.07 ? 1 : k < 0.15 ? 0.12 : k < 0.21 ? 0.9 : k < 0.3 ? 0.35 : 1; }
  function advanceTrip(dt) {
    clock += dt;
    const tr = trip; tr.t += dt;
    if (!tr.cut && tr.t >= TRIP_OUT) { tr.cut = true; stage = 'dest'; weather = tr.venue.weather; initRain(); if (onCue) { onCue('weather', weather); onCue('radio', 0); } if (!tr.short) addFlashWall(0.9, true); }
    if (tr.t < TRIP_OUT && onCue) { const k = clamp(1 - tr.t / 1.4, 0, 1); if (Math.abs(k - lastProx) > 0.03) { lastProx = k; onCue('radio', k); } }
    if (!tr.cueFired && tr.t >= TRIP_OUT + 1.1) { tr.cueFired = true; if (onCue) onCue(tr.venue.cue); }
    const c = camTrip(tr.t); cam.x = c.x; cam.y = c.y; cam.z = c.z; cam.roll = reduce ? 0 : c.roll;
    lampLevel = 1; owlOpen = 1;
    if (!tr.done && tr.t >= TRIP_OUT + TRIP_DEST + TRIP_HOLD) { tr.done = true; const f = tr.onDone; tr.onDone = null; if (f) setTimeout(f, 30); }
    updateFlash(T, clock);
    updateRain(dt); updateRipples(dt); updateSparks(dt);
  }
  function addFlashWall(s, b) { flashEvents.push({ t0: clock, s, bolt: b, done: false, wall: true }); }
  function advance(dt) {
    if (mode === 'trip' && trip) return advanceTrip(dt);
    clock += dt;
    if (mode === 'intro') { T += dt * rate; if (T >= END_T) T = END_T; }
    if (mode === 'intro' && !matchFired && T >= STRIKE_T && T < A_END) { matchFired = true; if (onCue) onCue('match'); }
    const c = camAt(Math.min(T, END_T));
    cam.x = c.x; cam.y = c.y; cam.z = c.z; cam.roll = reduce ? 0 : c.roll;
    if (mode === 'intro' && onCue) {
      if (T < WALK_T) { const sg = Math.sin(T * Math.PI * 1.75) >= 0 ? 1 : -1; if (sg !== stepSign) { stepSign = sg; if (T > 0.15) onCue('step'); } }
      if (!trainFired && T >= 5.05 && T < 7) { trainFired = true; onCue('train'); }
      if (T >= C0 && !office()) { const k = clamp(1 - (cam.z - ZW) / 42, 0, 1) * clamp((-cam.y - 20) / 20, 0, 1); if (Math.abs(k - lastProx) > 0.02) { lastProx = k; onCue('radio', k); } }
    }
    if (T < C0 && !reduce) { cam.x += (Math.sin(clock * 1.7) + Math.sin(clock * 2.9)) * 0.009; cam.y += (Math.sin(clock * 2.3) + Math.sin(clock * 3.7)) * 0.007; }
    if (T >= END_T) {
      const k = reduce ? 0 : 1;
      cam.x += Math.sin(clock * 0.21) * 0.035 * k; cam.y += Math.sin(clock * 0.27) * 0.018 * k;
      if (!doneFired) {
        if (endClock < 0) endClock = 0; else endClock += dt;
        lampLevel = lampAt(endClock);
        if (!lampFired && endClock >= 0.25) { lampFired = true; if (onLamp) onLamp(); if (onCue) onCue('lamp'); }
        if (endClock > 0.8) owlOpen = clamp(owlOpen + dt * 1.6, 0, 1);
        if (owlOpen >= 1 && !doneFired) { doneFired = true; mode = 'idle'; lampLevel = 1; titleFade = 1.6; if (onDone) setTimeout(onDone, 250); }
      } else lampLevel = 1;
    } else lampLevel = 0;
    if (skipFade > 0) skipFade = Math.max(0, skipFade - dt * 2.5);
    if (titleFade > 0 && mode === 'idle') titleFade = Math.max(0, titleFade - dt * 0.9);
    updateSparks(dt);
    // gufo: battito di ciglia e rotazione della testa
    if (owlOpen >= 1) {
      nextBlink -= dt;
      if (nextBlink < 0) {
        const ph = -nextBlink / 0.2;
        owlBlink = ph < 1 ? Math.sin(ph * Math.PI) : 0;
        if (ph >= 1) { nextBlink = 2.5 + Math.random() * 5; owlBlink = 0; }
      }
      owlTurn = Math.sin(clock * 0.45) * 0.6 + Math.sin(clock * 1.3) * 0.15;
    }
    // fulmini casuali a riposo
    if (mode === 'idle' && clock > nextIdleFlash) { flashEvents.push({ t0: clock, s: 0.55 + Math.random() * 0.4, bolt: Math.random() < 0.6, done: false, wall: true }); nextIdleFlash = clock + 9 + Math.random() * 9; }
    { const ph = office() ? 'office' : 'outside'; if (ph !== lastPhase) { lastPhase = ph; if (onPhase) onPhase(ph); } }
    updateFlash(T, clock);
    updateRain(dt);
    updateRipples(dt);
  }
  function safeRender() { try { render(); } catch (err) { ctx.setTransform(DPR, 0, 0, DPR, 0, 0); if (!step.warned) { step.warned = true; console.warn('nightowl render', err); } } }
  function step(now) {
    raf = 0;
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (!paused) { advance(dt); safeRender(); }
    raf = requestAnimationFrame(step);
  }

  function resize() {
    const r = cv.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    F = Math.min(W, H) * 1.05;
    fitEnd();
    makeVignette();
    initRain();
  }

  return {
    init(canvas, opts) {
      cv = canvas; ctx = cv.getContext('2d');
      onDone = opts && opts.onDone; onThunder = opts && opts.onThunder; onPhase = opts && opts.onPhase; onLamp = opts && opts.onLamp; onCue = opts && opts.onCue;
      reduce = !!(opts && opts.reduce);
      resize(); makeGrain();
      window.addEventListener('resize', () => { resize(); });
    },
    play(kind) {
      // kind: 'full' | 'short' | 'none'
      doneFired = false; owlOpen = 0; mode = 'intro'; skipFade = 0; endClock = -1; lampFired = false; lampLevel = 0; matchFired = false;
      titleFade = 0; typedChars = 0; lastProx = -1; stepSign = 0; trainFired = false; SPARKS.length = 0; stage = 'main'; trip = null; weather = 'rain';
      if (onCue) onCue('radio', 0);
      scheduleIntroFlashes();
      if (kind === 'none' || reduce) { T = END_T; rate = 1; flashEvents = []; owlOpen = 0.99; endClock = 2; lampFired = true; lampLevel = 1; }
      else if (kind === 'short') { T = C0 + 0.52 * (END_T - C0); rate = 1.3; flashEvents = []; addFlash(T + 0.45, 1.0, true); }
      else { T = 0; rate = 1; }
      const c = camAt(T); cam.x = c.x; cam.y = c.y; cam.z = c.z; cam.roll = reduce ? 0 : c.roll;
      initRain();
      clock = 0; nextIdleFlash = 8;
      if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(step); }
    },
    skip() {
      if (mode !== 'intro' || T >= END_T) return;
      T = END_T; skipFade = 0.9; flashEvents = []; bolt = null; initRain();
    },
    pause(v) { paused = !!v; if (!paused && running && !raf) { last = performance.now(); raf = requestAnimationFrame(step); } },
    isIntro() { return mode === 'intro' && T < END_T; },
    // per i test: disegna l'istante t
    renderAt(t) {
      T = t; mode = t < END_T + 1.6 ? 'intro' : 'idle'; clock = t; titleFade = 0;
      const c = camAt(Math.min(t, END_T)); cam.x = c.x; cam.y = c.y; cam.z = c.z; cam.roll = c.roll;
      endClock = t >= END_T ? t - END_T : -1; doneFired = t >= END_T + 1.6; typedChars = 0;
      owlOpen = t >= END_T + 1.3 ? 1 : 0; lampLevel = t >= END_T ? lampAt(t - END_T) : 0; initRain(); for (let i = 0; i < 30; i++) updateRain(1 / 30);
      flashEvents = []; flash = 0; bolt = null; render();
    },
    setCase(info) { caseInfo = info || null; },
    // viaggio verso il caso: esce dalla finestra e arriva sulla scena del delitto
    trip(info, opts, onDoneTrip) {
      caseInfo = info; opts = opts || {};
      const start = opts.short ? TRIP_OUT + TRIP_DEST * 0.55 : 0;
      trip = { t: start, start, short: !!opts.short, venue: buildVenue(info.id), onDone: onDoneTrip, cut: false, cueFired: !!opts.short, done: false };
      mode = 'trip'; tripTyped = 0; lastProx = -1; flashEvents = []; bolt = null; skipFade = 0;
      if (opts.short) { trip.cut = true; stage = 'dest'; weather = trip.venue.weather; if (onCue) { onCue('weather', weather); onCue('radio', 0); } }
      else stage = 'main';
      const c = camTrip(trip.t); cam.x = c.x; cam.y = c.y; cam.z = c.z; cam.roll = c.roll;
      initRain(); paused = false;
      if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(step); }
      else if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
    },
    skipTrip() { if (mode !== 'trip' || !trip || trip.done) return; trip.done = true; const f = trip.onDone; trip.onDone = null; if (f) f(); },
    inTrip() { return mode === 'trip' && trip && !trip.done; },
    toOffice() {
      if (mode !== 'trip' && stage === 'main') return;
      mode = 'idle'; stage = 'main'; trip = null; weather = 'rain'; doneFired = true; T = END_T; owlOpen = 1; lampLevel = 1; titleFade = 0;
      const c = camAt(END_T); cam.x = c.x; cam.y = c.y; cam.z = c.z; cam.roll = 0; initRain(); skipFade = 0.8;
      if (onCue) { onCue('weather', 'rain'); }
    },
    // per i test: un fotogramma del viaggio al tempo t
    renderTripAt(info, t) { caseInfo = info; trip = { t, start: 0, short: false, venue: buildVenue(info.id), cut: t >= TRIP_OUT, cueFired: true, done: false }; mode = 'trip'; stage = t >= TRIP_OUT ? 'dest' : 'main'; weather = stage === 'dest' ? trip.venue.weather : 'rain'; clock = t; tripTyped = 0; const c = camTrip(t); cam.x = c.x; cam.y = c.y; cam.z = c.z; cam.roll = c.roll; lampLevel = 1; owlOpen = 1; initRain(); for (let i = 0; i < 30; i++) updateRain(1 / 30); flashEvents = []; flash = 0; bolt = null; render(); },
    // per i test: i luoghi che hanno un viaggio dedicato (ogni caso deve averne uno)
    venueIds() { return Object.keys(VENUES); },
    // per il video di prova: avanza di dt e disegna
    frame(dt) { advance(dt); safeRender(); },
    stop() { running = false; },
    flashNow(withBolt) { flashEvents.push({ t0: clock, s: 1, bolt: withBolt, done: false, wall: true }); },
    anchor(name) {
      // posizione a schermo della cartella sulla scrivania (per il tocco)
      if (name === 'folder') { const a = proj(-0.28, FLOOR - 0.8, ZW - 1.62), b = proj(0.36, FLOOR - 0.8, ZW - 1.2); return { x: a[0], y: b[1], w: b[0] - a[0], h: a[1] - b[1] }; }
      return null;
    },
    END_T,
  };
})();
