/* nightowl — ritratti segnaletici cartoon in SVG, generati dai parametri del sospettato. */
window.NOPortrait = (function () {
  'use strict';
  const INK = '#0b0b0d';
  const SKIN = ['#dccfb6', '#c8b493', '#a88e6c', '#7d654d'];
  const SKIN_SH = ['#c4b394', '#b09a77', '#8e7556', '#64503c'];
  const HAIR = { dark: '#1c1a18', light: '#a08c62', grey: '#b3aea3', red: '#6e4a32' };
  const SUIT = ['#2a2a2f', '#3a3631', '#25272c', '#463f35', '#2f2d2a'];

  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function svg(look, opts) {
    opts = opts || {};
    const L = Object.assign({ g: 'm', age: 1, face: 'oval', hair: 'side', hc: 'dark', skin: 0, ex: [] }, look);
    const ex = new Set(L.ex || []);
    const id = opts.id || 'x';
    const num = opts.num || '';
    const seed = hash(id);
    const skin = SKIN[L.skin] || SKIN[0], sh = SKIN_SH[L.skin] || SKIN_SH[0];
    const hair = HAIR[L.hc] || HAIR.dark;
    const suit = L.g === 'f' ? ['#3b3438', '#2d2a33', '#463b33', '#2b2f33'][seed % 4] : SUIT[seed % SUIT.length];
    const sw = 2.4; // spessore contorno
    const parts = [];
    const P = (s) => parts.push(s);

    // sfondo segnaletico
    P(`<rect width="120" height="150" fill="#cdc4ad"/>`);
    for (let i = 0; i < 9; i++) { const y = 14 + i * 13; P(`<line x1="0" x2="120" y1="${y}" y2="${y}" stroke="#a79d86" stroke-width="${i % 2 ? 0.6 : 1.2}"/>`); }
    P(`<text x="4" y="25" font-size="6" fill="#857b66" font-family="Special Elite, Courier New, monospace">6'</text><text x="4" y="64" font-size="6" fill="#857b66" font-family="Special Elite, Courier New, monospace">5'6</text>`);

    // geometria del volto
    const cx = 60, cy = 66;
    const faces = {
      oval: [21, 27], round: [24, 25], long: [19, 30], square: [23, 26],
    };
    const [rx, ry] = faces[L.face] || faces.oval;
    const top = cy - ry, bot = cy + ry;

    // capelli dietro (lunghi / onde)
    if (L.hair === 'long') P(`<path d="M${cx - rx - 6} ${cy - 6} Q${cx - rx - 10} ${bot + 22} ${cx - rx + 2} ${bot + 26} L${cx + rx - 2} ${bot + 26} Q${cx + rx + 10} ${bot + 22} ${cx + rx + 6} ${cy - 6} Z" fill="${hair}" stroke="${INK}" stroke-width="${sw}"/>`);
    if (L.hair === 'waves' && L.g === 'f') P(`<path d="M${cx - rx - 5} ${cy - 8} Q${cx - rx - 9} ${cy + 18} ${cx - rx + 1} ${bot + 4} L${cx + rx - 1} ${bot + 4} Q${cx + rx + 9} ${cy + 18} ${cx + rx + 5} ${cy - 8} Z" fill="${hair}" stroke="${INK}" stroke-width="${sw}"/>`);
    if (L.hair === 'bob') P(`<path d="M${cx - rx - 5} ${cy - 10} L${cx - rx - 4} ${cy + 14} Q${cx - rx} ${cy + 18} ${cx - rx + 6} ${cy + 16} L${cx + rx - 6} ${cy + 16} Q${cx + rx} ${cy + 18} ${cx + rx + 4} ${cy + 14} L${cx + rx + 5} ${cy - 10} Z" fill="${hair}" stroke="${INK}" stroke-width="${sw}"/>`);

    // busto
    const shW = L.g === 'f' ? 44 : 50;
    P(`<path d="M${cx - shW} 150 L${cx - shW + 4} ${bot + 22} Q${cx - shW + 8} ${bot + 12} ${cx - 16} ${bot + 10} L${cx + 16} ${bot + 10} Q${cx + shW - 8} ${bot + 12} ${cx + shW - 4} ${bot + 22} L${cx + shW} 150 Z" fill="${suit}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`);
    // collo
    P(`<path d="M${cx - 9} ${bot - 6} L${cx - 10} ${bot + 12} Q${cx} ${bot + 16} ${cx + 10} ${bot + 12} L${cx + 9} ${bot - 6} Z" fill="${sh}" stroke="${INK}" stroke-width="${sw}"/>`);
    if (L.g === 'm') {
      // camicia e revers
      P(`<path d="M${cx - 12} ${bot + 10} L${cx} ${bot + 34} L${cx + 12} ${bot + 10} Z" fill="#e8dfca" stroke="${INK}" stroke-width="2"/>`);
      P(`<path d="M${cx - 16} ${bot + 10} L${cx - 4} ${bot + 38} L${cx - 22} ${bot + 22} Z M${cx + 16} ${bot + 10} L${cx + 4} ${bot + 38} L${cx + 22} ${bot + 22} Z" fill="${suit}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`);
      if (ex.has('tie')) P(`<path d="M${cx - 4} ${bot + 13} L${cx + 4} ${bot + 13} L${cx + 3} ${bot + 17} L${cx + 5} ${bot + 34} L${cx} ${bot + 38} L${cx - 5} ${bot + 34} L${cx - 3} ${bot + 17} Z" fill="#4a453d" stroke="${INK}" stroke-width="1.8"/>`);
      if (ex.has('bow')) P(`<path d="M${cx} ${bot + 15} L${cx - 10} ${bot + 10} L${cx - 10} ${bot + 21} Z M${cx} ${bot + 15} L${cx + 10} ${bot + 10} L${cx + 10} ${bot + 21} Z" fill="#141416" stroke="${INK}" stroke-width="1.6"/><circle cx="${cx}" cy="${bot + 15}" r="2.6" fill="#141416"/>`);
    } else {
      // scollatura
      P(`<path d="M${cx - 14} ${bot + 10} Q${cx} ${bot + 26} ${cx + 14} ${bot + 10}" fill="${sh}" stroke="${INK}" stroke-width="2"/>`);
      if (L.hat === 'maid') P(`<path d="M${cx - 14} ${bot + 22} L${cx + 14} ${bot + 22} L${cx + 16} 150 L${cx - 16} 150 Z" fill="#ece5d4" stroke="${INK}" stroke-width="1.8"/>`);
    }
    if (ex.has('pearls')) { let s = ''; for (let i = -5; i <= 5; i++) { const x = cx + i * 3.1, y = bot + 13 + (25 - i * i) * 0.36; s += `<circle cx="${x}" cy="${y}" r="1.9" fill="#f1ead8" stroke="${INK}" stroke-width="0.7"/>`; } P(s); }
    if (ex.has('scarf')) P(`<path d="M${cx - 15} ${bot + 6} Q${cx} ${bot + 16} ${cx + 15} ${bot + 6} L${cx + 13} ${bot + 14} Q${cx} ${bot + 22} ${cx - 13} ${bot + 14} Z M${cx + 6} ${bot + 14} L${cx + 12} ${bot + 34} L${cx + 4} ${bot + 33} Z" fill="#8a7f6c" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`);

    // orecchie
    P(`<ellipse cx="${cx - rx}" cy="${cy + 2}" rx="4.5" ry="7" fill="${skin}" stroke="${INK}" stroke-width="${sw}"/><ellipse cx="${cx + rx}" cy="${cy + 2}" rx="4.5" ry="7" fill="${skin}" stroke="${INK}" stroke-width="${sw}"/>`);
    if (ex.has('earrings')) P(`<circle cx="${cx - rx - 1}" cy="${cy + 11}" r="2.6" fill="#e3d8b8" stroke="${INK}" stroke-width="1"/><circle cx="${cx + rx + 1}" cy="${cy + 11}" r="2.6" fill="#e3d8b8" stroke="${INK}" stroke-width="1"/>`);

    // volto
    let facePath;
    if (L.face === 'square') facePath = `M${cx - rx} ${cy - ry + 6} Q${cx - rx} ${top} ${cx} ${top} Q${cx + rx} ${top} ${cx + rx} ${cy - ry + 6} L${cx + rx} ${cy + 8} Q${cx + rx - 2} ${bot} ${cx} ${bot} Q${cx - rx + 2} ${bot} ${cx - rx} ${cy + 8} Z`;
    else facePath = `M${cx} ${top} C${cx + rx * 1.3} ${top} ${cx + rx * 1.05} ${bot} ${cx} ${bot} C${cx - rx * 1.05} ${bot} ${cx - rx * 1.3} ${top} ${cx} ${top} Z`;
    P(`<path d="${facePath}" fill="${skin}" stroke="${INK}" stroke-width="${sw}"/>`);
    // ombra laterale
    P(`<path d="M${cx + rx * 0.55} ${top + 8} Q${cx + rx * 1.05} ${cy} ${cx + rx * 0.3} ${bot - 3} Q${cx + rx * 0.75} ${cy} ${cx + rx * 0.55} ${top + 8} Z" fill="${sh}" opacity="0.7"/>`);

    // barba (sotto i lineamenti)
    if (L.fh === 'beard') P(`<path d="M${cx - rx + 2} ${cy + 4} Q${cx - rx + 3} ${bot + 6} ${cx} ${bot + 8} Q${cx + rx - 3} ${bot + 6} ${cx + rx - 2} ${cy + 4} Q${cx + 8} ${cy + 16} ${cx} ${cy + 15} Q${cx - 8} ${cy + 16} ${cx - rx + 2} ${cy + 4} Z" fill="${hair}" stroke="${INK}" stroke-width="2"/>`);
    if (L.fh === 'stubble') {
      let s = '', a = seed || 1;
      const rnd = () => { a = (Math.imul(a, 1103515245) + 12345) >>> 0; return (a >>> 8) / 16777216; };
      let n = 0;
      while (n < 46) {
        const x = cx + (rnd() * 2 - 1) * rx * 0.85, y = cy + 6 + rnd() * (ry - 6);
        if (((x - cx) / (rx * 0.92)) ** 2 + ((y - cy) / (ry * 0.95)) ** 2 > 1) continue;
        s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="0.65" fill="#3a332b" opacity="0.55"/>`; n++;
      }
      P(s);
    }
    if (L.fh === 'goatee') P(`<path d="M${cx - 5} ${bot - 6} Q${cx} ${bot + 7} ${cx + 5} ${bot - 6} Z" fill="${hair}" stroke="${INK}" stroke-width="1.6"/>`);

    // occhi e sopracciglia
    const eyY = cy - 2, eyX = rx * 0.42;
    const browTilt = (seed % 3) - 1;
    P(`<ellipse cx="${cx - eyX}" cy="${eyY}" rx="3.2" ry="${L.age === 2 ? 2.2 : 2.8}" fill="${INK}"/><ellipse cx="${cx + eyX}" cy="${eyY}" rx="3.2" ry="${L.age === 2 ? 2.2 : 2.8}" fill="${INK}"/>`);
    P(`<circle cx="${cx - eyX + 1}" cy="${eyY - 1}" r="0.9" fill="#f4ecd8"/><circle cx="${cx + eyX + 1}" cy="${eyY - 1}" r="0.9" fill="#f4ecd8"/>`);
    const bw = L.g === 'f' ? 1.6 : 2.6;
    P(`<path d="M${cx - eyX - 6} ${eyY - 7 + browTilt} Q${cx - eyX} ${eyY - 10} ${cx - eyX + 5} ${eyY - 7 - browTilt}" fill="none" stroke="${L.hc === 'grey' ? '#6f6a60' : INK}" stroke-width="${bw}" stroke-linecap="round"/><path d="M${cx + eyX - 5} ${eyY - 7 - browTilt} Q${cx + eyX} ${eyY - 10} ${cx + eyX + 6} ${eyY - 7 + browTilt}" fill="none" stroke="${L.hc === 'grey' ? '#6f6a60' : INK}" stroke-width="${bw}" stroke-linecap="round"/>`);
    if (L.g === 'f') P(`<path d="M${cx - eyX - 4} ${eyY - 2} l-2 -2 M${cx + eyX + 4} ${eyY - 2} l2 -2" stroke="${INK}" stroke-width="1.2"/>`);
    // naso
    P(`<path d="M${cx + 1} ${eyY + 2} Q${cx + 5} ${cy + 10} ${cx + 1} ${cy + 11} Q${cx - 2} ${cy + 11.5} ${cx - 3} ${cy + 10}" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`);
    // rughe
    if (L.age === 2) P(`<path d="M${cx - 9} ${top + 8} q9 -2 18 0 M${cx - 7} ${top + 12} q7 -1.5 14 0 M${cx - eyX - 7} ${eyY + 3} l-3 2 M${cx + eyX + 7} ${eyY + 3} l3 2 M${cx - 9} ${cy + 13} q-2 4 0 8 M${cx + 9} ${cy + 13} q2 4 0 8" fill="none" stroke="${INK}" stroke-width="0.9" opacity="0.55"/>`);
    // bocca
    const mY = cy + 17;
    const smirk = seed % 2;
    if (ex.has('lipstick')) P(`<path d="M${cx - 6} ${mY} Q${cx - 3} ${mY - 3} ${cx} ${mY - 1} Q${cx + 3} ${mY - 3} ${cx + 6} ${mY} Q${cx} ${mY + 5} ${cx - 6} ${mY} Z" fill="#a3121a" stroke="${INK}" stroke-width="1.2"/>`);
    else P(`<path d="M${cx - 6} ${mY} Q${cx} ${mY + (smirk ? 1 : 2.5)} ${cx + 6} ${mY - (smirk ? 2 : 0)}" fill="none" stroke="${INK}" stroke-width="1.9" stroke-linecap="round"/>`);
    // baffi
    if (L.fh === 'pencil') P(`<path d="M${cx - 7} ${mY - 4} Q${cx} ${mY - 6} ${cx + 7} ${mY - 4}" fill="none" stroke="${hair === HAIR.grey ? '#6f6a60' : INK}" stroke-width="1.6"/>`);
    if (L.fh === 'walrus') P(`<path d="M${cx - 13} ${mY + 1} Q${cx - 10} ${mY - 9} ${cx} ${mY - 5} Q${cx + 10} ${mY - 9} ${cx + 13} ${mY + 1} Q${cx + 6} ${mY - 2} ${cx} ${mY - 1} Q${cx - 6} ${mY - 2} ${cx - 13} ${mY + 1} Z" fill="${hair}" stroke="${INK}" stroke-width="1.6"/>`);
    if (L.fh === 'beard') P(`<path d="M${cx - 8} ${mY - 3} Q${cx} ${mY - 7} ${cx + 8} ${mY - 3}" fill="none" stroke="${hair}" stroke-width="3"/>`);
    // neo, cicatrice
    if (ex.has('mole')) P(`<circle cx="${cx + rx * 0.45}" cy="${mY - 5}" r="1.2" fill="${INK}"/>`);
    if (ex.has('scar')) P(`<path d="M${cx + eyX + 2} ${eyY - 12} l4 9 M${cx + eyX + 1} ${eyY - 9} l3 -1 M${cx + eyX + 3} ${eyY - 6} l3 -1" stroke="${INK}" stroke-width="1.3" opacity="0.8"/>`);

    // capelli davanti
    const H = (d) => P(`<path d="${d}" fill="${hair}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`);
    switch (L.hair) {
      case 'slick': H(`M${cx - rx - 2} ${cy - 4} Q${cx - rx - 3} ${top - 6} ${cx} ${top - 7} Q${cx + rx + 3} ${top - 6} ${cx + rx + 2} ${cy - 4} Q${cx + rx - 2} ${top + 6} ${cx + 4} ${top + 7} Q${cx - rx + 3} ${top + 5} ${cx - rx - 2} ${cy - 4} Z`); P(`<path d="M${cx - 8} ${top - 3} Q${cx + 2} ${top - 5} ${cx + 12} ${top - 1}" fill="none" stroke="#f1ead8" stroke-width="1" opacity="0.5"/>`); break;
      case 'side': H(`M${cx - rx - 2} ${cy - 2} Q${cx - rx - 2} ${top - 7} ${cx - 2} ${top - 6} Q${cx + rx + 4} ${top - 5} ${cx + rx + 2} ${cy - 2} Q${cx + rx - 1} ${top + 7} ${cx - 6} ${top + 6} L${cx - 8} ${top + 2} Q${cx - rx + 2} ${top + 8} ${cx - rx - 2} ${cy - 2} Z`); break;
      case 'crop': H(`M${cx - rx} ${cy - 6} Q${cx - rx - 1} ${top - 3} ${cx} ${top - 4} Q${cx + rx + 1} ${top - 3} ${cx + rx} ${cy - 6} Q${cx + rx - 3} ${top + 4} ${cx} ${top + 4} Q${cx - rx + 3} ${top + 4} ${cx - rx} ${cy - 6} Z`); break;
      case 'curly': { let d = `M${cx - rx - 2} ${cy - 2}`; for (let i = 0; i <= 8; i++) { const a = Math.PI + (i / 8) * Math.PI; d += ` Q${cx + Math.cos(a - 0.2) * (rx + 9)} ${cy - 8 + Math.sin(a - 0.2) * (ry + 6)} ${cx + Math.cos(a) * (rx + 3)} ${cy - 6 + Math.sin(a) * (ry + 2)}`; } d += ` Q${cx + rx - 4} ${top + 8} ${cx} ${top + 6} Q${cx - rx + 4} ${top + 8} ${cx - rx - 2} ${cy - 2} Z`; H(d); break; }
      case 'bald': if (L.hc !== 'none') { H(`M${cx - rx - 1} ${cy - 1} Q${cx - rx - 2} ${cy - 10} ${cx - rx + 4} ${cy - 12} L${cx - rx + 3} ${cy + 2} Z`); H(`M${cx + rx + 1} ${cy - 1} Q${cx + rx + 2} ${cy - 10} ${cx + rx - 4} ${cy - 12} L${cx + rx - 3} ${cy + 2} Z`); } P(`<path d="M${cx - 6} ${top + 4} Q${cx} ${top + 1} ${cx + 8} ${top + 5}" fill="none" stroke="#fff8e6" stroke-width="1.5" opacity="0.45"/>`); break;
      case 'bob': H(`M${cx - rx - 5} ${cy - 6} Q${cx - rx - 4} ${top - 8} ${cx} ${top - 8} Q${cx + rx + 4} ${top - 8} ${cx + rx + 5} ${cy - 6} Q${cx + rx - 4} ${top + 4} ${cx + 2} ${top + 8} Q${cx - 6} ${top + 10} ${cx - rx + 2} ${cy - 10} Z`); break;
      case 'waves': H(`M${cx - rx - 5} ${cy} Q${cx - rx - 8} ${top - 6} ${cx - 2} ${top - 8} Q${cx + rx + 8} ${top - 8} ${cx + rx + 5} ${cy} Q${cx + rx - 1} ${top + 10} ${cx + 8} ${top + 4} Q${cx + 2} ${top + 12} ${cx - 6} ${top + 5} Q${cx - rx + 1} ${top + 12} ${cx - rx - 5} ${cy} Z`); P(`<path d="M${cx - rx + 2} ${top + 2} q6 -4 12 0 q6 4 12 0 M${cx - rx} ${top + 8} q5 -3 9 0" fill="none" stroke="${INK}" stroke-width="1" opacity="0.6"/>`); break;
      case 'bun': H(`M${cx - rx - 2} ${cy - 2} Q${cx - rx - 3} ${top - 6} ${cx} ${top - 6} Q${cx + rx + 3} ${top - 6} ${cx + rx + 2} ${cy - 2} Q${cx + rx - 2} ${top + 5} ${cx} ${top + 4} Q${cx - rx + 2} ${top + 5} ${cx - rx - 2} ${cy - 2} Z`); if (!L.hat) P(`<circle cx="${cx}" cy="${top - 9}" r="8" fill="${hair}" stroke="${INK}" stroke-width="${sw}"/>`); break;
      case 'long': H(`M${cx - rx - 6} ${cy - 2} Q${cx - rx - 6} ${top - 8} ${cx} ${top - 8} Q${cx + rx + 6} ${top - 8} ${cx + rx + 6} ${cy - 2} Q${cx + rx} ${top + 6} ${cx + 4} ${top + 6} Q${cx - 4} ${top + 12} ${cx - rx + 2} ${cy - 4} Z`); break;
    }

    // occhiali
    if (L.glasses === 'round') P(`<circle cx="${cx - eyX}" cy="${eyY}" r="6.5" fill="rgba(240,235,220,0.18)" stroke="${INK}" stroke-width="1.8"/><circle cx="${cx + eyX}" cy="${eyY}" r="6.5" fill="rgba(240,235,220,0.18)" stroke="${INK}" stroke-width="1.8"/><path d="M${cx - eyX + 6.5} ${eyY} Q${cx} ${eyY - 3} ${cx + eyX - 6.5} ${eyY} M${cx - eyX - 6.5} ${eyY - 1} L${cx - rx} ${eyY - 2} M${cx + eyX + 6.5} ${eyY - 1} L${cx + rx} ${eyY - 2}" fill="none" stroke="${INK}" stroke-width="1.6"/>`);
    if (L.glasses === 'pince') P(`<ellipse cx="${cx - eyX}" cy="${eyY + 1}" rx="5.5" ry="4.5" fill="rgba(240,235,220,0.2)" stroke="${INK}" stroke-width="1.5"/><ellipse cx="${cx + eyX}" cy="${eyY + 1}" rx="5.5" ry="4.5" fill="rgba(240,235,220,0.2)" stroke="${INK}" stroke-width="1.5"/><path d="M${cx - eyX + 5.5} ${eyY} Q${cx} ${eyY - 3} ${cx + eyX - 5.5} ${eyY} M${cx + eyX + 5} ${eyY + 3} Q${cx + rx + 6} ${cy + 20} ${cx + rx - 2} ${bot + 14}" fill="none" stroke="${INK}" stroke-width="1"/>`);
    if (ex.has('monocle')) P(`<circle cx="${cx + eyX}" cy="${eyY}" r="6" fill="rgba(240,235,220,0.25)" stroke="${INK}" stroke-width="1.8"/><path d="M${cx + eyX + 4} ${eyY + 5} Q${cx + rx + 8} ${cy + 22} ${cx + rx - 4} ${bot + 16}" fill="none" stroke="${INK}" stroke-width="0.9"/>`);

    // cappelli
    switch (L.hat) {
      case 'fedora':
        P(`<path d="M${cx - rx - 14} ${top + 5} Q${cx} ${top + 12} ${cx + rx + 14} ${top + 5} Q${cx + rx + 6} ${top - 1} ${cx} ${top} Q${cx - rx - 6} ${top - 1} ${cx - rx - 14} ${top + 5} Z" fill="#1e1d1f" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`);
        P(`<path d="M${cx - rx + 1} ${top + 3} Q${cx - rx} ${top - 18} ${cx - 6} ${top - 20} L${cx} ${top - 15} L${cx + 6} ${top - 20} Q${cx + rx} ${top - 18} ${cx + rx - 1} ${top + 3} Z" fill="#2a292c" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`);
        P(`<path d="M${cx - rx + 1} ${top - 2} L${cx + rx - 1} ${top - 2} L${cx + rx - 1} ${top + 3} L${cx - rx + 1} ${top + 3} Z" fill="#57524a" stroke="${INK}" stroke-width="1.4"/>`); break;
      case 'cap':
        P(`<path d="M${cx - rx - 3} ${top + 6} Q${cx - rx - 2} ${top - 12} ${cx + 4} ${top - 11} Q${cx + rx + 6} ${top - 9} ${cx + rx + 3} ${top + 4} Z" fill="#4a463f" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/><path d="M${cx - rx - 2} ${top + 6} Q${cx} ${top + 1} ${cx + rx + 12} ${top + 7} Q${cx + rx + 8} ${top + 11} ${cx - rx - 2} ${top + 9} Z" fill="#3a3732" stroke="${INK}" stroke-width="2"/>`); break;
      case 'cloche':
        P(`<path d="M${cx - rx - 6} ${cy - 2} Q${cx - rx - 9} ${top - 14} ${cx} ${top - 14} Q${cx + rx + 9} ${top - 14} ${cx + rx + 6} ${cy - 2} Q${cx + rx + 2} ${top + 10} ${cx} ${top + 9} Q${cx - rx - 2} ${top + 10} ${cx - rx - 6} ${cy - 2} Z" fill="#5c5348" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/><path d="M${cx - rx - 3} ${top + 2} Q${cx} ${top - 3} ${cx + rx + 3} ${top + 2}" fill="none" stroke="#2a2724" stroke-width="3"/><circle cx="${cx + rx - 2}" cy="${top + 1}" r="3" fill="#e8dfca" stroke="${INK}" stroke-width="1"/>`); break;
      case 'beret':
        P(`<path d="M${cx - rx - 8} ${top + 2} Q${cx - rx - 4} ${top - 14} ${cx + 4} ${top - 13} Q${cx + rx + 10} ${top - 10} ${cx + rx + 4} ${top + 1} Q${cx} ${top + 5} ${cx - rx - 8} ${top + 2} Z" fill="#2c2a2e" stroke="${INK}" stroke-width="${sw}"/><path d="M${cx + 3} ${top - 13} l1 -4" stroke="${INK}" stroke-width="2"/>`); break;
      case 'sailor':
        P(`<path d="M${cx - rx - 2} ${top + 4} Q${cx - rx} ${top - 10} ${cx} ${top - 10} Q${cx + rx} ${top - 10} ${cx + rx + 2} ${top + 4} Z" fill="#e6e0d0" stroke="${INK}" stroke-width="${sw}"/><path d="M${cx - rx - 2} ${top + 1} L${cx + rx + 2} ${top + 1} L${cx + rx + 2} ${top + 5} L${cx - rx - 2} ${top + 5} Z" fill="#1d1d22" stroke="${INK}" stroke-width="1.4"/>`); break;
      case 'tophat':
        P(`<path d="M${cx - rx - 10} ${top + 3} Q${cx} ${top + 9} ${cx + rx + 10} ${top + 3} Q${cx} ${top - 2} ${cx - rx - 10} ${top + 3} Z" fill="#141416" stroke="${INK}" stroke-width="${sw}"/><path d="M${cx - rx + 2} ${top + 2} L${cx - rx + 4} ${top - 30} Q${cx} ${top - 33} ${cx + rx - 4} ${top - 30} L${cx + rx - 2} ${top + 2} Z" fill="#1d1d20" stroke="${INK}" stroke-width="${sw}"/><path d="M${cx - rx + 3} ${top - 5} L${cx + rx - 3} ${top - 5}" stroke="#57524a" stroke-width="4"/>`); break;
      case 'turban':
        P(`<path d="M${cx - rx - 5} ${cy - 4} Q${cx - rx - 8} ${top - 18} ${cx} ${top - 18} Q${cx + rx + 8} ${top - 18} ${cx + rx + 5} ${cy - 4} Q${cx} ${top + 8} ${cx - rx - 5} ${cy - 4} Z" fill="#6b5d4b" stroke="${INK}" stroke-width="${sw}"/><path d="M${cx - rx} ${top - 4} Q${cx} ${top - 14} ${cx + rx} ${top - 8} M${cx - rx + 3} ${top + 2} Q${cx + 2} ${top - 8} ${cx + rx + 2} ${top - 1}" fill="none" stroke="${INK}" stroke-width="1.4"/><circle cx="${cx}" cy="${top - 6}" r="3.6" fill="#a3121a" stroke="${INK}" stroke-width="1.2"/>`); break;
      case 'maid':
        P(`<path d="M${cx - rx + 2} ${top + 1} Q${cx} ${top - 12} ${cx + rx - 2} ${top + 1} Q${cx} ${top - 3} ${cx - rx + 2} ${top + 1} Z" fill="#f2ecdd" stroke="${INK}" stroke-width="1.8"/><path d="M${cx - 12} ${top - 4} l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3 l3 -3" fill="none" stroke="${INK}" stroke-width="1"/>`); break;
      case 'scarf':
        P(`<path d="M${cx - rx - 6} ${cy + 4} Q${cx - rx - 8} ${top - 12} ${cx} ${top - 12} Q${cx + rx + 8} ${top - 12} ${cx + rx + 6} ${cy + 4} L${cx + rx + 1} ${cy + 2} Q${cx + rx} ${top + 4} ${cx} ${top + 4} Q${cx - rx} ${top + 4} ${cx - rx - 1} ${cy + 2} Z" fill="#7a7062" stroke="${INK}" stroke-width="${sw}"/><path d="M${cx - rx + 2} ${top - 2} l4 3 M${cx - 6} ${top - 8} l4 3 M${cx + 6} ${top - 6} l4 3" stroke="${INK}" stroke-width="1" opacity="0.6"/>`); break;
    }

    // sigaretta / pipa
    if (ex.has('cig')) P(`<path d="M${cx + 4} ${mY + 1} L${cx + 19} ${mY + 4}" stroke="#efe6d2" stroke-width="2.6" stroke-linecap="round"/><path d="M${cx + 4} ${mY + 1} L${cx + 19} ${mY + 4}" stroke="${INK}" stroke-width="0.6" fill="none"/><circle cx="${cx + 19.5}" cy="${mY + 4}" r="1.4" fill="#d34a2a"/><path d="M${cx + 20} ${mY} q-3 -6 1 -10 q4 -5 0 -11" fill="none" stroke="#9e988a" stroke-width="1.3" opacity="0.7"/>`);
    if (ex.has('pipe')) P(`<path d="M${cx + 3} ${mY + 1} Q${cx + 12} ${mY + 4} ${cx + 15} ${mY + 4}" fill="none" stroke="#2a221b" stroke-width="2.4"/><path d="M${cx + 13} ${mY - 2} L${cx + 21} ${mY - 2} L${cx + 20} ${mY + 7} Q${cx + 17} ${mY + 9} ${cx + 14} ${mY + 7} Z" fill="#3b2d22" stroke="${INK}" stroke-width="1.5"/>`);

    // cartellino
    const tagY = 128;
    P(`<rect x="22" y="${tagY}" width="76" height="20" fill="#121214" stroke="${INK}" stroke-width="1.5"/>`);
    P(`<text x="60" y="${tagY + 8}" text-anchor="middle" font-size="6.2" fill="#e8dfca" font-family="Special Elite, Courier New, monospace" letter-spacing="1">NEW YORK P.D.</text>`);
    P(`<text x="60" y="${tagY + 16.5}" text-anchor="middle" font-size="7" fill="#e8dfca" font-family="Special Elite, Courier New, monospace" letter-spacing="1.5">${num}</text>`);

    return `<svg viewBox="0 0 120 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${opts.label || 'Ritratto'}">${parts.join('')}</svg>`;
  }
  return { svg };
})();
