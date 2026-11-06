// Renderizza l'audio offline (NOAudio._render) in file WAV dentro test/out/, per ascoltarlo o misurarlo.
// Obiettivo sugli altoparlanti del telefono: circa -18 LUFS, picchi sotto -3 dBFS.
// Misura (se c'è ffmpeg): ffmpeg -i test/out/audio_studio.wav -af ebur128=peak=true -f null -
// Uso: node test/audio.mjs [nome1,nome2,...]
import { launch, fileUrl, OUT } from './lib.mjs';
import fs from 'fs';

const keys = (t0, n) => Array.from({ length: n }, (_, i) => [t0 + i * 0.034, 'key']).filter((_, i) => i % 7 !== 3);
const PLANS = {
  strada:    [16, { mode: 'outside', weather: 'rain', thunder: [[3, 1.0], [11, 0.6]] }],
  studio:    [20, { mode: 'office', jazz: true, thunder: [[14, 0.7]], sfx: [[5, 'match'], [6, 'page'], [7, 'stamp'], [8, 'hoot'], [9, 'bell'], ...keys(10, 30)] }],
  indagine:  [12, { mode: 'focus', jazz: true }],
  viaggio:   [5.4, { mode: 'outside', weather: 'rain', thunder: [[0.45, 0.9]], sfx: [[1.1, 'siren'], ...keys(1.32, 44)] }],
  molo:      [3, { mode: 'outside', weather: 'fog', sfx: [[0.2, 'foghorn']] }],
  luna_park: [3, { mode: 'outside', weather: 'snow', sfx: [[0.2, 'musicbox']] }],
  torre:     [3, { mode: 'outside', weather: 'wind', sfx: [[0.1, 'gust']] }],
};
const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(PLANS);

const b = await launch();
const p = await b.newPage();
p.on('pageerror', (e) => { console.log('errore:', e.message); process.exitCode = 1; });
await p.goto(fileUrl('test/audio.html'));
for (const name of only) {
  const [sec, plan] = PLANS[name];
  const b64 = await p.evaluate(async ({ sec, plan }) => {
    const [L, R] = await NOAudio._render(sec, plan);
    const n = L.length, buf = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) { buf[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767; buf[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767; }
    const u8 = new Uint8Array(buf.buffer); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s);
  }, { sec, plan });
  const pcm = Buffer.from(b64, 'base64'); const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(44100, 24); h.writeUInt32LE(176400, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(`${OUT}audio_${name}.wav`, Buffer.concat([h, pcm]));
  console.log(`  audio_${name}.wav  (${sec}s)`);
}
await b.close();
