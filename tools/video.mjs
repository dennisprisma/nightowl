// Video di anteprima delle animazioni (fotogramma per fotogramma, poi ffmpeg). Senza audio.
// Uso:
//   node tools/video.mjs apertura            → test/out/anteprima_apertura.mp4
//   node tools/video.mjs viaggi [id,id,...]  → test/out/anteprima_viaggi.mp4 (primo completo, gli altri brevi)
import { launch, fileUrl, OUT } from '../test/lib.mjs';
import fs from 'fs';
import { execFileSync } from 'child_process';

const [what = 'apertura', list] = process.argv.slice(2);
const FPS = 30, dir = OUT + 'frames_' + what + '/';
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });

const b = await launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto(fileUrl('dist/artifact/index.html'));
await p.addStyleTag({ content: '#intro-ui{display:none!important} .hotspot{animation:none!important}' + (what === 'viaggi' ? ' #home{display:none!important}' : '') });
await p.waitForTimeout(300);
let i = 0;
const grab = async (sec) => { for (let t = 0; t < sec; t += 1 / FPS, i++) { await p.evaluate((dt) => { NOScene.pause(true); NOScene.frame(dt); }, 1 / FPS); await p.screenshot({ path: `${dir}f${String(i).padStart(4, '0')}.png` }); } };
if (what === 'apertura') {
  await p.evaluate(() => { localStorage.clear(); NOScene.pause(true); NOScene.play('full'); NOScene.pause(true); });
  await grab((await p.evaluate(() => NOScene.END_T)) + 3.4); // apertura + lampada e occhi del gufo
} else {
  const ids = list ? list.split(',') : await p.evaluate(() => NO_CASES.map((c) => c.id));
  for (const [k, id] of ids.entries()) {
    const short = k > 0;
    await p.evaluate(({ id, short }) => { NOScene.pause(true); const c = NO_CASES.find((x) => x.id === id); NOScene.trip({ id, n: 1, title: c.title, where: c.where, year: c.year }, { short }, null); NOScene.pause(true); }, { id, short });
    await grab(short ? 2.95 : 7.25);
  }
}
await b.close();
const out = `${OUT}anteprima_${what}.mp4`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}f%04d.png`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-vf', 'scale=780:-2', out]);
fs.rmSync(dir, { recursive: true, force: true });
console.log(`${i} fotogrammi → ${out.replace(process.cwd() + '/', '')}`);
