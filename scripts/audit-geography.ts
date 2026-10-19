import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  buildGraph, buildRouteTree, drivableOutgoing, excludedRestrictionWays,
  isIntersection, isValidRoute, project, pointZoneMembership,
  type RoadData, type Route, type LonLat, type RoadWay,
} from '../src/core';
import { POLICE_STATION, stationDeparture } from '../src/departure';
import { canonicalRoadName, type StudyNetwork, type StudyJunction } from '../src/study-network';
import { fact, type VerificationRegistry } from '../src/training/verification';
import {
  applyIndependentClaims, classifyAuditRoute, unresolvedDimensions,
  type IndependentEvidence,
} from '../src/geographic-audit';
import { corroborateIndependentJunctions } from './corroborate-junctions';

const read = (path: string) => readFileSync(path, 'utf8');
const json = (path: string) => JSON.parse(read(path));
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const baseline = json('data-sources/geographic-audit-baseline.json');
const roads = json('public/data/roads.json') as RoadData;
const network = json('public/data/study-network.json') as StudyNetwork;
const registry = json('public/data/verification.json') as VerificationRegistry;
const city = json('data-sources/city-streets-full.geojson');
const zone1 = json('public/data/zones.json').zones.find((zone: {id: string}) => zone.id === 'zone1');
const evidencePath = 'data-sources/geographic-evidence.json';
const independent: IndependentEvidence = corroborateIndependentJunctions();
const preservation = Object.entries(baseline.files as Record<string, string>).map(([path, before]) => ({ path, before, after: hash(read(path)), unchanged: before === hash(read(path)) }));
if (preservation.some(file => !file.unchanged)) throw new Error('Audit baseline inputs changed. Review the correction and baseline explicitly; do not silently reuse this before snapshot.');
const graph = buildGraph(roads);
const departure = stationDeparture(graph);
const headquartersReturnAdjustment = graph.edges.get(departure.edgeId)!.length - departure.distance;
const wayById = new Map(roads.ways.map(way => [String(way.id), way]));
const evidenceByEntry = new Map(registry.entries.map(entry => [entry.id, entry]));
const entryByEdge = new Map<string, string>();
for (const entry of network.entries) for (const edge of entry.edgeIds) entryByEdge.set(edge, entry.id);
const primary = new Set(entryByEdge.keys());
const excludedWays = excludedRestrictionWays(roads);
const allRestrictions = [...roads.restrictions ?? [], ...roads.unsupportedRestrictions ?? []];
const restrictionIdsByWay = new Map<string, Set<string>>();
for (const restriction of allRestrictions) {
  for (const id of [restriction.fromWay, restriction.toWay, ...restriction.viaWays ?? []].filter(id => id !== undefined).map(String)) {
    const ids = restrictionIdsByWay.get(id) ?? new Set<string>();
    ids.add(String(restriction.id)); restrictionIdsByWay.set(id, ids);
  }
}
const round = (value: number) => Math.round(value * 100) / 100;
const distinct = <T>(values: T[]) => [...new Set(values)];
const wayTags = (way: RoadWay) => ({
  highway: way.highway ?? way.tags?.highway, name: way.name ?? way.tags?.name ?? '', ref: way.tags?.ref ?? null,
  bridge: way.tags?.bridge ?? null, tunnel: way.tags?.tunnel ?? null, layer: way.tags?.layer ?? null,
  oneway: way.oneway ?? way.tags?.oneway ?? null,
  directionRule: way.oneway ?? way.tags?.oneway ?? (way.highway === 'motorway' || way.tags?.junction === 'roundabout' ? 'implicit OSM one-way convention' : 'no one-way source tag'),
  access: way.tags?.motorcar ?? way.tags?.motor_vehicle ?? way.tags?.vehicle ?? way.tags?.access ?? null,
});
const junctionByNode = new Map(network.intersections.map(junction => [junction.nodeId, junction.id]));
type Use = { hqZone1: Set<string>; hqAll: Set<string>; matrix: Set<string> };
const nodeUse = new Map<string, Use>();
const connectorUse = new Map<string, Use>();
function useRecord(map: Map<string, Use>, id: string) {
  let use = map.get(id); if (!use) { use = { hqZone1: new Set(), hqAll: new Set(), matrix: new Set() }; map.set(id, use); } return use;
}
function trackUse(route: Route, id: string, pass: keyof Use) {
  for (const node of route.nodeIds) {
    if (junctionByNode.has(node) || isIntersection(graph, node)) useRecord(nodeUse, node)[pass].add(id);
  }
  for (const edgeId of route.edgeIds) if (!primary.has(edgeId)) useRecord(connectorUse, graph.edges.get(edgeId)!.wayId)[pass].add(id);
}
function sourceEdgeChecks(edgeIds: string[]) {
  return edgeIds.every(id => {
    const edge = graph.edges.get(id)!; const way = wayById.get(edge.wayId)!;
    const [, indexString, direction] = id.split(':'); const index = Number(indexString);
    const original = [String(way.nodes[index]), String(way.nodes[index + 1])];
    return direction === 'f' ? edge.from === original[0] && edge.to === original[1] : edge.from === original[1] && edge.to === original[0];
  });
}
function describeRoute(route: Route | null, hasCoverage: boolean, anchorAdjustment = 0) {
  if (!route) return { status: classifyAuditRoute({ hasCoverage, graphReachable: false, independentlySupported: false }), route: null };
  if (!isValidRoute(graph, route.edgeIds) || !sourceEdgeChecks(route.edgeIds)) throw new Error('A generated route violates source topology or the supported simulation transitions.');
  const movements = route.edgeIds.slice(1).map((id, index) => `${route.edgeIds[index]}>${id}`);
  const ways = distinct(route.edgeIds.map(id => graph.edges.get(id)!.wayId));
  const connectors = ways.filter(id => route.edgeIds.some(edgeId => graph.edges.get(edgeId)!.wayId === id && !primary.has(edgeId)));
  // Even an individually supported turn would not establish all road access,
  // geometry and grade facts of the complete route. No automatic promotion.
  return {
    status: classifyAuditRoute({ hasCoverage, graphReachable: true, independentlySupported: false }),
    route: {
      lengthMetres: round(Math.max(0, route.distance - anchorAdjustment)), edgeCount: route.edgeIds.length,
      sourceEdge: route.edgeIds[0], destinationEdge: route.edgeIds.at(-1), edgeIdsSha256: hash(JSON.stringify(route.edgeIds)),
      intersectionIds: distinct(route.nodeIds.flatMap(node => junctionByNode.get(node) ?? [])),
      connectorWayIds: connectors,
      connectorNames: distinct(connectors.map(id => wayById.get(id)!.name || `Unnamed OSM way ${id}`)),
      sourceRestrictionIdsTouchingRoute: distinct(ways.flatMap(id => [...restrictionIdsByWay.get(id) ?? []])),
      unresolvedMovementCount: movements.filter(id => registry.movements?.[id]?.status !== 'Verified').length,
      sourceTransitionsValidated: true,
      uncertainty: 'A computed route is not independent proof of real-world grade, public access, one-way currency or legal turning permission. Individual point records cannot verify the entire route.',
    },
  };
}

console.log(`Audit: ${graph.edges.size} directed edges, ${network.entries.length} preserved curriculum entries.`);
const forward = buildRouteTree(graph, departure.edgeId, false, primary);
const reverse = buildRouteTree(graph, departure.edgeId, true, primary);
const headquarters = network.entries.map(entry => {
  const target = entry.representativeEdge;
  const outbound = target ? forward.routeTo(target) : null;
  const inbound = target ? reverse.routeTo(target) : null;
  if (outbound) trackUse(outbound, `${entry.id}:outbound`, 'hqAll');
  if (inbound) trackUse(inbound, `${entry.id}:return`, 'hqAll');
  const localTarget = entry.zone1Location?.representativeEdge;
  const localOut = localTarget ? forward.routeTo(localTarget) : null;
  const localReturn = localTarget ? reverse.routeTo(localTarget) : null;
  if (localOut) trackUse(localOut, `${entry.id}:outbound`, 'hqZone1');
  if (localReturn) trackUse(localReturn, `${entry.id}:return`, 'hqZone1');
  const approaches = entry.approaches.map(approach => ({
    edgeId: approach.edgeId,
    outbound: describeRoute(forward.routeTo(approach.edgeId), graph.edges.has(approach.edgeId), departure.distance),
    return: describeRoute(reverse.routeTo(approach.edgeId), graph.edges.has(approach.edgeId), headquartersReturnAdjustment),
  }));
  return {
    entryId: entry.id, label: entry.originalLabel, representativeEdge: target,
    outbound: describeRoute(outbound, !!target && graph.edges.has(target), departure.distance),
    return: describeRoute(inbound, !!target && graph.edges.has(target), headquartersReturnAdjustment),
    zone1: localTarget ? {
      representativeEdge: localTarget,
      outbound: describeRoute(localOut, true, departure.distance), return: describeRoute(localReturn, true, headquartersReturnAdjustment),
    } : null,
    approaches,
  };
});
const matrix: Array<ReturnType<typeof describeRoute> & { from: string; to: string }> = [];
for (const from of network.entries) {
  const tree = from.representativeEdge ? buildRouteTree(graph, from.representativeEdge, false, primary) : null;
  for (const to of network.entries) {
    if (to.id === from.id) continue;
    const route = to.representativeEdge && tree ? tree.routeTo(to.representativeEdge) : null;
    if (route) trackUse(route, `${from.id}>${to.id}`, 'matrix');
    matrix.push({ from: from.id, to: to.id, ...describeRoute(route, !!from.representativeEdge && !!to.representativeEdge) });
  }
  console.log(`Directed reachability evaluated: ${from.id} ${from.originalLabel}`);
}

function counts(use: Use | undefined) {
  return { headquartersZone1Routes: use?.hqZone1.size ?? 0, headquartersAllRoutes: use?.hqAll.size ?? 0, roadToRoadRoutes: use?.matrix.size ?? 0 };
}
const cityByName = new Map<string, any[]>();
for (const feature of city.features) {
  const name = canonicalRoadName(feature.properties.ST_NAME ?? '');
  const list = cityByName.get(name) ?? []; list.push(feature); cityByName.set(name, list);
}
const cityLines = (feature: any): LonLat[][] => feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.type === 'MultiLineString' ? feature.geometry.coordinates : [];
function pointSegmentDistance(point: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}
function junctionAudit(junction: StudyJunction) {
  const evidence = registry.junctions.find(item => item.id === junction.id);
  const facts = unresolvedDimensions('Independent facts about this named physical junction, not inferred permissions for every approach.', [`osm:node=${junction.nodeId}`]);
  if (evidence) facts.identity = evidence.identity;
  const incoming = graph.incoming.get(junction.nodeId) ?? [];
  const outgoing = graph.outgoing.get(junction.nodeId) ?? [];
  const ways = distinct([...incoming, ...outgoing].map(id => graph.edges.get(id)!.wayId));
  const movementRecords = incoming.flatMap(incomingId => drivableOutgoing(graph, graph.edges.get(incomingId)!).map(outgoingEdge => ({
    id: `${incomingId}>${outgoingEdge.id}`, incomingEdge: incomingId, outgoingEdge: outgoingEdge.id,
    sourceNode: junction.nodeId, simulationSelectable: true,
    independentPermission: registry.movements?.[`${incomingId}>${outgoingEdge.id}`] ?? fact('Unresolved', 'This exact incoming-to-outgoing movement', 'Graph selection and absence of a restriction do not independently establish permission.', []),
  })));
  const cityNames = distinct(ways.flatMap(id => cityByName.get(canonicalRoadName(wayById.get(id)!.name ?? '')) ?? []));
  const point = project(junction.position);
  const nearEndpoints = cityNames.filter(feature => cityLines(feature).some(line => [line[0], line.at(-1)!].some(position => {
    const endpoint = project(position); return Math.hypot(point.x - endpoint.x, point.y - endpoint.y) <= 15;
  }))).map(feature => feature.properties.OBJECTID as number);
  const result = applyIndependentClaims(facts, 'junction', junction.id, independent);
  return {
    id: junction.id, logicalId: junction.logicalId, sourceNode: junction.nodeId, position: junction.position,
    studyEntryIds: junction.entryIds, names: distinct(ways.map(id => wayById.get(id)!.name ?? '').filter(Boolean)),
    inApproximateZone1Study: junction.inZone1Study, usage: counts(nodeUse.get(junction.nodeId)),
    dimensions: result,
    graphObservations: { incomingEdgeIds: incoming, outgoingEdgeIds: outgoing, sourceWays: ways.map(id => ({ id, ...wayTags(wayById.get(id)!) })), cityNamedEndpointObjectIdsWithin15m: distinct(nearEndpoints), restrictionIds: junction.restrictionIds, movements: movementRecords },
  };
}
const junctions = network.intersections.map(junctionAudit).sort((a, b) => b.usage.headquartersZone1Routes - a.usage.headquartersZone1Routes || b.usage.headquartersAllRoutes - a.usage.headquartersAllRoutes || b.usage.roadToRoadRoutes - a.usage.roadToRoadRoutes || a.id.localeCompare(b.id));
const connectorJunctions = [...nodeUse].filter(([node, use]) => use.hqZone1.size && !junctionByNode.has(node)).map(([node]) => {
  const incoming = graph.incoming.get(node) ?? [], outgoing = graph.outgoing.get(node) ?? [];
  return junctionAudit({ id: `osm-node-${node}`, logicalId: `osm-node-${node}`, nodeId: node, position: graph.nodes.get(node)!.position,
    entryIds: distinct([...incoming, ...outgoing].flatMap(edge => entryByEdge.get(edge) ?? [])), inZone1Study: pointZoneMembership(graph.nodes.get(node)!.position, zone1, 75) === 'inside',
    incomingEdgeIds: incoming, outgoingEdgeIds: outgoing, sourceWayIds: distinct([...incoming, ...outgoing].map(edge => graph.edges.get(edge)!.wayId)), movements: [],
    restrictionIds: graph.restrictions.filter(rule => String(rule.viaNode) === node).map(rule => String(rule.id)), status: 'HQ route connector junction; not an additional curriculum target.', connectionType: 'shared-node connector junction',
  });
}).sort((a, b) => b.usage.headquartersZone1Routes - a.usage.headquartersZone1Routes || a.id.localeCompare(b.id));

const graphEdgesByWay = new Map<string, string[]>();
for (const edge of graph.edges.values()) { const ids = graphEdgesByWay.get(edge.wayId) ?? []; ids.push(edge.id); graphEdgesByWay.set(edge.wayId, ids); }
const connectors = [...connectorUse].map(([id, use]) => {
  const way = wayById.get(id)!;
  const matchingCity = way.name ? cityByName.get(canonicalRoadName(way.name)) ?? [] : [];
  const segments = matchingCity.flatMap(feature => cityLines(feature).flatMap(line => line.slice(1).map((position, index) => ({ id: feature.properties.OBJECTID as number, a: project(line[index]), b: project(position) }))));
  const edgeIds = graphEdgesByWay.get(id) ?? [];
  const corroborated = edgeIds.filter(edgeId => {
    const edge = graph.edges.get(edgeId)!, a = graph.nodes.get(edge.from)!, b = graph.nodes.get(edge.to)!;
    const steps = Math.max(1, Math.ceil(edge.length / 10));
    for (let step = 0; step <= steps; step++) {
      const point = { x: a.x + (b.x - a.x) * step / steps, y: a.y + (b.y - a.y) * step / steps };
      if (!segments.some(segment => pointSegmentDistance(point, segment.a, segment.b) <= 15)) return false;
    }
    return true;
  });
  const dimensions = unresolvedDimensions('This supporting source way is a connector, never a new curriculum target.', [`osm:way=${id}`]);
  dimensions.identity = fact(matchingCity.length && way.name ? 'Verified' : 'Unresolved', 'Named identity of this connector way only', matchingCity.length && way.name ? 'Exact normalized source street name is present in the independent City street-name records.' : 'Unnamed or unmatched connector; retain its source ID without inventing a name.', matchingCity.map(feature => `city:OBJECTID=${feature.properties.OBJECTID}`).concat(`osm:way=${id}`));
  dimensions.geometry = fact(corroborated.length === edgeIds.length && edgeIds.length > 0 ? 'Verified' : 'Unresolved', 'Only the individually listed source edges have independent centerline corroboration.', `${corroborated.length}/${edgeIds.length} directed connector segments are within 15 m of corresponding City centerlines sampled every <=10 m. This does not establish at-grade connectivity or permissions.`, matchingCity.map(feature => `city:OBJECTID=${feature.properties.OBJECTID}`).concat(`osm:way=${id}`));
  return { sourceWayId: id, name: way.name ?? '', usage: counts(use), edgeIds, corroboratedEdgeIds: corroborated,
    sourceTags: wayTags(way), connectedStudyEntries: distinct(edgeIds.flatMap(edgeId => { const edge = graph.edges.get(edgeId)!; return [edge.from, edge.to].flatMap(node => [...graph.incoming.get(node) ?? [], ...graph.outgoing.get(node) ?? []].flatMap(id => entryByEdge.get(id) ?? [])); })),
    restrictionIds: [...restrictionIdsByWay.get(id) ?? []], dimensions: applyIndependentClaims(dimensions, 'connector', id, independent),
  };
}).sort((a, b) => b.usage.headquartersZone1Routes - a.usage.headquartersZone1Routes || b.usage.headquartersAllRoutes - a.usage.headquartersAllRoutes || b.usage.roadToRoadRoutes - a.usage.roadToRoadRoutes || a.sourceWayId.localeCompare(b.sourceWayId));

const crossingData = json('docs/data/study-intersections.json').unconnectedVisualCrossings as Array<{ edgeIds: string[]; sourceWayIds: string[]; entryIds: string[][]; position: LonLat; sourceTags: unknown[] }>;
const crossings = crossingData.map((crossing, index) => {
  const [first, second] = crossing.edgeIds.map(id => graph.edges.get(id)!);
  if (!first || !second || [first.from, first.to].some(node => node === second.from || node === second.to)) throw new Error('Crossing audit no longer matches the source graph.');
  return { id: `source-crossing-${index + 1}`, ...crossing, graphConnection: false,
    dimensions: applyIndependentClaims(unresolvedDimensions('Visual crossing without a shared source node. No new road connection is created.', crossing.sourceWayIds.map(id => `osm:way=${id}`)), 'crossing', `source-crossing-${index + 1}`, independent),
    sourceWays: crossing.sourceWayIds.map(id => ({ id, ...wayTags(wayById.get(id)!) })),
  };
});

const freewayEntries = network.entries.filter(entry => entry.ref === 'I 880' || entry.ref === 'I 680' || /Interstate (880|680)/.test(entry.originalLabel));
const freewayEdges = new Set(freewayEntries.flatMap(entry => entry.edgeIds));
const freewayTransitions: Array<{ nodeId: string; incoming: string; outgoing: string; freewayEntryId: string; connectionType: string; independentPermission: string }> = [];
for (const edge of graph.edges.values()) {
  for (const outgoing of drivableOutgoing(graph, edge)) {
    if (freewayEdges.has(edge.id) === freewayEdges.has(outgoing.id)) continue;
    const other = freewayEdges.has(edge.id) ? outgoing : edge;
    freewayTransitions.push({ nodeId: edge.to, incoming: edge.id, outgoing: outgoing.id,
      freewayEntryId: entryByEdge.get(freewayEdges.has(edge.id) ? edge.id : outgoing.id)!,
      connectionType: other.highway === 'motorway_link' ? 'source motorway ramp' : other.highway === 'motorway' ? 'source motorway continuation' : 'surface/freeway transition requiring source review',
      independentPermission: 'Unresolved; OSM connected topology and source directionality are preserved, but current legal access/turning evidence is not independently established.',
    });
  }
}
const entries = network.entries.map(entry => {
  const source = evidenceByEntry.get(entry.id)!;
  const dimensions = unresolvedDimensions('Complete imported corridor, not all real-world end-to-end road sections.', [`curriculum:${entry.id}`]);
  dimensions.identity = source.identity; dimensions.geometry = source.geometry;
  dimensions.topology = source.topology; dimensions.maneuvers = source.maneuvers;
  dimensions.reachability = fact('Unresolved', 'Independent real-world route legality versus separately computed source-graph reachability', 'The representative route and separate directed approach samples are evaluated in both directions. They do not establish every road section or actual legal access.', ['osm']);
  return { id: entry.id, label: entry.originalLabel, group: entry.group, names: entry.names, zones: entry.zones,
    representativeEdge: entry.representativeEdge, dimensions: applyIndependentClaims(dimensions, 'entry', entry.id, independent),
    totalDirectedSegments: entry.edgeIds.length, corroboratedDirectedSegments: source.segments.length,
    supportedSourceWays: entry.sourceWayIds, cityObjectIds: entry.cityObjectIds,
    coverage: entry.coverage,
  };
});
const stationOffset = Math.hypot(departure.metric.x - project(POLICE_STATION.position).x, departure.metric.y - project(POLICE_STATION.position).y);
const allJunctions = [...junctions, ...connectorJunctions];
const associations = json(evidencePath).associations as Array<{kind: string; subject: string; sourceObjectId?: number; structureNumber?: string}>;
const studyJunctionIds = new Set(junctions.map(junction => junction.id));
const studyLocationAssociations = associations.filter(item => item.kind === 'city-location' && studyJunctionIds.has(item.subject));
const studyImplementedAssociations = associations.filter(item => item.kind === 'implemented-protected-intersection' && studyJunctionIds.has(item.subject));
const after = {
  ...baseline.counts,
  relevantJunctions: junctions.length,
  additionalHQConnectorJunctions: connectorJunctions.length,
  independentlySupportedIntersectionLocations: junctions.filter(junction => junction.dimensions.intersectionLocation.status === 'Verified').length,
  independentlySupportedPhysicalConnections: junctions.filter(junction => junction.dimensions.topology.status === 'Verified').length,
  independentlySupportedGradeFacts: junctions.filter(junction => junction.dimensions.gradeSeparation.status === 'Verified').length,
  uniqueCityNamedIntersectionRecords: distinct(studyLocationAssociations.map(item => item.sourceObjectId)).length,
  uniqueImplementedProtectedIntersections: distinct(studyImplementedAssociations.map(item => item.sourceObjectId)).length,
  independentlyCorroboratedCrossingRecords: crossings.filter(crossing => crossing.dimensions.gradeSeparation.status === 'Verified').length,
  uniqueIndependentBridgeStructures: distinct(associations.filter(item => item.kind === 'bridge-grade-separation').map(item => item.structureNumber)).length,
  individuallyVerifiedLegalMovements: distinct(allJunctions.flatMap(junction => junction.graphObservations.movements.filter(movement => movement.independentPermission.status === 'Verified').map(movement => movement.id))).length,
  geographicErrorsCorrected: 0,
  junctionsWithUnresolvedManeuvers: junctions.filter(junction => junction.dimensions.maneuvers.status !== 'Verified').length,
  independentlySupportedHQRoutes: headquarters.flatMap(entry => [entry.outbound, entry.return]).filter(route => route.status === 'independently-supported').length,
  independentlySupportedRoadToRoadRoutes: matrix.filter(route => route.status === 'independently-supported').length,
  graphReachableDirectedPairs: matrix.filter(route => !!route.route).length,
  graphReachableHQRoutes: headquarters.flatMap(entry => [entry.outbound, entry.return]).filter(route => !!route.route).length,
  hqZone1RouteEvaluations: headquarters.filter(entry => entry.zone1).length * 2,
  sampledDirectedApproaches: headquarters.reduce((sum, entry) => sum + entry.approaches.length, 0),
  sampledApproachesNotRoundTripReachable: headquarters.flatMap(entry => entry.approaches).filter(approach => !approach.outbound.route || !approach.return.route).length,
  connectorWaysAudited: connectors.length,
  connectorWaysWithIdentityCorroboration: connectors.filter(connector => connector.dimensions.identity.status === 'Verified').length,
  connectorDirectedSegmentsCorroborated: connectors.reduce((sum, connector) => sum + connector.corroboratedEdgeIds.length, 0),
  nonconnectingVisualCrossingsAudited: crossings.length,
  freewayTransitionsAudited: freewayTransitions.length,
  freewaySurfaceTransitionsRequiringReview: freewayTransitions.filter(transition => transition.connectionType.startsWith('surface/')).length,
};
const audit = {
  schema: 1, version: `geographic-audit-v1-${hash(JSON.stringify(preservation) + JSON.stringify(independent) + 'nine-dimension-policy-v1').slice(0, 16)}`,
  evidenceVersion: registry.version, baselineCommit: baseline.baselineCommit,
  reproduction: 'npm run data:verify && npm run data:audit',
  independentEvidence: { file: evidencePath, sha256: existsSync(evidencePath) ? hash(read(evidencePath)) : null, sources: independent.sources, claims: independent.claims },
  sources: registry.sources, sourcePreservation: preservation,
  counts: { before: baseline.counts, after },
  station: { ...network.station, measuredOffsetMetres: round(stationOffset), userReportedOffsetMetres: 107,
    offsetResolution: 'The current pinned departure measures about 137 m from the retained OSM headquarters building reference in the documented local metric projection. The prompt\'s 107 m estimate is not reproduced. Both coordinates and the stopped public-road spawn remain unchanged; no driveway is inferred.',
    speedMetresPerSecond: departure.speed, sourceWay: wayById.get(graph.edges.get(departure.edgeId)!.wayId),
  },
  routePolicy: {
    anchor: 'Retained directed representative edge per entry; separate Zone 1 representatives and all 256 retained approach samples are reevaluated.',
    routing: 'Existing directed edge-state Dijkstra and drivableOutgoing; exact source topology, source one-way rules, supported restrictions, access exclusions and simulation-selectable turns. Study-road preference never creates edges.',
    length: 'Sum of source edge lengths. HQ outbound distances subtract the current departure offset along its edge; return distances subtract the unused final HQ edge portion. These are reproducible graph distances, not lane or driveway travel distances.',
    incomplete: 'Failure is labeled unreachable in the current graph unless missing coverage is explicit. Conservative exclusion of an unsupported restriction is not independent proof that every alternative route is prohibited.',
    independent: 'No end-to-end independently supported route is asserted. Every actual material connection, grade, access, direction and movement needs applicable evidence; named intersection points alone cannot satisfy this.',
  },
  pass1: { headquarters, priorityStudyJunctions: junctions.filter(junction => junction.usage.headquartersZone1Routes > 0), connectorJunctions },
  pass2: { entries, junctions, matrix, connectors, crossings, freewayTransitions },
  restrictions: { supportedSourceRecords: roads.restrictions?.length ?? 0, unsupportedSourceRecords: roads.unsupportedRestrictions?.length ?? 0,
    conservativeExcludedWayIds: [...excludedWays].sort(),
    unsupported: roads.unsupportedRestrictions,
    note: 'Source rules are retained and applied under the existing conservative graph policy. These source observations do not create independent permission records.',
  },
};
writeFileSync('docs/data/geographic-audit.json', JSON.stringify(audit) + '\n');
const metricLabels: Record<string, string> = {
  studyEntries: 'Study entries examined', corroboratedIdentities: 'Corroborated identities', corroboratedDirectedSegments: 'Corroborated directed study segments',
  wholeImportedGeometryEntries: 'Entries with every imported segment corroborated', partiallyCorroboratedEntries: 'Entries with partial corroboration',
  relevantJunctions: 'Study-junction source records audited', independentlySupportedIntersectionLocations: 'Source-node records associated with independently corroborated named locations',
  independentlySupportedPhysicalConnections: 'Source-node records associated with documented physical at-grade junctions', individuallyVerifiedLegalMovements: 'Individually verified legal movements',
  geographicErrorsCorrected: 'Confirmed geographic errors corrected', junctionsWithUnresolvedManeuvers: 'Study junction records with unresolved maneuvers',
  independentlySupportedHQRoutes: 'Independently supported HQ routes', independentlySupportedRoadToRoadRoutes: 'Independently supported road-to-road routes',
  graphReachableDirectedPairs: 'Graph-reachable directed representative pairs', unsupportedRestrictionRecords: 'Unsupported OSM restriction records',
};
const routeMarker = (route: ReturnType<typeof describeRoute>) => route.route ? 'G' : route.status === 'missing-geographic-coverage' ? 'M' : 'U';
const matrixMarkdown = `# Directed study-road connectivity matrix\n\nReproduce with \`npm run data:audit\`. ${audit.version}.\n\nG = graph-reachable, partially verified; I = independently supported; U = unreachable in current graph; M = missing geographic coverage; B = blocked by an independently supported applicable prohibition. A cell evaluates the retained directed representative only. Both directions are separate cells. See the JSON for distance, source edges, route hash, connectors, traversed study junctions and unresolved movement counts. Separate HQ approach checks prevent treating one representative as complete corridor coverage.\n\n| From / to | ${entries.map(entry => entry.id).join(' | ')} |\n|---|${entries.map(() => '---').join('|')}|\n${entries.map(from => `| ${from.id} | ${entries.map(to => from.id === to.id ? '—' : routeMarker(matrix.find(cell => cell.from === from.id && cell.to === to.id)!)).join(' | ')} |`).join('\n')}\n\n${entries.map(entry => `- ${entry.id}: ${entry.label}`).join('\n')}\n\nNo cell claims independently verified legal drivability. [Machine-readable audit](data/geographic-audit.json).\n`;
writeFileSync('docs/geographic-connectivity.md', matrixMarkdown);
const report = `# Geographic verification: headquarters and all 38 study entries\n\nAudit ${audit.version}; evidence ${registry.version}; reproduced baseline ${baseline.baselineCommit}. Run \`npm run data:verify && npm run data:audit\` offline against the committed source snapshots. Input hashes, source retrieval/version records, exact node/way IDs, nine separate evidence dimensions and route fingerprints are in [the machine-readable audit](data/geographic-audit.json).\n\n## Before and after\n\n| Measure | Reproduced before | After |\n|---|---:|---:|\n${Object.entries(metricLabels).map(([key, label]) => `| ${label} | ${baseline.counts[key]} | ${(after as Record<string, number>)[key]} |`).join('\n')}\n\nIncreased evidence coverage is not a correction of wrong geography. **No source road, graph connection, coordinate, curriculum mapping, zone polygon, HQ spawn or runtime scoring record was changed.** All baseline source hashes match. Software route validation is reported separately from independent geographic evidence.\n\n## Pass 1: HQ and approximate Zone 1\n\nThe stopped departure remains ${departure.edgeId}, ${JSON.stringify(departure.position)}, on Stevenson Boulevard. The existing projection measures **${round(stationOffset)} m**, approximately 137 m, from the retained building reference. The prompt's 107 m estimate is not reproduced. This is an approximate public-road departure, not a verified driveway.\n\nRecomputed ${after.hqZone1RouteEvaluations} Zone 1 departure/return evaluations and ${after.graphReachableHQRoutes} citywide representative HQ routes. Zone 1 is the historical approximate study boundary, not an official current jurisdiction claim. The route-use priority counts below identify the evidence review with greatest benefit to HQ training.\n\n| Priority named study junction | Source node | Zone 1 HQ paths using node | All HQ paths | Nine-dimension location / topology / maneuvers |\n|---|---|---:|---:|---|\n${junctions.filter(j => j.usage.headquartersZone1Routes).slice(0, 20).map(j => `| ${j.names.join(' / ')} | ${j.sourceNode} | ${j.usage.headquartersZone1Routes} | ${j.usage.headquartersAllRoutes} | ${j.dimensions.intersectionLocation.status} / ${j.dimensions.topology.status} / ${j.dimensions.maneuvers.status} |`).join('\n')}\n\n${connectorJunctions.length} additional connector junctions on Zone 1 HQ routes are audited separately. Their shared nodes are software observations; no proximity-based shortcut is introduced.\n\n## Pass 2: all 38 entries and connectors\n\nRecomputed all **${matrix.length} ordered pairs**, each reverse direction separately: ${after.graphReachableDirectedPairs} graph-reachable, partially verified; ${after.independentlySupportedRoadToRoadRoutes} independently supported. [Readable 38-by-38 matrix](geographic-connectivity.md). Route hashes and complete deterministic source selection make each result reproducible without duplicating the full graph.\n\nAlso rechecked **${after.sampledDirectedApproaches} directed approach samples**; **${after.sampledApproachesNotRoundTripReachable}** lack an outbound or return path in the conservative graph. A reachable representative does not establish every segment or approach.\n\n| Entry | Identity | Whole imported geometry | Corroborated segments | HQ out / return | Samples with both directions |\n|---|---|---|---:|---|---:|\n${entries.map(entry => { const routes = headquarters.find(item => item.entryId === entry.id)!; return `| ${entry.label} | ${entry.dimensions.identity.status} | ${entry.dimensions.geometry.status} | ${entry.corroboratedDirectedSegments}/${entry.totalDirectedSegments} | ${routeMarker(routes.outbound)} / ${routeMarker(routes.return)} | ${routes.approaches.filter(approach => approach.outbound.route && approach.return.route).length}/${routes.approaches.length} |`; }).join('\n')}\n\nAudited ${connectors.length} connector source ways actually used by these paths, including their source identity, direction/access tags, connected study entries and restriction IDs. ${after.connectorWaysWithIdentityCorroboration} have matched City identities; ${after.connectorDirectedSegmentsCorroborated} directed connector segments also pass the same 15 m / 10 m City centerline comparison. Unnamed ramps retain source identifiers, never invented street names. A connector is not an added learning target.\n\n## Crossings, ramps and restrictions\n\n${crossings.length} visual study-road crossings have no common source node and remain disconnected. Each records actual source bridge/tunnel/layer tags; missing tags do not prove at-grade passage. ${freewayTransitions.length} I-880/I-680 entry/exit/continuation transitions were examined against original edges: ${after.freewaySurfaceTransitionsRequiringReview} are surface/freeway transitions requiring further review. All ramp directions remain those of the existing graph.\n\n${roads.restrictions?.length ?? 0} supported source restriction records and ${roads.unsupportedRestrictions?.length ?? 0} unsupported records were inventoried. ${excludedWays.size} source ways are conservatively excluded under existing policy. An unsupported or excluded approach is not reported as independent evidence that the real-world road is disconnected or all alternate routes are prohibited.\n\n## Evidence scopes and remaining work\n\nEvery entry, relevant junction and connector has separate identity, geometry, intersection location, topology, grade separation, vehicle access, one-way, individual-movement and route-reachability statuses. City intersection points can corroborate a named physical location without proving each OSM carriageway-node coordinate, grade, public access or turns. The independent evidence file records exact scopes and sources. No runtime quiz/navigation eligibility is promoted by this offline audit.\n\nThe supported centerline comparison does not establish surveyed lane geometry or full-city/corridor coverage. Independently supported legal movements remain ${after.individuallyVerifiedLegalMovements}; end-to-end legal routes remain unresolved. Obtain applicable as-built junction/grade plans, public access and current restriction records for the ranked HQ junctions and route connectors before enabling strict scored maneuvers/navigation. Preserve dated evidence and resolve any conflict before changing the source graph.\n`;
const independentSummary = `## Independent evidence added

The City named-intersection catalog corroborates **${after.independentlySupportedIntersectionLocations} of ${junctions.length} study source-node location associations at ${after.uniqueCityNamedIntersectionRecords} distinct City named-intersection records**. These are named junction-center associations within 40 m with at least two exact normalized actual road names, not surveyed individual carriageway-node positions. Divided roads can contribute several source nodes to one named intersection; the counts deliberately distinguish them.

The City's transportation inventory identifies **${after.uniqueImplementedProtectedIntersections} implemented protected intersections associated with ${after.independentlySupportedPhysicalConnections} study source nodes**. This independently supports the existence of those named physical at-grade intersections. It does not establish each directed approach connection, public access, one-way currency, signal rule or individual legal maneuver. Two additional proposed source-node associations were withheld because both exact actual way names did not match; curriculum grouping alone was not substituted for physical road identity.

The National Bridge Inventory independently corroborates **${after.independentlyCorroboratedCrossingRecords} nonconnecting source-line crossing records at ${after.uniqueIndependentBridgeStructures} distinct bridge structures**, using matching carried/below facilities and a 50 m association threshold. Adjacent ramps remain separate. The retained Auto Mall/Durham source naming is not changed to match a historic bridge label.

Source families and dates:

${independent.sources.map(source => `- [${source.provider}](${source.url}): ${source.id}; retrieved ${source.retrievedAt}; hosted-service data edit ${source.dataModifiedAt ?? 'see metadata'}${source.datasetAsOf ? `; dataset as of **${source.datasetAsOf}** (separate from the hosted-service edit date)` : ''}. ${source.limitations}`).join('\n')}

The City intersection source references the complete derived union and its SHA-256 hash, with all eight unchanged raw query snapshots, retrieval dates and hashes listed in \`derivedFromSnapshots\`. The official layer URL identifies the dataset; no single query batch is presented as the source for the whole catalog.

The City intersection catalog and City centerlines share City GIS lineage; they are independent of OSM, not two independent City surveys. Transportation implementation records add different factual content. Raw records, object IDs, publication dates, query URLs and SHA-256 checksums are preserved in [the source research report](junction-source-research.md) and the committed retrieval manifest. Reproduction checks the raw hashes and exact derived catalog union before applying any scoped claim.

`;
writeFileSync('docs/geographic-audit.md', report.replace('## Pass 1:', independentSummary + '## Pass 1:'));
console.log(JSON.stringify({ version: audit.version, after, sourcePreservation: preservation.every(file => file.unchanged) }));
