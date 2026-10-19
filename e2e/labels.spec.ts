import { test, expect, type Page } from '@playwright/test';
import { closePanel, openPanel, chooseMode } from './ui-helpers';

// Read-only diagnostics query MapLibre's actually rendered symbol features.
// Driving and camera changes below use the shipped controls and pointer gestures.
const mapState = (page: Page) => page.evaluate(() => (window as any).__FREMONT_GAME__.presentation.map);
const symbols = (page: Page) => page.evaluate(() => (window as any).__FREMONT_GAME__.mapLabels);
const names = async (page: Page): Promise<string[]> => (await symbols(page)).rendered.map((feature: any) => feature.name);
const world = ([longitude, latitude]: number[]) => [(longitude + 180) / 360, (1 - Math.log(Math.tan(latitude * Math.PI / 180) + 1 / Math.cos(latitude * Math.PI / 180)) / Math.PI) / 2];

async function drag(page: Page, dx: number, dy: number) {
  const box = (await page.locator('.maplibregl-canvas').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 12 });
  // Let the pointer settle before release so the fixed-view comparison does not
  // depend on pointer velocity and MapLibre's legitimate inertial panning.
  await page.waitForTimeout(200);
  await page.mouse.up();
  await expect.poll(async () => (await mapState(page)).followVehicle).toBe(false);
}

async function zoom(page: Page, target: number) {
  await openPanel(page, 'settings');
  await page.locator('#map-zoom').evaluate((element, value) => {
    (element as HTMLInputElement).value = String(value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, Math.max(13, target));
  await closePanel(page);
  await expect.poll(async () => Math.abs((await mapState(page)).zoom - Math.max(13, target))).toBeLessThan(.01);
  for (let step = 13; step > target; step--) {
    await page.locator('.maplibregl-ctrl-zoom-out').click();
    await expect.poll(async () => Math.abs((await mapState(page)).zoom - (step - 1))).toBeLessThan(.01);
  }
}

async function view(page: Page, center: [number, number], targetZoom: number) {
  if ((await mapState(page)).followVehicle) await drag(page, 35, 20);
  await zoom(page, 10);
  const previous = await mapState(page), from = world(previous.center), to = world(center), scale = 512 * 2 ** previous.zoom;
  await drag(page, (from[0] - to[0]) * scale, (from[1] - to[1]) * scale);
  await zoom(page, targetZoom);
  await expect.poll(async () => (await symbols(page)).tilesReady).toBe(true);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!(window as any).__FREMONT_GAME__);
  await expect(page.getByTestId('game-dialog')).toBeVisible();
  await closePanel(page);
  await expect(page.getByTestId('overhead-view')).toHaveAttribute('data-renderer-ready', 'true');
});

test('native road labels provide usable city and intermediate views at both viewport sizes', async ({ page }) => {
  test.setTimeout(120_000);
  await chooseMode(page, 'study');
  await closePanel(page);
  await view(page, [-121.974, 37.545], 10);
  for (const width of [1440, 1920]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 1080 });
    for (const level of [10, 11, 12, 13]) {
      if (level > 10) {
        await page.locator('.maplibregl-ctrl-zoom-in').click();
        await expect.poll(async () => Math.abs((await mapState(page)).zoom - level)).toBeLessThan(.01);
      } else if ((await mapState(page)).zoom > 10) await zoom(page, 10);
      await expect.poll(async () => (await symbols(page)).tilesReady).toBe(true);
      await expect.poll(async () => new Set(await names(page)).size).toBeGreaterThanOrEqual(2);
      await expect.poll(async () => {
        const rendered = (await symbols(page)).rendered;
        return new Set(rendered.filter((feature: any) => {
          const ids = typeof feature.curriculumIds === 'string' ? JSON.parse(feature.curriculumIds) : feature.curriculumIds;
          return ids?.length > 0 && feature.name && !['motorway', 'motorway_link'].includes(feature.highway);
        }).map((feature: any) => feature.name)).size;
      }).toBeGreaterThanOrEqual(level === 10 ? 1 : 3);
      const actual = await symbols(page);
      // MapLibre's tile feature IDs must round-trip to prepared chain IDs;
      // unpromoted string GeoJSON IDs were previously exposed as numeric zero.
      expect(actual.rendered.every((feature: any) => typeof feature.id === 'string' && feature.id.startsWith('road-label:'))).toBe(true);
      expect(actual.rendered.some((feature: any) => {
        const ids = typeof feature.curriculumIds === 'string' ? JSON.parse(feature.curriculumIds) : feature.curriculumIds;
        return ids?.length > 0;
      })).toBe(true);
      expect(actual.layers.every((layer: any) => layer.placement === 'line')).toBe(true);
      expect(actual.sourceFeatureCount).toBeGreaterThan(45);
      await expect(page.locator('.map-street-label')).toHaveCount(0);
    }
  }
});

test('Fremont Boulevard stays labeled across separated visible sections without rebuilding geometry', async ({ page }) => {
  test.setTimeout(120_000);
  await chooseMode(page, 'study');
  await closePanel(page);
  await view(page, [-121.9867167, 37.5476736], 15);
  await expect.poll(() => names(page)).toContain('Fremont Boulevard');
  const before = await mapState(page);
  await drag(page, 300, 350);
  await expect.poll(() => names(page)).toContain('Fremont Boulevard');
  const after = await mapState(page);
  expect(after.center).not.toEqual(before.center);
  expect(after.followVehicle).toBe(false);
  expect(after.labels.geometryBuilds).toBe(before.labels.geometryBuilds);
  expect(after.labels.sourceFeatureCount).toBe(before.labels.sourceFeatureCount);
});

test('Auto Mall Parkway and Durham Road render their separate source names at the real carriageways', async ({ page }) => {
  test.setTimeout(120_000);
  await chooseMode(page, 'study');
  await closePanel(page);
  await view(page, [-121.9394, 37.51475], 16);
  await expect.poll(() => names(page)).toContain('Auto Mall Parkway');
  await expect.poll(() => names(page)).toContain('Durham Road');
  const rendered = (await symbols(page)).rendered;
  for (const name of ['Auto Mall Parkway', 'Durham Road']) {
    const features = rendered.filter((feature: any) => feature.name === name);
    expect(features.length).toBeGreaterThan(0);
    expect(features.every((feature: any) => feature.label === name)).toBe(true);
  }
  expect(rendered.some((feature: any) => feature.label === 'Auto Mall Parkway / Durham Road')).toBe(false);
  await expect(page.locator('.map-street-label')).toHaveCount(0);
});

test('native symbols survive actual following, heading rotation and repeated camera returns', async ({ page }) => {
  test.setTimeout(120_000);
  await expect.poll(() => names(page)).toContain('Stevenson Boulevard');
  await expect.poll(async () => (await symbols(page)).rendered.some((feature: any) => feature.name === 'Stevenson Boulevard' && feature.priority === 1)).toBe(true);
  const builds = (await mapState(page)).labels.geometryBuilds;
  await openPanel(page, 'settings');
  await page.locator('#map-orientation').selectOption('heading');
  await closePanel(page);
  await expect.poll(async () => Math.abs((await mapState(page)).bearing)).toBeGreaterThan(1);
  const initial = await page.evaluate(() => (window as any).__FREMONT_GAME__.vehicle.totalDistance);
  await page.keyboard.down('w');
  try {
    await expect.poll(() => page.evaluate(() => (window as any).__FREMONT_GAME__.vehicle.totalDistance)).toBeGreaterThan(initial + 10);
  } finally { await page.keyboard.up('w'); }
  await page.getByTestId('pause-toggle').click();
  await expect.poll(() => names(page)).toContain('Stevenson Boulevard');
  await expect.poll(async () => (await symbols(page)).rendered.some((feature: any) => feature.name === 'Stevenson Boulevard' && feature.priority === 1)).toBe(true);
  await drag(page, 130, 60);
  const pose = await mapState(page);
  for (let iteration = 0; iteration < 2; iteration++) {
    await page.keyboard.press('c');
    await expect(page.getByTestId('driver-view')).toBeVisible();
    await page.keyboard.press('c');
    await expect(page.getByTestId('overhead-view')).toBeVisible();
    await expect.poll(async () => (await names(page)).length).toBeGreaterThan(0);
    const returned = await mapState(page);
    for (const property of ['center', 'zoom', 'bearing', 'pitch', 'followVehicle']) expect(returned[property]).toEqual(pose[property]);
  }
  expect((await mapState(page)).labels.geometryBuilds).toBe(builds);
});

test('label settings, hidden-answer quizzes and no-GPS street-name policy control every native layer', async ({ page }) => {
  test.setTimeout(120_000);
  await expect.poll(async () => (await names(page)).length).toBeGreaterThan(0);
  await page.locator('.street-explorer summary').click();
  await page.locator('#street-labels').uncheck();
  await expect.poll(async () => (await symbols(page)).rendered.length).toBe(0);
  expect((await symbols(page)).layers.every((layer: any) => layer.visibility === 'none')).toBe(true);
  await page.locator('#street-labels').check();
  await expect.poll(async () => (await names(page)).length).toBeGreaterThan(0);
  await page.getByTestId('open-learning').click();
  await page.locator('#learning-target').selectOption('ns04');
  await page.locator('#learning-identify').click();
  await expect.poll(async () => (await symbols(page)).rendered.length).toBe(0);
  expect((await symbols(page)).layers.every((layer: any) => layer.visibility === 'none')).toBe(true);
  await expect(page.locator('.street-card')).not.toBeVisible();
  await expect(page.locator('.street-explorer')).not.toBeVisible();
  await page.locator('[data-end]').click();
  await page.locator('#learning-nogps').click();
  await expect(page.getByTestId('learning-coach')).toContainText('No GPS');
  await expect.poll(async () => (await names(page)).length).toBeGreaterThan(0);
  expect((await symbols(page)).visible).toBe(true);
  await expect(page.locator('.street-card')).toBeVisible();
});
