// Rigenera le icone della PWA (public/icon-180/192/512.png) da assets/icon.svg.
// Uso: node tools/icons.mjs
import { launch } from '../test/lib.mjs';
import fs from 'fs';

const svg = fs.readFileSync(new URL('../assets/icon.svg', import.meta.url), 'utf8');
const b = await launch();
for (const size of [180, 192, 512]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<html><body style="margin:0;background:#000">${svg.replace('<svg', `<svg width="${size}" height="${size}"`)}</body></html>`);
  await p.screenshot({ path: new URL(`../public/icon-${size}.png`, import.meta.url).pathname, omitBackground: false });
  await p.close();
  console.log(`  public/icon-${size}.png`);
}
await b.close();
