import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceSpeed, buildGraph, createChallenge, createGameState, createProgress, createVehicle,
  deserializeProgress, drivableOutgoing, findRoute, getZoneProgress, isValidRoute, legalOutgoing, loadProgress, MPH_TO_MPS, nextDecision,
  outgoingChoices, parseSpeedLimit, persistProgress, project, recordChallenge, recordExploration,
  recordQuiz, routeFromVehicle, savePracticeRoute, setCamera, stepVehicle, unproject, updateChallenge,
} from '../src/core/index';
import type { RoadData } from '../src/core/index';

function fixture(): RoadData {
  return {
    metadata: { purpose: 'Synthetic unit-test topology, never shipped as Fremont geography.' },
    nodes: {
      a: unproject({ x: 0, y: 0 }), m: unproject({ x: 0, y: 20 }),
      b: unproject({ x: 0, y: 40 }), c: unproject({ x: -100, y: 40 }),
      d: unproject({ x: 0, y: 200 }), e: unproject({ x: 100, y: 40 }),
    },
    ways: [
      { id: 'north', nodes: ['a', 'm', 'b', 'd'], name: 'Test north', highway: 'residential', maxspeed: '25 mph' },
      { id: 'west', nodes: ['b', 'c'], name: 'Test west', highway: 'residential' },
      { id: 'east', nodes: ['b', 'e'], name: 'Test east', highway: 'residential', oneway: 'yes' },
    ], restrictions: [],
  };
}

test('fixed Fremont projection round-trips and uses metres east/north', () => {
  const position: [number, number] = [-121.9821, 37.5502];
  const point = project(position);
  assert.ok(point.x > 500 && point.y > 100);
  const actual = unproject(point);
  assert.ok(Math.abs(actual[0] - position[0]) < 1e-10);
  assert.ok(Math.abs(actual[1] - position[1]) < 1e-10);
});

test('QUICK immediate throttle measures 0–30 in 2.5 s and 0–45 in 4–5 s', () => {
  let speed = 0;
  let time = 0;
  let thirty = 0;
  let fortyFive = 0;
  while (time < 6) {
    speed = advanceSpeed(speed, { throttle: true, brake: false }, 0.01);
    time += 0.01;
    if (!thirty && speed >= 30 * MPH_TO_MPS - 1e-7) thirty = time;
    if (!fortyFive && speed >= 45 * MPH_TO_MPS - 1e-7) fortyFive = time;
  }
  assert.ok(Math.abs(thirty - 2.5) < 0.03, `0–30 took ${thirty.toFixed(2)} seconds`);
  assert.ok(fortyFive >= 4 && fortyFive <= 5, `0–45 took ${fortyFive.toFixed(2)} seconds`);
  assert.ok(advanceSpeed(0, { throttle: true, brake: false }, 0.01) > 0);
});

test('NORMAL, QUICK, SPORT differ; configured cap never exceeds 55 mph', () => {
  const input = { throttle: true, brake: false };
  const normal = advanceSpeed(0, input, 1, { profile: 'NORMAL' });
  const quick = advanceSpeed(0, input, 1, { profile: 'QUICK' });
  const sport = advanceSpeed(0, input, 1, { profile: 'SPORT' });
  assert.ok(normal < quick && quick < sport);
  assert.ok(Math.abs(advanceSpeed(0, input, 30, { maxSpeedMph: 100 }) / MPH_TO_MPS - 55) < 1e-6);
  assert.ok(Math.abs(advanceSpeed(0, input, 30, { maxSpeedMph: 35 }) / MPH_TO_MPS - 35) < 1e-6);
});

test('braking responds immediately, slows smoothly and cannot reverse speed', () => {
  const start = 30 * MPH_TO_MPS;
  const next = advanceSpeed(start, { throttle: true, brake: true }, 0.1);
  assert.ok(next < start && next > start - 1);
  assert.equal(advanceSpeed(start, { throttle: false, brake: true }, 10), 0);
});

test('speed limits use source units and unknown values remain unknown', () => {
  assert.equal(parseSpeedLimit('35 mph'), 35);
  assert.ok(Math.abs(parseSpeedLimit('50')! - 31.0686) < 0.001);
  assert.equal(parseSpeedLimit('signals'), null);
  assert.equal(parseSpeedLimit('25;35'), null);
  assert.equal(parseSpeedLimit(undefined), null);
});

test('geometry crossing without shared OSM node never creates an intersection', () => {
  const graph = buildGraph({ nodes: { a: unproject({ x: -100, y: 0 }), b: unproject({ x: 100, y: 0 }), c: unproject({ x: 0, y: -100 }), d: unproject({ x: 0, y: 100 }) }, ways: [
    { id: 1, nodes: ['a', 'b'], highway: 'residential', tags: { bridge: 'yes', layer: '1' } },
    { id: 2, nodes: ['c', 'd'], highway: 'residential', tags: { layer: '0' } },
  ] });
  assert.equal(graph.nodes.size, 4);
  assert.equal(findRoute(graph, 'a', 'd'), null);
  let vehicle = createVehicle(graph, '1:0:f');
  vehicle = stepVehicle(graph, vehicle, { throttle: true, brake: false }, 15);
  assert.equal(graph.edges.get(vehicle.edgeId)?.wayId, '1');
  assert.ok(Math.abs(vehicle.metric.y) < 1e-6);
});

test('one-way, reverse one-way and private access are respected', () => {
  const data = fixture();
  data.ways.push({ id: 'reverse', nodes: ['e', 'd'], highway: 'residential', oneway: '-1' });
  data.ways.push({ id: 'private', nodes: ['c', 'd'], highway: 'service', tags: { access: 'private' } });
  const graph = buildGraph(data);
  assert.ok(graph.edges.has('east:0:f'));
  assert.equal(graph.edges.has('east:0:r'), false);
  assert.ok(graph.edges.has('reverse:0:r'));
  assert.equal(graph.edges.has('reverse:0:f'), false);
  assert.equal([...graph.edges.values()].some(edge => edge.wayId === 'private'), false);
  assert.equal(findRoute(graph, 'e', 'a'), null);
});

test('node-via no/only turn restrictions apply in simulation and first navigation turn', () => {
  const data: RoadData = { nodes: { a: unproject({ x: 0, y: 0 }), b: unproject({ x: 0, y: 100 }), c: unproject({ x: 100, y: 100 }), d: unproject({ x: 0, y: 200 }) }, ways: [
    { id: 'in', nodes: ['a', 'b'], highway: 'residential', oneway: 'yes' },
    { id: 'right', nodes: ['b', 'c'], highway: 'residential', oneway: 'yes' },
    { id: 'forward', nodes: ['b', 'd'], highway: 'residential', oneway: 'yes' },
  ], restrictions: [{ fromWay: 'in', toWay: 'right', viaNode: 'b', restriction: 'no_right_turn' }] };
  const graph = buildGraph(data);
  const incoming = graph.edges.get('in:0:f')!;
  assert.deepEqual(legalOutgoing(graph, incoming).map(edge => edge.wayId), ['forward']);
  assert.equal(routeFromVehicle(graph, createVehicle(graph, incoming.id), 'c'), null);
  const vehicle = stepVehicle(graph, createVehicle(graph, incoming.id, 99), { throttle: true, brake: false, turn: 'right' }, 2);
  assert.equal(graph.edges.get(vehicle.edgeId)?.wayId, 'forward');
  assert.equal(vehicle.pendingTurn, 'right');
  data.restrictions = [{ fromWay: 'in', toWay: 'right', viaNode: 'b', restriction: 'only_right_turn' }];
  const onlyGraph = buildGraph(data);
  assert.deepEqual(legalOutgoing(onlyGraph, onlyGraph.edges.get(incoming.id)!).map(edge => edge.wayId), ['right']);
});

test('unsupported via-way restriction geometry is excluded conservatively', () => {
  const data = fixture();
  data.unsupportedRestrictions = [{ id: 10, fromWay: 'north', toWay: 'east', viaWays: ['west'], reason: 'via-way unsupported' }];
  const graph = buildGraph(data);
  assert.equal([...graph.edges.values()].some(edge => edge.wayId === 'north' || edge.wayId === 'west'), false);
  assert.ok(graph.warnings.some(warning => warning.includes('excluded')));
});

test('same-way only-straight restriction cannot accidentally permit a reversal', () => {
  const data = fixture();
  data.restrictions = [{ fromWay: 'north', toWay: 'north', viaNode: 'b', restriction: 'only_straight_on' }];
  const graph = buildGraph(data);
  const choices = legalOutgoing(graph, graph.edges.get('north:1:f')!);
  assert.deepEqual(choices.map(edge => edge.id), ['north:2:f']);
  assert.equal(isValidRoute(graph, ['north:0:f', 'north:1:f', 'north:2:f']), true);
  assert.equal(isValidRoute(graph, ['north:1:f', 'east:0:f']), false);
  assert.equal(isValidRoute(graph, ['north:0:f', 'west:0:f']), false);
  assert.equal(isValidRoute(graph, []), false);
});

test('left turn request buffers past shape nodes and follows connected road', () => {
  const graph = buildGraph(fixture());
  const initial = { ...createVehicle(graph, 'north:0:f'), speed: 20 };
  const vehicle = stepVehicle(graph, initial, { throttle: false, brake: false, turn: 'left' }, 2.2);
  assert.equal(graph.edges.get(vehicle.edgeId)?.wayId, 'west');
  assert.equal(vehicle.pendingTurn, null);
  assert.ok(vehicle.metric.x < 0);
  assert.ok(Math.abs(vehicle.metric.y - 40) < 1e-6);
  assert.ok(vehicle.events.some(event => event.type === 'intersection' && event.id === 'b'));
  assert.ok(vehicle.events.some(event => event.name === 'Test west'));
  assert.equal(initial.distance, 0);
});

test('available turn choices reflect heading and legal directed outgoing roads', () => {
  const graph = buildGraph(fixture());
  const choices = outgoingChoices(graph, createVehicle(graph, 'north:1:f'));
  assert.equal(choices.find(choice => choice.name === 'Test west')?.kind, 'left');
  assert.equal(choices.find(choice => choice.name === 'Test east')?.kind, 'right');
  assert.ok(choices.some(choice => choice.kind === 'straight'));
});

test('buffered U-turn ignores a shape node and applies at a real junction', () => {
  const graph = buildGraph(fixture());
  const initial = { ...createVehicle(graph, 'north:0:f'), speed: 20 };
  const atShape = stepVehicle(graph, initial, { throttle: false, brake: false, turn: 'uturn' }, 1.2);
  assert.equal(atShape.edgeId, 'north:1:f');
  assert.equal(atShape.pendingTurn, 'uturn');
  const atJunction = stepVehicle(graph, atShape, { throttle: false, brake: false }, 1.1);
  assert.equal(atJunction.edgeId, 'north:1:r');
  assert.equal(atJunction.pendingTurn, null);
  assert.ok(atJunction.events.some(event => event.type === 'node' && event.id === 'b' && event.edgeId === 'north:1:f'));
});

test('navigation cannot use a shape-node U-turn that the driving controls cannot select', () => {
  const graph = buildGraph({ nodes: { a: unproject({ x: 0, y: 0 }), b: unproject({ x: 0, y: 50 }), c: unproject({ x: 0, y: 100 }) }, ways: [{ id: 'line', nodes: ['a', 'b', 'c'], highway: 'residential' }] });
  const vehicle = createVehicle(graph, 'line:0:f');
  const route = routeFromVehicle(graph, vehicle, 'a')!;
  assert.deepEqual(route.edgeIds, ['line:1:f', 'line:1:r', 'line:0:r']);
  assert.equal(isValidRoute(graph, ['line:0:f', 'line:0:r']), false);
});

test('next intersection looks through shape nodes without consuming a buffered turn or changing state', () => {
  const graph = buildGraph(fixture());
  const vehicle = { ...createVehicle(graph, 'north:0:f', 5), pendingTurn: 'left' as const };
  const snapshot = structuredClone(vehicle);
  const decision = nextDecision(graph, vehicle)!;
  assert.equal(decision.incomingEdgeId, 'north:1:f');
  assert.ok(Math.abs(decision.distance - 35) < 1e-6);
  assert.ok(decision.choices.some(choice => choice.edgeId === 'west:0:f' && choice.kind === 'left'));
  assert.deepEqual(vehicle, snapshot);
});

test('complex fork navigation uses only the same canonical directional choice as driving', () => {
  const data: RoadData = { nodes: { a: unproject({ x: 0, y: 0 }), b: unproject({ x: 0, y: 100 }), shallow: unproject({ x: -50, y: 190 }), rightAngle: unproject({ x: -100, y: 100 }) }, ways: [
    { id: 'in', nodes: ['a', 'b'], highway: 'residential', oneway: true },
    { id: 'shallow', nodes: ['b', 'shallow'], highway: 'residential', oneway: true },
    { id: 'square', nodes: ['b', 'rightAngle'], highway: 'residential', oneway: true },
  ] };
  const graph = buildGraph(data);
  const vehicle = createVehicle(graph, 'in:0:f', 99);
  assert.deepEqual(drivableOutgoing(graph, graph.edges.get(vehicle.edgeId)!).map(edge => edge.id), ['square:0:f']);
  assert.equal(routeFromVehicle(graph, vehicle, 'shallow'), null);
  assert.equal(routeFromVehicle(graph, vehicle, 'rightAngle')?.edgeIds[0], 'square:0:f');
  const turned = stepVehicle(graph, vehicle, { throttle: true, brake: false, turn: 'left' }, 2);
  assert.equal(turned.edgeId, 'square:0:f');
});

test('simulation remains on geometry and agrees across integration frame rates', () => {
  const graph = buildGraph(fixture());
  const initial = createVehicle(graph, 'north:0:f');
  const bigStep = stepVehicle(graph, initial, { throttle: true, brake: false }, 4);
  let smallSteps = initial;
  for (let i = 0; i < 240; i++) smallSteps = stepVehicle(graph, smallSteps, { throttle: true, brake: false }, 1 / 60);
  assert.ok(Math.abs(bigStep.totalDistance - smallSteps.totalDistance) < 0.05);
  assert.ok(Math.abs(bigStep.speed - smallSteps.speed) < 0.03);
  assert.ok(Math.abs(bigStep.metric.x) < 1e-6);
  assert.ok(bigStep.totalDistance > 40, 'must traverse several connected segments');
});

test('camera changes preserve vehicle, speed, heading, route and zone exactly', () => {
  const graph = buildGraph(fixture());
  const vehicle = stepVehicle(graph, createVehicle(graph, 'north:0:f'), { throttle: true, brake: false }, 1);
  const route = findRoute(graph, 'a', 'e')!;
  const initial = { ...createGameState(vehicle, 'zone-1'), activeRoute: route };
  const driver = setCamera(initial, 'driver');
  const overhead = setCamera(driver, 'overhead');
  assert.equal(driver.vehicle, initial.vehicle);
  assert.equal(overhead.vehicle, initial.vehicle);
  assert.equal(driver.activeRoute, route);
  assert.equal(driver.zoneId, 'zone-1');
  assert.deepEqual(overhead.vehicle, vehicle);
});

test('a connected multi-intersection navigation route can be completed after real travel', () => {
  const graph = buildGraph(fixture());
  const route = findRoute(graph, 'a', 'e')!;
  assert.deepEqual(route.nodeIds, ['a', 'm', 'b', 'e']);
  let challenge = createChallenge(route, false);
  for (const id of route.edgeIds) {
    const edge = graph.edges.get(id)!;
    challenge = updateChallenge(challenge, edge.from, edge.to, id);
  }
  assert.equal(challenge.completed, true);
  assert.equal(challenge.guidanceUsed, false);
  assert.equal(challenge.visitedEdgeIds.length, 3);
});

test('progress keeps exploration, quizzes, mastery, saved routes and zones distinct', () => {
  let progress = createProgress();
  progress = recordExploration(progress, 'zone-1', [{ type: 'street', id: 'A', name: 'A' }, { type: 'street', id: 'A', name: 'A' }, { type: 'intersection', id: 'n1' }]);
  progress = recordQuiz(recordQuiz(progress, 'zone-1', true), 'zone-1', false);
  progress = recordChallenge(progress, 'zone-1', false);
  progress = savePracticeRoute(progress, 'zone-1', { id: 'r1', name: 'Practice', edgeIds: ['x'], destinationNode: 'n2', savedAt: '2026-10-18T00:00:00Z' });
  const zone = getZoneProgress(progress, 'zone-1');
  assert.deepEqual(zone.streetNames, ['A']);
  assert.deepEqual(zone.intersectionIds, ['n1']);
  assert.equal(zone.quizCorrect / zone.quizTotal, 0.5);
  assert.equal(zone.unguidedRoutesCompleted, 1);
  assert.equal(zone.challengesCompleted, 1);
  assert.equal(zone.savedRoutes.length, 1);
  assert.equal(getZoneProgress(progress, 'zone-2').streetNames.length, 0);
  let stored: string | null = null;
  const storage = { getItem: () => stored, setItem: (_key: string, value: string) => { stored = value; } };
  assert.equal(persistProgress(storage, progress), true);
  assert.deepEqual(loadProgress(storage), progress);
});

test('damaged or unavailable local storage never crashes game state', () => {
  assert.deepEqual(deserializeProgress('{broken'), createProgress());
  assert.deepEqual(deserializeProgress('{"version":99}'), createProgress());
  const broken = { getItem: () => { throw new Error('unavailable'); }, setItem: () => { throw new Error('quota'); } };
  assert.deepEqual(loadProgress(broken), createProgress());
  assert.equal(persistProgress(broken, createProgress()), false);
  const invalid = deserializeProgress('{"version":1,"zones":{"all":{"quizCorrect":50,"quizTotal":2,"streetNames":[null],"savedRoutes":[{}]}}}');
  assert.equal(invalid.zones.all.quizCorrect, 2);
  assert.deepEqual(invalid.zones.all.streetNames, []);
  assert.deepEqual(invalid.zones.all.savedRoutes, []);
  assert.deepEqual(deserializeProgress('{"version":1,"zones":{"all":{"savedRoutes":[{"id":"bad","name":"bad","edgeIds":[],"destinationNode":"b","savedAt":"today"}]}}}').zones.all.savedRoutes, []);
});
