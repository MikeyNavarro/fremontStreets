import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, isIntersection, isValidRoute, nextDecision, routeFromVehicle } from '../src/core/graph';
import { unproject } from '../src/core/projection';
import { createVehicle, stepVehicle } from '../src/core/simulation';
import {
  buildZoneCoverage, classifySegmentZones, pointZoneMembership, validateZoneGeometry,
  validateZoneManifest, zoneDocumentFromGeoJSON, zoneDocumentToGeoJSON,
} from '../src/core/zones';
import type { StudyZone, ZoneDocument } from '../src/core/zones';
import type { LonLat, RoadData, RoadGraph, Route, Turn } from '../src/core/types';
import { PatrolStudy } from '../src/patrol';
// Dependency-free source import tooling is intentionally JavaScript.
// @ts-expect-error The source-data utility has no TypeScript declaration file.
import { contentDigest } from '../scripts/extend-roads.mjs';

// These deliberately synthetic metre-scale geometries exercise geometry and
// topology in Fremont's fixed projection. They are never shipped as zone data.
const point = (x: number, y: number): LonLat => unproject({ x, y });
const ring = (west: number, south: number, east: number, north: number): LonLat[] =>
  [point(west, south), point(east, south), point(east, north), point(west, north), point(west, south)];
const polygon = (west: number, south: number, east: number, north: number) =>
  ({ type: 'Polygon' as const, coordinates: [ring(west, south, east, north)] });

function zone(id: string, west: number, south: number, east: number, north: number): StudyZone {
  return {
    id, name: `Synthetic ${id}`, status: 'partial', color: '#3366cc',
    geometry: polygon(west, south, east, north), boundaryVersion: 'synthetic-test-v1',
  };
}

function document(): ZoneDocument {
  return {
    metadata: {
      sourceUrl: 'https://www.fremontpolice.gov/about-us/about-fremont-police/police-zone-map',
      boundaryVersion: 'synthetic-test-v1', accuracy: 'approximate', geometrySource: 'calibrated-screenshot',
      screenshotReference: 'Synthetic unit-test calibration fixture; no real patrol boundary is represented.',
      digitizedAt: '2026-10-18',
      calibration: {
        method: 'Synthetic affine control points in the documented Fremont metric projection.',
        uncertaintyMeters: 50,
        controlPoints: [
          { image: [0, 0], geographic: point(-800, 800) },
          { image: [160, 0], geographic: point(800, 800) },
          { image: [0, 160], geographic: point(-800, -800) },
        ],
      },
      limitations: ['Synthetic test fixture only; not actual Fremont patrol-zone geometry.'],
    },
    zones: [zone('zone1', -800, -800, 0, 800), zone('zone2', 0, -800, 800, 800), zone('zone3', -800, -1800, 800, -800)],
  };
}

function graphFixture(): RoadGraph {
  const nodes: RoadData['nodes'] = {
    westA: point(-600, 100), westB: point(-200, 100),
    eastA: point(200, 100), eastB: point(600, 100),
    boundaryA: point(-20, 200), boundaryB: point(-20, 500),
  };
  return buildGraph({
    metadata: { purpose: 'Synthetic topology for boundary-classification tests only.' }, nodes,
    ways: [
      { id: 'west', nodes: ['westA', 'westB'], name: 'Synthetic west', highway: 'residential' },
      { id: 'crossing', nodes: ['westB', 'eastA'], name: 'Synthetic crossing', highway: 'residential' },
      { id: 'east', nodes: ['eastA', 'eastB'], name: 'Synthetic east', highway: 'residential' },
      { id: 'ambiguous', nodes: ['boundaryA', 'boundaryB'], name: 'Synthetic border', highway: 'residential' },
    ],
  });
}

function digestGraph(graph: RoadGraph): string {
  return createHash('sha256').update(JSON.stringify({
    nodes: [...graph.nodes], edges: [...graph.edges], outgoing: [...graph.outgoing],
    incoming: [...graph.incoming], restrictions: graph.restrictions,
    warnings: graph.warnings, metadata: graph.metadata,
  })).digest('hex');
}

test('valid Polygon, Polygon holes, and disjoint MultiPolygon retain geographic shape', () => {
  const withHole = { type: 'Polygon', coordinates: [ring(-500, -500, 500, 500), ring(-100, -100, 100, 100)] };
  const multiple = { type: 'MultiPolygon', coordinates: [[ring(-500, -500, -200, 500)], [ring(200, -500, 500, 500)]] };
  for (const geometry of [polygon(-500, -500, 500, 500), withHole, multiple]) {
    const result = validateZoneGeometry(geometry);
    assert.equal(result.valid, true, result.errors.join('; '));
    assert.deepEqual(result.errors, []);
  }
});

test('invalid polygon edits reject open, nonfinite, zero-area and intersecting rings', () => {
  const open = ring(-200, -200, 200, 200).slice(0, -1);
  const nonfinite = ring(-200, -200, 200, 200); nonfinite[1] = [Number.NaN, 37.55];
  const zeroArea = [point(-200, 0), point(0, 0), point(200, 0), point(-200, 0)];
  const bowtie = [point(-200, -200), point(200, 200), point(-200, 200), point(200, -200), point(-200, -200)];
  for (const coordinates of [open, nonfinite, zeroArea, bowtie]) {
    const result = validateZoneGeometry({ type: 'Polygon', coordinates: [coordinates] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0, 'Invalid edits must explain why they were rejected.');
  }
});

test('invalid polygon edits reject geometry outside the Fremont study region and exterior holes', () => {
  const elsewhere = { type: 'Polygon', coordinates: [[[-74, 40], [-73, 40], [-73, 41], [-74, 41], [-74, 40]]] };
  const exteriorHole = { type: 'Polygon', coordinates: [ring(-200, -200, 200, 200), ring(400, 400, 500, 500)] };
  for (const geometry of [elsewhere, exteriorHole, { type: 'LineString', coordinates: ring(-200, -200, 200, 200) }, null]) {
    assert.equal(validateZoneGeometry(geometry).valid, false);
  }
});

test('point membership honors holes, disjoint components and a metric uncertainty buffer', () => {
  const withHole: StudyZone = { ...zone('hole', -500, -500, 500, 500), geometry: { type: 'Polygon', coordinates: [ring(-500, -500, 500, 500), ring(-100, -100, 100, 100)] } };
  assert.equal(pointZoneMembership(point(300, 300), withHole, 50), 'inside');
  assert.equal(pointZoneMembership(point(0, 0), withHole, 50), 'outside');
  assert.equal(pointZoneMembership(point(120, 0), withHole, 50), 'uncertain');
  assert.equal(pointZoneMembership(point(480, 200), withHole, 50), 'uncertain');
  assert.equal(pointZoneMembership(point(520, 200), withHole, 50), 'uncertain');
  assert.equal(pointZoneMembership(point(600, 200), withHole, 50), 'outside');
  const multiple: StudyZone = { ...withHole, geometry: { type: 'MultiPolygon', coordinates: [[ring(-500, -500, -200, 500)], [ring(200, -500, 500, 500)]] } };
  assert.equal(pointZoneMembership(point(-350, 0), multiple, 50), 'inside');
  assert.equal(pointZoneMembership(point(350, 0), multiple, 50), 'inside');
  assert.equal(pointZoneMembership(point(0, 0), multiple, 50), 'outside');
});

test('a crossing street has separate memberships on both sides without changing coordinates', () => {
  const doc = document();
  const start = point(-300, 100), end = point(300, 100);
  const original = structuredClone({ start, end, doc });
  const classification = classifySegmentZones(start, end, doc);
  assert.deepEqual([...classification.zoneIds].sort(), ['zone1', 'zone2']);
  assert.equal(classification.crossesBoundary, true);
  assert.deepEqual({ start, end, doc }, original);
  const reverse = classifySegmentZones(end, start, doc);
  assert.deepEqual([...reverse.zoneIds].sort(), [...classification.zoneIds].sort());
  assert.deepEqual([...reverse.uncertainZoneIds].sort(), [...classification.uncertainZoneIds].sort());
});

test('near-border segments stay ambiguous rather than acquiring confident street assignments', () => {
  const doc = document();
  const result = classifySegmentZones(point(-20, 200), point(-20, 500), doc);
  assert.deepEqual(result.zoneIds, []);
  assert.deepEqual([...result.uncertainZoneIds].sort(), ['zone1', 'zone2']);
  const interior = classifySegmentZones(point(-600, 100), point(-200, 100), doc);
  assert.deepEqual(interior.zoneIds, ['zone1']);
  assert.deepEqual(interior.uncertainZoneIds, []);
  assert.equal(interior.crossesBoundary, false);
});

test('segment membership detects polygon interiors even when both endpoints are outside', () => {
  const doc = document();
  doc.zones = [zone('zone1', -100, -300, 100, 300)];
  doc.metadata.calibration!.uncertaintyMeters = 20;
  const result = classifySegmentZones(point(-500, 0), point(500, 0), doc);
  assert.deepEqual(result.zoneIds, ['zone1']);
  assert.equal(result.crossesBoundary, true);
});

test('zone coverage counts unique physical segments and keeps both legal edge directions', () => {
  const graph = graphFixture();
  const coverage = buildZoneCoverage(graph, document());
  assert.equal(graph.edges.size, 8);
  assert.equal(coverage.segments.size, 4, 'Opposite directions represent one physical street segment.');
  assert.deepEqual([...coverage.zones.zone1.segmentIds].sort(), ['crossing:0', 'west:0']);
  assert.deepEqual([...coverage.zones.zone2.segmentIds].sort(), ['crossing:0', 'east:0']);
  assert.deepEqual([...coverage.zones.zone1.edgeIds].sort(), ['crossing:0:f', 'crossing:0:r', 'west:0:f', 'west:0:r']);
  assert.deepEqual([...coverage.zones.zone1.streetNames].sort(), ['Synthetic crossing', 'Synthetic west']);
  assert.equal(coverage.zones.zone1.streetNames.includes('Synthetic border'), false);
  assert.ok(coverage.zones.zone1.ambiguousSegmentIds.includes('ambiguous:0'));
  assert.ok(coverage.zones.zone2.ambiguousSegmentIds.includes('ambiguous:0'));
  assert.equal(coverage.zones.zone1.coverage, 'partial');
  assert.equal(coverage.zones.zone2.coverage, 'partial');
  assert.equal(coverage.zones.zone3.coverage, 'none');
  assert.equal(coverage.zones.zone3.available, false);
});

test('zone destinations are safely inside the selected area and crossing-zone routes remain legal', () => {
  const graph = graphFixture();
  const doc = document();
  const coverage = buildZoneCoverage(graph, doc);
  assert.ok(coverage.zones.zone1.safeDestinationNodeIds.includes('westB'));
  assert.equal(coverage.zones.zone1.safeDestinationNodeIds.includes('eastA'), false);
  assert.equal(coverage.zones.zone1.safeDestinationNodeIds.includes('boundaryA'), false);
  for (const id of coverage.zones.zone1.safeDestinationNodeIds) {
    assert.equal(pointZoneMembership(graph.nodes.get(id)!.position, doc.zones[0], 50), 'inside');
  }
  const preferred = new Set(coverage.zones.zone2.edgeIds);
  const route = routeFromVehicle(graph, createVehicle(graph, 'west:0:f'), 'eastB', preferred);
  assert.ok(route, 'Study areas must not turn their boundaries into road walls.');
  assert.ok(isValidRoute(graph, ['west:0:f', ...route.edgeIds]));
  assert.ok(route.edgeIds.includes('crossing:0:f'));
});

test('classification and edited boundaries leave the complete source road graph unchanged', () => {
  const graph = graphFixture();
  const before = digestGraph(graph);
  const original = document();
  const originalSnapshot = structuredClone(original);
  const initial = buildZoneCoverage(graph, original);
  const edited = structuredClone(original);
  edited.zones[0].geometry = polygon(-800, -800, -300, 800);
  const updated = buildZoneCoverage(graph, edited);
  assert.notDeepEqual(updated.zones.zone1.segmentIds, initial.zones.zone1.segmentIds);
  assert.equal(digestGraph(graph), before, 'Boundary editing must never alter road nodes, edges or restrictions.');
  assert.deepEqual(original, originalSnapshot, 'Coverage previews must not mutate their source boundary document.');
});

test('approximate boundaries require their original source, calibration and uncertainty provenance', () => {
  const valid = document();
  const checked = validateZoneManifest(valid);
  assert.equal(checked.valid, true, checked.errors.join('; '));
  for (const field of ['sourceUrl', 'screenshotReference', 'digitizedAt', 'boundaryVersion', 'calibration'] as const) {
    const incomplete = structuredClone(valid) as unknown as { metadata: Record<string, unknown> };
    delete incomplete.metadata[field];
    assert.equal(validateZoneManifest(incomplete).valid, false, `Missing ${field} cannot pass provenance checks.`);
  }
  const noUncertainty = structuredClone(valid);
  noUncertainty.metadata.calibration!.uncertaintyMeters = -1;
  assert.equal(validateZoneManifest(noUncertainty).valid, false);
  const collinear = structuredClone(valid);
  collinear.metadata.calibration!.controlPoints = [
    { image: [0, 0], geographic: point(-100, 0) },
    { image: [50, 0], geographic: point(0, 0) },
    { image: [100, 0], geographic: point(100, 0) },
  ];
  assert.equal(validateZoneManifest(collinear).valid, false, 'Uncalibrated/degenerate screenshot transforms must be rejected.');
});

test('a screenshot-derived boundary cannot be promoted to verified official GIS geometry', () => {
  const doc = document();
  doc.metadata.accuracy = 'official';
  assert.equal(validateZoneManifest(doc).valid, false);
});

test('GeoJSON roundtrip preserves all zones, geometry, colors, versions and provenance', () => {
  const doc = document();
  const exported = zoneDocumentToGeoJSON(doc);
  const imported = zoneDocumentFromGeoJSON(JSON.parse(JSON.stringify(exported)));
  assert.deepEqual(imported, doc);
  assert.equal(validateZoneManifest(imported).valid, true);
  assert.throws(() => zoneDocumentFromGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: 'zone1' }, geometry: { type: 'LineString', coordinates: [point(0, 0), point(100, 0)] } }] }));
  assert.throws(() => zoneDocumentFromGeoJSON({ type: 'FeatureCollection', features: [] }));
  const invalid = zoneDocumentToGeoJSON(doc);
  invalid.features[0].geometry = { type: 'Polygon', coordinates: [[point(0, 0), point(100, 100), point(0, 100), point(100, 0), point(0, 0)]] };
  assert.throws(() => zoneDocumentFromGeoJSON(invalid), /self-intersects|zero area/);
});

test('malformed calibration input is rejected without throwing or accepting false provenance', () => {
  const malformed = document();
  malformed.metadata.calibration!.controlPoints = [null, null, null] as never;
  assert.doesNotThrow(() => validateZoneManifest(malformed));
  assert.equal(validateZoneManifest(malformed).valid, false);
});

const actualZones = JSON.parse(readFileSync(new URL('../public/data/zones.json', import.meta.url), 'utf8')) as ZoneDocument;
const actualRoads = JSON.parse(readFileSync(new URL('../public/data/roads.json', import.meta.url), 'utf8')) as RoadData;
const actualGraph = buildGraph(actualRoads);

test('all three shipped study boundaries retain the real historical City GIS source and screenshot comparison', () => {
  const validation = validateZoneManifest(actualZones);
  assert.equal(validation.valid, true, validation.errors.join('; '));
  assert.equal(actualZones.metadata.accuracy, 'approximate');
  assert.equal(actualZones.metadata.geometrySource, 'official-gis');
  assert.match(actualZones.metadata.sourceDatasetUrl!, /arcgis.*Police_Zones/);
  assert.match(actualZones.metadata.dataVersion!, /^2020-12-10T/);
  assert.match(actualZones.metadata.screenshotReference!, /screenshot/i);
  assert.equal(actualZones.metadata.calibration!.spatialReference, 'EPSG:4326');
  assert.equal(actualZones.metadata.calibration!.uncertaintyMeters, 75);
  assert.equal(actualZones.metadata.digitizedAt, null, 'Direct GIS geometry must not pretend to be digitized.');
  assert.ok(Number.isFinite(Date.parse(actualZones.metadata.importedAt!)));
  assert.deepEqual(actualZones.zones.map(item => item.id).sort(), ['zone1', 'zone2', 'zone3']);
  for (const sourceZone of actualZones.zones) {
    assert.ok(sourceZone.geometry);
    assert.equal(validateZoneGeometry(sourceZone.geometry).valid, true);
  }
});

test('actual zone coverage counts physical source segments and preserves the entire citywide graph', () => {
  const before = digestGraph(actualGraph);
  const coverage = buildZoneCoverage(actualGraph, actualZones);
  assert.equal(coverage.validation.valid, true);
  assert.equal(coverage.zones.zone1.segmentIds.length, 11275);
  assert.equal(coverage.zones.zone2.segmentIds.length, 1849);
  assert.equal(coverage.zones.zone3.segmentIds.length, 6632);
  assert.equal(coverage.zones.zone1.coverage, 'partial');
  assert.equal(coverage.zones.zone2.coverage, 'partial');
  assert.equal(coverage.zones.zone3.coverage, 'partial');
  assert.equal(coverage.zones.zone3.available, true);
  assert.ok(coverage.zones.zone1.ambiguousSegmentIds.length > 0);
  assert.ok(coverage.zones.zone2.ambiguousSegmentIds.length > 0);
  const edgesByZone = new Map(Object.entries(coverage.zones).map(([id, assigned]) => [id, new Set(assigned.edgeIds)]));
  for (const [id, assigned] of coverage.byEdge) {
    assert.ok(actualGraph.edges.has(id));
    for (const zoneId of assigned.zoneIds) assert.ok(edgesByZone.get(zoneId)!.has(id));
  }
  assert.equal(digestGraph(actualGraph), before);
  assert.equal(buildZoneCoverage(actualGraph, actualZones), coverage, 'Repeated previews reuse an immutable compiled result.');
});

test('the authorized Zone 3 append preserves every source object and graph edge from the playable baseline', () => {
  const snapshot = actualRoads.metadata!.baseSnapshot as {
    fileSha256: string;
    nodeIds: string[];
    wayIds: string[];
    restrictionIds: string[];
    unsupportedRestrictionIds: string[];
    canonicalSha256: Record<'nodes' | 'ways' | 'restrictions' | 'unsupportedRestrictions', string>;
    metadata: Record<string, unknown>;
  };
  assert.ok(snapshot, 'Append provenance must retain the original source inventory.');
  // Anchored to the executed git comparison against baseline commit 70223c0;
  // this permanent regression does not depend on a Git checkout at test time.
  assert.equal(snapshot.fileSha256, '939484ce421efd32a4f9c9625bbc8b32aa921d8aecbca01856744233f6d5ba12');
  assert.deepEqual(snapshot.canonicalSha256, {
    nodes: '416d2900246963eabe4363b1dc5dc68fbea895ad261c814311843f693f603fa2',
    ways: '9867dcce2dcd7a1f643fe4d1b09e1af69811754089dd46520b28060831c48b70',
    restrictions: 'dd902bd12f6b5bbaae32df7cf712071ba5b784989ae3be83f1ccc0b97c40425c',
    unsupportedRestrictions: 'c45acb4a490b7eb5317fbac699f382fcb0a00d089d5b4d6697aba013e242590c',
  });
  const wayMap = new Map(actualRoads.ways.map(way => [String(way.id), way]));
  const ruleMap = new Map(actualRoads.restrictions!.map(rule => [String(rule.id), rule]));
  const unsupportedMap = new Map(actualRoads.unsupportedRestrictions!.map(rule => [String(rule.id), rule]));
  const original: RoadData = {
    metadata: snapshot.metadata,
    nodes: Object.fromEntries(snapshot.nodeIds.map(id => [id, actualRoads.nodes[id]])),
    ways: snapshot.wayIds.map(id => wayMap.get(id)!),
    restrictions: snapshot.restrictionIds.map(id => ruleMap.get(id)!),
    unsupportedRestrictions: snapshot.unsupportedRestrictionIds.map(id => unsupportedMap.get(id)!),
  };
  for (const field of ['nodes', 'ways', 'restrictions', 'unsupportedRestrictions'] as const) assert.equal(contentDigest(original[field]), snapshot.canonicalSha256[field], `Preserved original ${field} changed.`);
  const originalGraph = buildGraph(original);
  assert.equal(originalGraph.edges.size, 18854);
  for (const [id, node] of originalGraph.nodes) assert.deepEqual(actualGraph.nodes.get(id), node);
  for (const [id, edge] of originalGraph.edges) assert.deepEqual(actualGraph.edges.get(id), edge);
});

test('all three actual zone practice starts offer a driveable navigation challenge within their safe interiors', () => {
  const study = new PatrolStudy(actualGraph, actualZones);
  const defaultEdge = actualGraph.edges.keys().next().value!;
  for (const zoneId of ['zone1', 'zone2', 'zone3']) {
    const spawn = study.startEdge(zoneId, defaultEdge);
    assert.ok(spawn, `${zoneId} must offer a source-road practice start.`);
    let vehicle = createVehicle(actualGraph, spawn);
    assert.ok(study.contains(vehicle.position, zoneId));
    const candidates = study.coverage.zones[zoneId].safeDestinationNodeIds.map(id => actualGraph.nodes.get(id)!).filter(node => {
      const distance = Math.hypot(node.x - vehicle.metric.x, node.y - vehicle.metric.y);
      return distance > 250 && distance < 950 && (actualGraph.outgoing.get(node.id)?.length ?? 0) > 2;
    }).sort((a, b) => Math.abs(Math.hypot(a.x - vehicle.metric.x, a.y - vehicle.metric.y) - 550) - Math.abs(Math.hypot(b.x - vehicle.metric.x, b.y - vehicle.metric.y) - 550));
    let route: Route | null = null;
    for (const candidate of candidates.slice(0, 60)) {
      const found = routeFromVehicle(actualGraph, vehicle, candidate.id, study.preferredEdges(zoneId));
      if (found && found.edgeIds.length > 3) { route = { ...found, edgeIds: [spawn, ...found.edgeIds] }; break; }
    }
    assert.ok(route, `${zoneId} needs a reachable, nontrivial real-road navigation challenge.`);
    assert.ok(isValidRoute(actualGraph, route.edgeIds));
    const destination = route.nodeIds.at(-1)!;
    assert.ok(study.safeDestination(zoneId, destination));
    let reached = false, routeIndex = 0;
    for (let frame = 0; frame < 60 * 600; frame++) {
      routeIndex = route.edgeIds.indexOf(vehicle.edgeId, Math.max(0, routeIndex - 1));
      assert.ok(routeIndex >= 0, `${zoneId} challenge left the planned driveable road route.`);
      const decision = nextDecision(actualGraph, vehicle);
      let turn: Turn | undefined;
      if (decision) {
        const index = route.edgeIds.indexOf(decision.incomingEdgeId, routeIndex);
        if (index >= routeIndex) turn = decision.choices.find(choice => choice.edgeId === route!.edgeIds[index + 1])?.kind;
      }
      vehicle = stepVehicle(actualGraph, vehicle, { throttle: true, brake: false, turn }, 1 / 60, { maxSpeedMph: 30, cornerAssist: true });
      if (vehicle.events.some(event => event.type === 'node' && event.id === destination)) { reached = true; break; }
    }
    assert.ok(reached, `${zoneId} destination must be reached using actual directional driving controls.`);
  }
});

test('zone-focused navigation reaches a safe real Zone 2 destination across the unchanged road network', () => {
  const coverage = buildZoneCoverage(actualGraph, actualZones);
  const startNode = [...actualGraph.nodes.values()].filter(node => (actualGraph.outgoing.get(node.id)?.length ?? 0) > 0).sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0];
  const initial = createVehicle(actualGraph, actualGraph.outgoing.get(startNode.id)![0]);
  const preferred = new Set(coverage.zones.zone2.edgeIds);
  const candidates = coverage.zones.zone2.safeDestinationNodeIds.map(id => actualGraph.nodes.get(id)!).filter(node => isIntersection(actualGraph, node.id)).sort((a, b) => Math.hypot(a.x - initial.metric.x, a.y - initial.metric.y) - Math.hypot(b.x - initial.metric.x, b.y - initial.metric.y));
  let route: Route | null = null;
  let destination = '';
  for (const node of candidates.slice(0, 40)) {
    const found = routeFromVehicle(actualGraph, initial, node.id, preferred);
    if (found && found.edgeIds.length > 3) {
      route = { ...found, edgeIds: [initial.edgeId, ...found.edgeIds] };
      destination = node.id;
      break;
    }
  }
  assert.ok(route, 'A covered patrol study area must offer a real reachable destination.');
  assert.ok(isValidRoute(actualGraph, route.edgeIds));
  const zone2 = actualZones.zones.find(item => item.id === 'zone2')!;
  assert.equal(pointZoneMembership(actualGraph.nodes.get(destination)!.position, zone2, 75), 'inside');
  let vehicle = initial;
  let reached = false;
  let routeIndex = 0;
  for (let frame = 0; frame < 60 * 600; frame++) {
    routeIndex = route.edgeIds.indexOf(vehicle.edgeId, Math.max(0, routeIndex - 1));
    assert.ok(routeIndex >= 0, 'Navigation must remain driveable through source intersections.');
    const decision = nextDecision(actualGraph, vehicle);
    let turn: Turn | undefined;
    if (decision) {
      const index = route.edgeIds.indexOf(decision.incomingEdgeId, routeIndex);
      if (index >= routeIndex) turn = decision.choices.find(choice => choice.edgeId === route!.edgeIds[index + 1])?.kind;
    }
    vehicle = stepVehicle(actualGraph, vehicle, { throttle: true, brake: false, turn }, 1 / 60, { maxSpeedMph: 30, cornerAssist: true });
    if (vehicle.events.some(event => event.type === 'node' && event.id === destination)) { reached = true; break; }
  }
  assert.ok(reached, 'Zone navigation is verified by driving to the destination, without repositioning the vehicle.');
});
