/* nightowl — audio sintetizzato (v2).
   Pioggia e tuoni pre-calcolati in buffer stereo realistici; jazz da grammofono
   (piano elettrico, contrabbasso, spazzole, vibrafono) con una progressione noir
   scritta a mano; effetti brevi e discreti. Tutto passa da un compressore,
   così nulla distorce. Tre ambienti: fuori (vicolo), studio, lettura. */
window.NOAudio = (function () {
  'use strict';
  let ac = null, G = null;
  let on = false, jazzOn = false, sfxOn = true, vol = 0.75, mode = 'outside';
  let jazzTimer = 0, nextBar = 0, bar = 0, cycle = 0, lastKey = 0;
  let thunderBufs = [], noiseBuf = null, trainBuf = null, prox = 0, wx = 'rain';

  const MODES = {
    outside: { rain: 0.36, rainLP: 6000, thLP: 5200, th: 1.0, jazz: 0.0 },
    office: { rain: 0.22, rainLP: 1500, thLP: 1500, th: 0.8, jazz: 0.62 },
    focus: { rain: 0.14, rainLP: 1100, thLP: 1100, th: 0.55, jazz: 0.4 },
  };

  /* ------------------------------------------------ generatori di buffer */
  function normalize(buf, peak) {
    let m = 0;
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > m) m = a; } }
    if (m > 0) { const k = peak / m; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; } }
    return buf;
  }
  function pink(n, amp) {
    const out = new Float32Array(n);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * amp; b6 = w * 0.115926;
    }
    return out;
  }
  function makeRain(sec) {
    const sr = ac.sampleRate, n = Math.floor(sec * sr), xf = Math.floor(0.8 * sr), N = n + xf;
    const buf = ac.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const t = pink(N, 0.05);
      // scroscio leggero: tante gocce minuscole, poche più grosse
      const drops = Math.floor(sec * 520);
      for (let d = 0; d < drops; d++) {
        const st = Math.floor(Math.random() * (N - 3000));
        const f = 900 + Math.pow(Math.random(), 1.8) * 4200, q = 1.5 + Math.random() * 4;
        const amp = 0.012 + Math.pow(Math.random(), 7) * 0.18;
        const dec = (0.0018 + Math.random() * 0.007) * sr;
        const w0 = 2 * Math.PI * f / sr, al = Math.sin(w0) / (2 * q), a0 = 1 + al;
        const bb0 = al / a0, bb2 = -al / a0, aa1 = -2 * Math.cos(w0) / a0, aa2 = (1 - al) / a0;
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        const len = Math.min(N - st, Math.floor(dec * 5));
        for (let k = 0; k < len; k++) {
          const x = (Math.random() * 2 - 1) * Math.exp(-k / dec);
          const y = bb0 * x + bb2 * x2 - aa1 * y1 - aa2 * y2;
          x2 = x1; x1 = x; y2 = y1; y1 = y;
          t[st + k] += y * amp * 2.2;
        }
      }
      // gocce da grondaia (piccoli "plic" che salgono di tono), rare
      const pl = Math.floor(sec * 3);
      for (let d = 0; d < pl; d++) {
        const st = Math.floor(Math.random() * (N - 4000)), f0 = 700 + Math.random() * 1300, len = Math.floor(0.045 * sr);
        const a = 0.02 + Math.random() * 0.03; let ph = 0;
        for (let k = 0; k < len; k++) { const f = f0 * (1 + 0.8 * k / len); ph += 2 * Math.PI * f / sr; t[st + k] += Math.sin(ph) * Math.exp(-k / (0.01 * sr)) * a; }
      }
      // giunzione del loop senza scatti
      const out = buf.getChannelData(ch);
      for (let i = 0; i < n; i++) out[i] = t[i];
      for (let i = 0; i < xf; i++) { const k = i / xf; out[i] = t[i] * Math.sqrt(k) + t[n + i] * Math.sqrt(1 - k); }
    }
    return normalize(buf, 0.7);
  }
  function makeThunder(close) {
    const sr = ac.sampleRate, sec = 7.5, n = Math.floor(sec * sr);
    const buf = ac.createBuffer(2, n, sr);
    const rolls = []; const k = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < k; i++) rolls.push({ t: 0.08 + Math.random() * 3.2 * (i / k + 0.15), a: (1 - i / (k + 1)) * (0.6 + Math.random() * 0.4), w: 0.25 + Math.random() * 0.9 });
    const fc = 2 * Math.PI * 150 / sr, alpha = fc / (fc + 1), fc2 = 2 * Math.PI * 900 / sr, a2 = fc2 / (fc2 + 1), fm = 2 * Math.PI * 520 / sr, am = fm / (fm + 1);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let br = 0, lp = 0, lp2 = 0, lpc = 0, mid = 0, midHP = 0;
      for (let i = 0; i < n; i++) {
        const tt = i / sr;
        const w = Math.random() * 2 - 1;
        br = (br + 0.02 * w) / 1.02;
        lp += alpha * (br * 6 - lp);
        lp2 += a2 * (w - lp2);
        let env = 0;
        for (const r of rolls) { const x = (tt - r.t) / r.w; env += r.a * Math.exp(-x * x); }
        env = (env + 0.35 * Math.exp(-tt / 2.2)) * (1 - Math.exp(-tt / 0.03)) * Math.exp(-Math.max(0, tt - 4.5) / 1.2);
        mid += am * (w - mid); midHP += 0.02 * (mid - midHP);
        let s = lp * env + (mid - midHP) * env * 0.85;
        if (close) { lpc += 0.5 * (w - lpc); s += (w - lpc) * 0.5 * Math.exp(-tt / 0.07) * (tt < 0.5 ? 1 : 0) + lp2 * 0.25 * Math.exp(-tt / 0.4); }
        d[i] = s;
      }
    }
    return normalize(buf, 0.9);
  }
  function makeTrain() {
    const sr = ac.sampleRate, sec = 3.8, n = Math.floor(sec * sr), b = ac.createBuffer(2, n, sr);
    const fc = 2 * Math.PI * 220 / sr, al = fc / (fc + 1);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); let br = 0, lp = 0, ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = Math.random() * 2 - 1;
        br = (br + 0.02 * w) / 1.02; lp += al * (br * 7 - lp);
        const env = Math.min(1, t / 0.7) * Math.min(1, (sec - t) / 1.0);
        let v = lp * env;
        // giunture dei binari: tu-tum
        const cl = t % 0.42, cl2 = (t + 0.11) % 0.42;
        if (cl < 0.02) v += w * 0.45 * Math.exp(-cl / 0.005) * env;
        if (cl2 < 0.02) v += w * 0.35 * Math.exp(-cl2 / 0.005) * env;
        // stridio delle ruote, lontano
        ph += 2 * Math.PI * (3100 + 180 * Math.sin(t * 5)) / sr; v += Math.sin(ph) * 0.012 * env * (0.5 + 0.5 * Math.sin(t * 2.3));
        // scintille
        if (Math.random() < 0.0009) v += (Math.random() * 2 - 1) * 0.5 * env;
        d[i] = v;
      }
    }
    return normalize(b, 0.8);
  }
  function makeIR(sec, decay) {
    const sr = ac.sampleRate, n = Math.floor(sec * sr), b = ac.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let lp = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; lp += 0.35 * (w - lp); d[i] = lp * Math.pow(1 - i / n, decay); } }
    return normalize(b, 0.5);
  }
  function makeCrackle(sec) {
    const sr = ac.sampleRate, n = Math.floor(sec * sr), b = ac.createBuffer(2, n, sr);
    const hiss = pink(n, 0.004);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = hiss[i];
      const clicks = Math.floor(sec * 9);
      for (let k = 0; k < clicks; k++) { const st = Math.floor(Math.random() * (n - 40)), a = (Math.random() < 0.1 ? 0.5 : 0.12) * Math.random(); for (let j = 0; j < 30; j++) d[st + j] += (Math.random() * 2 - 1) * a * Math.exp(-j / 4); }
    }
    return b;
  }

  /* ------------------------------------------------ grafo */
  function build() {
    G = {};
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    G.master = ac.createGain(); G.master.gain.value = 0;
    comp.connect(G.master); G.master.connect(ac.destination);
    G.comp = comp;
    // riverbero della stanza
    G.verb = ac.createConvolver(); G.verb.buffer = makeIR(2.4, 3);
    G.verbOut = ac.createGain(); G.verbOut.gain.value = 0.32; G.verb.connect(G.verbOut); G.verbOut.connect(comp);
    // rumore bianco per gli effetti brevi
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    // pioggia
    G.rainHP = ac.createBiquadFilter(); G.rainHP.type = 'highpass'; G.rainHP.frequency.value = 110;
    G.rainLP = ac.createBiquadFilter(); G.rainLP.type = 'lowpass'; G.rainLP.frequency.value = MODES[mode].rainLP; G.rainLP.Q.value = 0.5;
    G.rainOut = ac.createGain(); G.rainOut.gain.value = 0;
    G.rainHP.connect(G.rainLP); G.rainLP.connect(G.rainOut); G.rainOut.connect(comp);
    const rs = ac.createBufferSource(); rs.buffer = makeRain(9); rs.loop = true; rs.connect(G.rainHP); rs.start();
    // vento (neve e grattacielo)
    G.wind = ac.createGain(); G.wind.gain.value = 0;
    const wb = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate); wb.getChannelData(0).set(pink(ac.sampleRate * 4, 0.3));
    const ws = ac.createBufferSource(); ws.buffer = wb; ws.loop = true;
    const wf = ac.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.7;
    const wl = ac.createOscillator(); wl.frequency.value = 0.13; const wlg = ac.createGain(); wlg.gain.value = 220; wl.connect(wlg); wlg.connect(wf.frequency);
    const wa = ac.createGain(); wa.gain.value = 1; const wl2 = ac.createOscillator(); wl2.frequency.value = 0.21; const wl2g = ac.createGain(); wl2g.gain.value = 0.35; wl2.connect(wl2g); wl2g.connect(wa.gain);
    ws.connect(wf); wf.connect(wa); wa.connect(G.wind); G.wind.connect(comp); ws.start(); wl.start(); wl2.start();
    // tuoni
    G.thLP = ac.createBiquadFilter(); G.thLP.type = 'lowpass'; G.thLP.frequency.value = MODES[mode].thLP;
    G.thOut = ac.createGain(); G.thOut.gain.value = 1; G.thLP.connect(G.thOut); G.thOut.connect(comp);
    const ts = ac.createGain(); ts.gain.value = 0.18; G.thOut.connect(ts); ts.connect(G.verb);
    // jazz: catena "grammofono"
    G.jazzIn = ac.createGain(); G.jazzIn.gain.value = 1;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 150;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 0.6;
    const pk = ac.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1300; pk.gain.value = 3; pk.Q.value = 0.8;
    const sh = ac.createWaveShaper(); { const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(1.6 * x) / Math.tanh(1.6); } sh.curve = c; sh.oversample = '2x'; }
    G.jazzOut = ac.createGain(); G.jazzOut.gain.value = 0;
    G.jazzLP = ac.createBiquadFilter(); G.jazzLP.type = 'lowpass'; G.jazzLP.frequency.value = 16000; G.jazzLP.Q.value = 0.7;
    G.jazzIn.connect(hp); hp.connect(lp); lp.connect(pk); pk.connect(sh); sh.connect(G.jazzLP); G.jazzLP.connect(G.jazzOut); G.jazzOut.connect(comp);
    const js = ac.createGain(); js.gain.value = 0.35; G.jazzOut.connect(js); js.connect(G.verb);
    const cs = ac.createBufferSource(); cs.buffer = makeCrackle(5); cs.loop = true;
    const cg = ac.createGain(); cg.gain.value = 0.55; cs.connect(cg); cg.connect(hp); cs.start();
    // spazzole: fruscio continuo modulato a ogni battuta
    G.swirl = ac.createGain(); G.swirl.gain.value = 0.0001;
    const sw = ac.createBufferSource(); sw.buffer = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate); sw.buffer.getChannelData(0).set(pink(ac.sampleRate * 3, 0.25)); sw.loop = true;
    const swf = ac.createBiquadFilter(); swf.type = 'bandpass'; swf.frequency.value = 4200; swf.Q.value = 0.6;
    sw.connect(swf); swf.connect(G.swirl); G.swirl.connect(G.jazzIn); sw.start();
    // effetti
    G.sfx = ac.createGain(); G.sfx.gain.value = sfxOn ? 1 : 0; G.sfx.connect(comp);
    const ss = ac.createGain(); ss.gain.value = 0.22; G.sfx.connect(ss); ss.connect(G.verb);
    // tuoni pronti (vicino e lontani)
    thunderBufs = [makeThunder(true), makeThunder(false), makeThunder(false)];
  }
  function ensure() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ac = new AC({ latencyHint: 'playback' }); } catch (e) { try { ac = new AC(); } catch (e2) { return false; } }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* non supportato */ }
    build();
    return true;
  }
  function applyMode(fast) {
    if (!ac || !G) return;
    const m = MODES[mode] || MODES.office, t = ac.currentTime, k = fast ? 0.05 : 0.9;
    const wr = { rain: 1, wind: 1.15, fog: 0.3, snow: 0 }[wx] ?? 1;
    G.rainOut.gain.setTargetAtTime(on ? m.rain * wr : 0, t, k);
    G.wind.gain.setTargetAtTime(on ? ({ wind: 0.32, snow: 0.24 }[wx] || 0) : 0, t, k);
    G.rainLP.frequency.setTargetAtTime(m.rainLP, t, k);
    G.thLP.frequency.setTargetAtTime(m.thLP, t, k);
    G.thOut.gain.setTargetAtTime(m.th, t, k);
    if (mode === 'outside') {
      // la radio dello studio si sente da fuori, sempre più vicina
      const k = prox * prox;
      G.jazzOut.gain.setTargetAtTime(on && jazzOn ? MODES.office.jazz * Math.pow(prox, 1.5) * 0.95 : 0, t, 0.25);
      G.jazzLP.frequency.setTargetAtTime(300 + 4200 * k, t, 0.25);
    } else {
      G.jazzOut.gain.setTargetAtTime(on && jazzOn ? m.jazz : 0, t, fast ? 0.05 : 1.4);
      G.jazzLP.frequency.setTargetAtTime(16000, t, 0.4);
    }
  }

  /* ------------------------------------------------ jazz */
  const BPM = 72, BEAT = 60 / BPM, SW = 0.66;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // 8 battute in Do minore con il "cliché" discendente Do–Si–Sib–La
  const CHORDS = [
    [[0, 4, [55, 60, 62, 63]]],
    [[0, 4, [55, 59, 62, 63]]],
    [[0, 4, [55, 58, 62, 63]]],
    [[0, 4, [55, 57, 62, 63]]],
    [[0, 4, [56, 60, 63, 67]]],
    [[0, 4, [56, 60, 62, 65]]],
    [[0, 2, [56, 60, 62, 65]], [2, 2, [56, 59, 62, 65]]],
    [[0, 4, [55, 58, 62, 63]]],
  ];
  const BASS = [[[0, 36], [2, 43]], [[0, 36], [2, 43]], [[0, 36], [2, 46]], [[0, 36], [2, 45], [3.5, 40]], [[0, 41], [2, 48]], [[0, 41], [2, 44]], [[0, 38], [2, 43]], [[0, 36], [2, 43], [3, 42], [3.5, 43]]];
  const MELODY = [
    [[67, 0, 2], [75, 2, 1.5], [74, 3.5, 0.5]],
    [[72, 0, 3], [71, 3, 1]],
    [[70, 0, 2], [67, 2, 1], [68, 3, 1]],
    [[69, 0, 3.5]],
    [[68, 0, 1], [72, 1, 1], [75, 2, 1.5], [79, 3.5, 0.5]],
    [[77, 0, 3], [74, 3, 1]],
    [[77, 0, 1], [75, 1, 1], [74, 2, 1], [68, 3, 1]],
    [[67, 0, 3.5]],
  ];
  const sw = (b) => { const f = b - Math.floor(b); return Math.floor(b) + (Math.abs(f - 0.5) < 0.01 ? SW : f); };
  function env(g, t, peak, a, d, sustain, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), t + a + d);
    g.gain.exponentialRampToValueAtTime(0.0001, t + rel);
  }
  function epiano(f, t, dur, vel) {
    const car = ac.createOscillator(), mod = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain();
    car.frequency.value = f; mod.frequency.value = f;
    mg.gain.setValueAtTime(f * 1.3, t); mg.gain.exponentialRampToValueAtTime(f * 0.12, t + 0.7);
    mod.connect(mg); mg.connect(car.frequency); car.connect(g); g.connect(G.jazzIn);
    env(g, t, vel, 0.008, 0.4, 0.45, t + dur - t);
    car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
  }
  function upright(f, t, dur, vel) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), g2 = ac.createGain(), lp = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f * 0.985, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
    o2.type = 'sawtooth'; o2.frequency.setValueAtTime(f * 0.985, t); o2.frequency.exponentialRampToValueAtTime(f, t + 0.05); g2.gain.value = 0.5;
    lp.type = 'lowpass'; lp.Q.value = 1.2; lp.frequency.setValueAtTime(1500, t); lp.frequency.exponentialRampToValueAtTime(420, t + 0.35);
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(G.jazzIn);
    env(g, t, vel, 0.012, 0.25, 0.45, dur);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function vibe(f, t, dur, vel) {
    const car = ac.createOscillator(), mod = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain(), trem = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    car.frequency.value = f; mod.frequency.value = f * 4;
    mg.gain.setValueAtTime(f * 1.2, t); mg.gain.exponentialRampToValueAtTime(f * 0.01, t + 0.12);
    mod.connect(mg); mg.connect(car.frequency);
    lfo.frequency.value = 5.2; lg.gain.value = 0.28; trem.gain.value = 0.72; lfo.connect(lg); lg.connect(trem.gain);
    car.connect(g); g.connect(trem); trem.connect(G.jazzIn);
    const rel = Math.min(dur * BEAT + 1.4, 3.2);
    env(g, t, vel, 0.004, 0.3, 0.5, rel);
    [car, mod, lfo].forEach((o) => { o.start(t); o.stop(t + rel + 0.05); });
  }
  function noiseHit(t, type, freq, q, peak, dec, dest) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
    s.connect(f); f.connect(g); g.connect(dest || G.jazzIn); s.start(t, Math.random() * 1.5, dec + 0.05);
  }
  function scheduleBar(t0) {
    const b = bar % 8;
    // accordi
    CHORDS[b].forEach(([beat, len, notes]) => {
      const t = t0 + beat * BEAT;
      notes.forEach((m, i) => epiano(mtof(m), t + i * 0.012, len * BEAT * 1.05, 0.045 + Math.random() * 0.01));
      if (Math.random() < 0.35 && len === 4) notes.slice(1).forEach((m, i) => epiano(mtof(m), t + sw(2.5) * BEAT + i * 0.01, BEAT * 1.4, 0.025));
    });
    // contrabbasso
    BASS[b].forEach(([beat, m]) => upright(mtof(m), t0 + sw(beat) * BEAT, beat % 1 ? BEAT * 0.5 : BEAT * 1.7, 0.42));
    // spazzole e ride (morbidi)
    for (let i = 0; i < 4; i++) {
      const t = t0 + i * BEAT;
      G.swirl.gain.setTargetAtTime(0.11, t, 0.04); G.swirl.gain.setTargetAtTime(0.035, t + 0.12, 0.18);
      if (i % 2) noiseHit(t, 'bandpass', 2600, 0.9, 0.05, 0.06);
      noiseHit(t, 'highpass', 7000, 0.5, i % 2 ? 0.018 : 0.012, 0.45);
      if (i % 2) noiseHit(t + SW * BEAT, 'highpass', 7000, 0.5, 0.009, 0.3);
    }
    // vibrafono: il tema nei giri pari, qualche nota sparsa nei dispari
    if (cycle % 2 === 0) MELODY[b].forEach(([m, beat, len]) => vibe(mtof(m), t0 + sw(beat) * BEAT, len, 0.085));
    else if (Math.random() < 0.3) { const ch = CHORDS[b][0][2]; vibe(mtof(ch[3] + 12), t0 + sw(1.5) * BEAT, 1.5, 0.05); }
    bar++; if (bar % 8 === 0) cycle++;
  }
  function jazzTick() {
    if (!ac) return;
    while (nextBar < ac.currentTime + 0.8) { scheduleBar(nextBar); nextBar += BEAT * 4; }
  }
  function startJazz() {
    if (!ac || jazzTimer) return;
    bar = 0; cycle = 0; nextBar = ac.currentTime + 0.3;
    jazzTick(); jazzTimer = setInterval(jazzTick, 150);
    applyMode();
  }
  function stopJazz() {
    if (jazzTimer) { clearInterval(jazzTimer); jazzTimer = 0; }
    applyMode();
  }

  /* ------------------------------------------------ effetti */
  function sfx(kind, at) {
    if (!on || !ac || !sfxOn) return;
    const t = at != null ? at : ac.currentTime + 0.005;
    const out = G.sfx;
    if (kind === 'key') {
      if (at == null) { if (t - lastKey < 0.05) return; lastKey = t; }
      const v = 0.05 + Math.random() * 0.03;
      noiseHit(t, 'bandpass', 2000 + Math.random() * 1200, 1.4, v, 0.03, out);
      const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 150 + Math.random() * 40;
      g.gain.setValueAtTime(v * 0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.04);
    } else if (kind === 'bell') {
      [2093, 4186 * 1.01, 6279 * 1.02].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.03 / (i + 1), t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2 / (i + 1)); o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.3); });
    } else if (kind === 'match') {
      const s = ac.createBufferSource(); s.buffer = noiseBuf;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.1; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(4200, t + 0.09);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random(), 0.2);
      const s2 = ac.createBufferSource(); s2.buffer = noiseBuf; const f2 = ac.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 900;
      const g2 = ac.createGain(); g2.gain.setValueAtTime(0.0001, t + 0.05); g2.gain.exponentialRampToValueAtTime(0.07, t + 0.16); g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      s2.connect(f2); f2.connect(g2); g2.connect(out); s2.start(t + 0.05, Math.random(), 1.2);
    } else if (kind === 'page') {
      const s = ac.createBufferSource(); s.buffer = noiseBuf; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 0.5;
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 5; i++) { const tt = t + i * 0.045 + Math.random() * 0.02; g.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.025, tt + 0.012); g.gain.exponentialRampToValueAtTime(0.004, tt + 0.04); }
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random(), 0.4);
    } else if (kind === 'stamp') {
      const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(115, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.2);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.35);
      noiseHit(t, 'lowpass', 1200, 0.7, 0.22, 0.09, out);
    } else if (kind === 'siren') {
      // sirena della polizia, lontana tra i palazzi
      const o = ac.createOscillator(), o2 = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 1300; lp.Q.value = 0.8;
      [o, o2].forEach((x, i) => { const m = i ? 1.005 : 1; x.frequency.setValueAtTime(560 * m, t); for (let k = 0; k < 2; k++) { x.frequency.linearRampToValueAtTime(880 * m, t + 0.9 + k * 1.9); x.frequency.linearRampToValueAtTime(560 * m, t + 1.9 + k * 1.9); } });
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.6); g.gain.setValueAtTime(0.05, t + 3.0); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.9);
      const og = ac.createGain(); og.gain.value = 0.5; o2.connect(og); og.connect(lp); o.connect(lp); lp.connect(g);
      if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = -0.45; g.connect(p); p.connect(out); } else g.connect(out);
      o.start(t); o2.start(t); o.stop(t + 4); o2.stop(t + 4);
    } else if (kind === 'foghorn') {
      [98, 147].forEach((f) => { const o = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 480;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.45); g.gain.setValueAtTime(0.12, t + 2.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
        o.connect(lp); lp.connect(g); g.connect(out); o.start(t); o.stop(t + 3.5); });
    } else if (kind === 'musicbox') {
      // carillon stonato della giostra chiusa
      [84, 79, 76, 72, 74, 71, 67, 72].forEach((m, i) => { const f = 440 * Math.pow(2, (m - 69) / 12) * (1 + (Math.random() - 0.5) * 0.012), tt = t + i * 0.42 + (i > 5 ? 0.2 : 0);
        const c = ac.createOscillator(), mo = ac.createOscillator(), mg = ac.createGain(), g = ac.createGain(); c.frequency.value = f; mo.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 0.8, tt); mg.gain.exponentialRampToValueAtTime(f * 0.01, tt + 0.2);
        mo.connect(mg); mg.connect(c.frequency); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.045, tt + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.4);
        c.connect(g); g.connect(out); c.start(tt); mo.start(tt); c.stop(tt + 1.5); mo.stop(tt + 1.5); });
    } else if (kind === 'gust') {
      const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
      f.frequency.setValueAtTime(260, t); f.frequency.linearRampToValueAtTime(900, t + 1.2); f.frequency.linearRampToValueAtTime(300, t + 2.8);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 1.0); g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
      s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 3.1);
    } else if (kind === 'step') {
      // passo sul selciato bagnato
      noiseHit(t, 'lowpass', 700, 0.7, 0.05, 0.07, out);
      noiseHit(t + 0.015, 'bandpass', 2000 + Math.random() * 800, 1.6, 0.025, 0.05, out);
    } else if (kind === 'train') {
      if (!trainBuf) trainBuf = makeTrain();
      const s = ac.createBufferSource(); s.buffer = trainBuf;
      const g = ac.createGain(); g.gain.value = 0.75;
      if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.setValueAtTime(-0.8, t); p.pan.linearRampToValueAtTime(0.8, t + 3.6); s.connect(p); p.connect(g); } else s.connect(g);
      g.connect(G.thLP); s.start(t);
    } else if (kind === 'switch') {
      noiseHit(t, 'highpass', 2600, 0.7, 0.14, 0.012, out);
      noiseHit(t + 0.05, 'highpass', 1900, 0.7, 0.07, 0.016, out);
      const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 95;
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.08);
    } else if (kind === 'hoot') {
      [[0, 392, 349], [0.5, 370, 330]].forEach(([dt, f1, f2]) => {
        const tt = t + dt, o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), lp = ac.createBiquadFilter(), g = ac.createGain();
        o.frequency.setValueAtTime(f1, tt); o.frequency.linearRampToValueAtTime(f2, tt + 0.38);
        lfo.frequency.value = 7; lg.gain.value = 4; lfo.connect(lg); lg.connect(o.frequency);
        lp.type = 'lowpass'; lp.frequency.value = 900;
        g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.09, tt + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.45);
        o.connect(lp); lp.connect(g); g.connect(out); o.start(tt); lfo.start(tt); o.stop(tt + 0.5); lfo.stop(tt + 0.5);
      });
    }
  }
  function thunder(strength, delay, at) {
    if (!on || !ac || !thunderBufs.length) return;
    const t = at != null ? at : ac.currentTime + (delay || 0.6);
    const close = strength > 0.85;
    const s = ac.createBufferSource(); s.buffer = close ? thunderBufs[0] : thunderBufs[1 + Math.floor(Math.random() * 2)];
    s.playbackRate.value = 0.85 + Math.random() * 0.2;
    const p = ac.createStereoPanner ? ac.createStereoPanner() : null;
    const g = ac.createGain(); g.gain.value = 0.85 * Math.min(1, strength || 0.8);
    if (p) { p.pan.value = Math.random() * 1.2 - 0.6; s.connect(p); p.connect(g); } else s.connect(g);
    g.connect(G.thLP); s.start(t);
  }

  /* ------------------------------------------------ API */
  function setOn(v) {
    on = !!v;
    if (on && !ensure()) { on = false; return false; }
    if (!ac) return false;
    if (ac.state === 'suspended') ac.resume();
    G.master.gain.setTargetAtTime(on ? vol : 0, ac.currentTime, 0.3);
    if (on && jazzOn) startJazz();
    if (!on) stopJazz();
    applyMode();
    return on;
  }
  function setJazz(v) { jazzOn = !!v; if (jazzOn && on) startJazz(); else stopJazz(); }
  function setSfx(v) { sfxOn = !!v; if (G) G.sfx.gain.setTargetAtTime(sfxOn ? 1 : 0, ac.currentTime, 0.05); }
  function setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (ac && on) G.master.gain.setTargetAtTime(vol, ac.currentTime, 0.1); }
  function setMode(m) { if (!MODES[m] || m === mode) return; mode = m; applyMode(); }
  function setWeather(w) { wx = w || 'rain'; if (ac && G) applyMode(); }
  function setProximity(k) { prox = Math.max(0, Math.min(1, k || 0)); if (ac && G && mode === 'outside') applyMode(); }

  // solo per i test: rende N secondi di audio in un contesto offline
  async function _render(sec, plan) {
    const prev = [ac, G, on, jazzOn, mode, bar, cycle, nextBar, thunderBufs, noiseBuf, wx];
    wx = plan.weather || 'rain';
    ac = new OfflineAudioContext(2, Math.floor(44100 * sec), 44100);
    mode = plan.mode || 'office'; jazzOn = !!plan.jazz; on = true;
    build(); G.master.gain.value = vol; applyMode(true);
    if (plan.jazz) { bar = 0; cycle = 0; nextBar = 0.2; while (nextBar < sec) { scheduleBar(nextBar); nextBar += BEAT * 4; } }
    (plan.thunder || []).forEach(([t, s]) => thunder(s, 0, t));
    (plan.sfx || []).forEach(([t, k]) => sfx(k, t));
    const buf = await ac.startRendering();
    [ac, G, on, jazzOn, mode, bar, cycle, nextBar, thunderBufs, noiseBuf, wx] = prev; trainBuf = null;
    return [buf.getChannelData(0), buf.getChannelData(1)];
  }

  return { setOn, setJazz, setSfx, setVolume, setMode, setProximity, setWeather, thunder: (s, d) => thunder(s, d), click: (k) => sfx(k), isOn: () => on, _render };
})();
