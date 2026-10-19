import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Reproducible presentation-only inspection of the existing developer API.
// Start `npm run dev -- --port 4182 --strictPort` separately. This script does
// not build, mutate map data, or enable debugging in a production deployment.
const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const url = new URL(argument('--url', 'http://127.0.0.1:4182/'));
url.searchParams.set('labelDebug', '1');
const output = resolve(argument('--out', 'docs/screenshots/labels'));
const prefix = argument('--prefix', 'after');
if (!/^[a-zA-Z0-9_-]+$/.test(prefix)) throw new Error('Use a simple filename prefix.');
const subset = argument('--cases', '').split(',').filter(Boolean);
const views = [
  ['wide-z10', [-121.974, 37.545], 10],
  ['wide-z11', [-121.974, 37.545], 11],
  ['wide-z12', [-121.974, 37.545], 12],
  ['central-z13', [-121.977, 37.550], 13],
  ['fremont-z15', [-121.9867167, 37.5476736], 15],
  ['fremont-z17', [-121.9867167, 37.5476736], 17],
  ['stevenson-z16', [-121.9724171, 37.5495328], 16],
  ['automall-durham-z17', [-121.9394, 37.51475], 17],
  ['automall-durham-z19', [-121.9394, 37.51475], 19],
].filter(([name]) => !subset.length || subset.includes(name));
if (!views.length) throw new Error('No matching screenshot cases.');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  headless: true,
  args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const observations = [];
try {
  for (const [width, height] of [[1440, 1000], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url.href);
    await page.waitForFunction(() => window.__FREMONT_GAME__ && window.__FREMONT_LABEL_DEBUG__);
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    await page.getByRole('button', { name: 'Open main menu', exact: true }).click();
    await page.locator('#mode-study').click();
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    for (const [name, center, zoom] of views) {
      await page.evaluate(pose => window.__FREMONT_LABEL_DEBUG__.setView(pose), { center, zoom, bearing: 0, pitch: 0 });
      await page.waitForFunction(() => window.__FREMONT_LABEL_DEBUG__.ready());
      await page.waitForFunction(() => window.__FREMONT_GAME__.mapLabels.rendered.length > 0);
      // Let newly requested symbol tiles and their normal collision fade settle.
      await page.waitForTimeout(1300);
      const record = await page.evaluate(({ name }) => {
        const game = window.__FREMONT_GAME__, debug = window.__FREMONT_LABEL_DEBUG__;
        const native = game.mapLabels, map = game.presentation.map;
        const hits = [];
        if (name.startsWith('fremont-')) {
          // Each small box queries actual placed-symbol collision bounds. Boxes
          // farther apart than the rendered text width cannot be a single label.
          for (let y = 40; y < map.height - 40; y += 80) for (let x = 40; x < map.width - 40; x += 80) {
            const rendered = debug.inspect([[x - 18, y - 18], [x + 18, y + 18]]).rendered;
            if (rendered.some(feature => feature.name === 'Fremont Boulevard')) hits.push({ x, y });
          }
        }
        const separated = [];
        for (const point of hits) if (separated.every(other => Math.hypot(other.x - point.x, other.y - point.y) > 280)) separated.push(point);
        return {
          map,
          renderedFeatures: native.rendered.map(({ geometry, ...feature }) => feature),
          distinctNames: [...new Set(native.rendered.map(feature => feature.name))].sort(),
          ordinaryDomMarkers: document.querySelectorAll('.map-street-label').length,
          rendererError: document.querySelector('[data-testid="overhead-view"]')?.getAttribute('data-renderer-error'),
          fremontSymbolHitBoxes: hits,
          fremontWidelySeparatedHitBoxes: separated,
          sourceDiagnostics: debug.stats(),
        };
      }, { name });
      const filename = `${prefix}-${name}-${width}.png`;
      await page.screenshot({ path: resolve(output, filename) });
      observations.push({ name, width, height, center, zoom, filename, ...record, errors: [...errors] });
      console.log(JSON.stringify({ filename, distinctNames: record.distinctNames.length, separatedFremontSymbolBoxes: record.fremontWidelySeparatedHitBoxes.length, errors }));
      if (errors.length || record.rendererError) throw new Error(`Rendering failed in ${filename}: ${[...errors, record.rendererError].filter(Boolean).join('; ')}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(resolve(output, `${prefix}-observations.json`), JSON.stringify(observations, null, 2) + '\n');
}
