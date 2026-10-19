import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AUDIT_DIMENSIONS, applyIndependentClaims, classifyAuditRoute, unresolvedDimensions, type IndependentEvidence } from '../src/geographic-audit';
import { buildGraph, buildRouteTree, project, type RoadData } from '../src/core';
import { stationDeparture, POLICE_STATION } from '../src/departure';
import type { StudyNetwork } from '../src/study-network';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const audit = JSON.parse(read('docs/data/geographic-audit.json'));
const network = JSON.parse(read('public/data/study-network.json')) as StudyNetwork;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

test('nine-dimension evidence never turns a named intersection point into permission for a turn', () => {
  const evidence: IndependentEvidence = {
    schema: 1,
    sources: [{ id: 'official-point', provider: 'Fixture government record', url: 'https://example.test/point', retrievedAt: '2026-10-19', limitations: 'Location only; synthetic policy fixture.' }],
    claims: [{ id: 'named-point', subject: { kind: 'junction', id: 'junction-a' }, dimension: 'intersectionLocation', status: 'Verified', sourceIds: ['official-point'], scope: 'Named junction center location only', reason: 'Explicit point record; no traffic movement fields.' }],
  };
  const original = unresolvedDimensions('Fixture independent facts');
  const verified = applyIndependentClaims(original, 'junction', 'junction-a', evidence);
  assert.equal(verified.intersectionLocation.status, 'Verified');
  for (const dimension of AUDIT_DIMENSIONS.filter(dimension => dimension !== 'intersectionLocation')) assert.equal(verified[dimension].status, 'Unresolved');
  assert.equal(original.intersectionLocation.status, 'Unresolved', 'Applying evidence must not mutate another subject.');
  assert.equal(applyIndependentClaims(original, 'junction', 'junction-b', evidence).intersectionLocation.status, 'Unresolved');
  assert.throws(() => applyIndependentClaims(original, 'junction', 'junction-a', { ...evidence, sources: [] }), /source record/);
  const conflict = { ...evidence.claims[0], id: 'explicit-disagreement', status: 'Conflicted' as const };
  assert.equal(applyIndependentClaims(original, 'junction', 'junction-a', { ...evidence, claims: [...evidence.claims, conflict] }).intersectionLocation.status, 'Conflicted');
  const gap = { ...evidence.claims[0], id: 'remaining-evidence-gap', status: 'Unresolved' as const };
  assert.equal(applyIndependentClaims(original, 'junction', 'junction-a', { ...evidence, claims: [...evidence.claims, gap] }).intersectionLocation.status, 'Unresolved', 'A remaining evidence gap is not automatically a factual source conflict.');
  const priorConflict = { ...original, intersectionLocation: { status: 'Conflicted' as const, evidence: ['prior-disagreement'], scope: 'Previously conflicting location records', reason: 'An earlier applicable source disagrees.' } };
  const stillConflicted = applyIndependentClaims(priorConflict, 'junction', 'junction-a', evidence).intersectionLocation;
  assert.equal(stillConflicted.status, 'Conflicted', 'A favorable new claim cannot silently resolve an existing source conflict.');
  assert.ok(stillConflicted.evidence.includes('prior-disagreement')); assert.ok(stillConflicted.evidence.includes('official-point'));
  assert.match(stillConflicted.reason, /earlier applicable source disagrees/);
});

test('route status distinguishes software reachability, missing data, and an evidenced prohibition', () => {
  const common = { hasCoverage: true, graphReachable: true, independentlySupported: false };
  assert.equal(classifyAuditRoute(common), 'graph-reachable-partially-verified');
  assert.equal(classifyAuditRoute({ ...common, graphReachable: false }), 'unreachable-current-graph');
  assert.equal(classifyAuditRoute({ ...common, hasCoverage: false }), 'missing-geographic-coverage');
  assert.equal(classifyAuditRoute({ ...common, knownProhibition: { sourceIds: [], appliesToWholeRoute: true } }), 'graph-reachable-partially-verified');
  assert.equal(classifyAuditRoute({ ...common, knownProhibition: { sourceIds: ['restriction-record'], appliesToWholeRoute: false } }), 'graph-reachable-partially-verified');
  assert.equal(classifyAuditRoute({ ...common, knownProhibition: { sourceIds: ['restriction-record'], appliesToWholeRoute: true } }), 'blocked-known-restriction');
});

test('audit preserves every source hash and 38 curriculum entries, including all independent dimension scopes', () => {
  assert.equal(audit.pass2.entries.length, 38);
  assert.deepEqual(audit.pass2.entries.map((entry: any) => [entry.id, entry.label, entry.group]), network.entries.map(entry => [entry.id, entry.originalLabel, entry.group]));
  for (const file of audit.sourcePreservation) {
    assert.equal(file.before, file.after); assert.equal(file.after, sha(read(file.path))); assert.equal(file.unchanged, true);
  }
  for (const item of [...audit.pass2.entries, ...audit.pass2.junctions, ...audit.pass2.connectors, ...audit.pass1.connectorJunctions]) {
    assert.deepEqual(Object.keys(item.dimensions).sort(), [...AUDIT_DIMENSIONS].sort());
    for (const dimension of AUDIT_DIMENSIONS) {
      assert.ok(['Verified', 'Unresolved', 'Conflicted'].includes(item.dimensions[dimension].status));
      assert.ok(item.dimensions[dimension].scope); assert.ok(item.dimensions[dimension].reason);
    }
  }
  assert.equal(audit.counts.before.corroboratedDirectedSegments, 12279);
  assert.equal(audit.counts.after.corroboratedDirectedSegments, audit.counts.before.corroboratedDirectedSegments);
  assert.equal(audit.counts.after.geographicErrorsCorrected, 0);
});

test('directed matrix and headquarters samples account for inaccessible approaches without overstating legality', () => {
  assert.equal(audit.pass2.matrix.length, 38 * 37);
  const cells = new Map(audit.pass2.matrix.map((cell: any) => [`${cell.from}>${cell.to}`, cell]));
  assert.equal(cells.size, 38 * 37);
  for (const cell of audit.pass2.matrix) {
    assert.ok(cells.has(`${cell.to}>${cell.from}`));
    assert.equal(cell.status, 'graph-reachable-partially-verified');
    assert.ok(cell.route.sourceTransitionsValidated); assert.ok(cell.route.lengthMetres > 0);
    assert.match(cell.route.edgeIdsSha256, /^[a-f0-9]{64}$/); assert.ok(cell.route.unresolvedMovementCount > 0);
    assert.ok(network.entries.find(entry => entry.id === cell.from)!.edgeIds.includes(cell.route.sourceEdge));
    assert.ok(network.entries.find(entry => entry.id === cell.to)!.edgeIds.includes(cell.route.destinationEdge));
  }
  assert.equal(audit.pass1.headquarters.length, 38);
  const samples = audit.pass1.headquarters.flatMap((entry: any) => entry.approaches);
  assert.equal(samples.length, 256);
  assert.equal(samples.filter((sample: any) => !sample.outbound.route || !sample.return.route).length, 11);
  assert.equal(audit.counts.after.independentlySupportedHQRoutes, 0);
  assert.equal(audit.counts.after.independentlySupportedRoadToRoadRoutes, 0);
});

test('independent City and bridge records improve only the scoped location and grade facts', () => {
  const evidence = JSON.parse(read('data-sources/geographic-evidence.json'));
  const catalog = JSON.parse(read('data-sources/independent-junctions/city-study-intersections.geojson'));
  const protectedProjects = JSON.parse(read('data-sources/independent-junctions/city-protected-intersections.geojson'));
  const bridges = JSON.parse(read('data-sources/independent-junctions/nbi-fremont-bridges.geojson'));
  const citySource = evidence.sources.find((source: any) => source.id === 'city-intersection-catalog-2023');
  assert.match(citySource.url, /Intersections\/FeatureServer\/0$/);
  assert.equal(citySource.sourceFile, 'city-study-intersections.geojson');
  assert.equal(citySource.sha256, sha(read(`data-sources/independent-junctions/${citySource.sourceFile}`)));
  assert.equal(citySource.derivedFromSnapshots.length, 8);
  for (const snapshot of citySource.derivedFromSnapshots) assert.equal(snapshot.sha256, sha(read(`data-sources/independent-junctions/${snapshot.file}`)));
  const bridgeSource = evidence.sources.find((source: any) => source.id === 'usdot-fhwa-nbi-2025');
  assert.equal(bridgeSource.datasetAsOf, '2025-06-20');
  assert.match(bridgeSource.dataModifiedAt, /^2025-08-11/);
  assert.equal(bridgeSource.publishedAt, undefined, 'Service edit metadata is not independently established as a publication or observation date.');
  const subjectIds = new Set(audit.pass2.junctions.map((junction: any) => junction.id));
  const namedPoints = evidence.associations.filter((association: any) => association.kind === 'city-location' && subjectIds.has(association.subject));
  assert.equal(namedPoints.length, audit.counts.after.independentlySupportedIntersectionLocations);
  for (const association of evidence.associations) {
    const source = association.kind === 'city-location' ? catalog.features.find((feature: any) => feature.properties.OBJECTID === association.sourceObjectId)
      : association.kind === 'implemented-protected-intersection' ? protectedProjects.features.find((feature: any) => feature.properties.OBJECTID === association.sourceObjectId)
        : bridges.features.find((feature: any) => feature.properties.STRUCTURE_NUMBER_008 === association.structureNumber);
    assert.ok(source); assert.deepEqual(association.sourcePosition, source.geometry.coordinates);
    const a = project(association.sourcePosition), b = project(association.graphPosition);
    assert.ok(Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - association.offsetMetres) < .01);
    assert.ok(association.offsetMetres <= (association.kind === 'bridge-grade-separation' ? 50 : 40));
    if (association.kind === 'implemented-protected-intersection') assert.equal(source.properties.Status, 'Implemented');
    if (association.kind === 'bridge-grade-separation') {
      assert.equal(association.facilityCarried, source.properties.FACILITY_CARRIED_007);
      assert.equal(association.featureBelow, source.properties.FEATURES_DESC_006A);
    }
  }
  assert.equal(audit.counts.after.uniqueImplementedProtectedIntersections, 6);
  assert.ok(audit.counts.after.independentlySupportedPhysicalConnections > audit.counts.after.uniqueImplementedProtectedIntersections);
  assert.ok(audit.counts.after.independentlyCorroboratedCrossingRecords > 0);
  for (const junction of audit.pass2.junctions) {
    assert.equal(junction.dimensions.maneuvers.status, 'Unresolved');
    assert.equal(junction.dimensions.vehicleAccess.status, 'Unresolved');
    assert.equal(junction.dimensions.oneWay.status, 'Unresolved');
  }
  assert.equal(audit.counts.after.individuallyVerifiedLegalMovements, 0);
});

test('real HQ route fingerprints and approximate departure reproduce from immutable directed source geometry', () => {
  const graph = buildGraph(JSON.parse(read('public/data/roads.json')) as RoadData);
  const departure = stationDeparture(graph);
  const reference = project(POLICE_STATION.position);
  assert.equal(departure.speed, 0);
  assert.equal(departure.edgeId, audit.station.edgeId);
  assert.deepEqual(departure.position, audit.station.departurePosition);
  assert.ok(Math.abs(Math.hypot(departure.metric.x - reference.x, departure.metric.y - reference.y) - audit.station.measuredOffsetMetres) < .01);
  assert.ok(audit.station.measuredOffsetMetres > 136 && audit.station.measuredOffsetMetres < 138);
  const preferred = new Set(network.entries.flatMap(entry => entry.edgeIds));
  const tree = buildRouteTree(graph, departure.edgeId, false, preferred);
  for (const entry of audit.pass1.headquarters) {
    const route = tree.routeTo(entry.representativeEdge)!;
    assert.equal(sha(JSON.stringify(route.edgeIds)), entry.outbound.route.edgeIdsSha256);
  }
  for (const crossing of audit.pass2.crossings) {
    const [a, b] = crossing.edgeIds.map((id: string) => graph.edges.get(id)!);
    assert.equal([a.from, a.to].some(node => node === b.from || node === b.to), false);
    assert.equal(crossing.graphConnection, false);
  }
  for (const transition of audit.pass2.freewayTransitions) {
    const a = graph.edges.get(transition.incoming)!, b = graph.edges.get(transition.outgoing)!;
    assert.equal(a.to, b.from); assert.equal(a.to, transition.nodeId);
    assert.ok([a.highway, b.highway].includes('motorway'));
    assert.ok([a.highway, b.highway].every(highway => highway === 'motorway' || highway === 'motorway_link'));
  }
});
