import {closePanel,chooseMode,openPanel,selectZone,saveCurrentRoute} from './ui-helpers';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { ZoneDocument, ZoneRoadCoverage } from '../src/core/zones';

interface PatrolState {
  zoneId: string;
  zoneDocument: ZoneDocument;
  zoneCoverage: Record<string, ZoneRoadCoverage>;
  overlay: {
    loaded: boolean;
    sourceData: FeatureCollection<Polygon | MultiPolygon> | null;
    fillLayer: { paint: Record<string, unknown> } | null;
    borderLayer: unknown;
    renderedZoneIds: string[];
    vertexHandleCount: number;
  };
  quiz: { street: string; choices: string[] };
  progress: { zones: Record<string, { quizCorrect: number; quizTotal: number; savedRoutes: unknown[] }> };
  route: null | { edgeIds: string[]; nodeIds: string[] };
  challenge: null | { targetNode: string; status: string };
  editorActive: boolean;
}

async function patrolState(page: Page): Promise<PatrolState> {
  return page.evaluate(() => {
    const app = window as unknown as { __FREMONT_GAME__: PatrolState };
    const { zoneId, zoneDocument, zoneCoverage, overlay, quiz, progress, route, challenge, editorActive } = app.__FREMONT_GAME__;
    return { zoneId, zoneDocument, zoneCoverage, overlay, quiz, progress, route, challenge, editorActive };
  });
}

type ZoneExport = FeatureCollection<Polygon | MultiPolygon> & {
  metadata: {
    sourceUrl: string;
    boundaryVersion: string;
    screenshotReference: string;
    calibration: { method: string; uncertaintyMeters: number };
    [key: string]: unknown;
  };
};

async function openGame(page: Page, editor = false) {
  await page.goto(editor ? '/?zoneEditor=1' : '/');
  await page.waitForFunction(() => Boolean((window as unknown as { __FREMONT_GAME__?: unknown }).__FREMONT_GAME__));
  await expect(page.getByTestId('overhead-view')).toHaveAttribute('data-renderer-ready', 'true');
  if(!editor)await closePanel(page);
}

async function roadGraph(page: Page) {
  return page.evaluate(async () => {
    const app = window as unknown as { __FREMONT_GAME__: { graph: unknown } };
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(app.__FREMONT_GAME__.graph)));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  });
}

async function exportBoundaries(page: Page): Promise<ZoneExport> {
  const downloaded = page.waitForEvent('download');
  await page.getByTestId('zone-editor').locator('[data-action="export"]').click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^fremont-study-zones-.*\.geojson$/);
  const path = await download.path();
  if (!path) throw new Error('Boundary GeoJSON download was not saved.');
  return JSON.parse(await readFile(path, 'utf8')) as ZoneExport;
}

const geometries = (data: ZoneExport) => data.features.map(feature => feature.geometry);

async function dragBoundaryVertex(page: Page, original: ZoneExport) {
  await page.getByTestId('overhead-view').scrollIntoViewIfNeeded();
  const map = await page.getByTestId('overhead-view').boundingBox();
  if (!map) throw new Error('Overhead map is not visible.');
  const handles = await page.getByTestId('zone-vertex').evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    const node = element as HTMLElement;
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      index: Number(node.dataset.vertexIndex),
      ring: Number(node.dataset.ringIndex),
      polygon: Number(node.dataset.polygonIndex),
    };
  }));
  const candidates = handles.filter(handle => handle.x > map.x + 30 && handle.x < map.x + map.width - 30 && handle.y > map.y + 95 && handle.y < map.y + map.height - 75)
    .map(handle => {
      const geometry = original.features.find(feature => feature.properties?.id === 'zone1')!.geometry;
      const ring = geometry.type === 'Polygon' ? geometry.coordinates[handle.ring] : geometry.coordinates[handle.polygon][handle.ring];
      const coordinate = ring[handle.index];
      const adjacent = [ring[handle.index === 0 ? ring.length - 2 : handle.index - 1], ring[handle.index + 1]];
      const clearance = Math.min(...adjacent.map(other => Math.hypot((other[0] - coordinate[0]) * 88_000, (other[1] - coordinate[1]) * 111_000)));
      return { ...handle, clearance };
    }).sort((a, b) => b.clearance - a.clearance);
  expect(candidates.length, 'A boundary vertex is visible on the map').toBeGreaterThan(0);
  for (const vertex of candidates.slice(0, 5)) {
    await page.mouse.move(vertex.x, vertex.y);
    await page.mouse.down();
    await page.mouse.move(vertex.x + 5, vertex.y + 4, { steps: 5 });
    await page.mouse.up();
    const status = page.getByTestId('zone-editor').locator('[data-field="status"]');
    await expect(status).toContainText(/Valid edit|Edit rejected/);
    if ((await status.textContent())?.includes('Valid edit')) return;
  }
  throw new Error('No visible boundary vertex accepted a small valid drag.');
}

test('boundary editing stays disabled in ordinary gameplay', async ({ page }) => {
  await openGame(page);
  await expect(page.getByTestId('zone-editor')).toHaveCount(0);
  await expect(page.getByTestId('zone-vertex')).toHaveCount(0);
});

test('all three sourced study areas render the correct polygons without changing road connectivity', async ({ page }) => {
  await openGame(page);
  const originalGraph = await roadGraph(page);
  await expect(page.getByTestId('zone-notice')).toHaveText("Patrol-zone boundaries are approximate study areas based on the Fremont Police Department's published map. They are not verified official GIS boundaries.");
  for (const id of ['zone1', 'zone2', 'zone3'] as const) {
    await selectZone(page,id);
    await page.locator('#inspect-zone').click();
    await expect.poll(async () => (await patrolState(page)).overlay.renderedZoneIds).toContain(id);
    const selected = await patrolState(page);
    expect(selected.zoneId).toBe(id);
    expect(selected.overlay.loaded).toBe(true);
    expect(selected.overlay.borderLayer).not.toBeNull();
    expect(JSON.stringify(selected.overlay.fillLayer?.paint['fill-color'])).toContain('color');
    const zone = selected.zoneDocument.zones.find(item => item.id === id)!;
    const features = selected.overlay.sourceData?.features ?? [];
    expect(features).toHaveLength(1);
    expect(features[0].properties?.id).toBe(id);
    expect(features[0].properties?.color).toBe(zone.color);
    expect(features[0].geometry).toEqual(zone.geometry);
    expect(selected.zoneDocument.metadata.accuracy).toBe('approximate');
    expect(selected.zoneDocument.metadata.boundaryVersion).toBeTruthy();
    expect(selected.zoneDocument.metadata.calibration?.uncertaintyMeters).toBeGreaterThan(0);
    const coverage = selected.zoneCoverage[id];
    await expect(page.getByTestId('coverage')).toContainText(`${coverage.segmentIds.length} playable segments`);
    await expect(page.locator('#zone-coverage-description')).toContainText(coverage.available ? 'Partial road coverage' : 'Boundary study only');
    expect(await roadGraph(page)).toEqual(originalGraph);
  }
});

test('zone quizzes, navigation destinations, and saved progress follow actual zone coverage', async ({ page }) => {
  test.setTimeout(90_000);
  await openGame(page);
  const quizPlayed=new Set<string>();
  const played: string[] = [];
  for (const id of ['zone1', 'zone2', 'zone3']) {
    await selectZone(page,id);
    const area = (await patrolState(page)).zoneCoverage[id];
    if (!area.available) {
      await expect(page.locator('#mode-quiz')).toBeDisabled();
      await expect(page.locator('#mode-navigation')).toBeDisabled();
      expect((await patrolState(page)).route).toBeNull();
      continue;
    }
    played.push(id);
    await chooseMode(page,'quiz');
    const quiz = await patrolState(page);
    if(quiz.quiz.street){
    quizPlayed.add(id);
    expect(quiz.quiz.street.length).toBeGreaterThan(0);
    expect(quiz.quiz.choices.length).toBeGreaterThanOrEqual(2);
    expect(quiz.quiz.choices.every(name => area.streetNames.includes(name))).toBe(true);
    expect(await page.locator('#quiz button[data-answer]').allTextContents()).toEqual(quiz.quiz.choices);
    await page.locator('#quiz').getByRole('button', { name: quiz.quiz.street, exact: true }).click();
    expect((await patrolState(page)).progress.zones[id].quizCorrect).toBe(1);
    }else{await expect(page.locator('#quiz')).toContainText('outside this study area');expect(quiz.quiz.choices).toEqual([]);}
    await chooseMode(page,'navigation');
    await page.getByTestId('challenge-start').click();
    await expect.poll(async () => (await patrolState(page)).route).not.toBeNull();
    const navigation = await patrolState(page);
    expect(area.safeDestinationNodeIds).toContain(navigation.challenge!.targetNode);
    expect(navigation.route!.edgeIds.length).toBeGreaterThan(3);
    await saveCurrentRoute(page);
    expect((await patrolState(page)).progress.zones[id].savedRoutes).toHaveLength(1);
  }
  expect(played).toEqual(['zone1', 'zone2', 'zone3']);
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __FREMONT_GAME__?: unknown }).__FREMONT_GAME__));
  for (const id of played) {
    await selectZone(page,id);
    const restored = await patrolState(page);
    expect(restored.progress.zones[id].quizTotal).toBe(quizPlayed.has(id)?1:0);
    expect(restored.progress.zones[id].quizCorrect).toBe(quizPlayed.has(id)?1:0);
    expect(restored.progress.zones[id].savedRoutes).toHaveLength(1);
    await expect(page.locator('#metric-accuracy')).toHaveText(quizPlayed.has(id)?'100%':'—');
    await expect(page.locator('#metric-saved')).toHaveText('1');
  }
});

test('developer boundary edits validate, undo, discard, export, and preserve the driving graph', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page, true);
  const editor = page.getByTestId('zone-editor');
  await expect(editor).toBeVisible();
  await expect(page.getByTestId('zone-vertex').first()).toBeVisible();
  const originalGraph = await roadGraph(page);
  const original = await exportBoundaries(page);
  expect(original.features).toHaveLength(3);
  expect(original.metadata.sourceUrl).toContain('fremontpolice.gov');
  expect(original.metadata.screenshotReference.length).toBeGreaterThan(10);
  expect(original.metadata.calibration.method.length).toBeGreaterThan(10);
  expect(original.metadata.calibration.uncertaintyMeters).toBeGreaterThan(0);

  await dragBoundaryVertex(page, original);
  const edited = await exportBoundaries(page);
  expect(geometries(edited)).not.toEqual(geometries(original));
  expect(edited.metadata.boundaryVersion).not.toBe(original.metadata.boundaryVersion);
  expect(edited.metadata.sourceUrl).toBe(original.metadata.sourceUrl);
  expect(edited.metadata.screenshotReference).toBe(original.metadata.screenshotReference);
  expect(edited.metadata.calibration).toEqual(original.metadata.calibration);
  expect(await roadGraph(page)).toEqual(originalGraph);

  await editor.locator('[data-action="undo"]').click();
  expect(geometries(await exportBoundaries(page))).toEqual(geometries(original));
  await editor.locator('[data-action="vertex"]').selectOption('0:0:25');
  const longitude = page.getByTestId('zone-editor-longitude');
  const originalLongitude = Number(await longitude.inputValue());
  await longitude.fill('');
  await page.getByTestId('zone-editor-apply-vertex').click();
  await expect(editor.locator('[data-field="status"]')).toContainText('Edit rejected');
  expect(geometries(await exportBoundaries(page))).toEqual(geometries(original));
  await longitude.fill(String(originalLongitude + 0.000001));
  await page.getByTestId('zone-editor-apply-vertex').click();
  await expect(editor.locator('[data-field="status"]')).toContainText('Valid vertex adjustment');
  await editor.locator('[data-action="discard"]').click();
  expect(geometries(await exportBoundaries(page))).toEqual(geometries(original));

  const invalid = structuredClone(original);
  const geometry = invalid.features[0].geometry;
  const ring = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0][0];
  ring[0] = [ring[0][0], 95];
  ring[ring.length - 1] = [...ring[0]];
  await editor.locator('[data-action="import"]').setInputFiles({ name: 'invalid-study-zones.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(invalid)) });
  await expect(editor.locator('[data-field="status"]')).toContainText('Import rejected');
  expect(geometries(await exportBoundaries(page))).toEqual(geometries(original));

  await editor.locator('[data-action="import"]').setInputFiles({ name: 'edited-study-zones.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(edited)) });
  await expect(editor.locator('[data-field="status"]')).toContainText('imported');
  expect(geometries(await exportBoundaries(page))).toEqual(geometries(edited));
  await editor.locator('[data-action="revert"]').click();
  expect(geometries(await exportBoundaries(page))).toEqual(geometries(original));
  expect(await roadGraph(page)).toEqual(originalGraph);
});
