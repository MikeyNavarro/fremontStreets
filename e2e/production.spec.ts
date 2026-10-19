import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, test as base, type Page } from '@playwright/test';

const origin = 'http://127.0.0.1:4179';
const prefix = '/fremontStreets/';

interface Audit {
  requests: string[];
  workers: string[];
  errors: string[];
}

// Every browser scenario must run entirely from the built, local static files.
// External geographic services and cloud-only endpoints cannot hide a missing
// asset or a deployment-specific failure.
const test = base.extend<{ audit: Audit }>({
  audit: [async ({ page }, use) => {
    const audit: Audit = { requests: [], workers: [], errors: [] };
    page.on('request', request => audit.requests.push(request.url()));
    page.on('requestfailed', request => audit.errors.push(`Request failed: ${request.url()} (${request.failure()?.errorText})`));
    page.on('response', response => {
      if (response.status() >= 400) audit.errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    page.on('pageerror', error => audit.errors.push(`Page error: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') audit.errors.push(`Console error: ${message.text()}`);
    });
    page.on('worker', worker => audit.workers.push(worker.url()));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
        audit.errors.push(`Unexpected remote dependency: ${url.href}`);
        return route.abort();
      }
      return route.continue();
    });
    await use(audit);
    for (const url of audit.requests.filter(url => /^https?:/.test(url))) {
      expect(new URL(url).origin, `All gameplay requests stay on the static origin: ${url}`).toBe(origin);
      expect(new URL(url).pathname, `All gameplay requests use the Pages base: ${url}`).toMatch(/^\/fremontStreets\//);
    }
    expect(audit.errors, 'No failed requests, HTTP failures, or browser errors').toEqual([]);
  }, { auto: true }],
});

interface Snapshot {
  vehicle: { edgeId: string; totalDistance: number; position: [number, number]; speed: number };
  camera: string;
  paused: boolean;
  profile: string;
  zoneId: string;
  editorActive: boolean;
  route: null | { edgeIds: string[]; nodeIds: string[] };
  challenge: null | { status: string; targetNode: string };
  quiz: { street: string; choices: string[] };
  progress: { zones: Record<string, {
    streetNames: string[]; intersectionIds: string[]; quizCorrect: number; quizTotal: number;
    savedRoutes: Array<{ edgeIds: string[]; name: string }>;
  }> };
  zoneCoverage: Record<string, { available: boolean; streetNames: string[]; safeDestinationNodeIds: string[] }>;
  overlay: { loaded: boolean; renderedZoneIds: string[] };
}

async function state(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const snapshot = (window as unknown as { __FREMONT_GAME__: Snapshot }).__FREMONT_GAME__;
    const { vehicle, camera, paused, profile, zoneId, editorActive, route, challenge, quiz, progress, zoneCoverage, overlay } = snapshot;
    return { vehicle, camera, paused, profile, zoneId, editorActive, route, challenge, quiz, progress, zoneCoverage, overlay };
  });
}

async function openGame(page: Page, query = '') {
  // A relative URL intentionally preserves /fremontStreets/ in the base URL.
  await page.goto(`.${query ? `/${query}` : '/'}`);
  await page.waitForFunction(() => Boolean((window as unknown as { __FREMONT_GAME__?: unknown }).__FREMONT_GAME__));
  await expect(page.getByTestId('overhead-view')).toHaveAttribute('data-renderer-ready', 'true');
  await expect(page.getByTestId('overhead-view')).not.toHaveAttribute('data-renderer-error', /.+/);
}

test('production artifact contains all runtime assets and only serves the Pages subdirectory', async ({ request }) => {
  const files = await readdir('dist', { recursive: true, withFileTypes: true });
  const names = files.filter(file => file.isFile()).map(file => {
    const directory = file.parentPath.replaceAll('\\', '/').replace(/^dist\/?/, '');
    return `${directory ? `${directory}/` : ''}${file.name}`;
  });
  expect(names).toEqual(expect.arrayContaining(['index.html', 'favicon.svg', '.nojekyll', 'data/roads.json', 'data/zones.json', 'data/study-network.json']));
  expect(names.some(name => /^assets\/maplibre-gl-worker-.*\.mjs$/.test(name))).toBe(true);
  const html = await readFile('dist/index.html', 'utf8');
  const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  expect(references.length).toBeGreaterThanOrEqual(3);
  for (const reference of references) expect(reference).toMatch(/^\/fremontStreets\//);
  for (const name of names) {
    const response = await request.get(`${prefix}${name}`);
    expect(response.status(), name).toBe(200);
    const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
    expect(digest(await response.body()), `Built asset is served intact: ${name}`).toBe(digest(await readFile(`dist/${name}`)));
    if (/\.m?js$/.test(name)) expect(response.headers()['content-type']).toContain('text/javascript');
    if (/\.css$/.test(name)) expect(response.headers()['content-type']).toContain('text/css');
    if (/\.json$/.test(name)) expect(response.headers()['content-type']).toContain('application/json');
  }
  expect((await request.get('/')).status()).toBe(404);
  expect((await request.get('/data/roads.json')).status()).toBe(404);
  expect((await request.get('/fremontStreets/%2e%2e%2fpackage.json')).status()).toBe(404);
  expect((await request.get('/fremontStreets/missing.js')).status()).toBe(404);
  const redirect = await request.get('/fremontStreets', { maxRedirects: 0 });
  expect(redirect.status()).toBe(308);
  expect(redirect.headers().location).toBe(prefix);
});

test('static production game loads real Fremont roads, its MapLibre worker, and all three study areas', async ({ page, audit }) => {
  await openGame(page);
  const initial = await state(page);
  expect(initial.profile).toBe('QUICK');
  expect(initial.vehicle.position[0]).toBeGreaterThan(-122.1);
  expect(initial.vehicle.position[0]).toBeLessThan(-121.8);
  expect(initial.vehicle.position[1]).toBeGreaterThan(37.4);
  expect(initial.vehicle.position[1]).toBeLessThan(37.7);
  const graph = await page.evaluate(() => {
    const { graph } = (window as unknown as { __FREMONT_GAME__: { graph: { nodes: unknown[]; edges: Array<{ name: string }> } } }).__FREMONT_GAME__;
    return { nodes: graph.nodes.length, edges: graph.edges.length, names: [...new Set(graph.edges.map(edge => edge.name))] };
  });
  expect(graph.nodes).toBeGreaterThan(100);
  expect(graph.edges).toBeGreaterThan(100);
  expect(graph.names).toContain('Fremont Boulevard');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect.poll(() => audit.workers.some(url => /\/fremontStreets\/assets\/maplibre-gl-worker-.*\.mjs$/.test(url))).toBe(true);
  expect(audit.requests.some(url => new URL(url).pathname === `${prefix}data/roads.json` && new URL(url).searchParams.has('v'))).toBe(true);
  expect(audit.requests.some(url => new URL(url).pathname === `${prefix}data/zones.json` && new URL(url).searchParams.has('v'))).toBe(true);
  for (const id of ['zone1', 'zone2', 'zone3']) {
    await page.getByTestId('zone-select').selectOption(id);
    await expect.poll(async () => (await state(page)).overlay.renderedZoneIds).toContain(id);
    const selected = await state(page);
    expect(selected.zoneId).toBe(id);
    expect(selected.zoneCoverage[id].available).toBe(true);
    expect(selected.zoneCoverage[id].streetNames.length).toBeGreaterThan(0);
    await expect(page.locator('#mode-navigation')).toBeEnabled();
    await expect(page.locator('#mode-quiz')).toBeEnabled();
  }
});

test('driving and both cameras work from static files without changing paused vehicle or route state', async ({ page }) => {
  await openGame(page);
  await page.locator('#mode-navigation').click();
  await page.getByTestId('challenge-start').click();
  await expect.poll(async () => (await state(page)).route).not.toBeNull();
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await state(page)).vehicle.speed).toBeGreaterThan(8);
  await expect.poll(async () => (await state(page)).vehicle.totalDistance).toBeGreaterThan(20);
  await page.keyboard.up('ArrowUp');
  await page.getByTestId('pause-toggle').click();
  await expect.poll(async () => (await state(page)).paused).toBe(true);
  const before = await state(page);
  await page.getByTestId('camera-toggle').click();
  await expect(page.getByTestId('driver-view')).toBeVisible();
  await expect(page.getByTestId('driver-view')).toHaveAttribute('data-renderer-ready', 'true');
  await expect(page.getByTestId('driver-view').locator('canvas')).toBeVisible();
  const driver = await state(page);
  expect(driver.camera).toBe('driver');
  expect(driver.vehicle).toEqual(before.vehicle);
  expect(driver.route).toEqual(before.route);
  expect(driver.progress).toEqual(before.progress);
  await page.locator('#camera-overhead').click();
  await expect(page.getByTestId('overhead-view')).toBeVisible();
  const overhead = await state(page);
  expect(overhead.camera).toBe('overhead');
  expect(overhead.vehicle).toEqual(before.vehicle);
  expect(overhead.route).toEqual(before.route);
  expect(overhead.progress).toEqual(before.progress);
});

test('all zones support quizzes, real navigation routes, saved routes, and persistent progress in production', async ({ page }) => {
  test.setTimeout(90_000);
  await openGame(page);
  const quizPlayed=new Set<string>();
  for (const id of ['zone1', 'zone2', 'zone3']) {
    await page.getByTestId('zone-select').selectOption(id);
    await page.locator('#mode-quiz').click();
    const selected = await state(page);
    if(selected.quiz.street){
    quizPlayed.add(id);
    expect(selected.quiz.street).toBeTruthy();
    expect(selected.zoneCoverage[id].streetNames).toContain(selected.quiz.street);
    expect(selected.quiz.choices.every(name => selected.zoneCoverage[id].streetNames.includes(name))).toBe(true);
    await page.locator('#quiz').getByRole('button', { name: selected.quiz.street, exact: true }).click();
    expect((await state(page)).progress.zones[id].quizCorrect).toBe(1);
    }else{await expect(page.locator('#quiz')).toContainText('outside this study area');expect(selected.quiz.choices).toEqual([]);}
    await page.locator('#mode-navigation').click();
    await page.getByTestId('challenge-start').click();
    await expect.poll(async () => (await state(page)).route).not.toBeNull();
    const navigation = await state(page);
    expect(navigation.route!.edgeIds.length).toBeGreaterThan(3);
    expect(selected.zoneCoverage[id].safeDestinationNodeIds).toContain(navigation.challenge!.targetNode);
    await page.locator('#save-route').click();
    expect((await state(page)).progress.zones[id].savedRoutes).toHaveLength(1);
  }
  const saved = (await state(page)).progress;
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __FREMONT_GAME__?: unknown }).__FREMONT_GAME__));
  for (const id of ['zone1', 'zone2', 'zone3']) {
    await page.getByTestId('zone-select').selectOption(id);
    const restored = (await state(page)).progress.zones[id];
    expect(restored.quizCorrect).toBe(quizPlayed.has(id)?1:0);
    expect(restored.quizTotal).toBe(quizPlayed.has(id)?1:0);
    expect(restored.savedRoutes).toEqual(saved.zones[id].savedRoutes);
    await expect(page.locator('#metric-accuracy')).toHaveText(quizPlayed.has(id)?'100%':'—');
    await expect(page.locator('#metric-saved')).toHaveText('1');
    await page.locator('#saved-routes button').click();
    expect((await state(page)).route?.edgeIds).toEqual(saved.zones[id].savedRoutes[0].edgeIds);
  }
});

test('developer boundary editor remains unavailable in the public production build', async ({ page }) => {
  await openGame(page, '?zoneEditor=1');
  expect((await state(page)).editorActive).toBe(false);
  await expect(page.getByTestId('zone-editor')).toHaveCount(0);
  await expect(page.getByTestId('zone-vertex')).toHaveCount(0);
  await expect(page.getByTestId('zone-select')).toBeEnabled();
  await expect(page.locator('#throttle')).toBeEnabled();
});
