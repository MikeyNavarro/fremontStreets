import {closePanel,chooseMode,openPanel,saveCurrentRoute} from './ui-helpers';
import { expect, test, type Page } from '@playwright/test';

interface Snapshot {
  vehicle: {
    edgeId: string;
    previousEdgeId: string | null;
    distance: number;
    totalDistance: number;
    position: [number, number];
    speed: number;
    heading: number;
    [key: string]: unknown;
  };
  camera: string;
  paused: boolean;
  route: null | { edgeIds: string[]; nodeIds: string[]; distance: number };
  progress: {
    version: number;
    zones: Record<string, {
      streetNames: string[];
      intersectionIds: string[];
      challengesCompleted: number;
      quizCorrect: number;
      quizTotal: number;
      savedRoutes: Array<{ edgeIds: string[]; name: string }>;
      unguidedRoutesCompleted: number;
      recentStreets: string[];
    }>;
  };
  graph: {
    nodes: Array<{ id: string; position: [number, number] }>;
    edges: Array<{ id: string; from: string; to: string; name: string; heading: number }>;
  };
  challenge: null | { status: 'active' | 'complete'; targetNode: string };
  decision: null | {
    incomingEdgeId: string;
    distance: number;
    choices: Array<{ edgeId: string; kind: 'left' | 'right' | 'straight' | 'uturn' }>;
  };
}

async function state(page: Page, includeCurrentEdges = false): Promise<Snapshot> {
  return page.evaluate(withCurrentEdges => {
    const app = window as unknown as { __FREMONT_GAME__: Snapshot };
    const snapshot = app.__FREMONT_GAME__;
    return structuredClone({
      vehicle: snapshot.vehicle,
      camera: snapshot.camera,
      paused: snapshot.paused,
      route: snapshot.route,
      progress: snapshot.progress,
      // These assertions inspect only the driven transition, never the full graph.
      graph: {nodes:[],edges:withCurrentEdges?snapshot.graph.edges.filter(edge=>edge.id===snapshot.vehicle.edgeId||edge.id===snapshot.vehicle.previousEdgeId).map(({id,from,to,name,heading})=>({id,from,to,name,heading})):[]},
      challenge: snapshot.challenge,
      decision: snapshot.decision,
    });
  }, includeCurrentEdges);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean((window as unknown as { __FREMONT_GAME__?: unknown }).__FREMONT_GAME__));
  await closePanel(page);
});

test('starts with actual Fremont roads and selectable patrol study areas', async ({ page }) => {
  const snapshot = await state(page);
  // Assert inside the browser: transferring the complete 41 MB graph through
  // Playwright's protocol consumed 23 seconds locally and timed out in CI.
  const counts = await page.evaluate(() => {
    const graph = (window as unknown as { __FREMONT_GAME__: Snapshot }).__FREMONT_GAME__.graph;
    return { nodes: graph.nodes.length, edges: graph.edges.length };
  });
  expect(counts.nodes).toBeGreaterThan(100);
  expect(counts.edges).toBeGreaterThan(100);
  expect(snapshot.vehicle.position[0]).toBeGreaterThan(-122.1);
  expect(snapshot.vehicle.position[0]).toBeLessThan(-121.8);
  expect(snapshot.vehicle.position[1]).toBeGreaterThan(37.4);
  expect(snapshot.vehicle.position[1]).toBeLessThan(37.7);
  await openPanel(page,'zones');
  await expect(page.getByTestId('coverage')).toBeVisible();
  await expect(page.getByTestId('zone-select')).toHaveCount(1);
  await expect(page.getByTestId('zone-select')).toHaveValue('zone1');
  await expect(page.getByTestId('zone-select').locator('option')).toHaveCount(4);
  for (const zone of ['zone1', 'zone2', 'zone3']) {
    await expect(page.getByTestId('zone-select').locator(`option[value="${zone}"]`)).toBeEnabled();
  }
  await expect(page.getByTestId('overhead-view')).toBeVisible();
  await expect(page.getByTestId('overhead-view')).toHaveAttribute('data-renderer-ready', 'true');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
});

test('keyboard throttle drives the road graph and braking responds', async ({ page }) => {
  test.setTimeout(60_000);
  const start = await state(page);
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await state(page)).vehicle.speed).toBeGreaterThan(8);
  await expect.poll(async () => (await state(page)).vehicle.totalDistance, { timeout: 20_000 }).toBeGreaterThan(start.vehicle.totalDistance + 130);
  await expect.poll(async () => (await state(page)).progress.zones.all.intersectionIds.length, { timeout: 35_000 }).toBeGreaterThanOrEqual(2);
  await page.keyboard.up('ArrowUp');
  const moving = await state(page, true);
  expect(moving.vehicle.edgeId).not.toBe(start.vehicle.edgeId);
  expect(moving.vehicle.position).not.toEqual(start.vehicle.position);
  const incoming = moving.graph.edges.find(edge => edge.id === moving.vehicle.previousEdgeId)!;
  const current = moving.graph.edges.find(edge => edge.id === moving.vehicle.edgeId)!;
  expect(incoming.to).toBe(current.from);
  await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await state(page)).vehicle.speed).toBeLessThan(0.2);
  await page.keyboard.up('ArrowDown');
});

test('both rendered cameras use the same paused vehicle, route, and progress', async ({ page }) => {
  await chooseMode(page,'navigation');
  await page.getByTestId('challenge-start').click();
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await state(page)).vehicle.totalDistance).toBeGreaterThan(10);
  await page.keyboard.up('ArrowUp');
  await page.getByTestId('pause-toggle').click();
  await expect.poll(async () => (await state(page)).paused).toBe(true);
  const before = await state(page);
  await page.getByTestId('camera-toggle').click();
  await expect(page.getByTestId('driver-view')).toBeVisible();
  await expect(page.getByTestId('driver-view')).toHaveAttribute('data-renderer-ready', 'true');
  await expect(page.getByTestId('driver-view').locator('canvas')).toBeVisible();
  const after = await state(page);
  expect(after.camera).not.toBe(before.camera);
  expect(after.vehicle).toEqual(before.vehicle);
  expect(after.route).toEqual(before.route);
  expect(after.progress).toEqual(before.progress);
  await page.locator('#camera-overhead').click();
  await expect(page.getByTestId('overhead-view')).toBeVisible();
  expect((await state(page)).vehicle).toEqual(before.vehicle);
});

test('navigation creates a real route and exploration progress survives reload', async ({ page }) => {
  await chooseMode(page,'navigation');
  await page.getByTestId('challenge-start').click();
  await expect.poll(async () => (await state(page)).route).not.toBeNull();
  await saveCurrentRoute(page);
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await state(page)).vehicle.totalDistance).toBeGreaterThan(35);
  await page.keyboard.up('ArrowUp');
  await page.getByTestId('pause-toggle').click();
  const before = await state(page);
  expect(before.progress.zones.zone1.streetNames.length).toBeGreaterThan(0);
  expect(before.progress.zones.zone1.savedRoutes).toHaveLength(1);
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __FREMONT_GAME__?: unknown }).__FREMONT_GAME__));
  const restored = (await state(page)).progress.zones.zone1;
  expect(restored.streetNames).toEqual(expect.arrayContaining(before.progress.zones.zone1.streetNames));
  expect(restored.intersectionIds).toEqual(before.progress.zones.zone1.intersectionIds);
  expect(restored.savedRoutes).toEqual(before.progress.zones.zone1.savedRoutes);
  expect(restored.challengesCompleted).toBe(before.progress.zones.zone1.challengesCompleted);
  await openPanel(page,'routes');await page.locator('#saved-routes button').click();
  expect((await state(page)).route?.edgeIds).toEqual(before.progress.zones.zone1.savedRoutes[0].edgeIds);
  await chooseMode(page,'free');
  expect((await state(page)).route).toBeNull();
  expect((await state(page)).challenge).toBeNull();
});

test('a navigation challenge can be completed using driving controls', async ({ page }) => {
  test.setTimeout(120_000);
  await chooseMode(page,'navigation');
  await page.getByTestId('challenge-start').click();
  const initial = await state(page);
  expect(initial.route?.edgeIds.length).toBeGreaterThan(3);
  const route = initial.route!;
  let previousDecision = '';
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => {
    const snapshot = await state(page);
    if (snapshot.challenge?.status === 'complete') return true;
    const currentIndex = route.edgeIds.indexOf(snapshot.vehicle.edgeId);
    expect(currentIndex, 'Vehicle remains on the connected suggested route').toBeGreaterThanOrEqual(0);
    // Follow the same upcoming-junction information shown to the player.
    // Shape nodes must not overwrite an intersection turn queued early.
    const decision = snapshot.decision;
    if (decision && decision.incomingEdgeId !== previousDecision) {
      const index = route.edgeIds.indexOf(decision.incomingEdgeId);
      const nextId = route.edgeIds[index + 1];
      if (index >= 0 && nextId) {
        const choice = decision.choices.find(item => item.edgeId === nextId);
        expect(choice, 'Suggested route is selectable with the available turn controls').toBeDefined();
        previousDecision = decision.incomingEdgeId;
        if (choice!.kind === 'uturn') await page.locator('#turn-uturn').click();
        else if (choice!.kind === 'left') await page.keyboard.press('ArrowLeft');
        else if (choice!.kind === 'right') await page.keyboard.press('ArrowRight');
        else await page.locator('#turn-straight').click();
      }
    }
    return false;
  }, { timeout: 100_000, intervals: [100] }).toBe(true);
  await page.keyboard.up('ArrowUp');
  expect((await state(page)).progress.zones.all.challengesCompleted).toBe(1);
  await expect(page.locator('#mission')).toContainText('Destination reached');
});

test('street-name practice records demonstrated quiz accuracy', async ({ page }) => {
  const snapshot = await state(page, true);
  const street = snapshot.graph.edges.find(edge => edge.id === snapshot.vehicle.edgeId)!.name;
  expect(street.length).toBeGreaterThan(0);
  await chooseMode(page,'quiz');
  await page.locator('#quiz').getByRole('button', { name: street, exact: true }).click();
  await expect(page.locator('#metric-accuracy')).toHaveText('100%');
  const progress = (await state(page)).progress.zones.all;
  expect(progress.quizCorrect).toBe(1);
  expect(progress.quizTotal).toBe(1);
  expect(progress.challengesCompleted).toBe(0);
});
