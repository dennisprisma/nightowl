// Utilità condivise dai test (Playwright + Chromium).
// Chromium: `npx playwright install chromium`, oppure CHROME=/percorso/del/browser.
import { chromium } from 'playwright';
import fs from 'fs';
import { fileURLToPath } from 'url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const OUT = fileURLToPath(new URL('out/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });

/** URL file:// di un percorso relativo alla radice del progetto. */
export const fileUrl = (p) => new URL(p, new URL('..', import.meta.url)).href;

export function launch(extraArgs = []) {
  return chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox', ...extraArgs] });
}

/** Viewport di riferimento: iPhone in verticale. */
export const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

/** Raccoglie errori della pagina (e, se richiesto, i warning della console). */
export function collect(page, { warnings = false, ignore = /fonts\.(googleapis|gstatic)/ } = {}) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    const t = m.type();
    if ((t === 'error' || (warnings && t === 'warning')) && !ignore.test(m.text())) errs.push(t + ': ' + m.text());
  });
  return errs;
}

/** Stampa l'esito e imposta il codice di uscita (1 = test fallito). */
export function report(name, errs) {
  if (errs.length) { console.log(`✗ ${name}\n  ` + errs.slice(0, 12).join('\n  ')); process.exitCode = 1; }
  else console.log(`✓ ${name}`);
}
