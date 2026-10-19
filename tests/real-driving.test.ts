import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGraph, createVehicle, drivableOutgoing, excludedRestrictionWays, isIntersection, isValidRoute, legalOutgoing,
  nearestNode, nextDecision, routeFromVehicle, selectNextEdge, stepVehicle,
} from '../src/core/index';
import type { RoadData, Route, Turn } from '../src/core/index';

const data = JSON.parse(readFileSync(new URL('../public/data/roads.json', import.meta.url), 'utf8')) as RoadData;
const graph = buildGraph(data);
const ways = new Map(data.ways.map(way => [String(way.id), way]));
const start = nearestNode(graph, [-121.9845, 37.5489])!;
const firstEdge = (graph.outgoing.get(start) ?? []).map(id => graph.edges.get(id)!).find(edge => edge.name)!;

test('all playable graph segments retain exact source OSM topology, road names and direction', () => {
  for (const edge of graph.edges.values()) {
    const [wayId, segmentString, direction] = edge.id.split(':');
    const way = ways.get(wayId)!;
    const segment = Number(segmentString);
    assert.ok(way, `No source way for ${edge.id}`);
    const pair = [String(way.nodes[segment]), String(way.nodes[segment + 1])];
    assert.deepEqual([edge.from, edge.to], direction === 'f' ? pair : pair.reverse());
    assert.equal(edge.name, way.name ?? way.tags?.name ?? '');
    assert.ok(edge.length > 0 && Number.isFinite(edge.heading));
    const raw = String(way.oneway ?? way.tags?.oneway ?? '').toLowerCase();
    if (['yes', '1', 'true'].includes(raw)) assert.equal(direction, 'f');
    if (['-1', 'reverse'].includes(raw)) assert.equal(direction, 'r');
  }
  const names = new Set([...graph.edges.values()].map(edge => edge.name));
  for (const name of ['Fremont Boulevard', 'Stevenson Boulevard', 'Paseo Padre Parkway', 'Mowry Avenue', 'Capitol Avenue', 'Liberty Street']) assert.ok(names.has(name), `Actual Fremont road ${name} must be present`);
});

test('actual node-via restrictions are honored and unsupported restriction ways remain excluded', () => {
  let checked = 0;
  for (const rule of data.restrictions ?? []) {
    const except = rule.tags?.except?.split(';').map(item => item.trim()) ?? [];
    if (except.some(value => ['vehicle', 'motor_vehicle', 'motorcar'].includes(value))) continue;
    for (const incomingId of graph.incoming.get(String(rule.viaNode)) ?? []) {
      const incoming = graph.edges.get(incomingId)!;
      if (incoming.wayId !== String(rule.fromWay)) continue;
      const outgoing = legalOutgoing(graph, incoming);
      if (rule.restriction === 'no_u_turn') assert.equal(outgoing.some(edge => edge.wayId === String(rule.toWay) && edge.to === incoming.from), false);
      else if (rule.restriction.startsWith('no_') && String(rule.fromWay) !== String(rule.toWay)) assert.equal(outgoing.some(edge => edge.wayId === String(rule.toWay)), false);
      else if (rule.restriction.startsWith('only_')) assert.ok(outgoing.every(edge => edge.wayId === String(rule.toWay)));
      checked++;
    }
  }
  assert.ok(checked >= 5);
  const omitted = excludedRestrictionWays(data);
  for (const edge of graph.edges.values()) assert.equal(omitted.has(edge.wayId), false);
  assert.ok(graph.warnings.length > 0);
});

test('two-minute real Fremont drive crosses multiple source intersections and stays exactly on roads', () => {
  let vehicle = createVehicle(graph, firstEdge.id);
  const intersections = new Set<string>();
  const streets = new Set([firstEdge.name]);
  for (let i = 0; i < 1200; i++) {
    vehicle = stepVehicle(graph, vehicle, { throttle: true, brake: false }, 0.1, { maxSpeedMph: 30, cornerAssist: true });
    const active = graph.edges.get(vehicle.edgeId)!;
    const from = graph.nodes.get(active.from)!;
    const to = graph.nodes.get(active.to)!;
    const t = vehicle.distance / active.length;
    assert.ok(t >= -1e-9 && t <= 1 + 1e-9);
    assert.ok(Math.abs(vehicle.metric.x - (from.x + (to.x - from.x) * t)) < 1e-6);
    assert.ok(Math.abs(vehicle.metric.y - (from.y + (to.y - from.y) * t)) < 1e-6);
    for (const event of vehicle.events) {
      if (event.type === 'intersection') intersections.add(event.id);
      if (event.type === 'street' && event.name) streets.add(event.name);
      if (event.type === 'node') assert.equal(graph.edges.get(event.edgeId!)!.to, event.id);
    }
  }
  assert.ok(vehicle.totalDistance > 1000);
  assert.ok(intersections.size >= 3, `Only ${intersections.size} source intersections traversed`);
  assert.ok(streets.size >= 3, `Only ${streets.size} named streets encountered`);
});

function realRoute(): Route {
  const vehicle = createVehicle(graph, firstEdge.id);
  for (const node of graph.nodes.values()) {
    const distance = Math.hypot(node.x - vehicle.metric.x, node.y - vehicle.metric.y);
    if (distance < 400 || distance > 900 || !isIntersection(graph, node.id)) continue;
    const route = routeFromVehicle(graph, vehicle, node.id);
    if (route && route.nodeIds.filter(id => isIntersection(graph, id)).length >= 3) return { ...route, edgeIds: [firstEdge.id, ...route.edgeIds], nodeIds: [firstEdge.from, ...route.nodeIds], distance: route.distance + firstEdge.length };
  }
  throw new Error('No playable real navigation route from the start.');
}

test('real navigation uses only canonical selectable road transitions, including the reported fork', () => {
  const route = realRoute();
  assert.ok(isValidRoute(graph, route.edgeIds));
  for (let i = 0; i < route.edgeIds.length - 1; i++) {
    const incoming = graph.edges.get(route.edgeIds[i])!;
    const outgoing = graph.edges.get(route.edgeIds[i + 1])!;
    assert.ok(drivableOutgoing(graph, incoming).some(edge => edge.id === outgoing.id));
    if (isIntersection(graph, incoming.to)) {
      const choice = nextDecision(graph, { edgeId: incoming.id, distance: 0 })!.choices.find(item => item.edgeId === outgoing.id)!;
      assert.ok(choice);
      assert.equal(selectNextEdge(graph, incoming, choice.kind).edge?.id, outgoing.id);
    }
  }
  // Regression from an executed browser challenge: two left branches where
  // the controller selects the branch nearer 90 degrees, unlike shortest path.
  const sundale = graph.edges.get('417095463:1:f');
  if (sundale && graph.edges.has('749343001:0:f') && graph.edges.has('417101748:0:f')) {
    assert.equal(selectNextEdge(graph, sundale, 'left').edge?.id, '417101748:0:f');
    assert.equal(drivableOutgoing(graph, sundale).some(edge => edge.id === '749343001:0:f'), false);
  }
});

test('actual navigation destination is reached using only buffered directional driving controls', () => {
  const route = realRoute();
  const target = route.nodeIds.at(-1)!;
  let vehicle = createVehicle(graph, firstEdge.id);
  let reached = false;
  let nextIndex = 0;
  for (let frame = 0; frame < 60 * 240; frame++) {
    const currentIndex = route.edgeIds.indexOf(vehicle.edgeId, Math.max(0, nextIndex - 1));
    assert.ok(currentIndex >= 0, `Driving left route at ${vehicle.edgeId}`);
    nextIndex = currentIndex;
    const decision = nextDecision(graph, vehicle);
    let turn: Turn | undefined;
    if (decision) {
      const decisionIndex = route.edgeIds.indexOf(decision.incomingEdgeId, currentIndex);
      const desired = route.edgeIds[decisionIndex + 1];
      if (decisionIndex >= currentIndex && desired) turn = decision.choices.find(choice => choice.edgeId === desired)?.kind;
    }
    vehicle = stepVehicle(graph, vehicle, { throttle: true, brake: false, turn }, 1 / 60, { maxSpeedMph: 30, cornerAssist: true });
    if (vehicle.events.some(event => event.type === 'node' && event.id === target)) { reached = true; break; }
  }
  assert.ok(reached, 'A real navigation challenge must be completable by driving, not by teleporting the vehicle.');
});
