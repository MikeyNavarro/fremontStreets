import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { buildGraph, isIntersection, project, type LonLat, type RoadData } from '../src/core';
import { canonicalRoadName, type StudyNetwork } from '../src/study-network';
import type { AuditDimension, IndependentClaim, IndependentEvidence } from '../src/geographic-audit';

/** Evidence-only association. A City named center is not an OSM approach-node
 * survey. Neither this script nor its output changes source edges or scoring. */
export function corroborateIndependentJunctions(): IndependentEvidence {
  const directory = 'data-sources/independent-junctions/';
  const read = (file: string) => JSON.parse(readFileSync(file, 'utf8'));
  const proposals = read(directory + 'scoped-proposed-facts.json');
  const catalog = read(directory + 'city-study-intersections.geojson');
  const manifest = read(directory + 'retrieval-manifest.json');
  for (const file of manifest.files) {
    const digest = createHash('sha256').update(readFileSync(directory + file.file)).digest('hex');
    if (digest !== file.sha256) throw new Error(`Independent source snapshot changed: ${file.file}`);
  }
  const rawCatalog = new Map<number, unknown>();
  for (const file of manifest.files.filter((file: {file: string}) => /^city-intersections-query-\d+\.geojson$/.test(file.file))) {
    for (const feature of read(directory + file.file).features) rawCatalog.set(feature.properties.OBJECTID, feature);
  }
  if (catalog.features.length !== rawCatalog.size || catalog.features.some((feature: any) => !isDeepStrictEqual(feature, rawCatalog.get(feature.properties.OBJECTID)))) {
    throw new Error('Derived City intersection catalog must exactly preserve the hashed raw query records.');
  }
  const protectedRecords = new Map<number, any>(read(directory + 'city-protected-intersections.geojson').features.map((feature: any) => [feature.properties.OBJECTID, feature]));
  const bridgeRecords = new Map<string, any>(read(directory + 'nbi-fremont-bridges.geojson').features.map((feature: any) => [feature.properties.STRUCTURE_NUMBER_008, feature]));
  for (const proposal of proposals.facts) {
    const source = proposal.subject.kind === 'named-intersection' ? protectedRecords.get(proposal.subject.sourceObjectId) : bridgeRecords.get(proposal.subject.structureNumber);
    if (!source || !isDeepStrictEqual(source.geometry.coordinates, proposal.subject.position)) throw new Error(`Evidence proposal ${proposal.id} has no exact source position.`);
    if (proposal.subject.kind === 'named-intersection' && source.properties.Status !== proposal.implementationStatus) throw new Error(`Evidence proposal ${proposal.id} misstates implementation status.`);
    if (proposal.subject.kind === 'grade-separated-crossing' && (source.properties.FACILITY_CARRIED_007 !== proposal.subject.facilityCarried || source.properties.FEATURES_DESC_006A !== proposal.subject.featureBelow)) throw new Error(`Evidence proposal ${proposal.id} misstates the bridge's carried/below facilities.`);
  }
  const network = read('public/data/study-network.json') as StudyNetwork;
  const roads = read('public/data/roads.json') as RoadData;
  const graph = buildGraph(roads);
  const wayById = new Map(roads.ways.map(way => [String(way.id), way]));
  const distance = (a: LonLat, b: LonLat) => {
    const first = project(a), second = project(b); return Math.hypot(first.x - second.x, first.y - second.y);
  };
  const namedNodes = [...graph.nodes.values()].filter(node => isIntersection(graph, node.id)).map(node => ({
    id: `osm-node-${node.id}`, position: node.position,
    names: [...new Set([...(graph.incoming.get(node.id) ?? []), ...(graph.outgoing.get(node.id) ?? [])].map(id => canonicalRoadName(graph.edges.get(id)!.name)).filter(Boolean))],
  }));
  const sources = proposals.sources.map((source: any) => {
    const normalized = { ...source, limitations: source.limitations.join(' ') };
    if (source.id === 'city-intersection-catalog-2023') {
      const batches = manifest.files.filter((file: {file: string}) => /^city-intersections-query-\d+\.geojson$/.test(file.file));
      normalized.url = source.url.split('/query?')[0];
      normalized.sourceFile = 'city-study-intersections.geojson';
      normalized.sha256 = createHash('sha256').update(readFileSync(directory + normalized.sourceFile)).digest('hex');
      normalized.derivedFromSnapshots = batches.map((file: any) => ({ file: file.file, url: file.url, sha256: file.sha256, retrievedAt: file.retrievedAt }));
      const dates = batches.map((file: any) => file.retrievedAt).sort();
      normalized.retrievalRange = { first: dates[0], last: dates.at(-1) };
      normalized.retrievedAt = dates.at(-1);
    }
    // Dataset observation/reference date and hosted-service editing metadata
    // describe different things. Retain both rather than calling an edit a
    // new survey or publication of the bridge conditions.
    if (source.id === 'usdot-fhwa-nbi-2025') normalized.datasetAsOf = '2025-06-20';
    return normalized;
  });
  const claims: IndependentClaim[] = [];
  const associations: Array<Record<string, unknown>> = [];
  const locationRadius = 40;
  for (const node of namedNodes) {
    if (node.names.length < 2) continue;
    const candidates = catalog.features.map((feature: any) => ({ feature, names: [...new Set<string>(String(feature.properties.CROSS_ST_NAMES ?? '').split('/').map(canonicalRoadName))], distance: distance(node.position, feature.geometry.coordinates) }))
      .filter((candidate: any) => candidate.distance <= locationRadius && candidate.names.filter((name: string) => node.names.includes(name)).length >= 2)
      .sort((a: any, b: any) => a.distance - b.distance || a.feature.properties.OBJECTID - b.feature.properties.OBJECTID);
    const matched = candidates[0]; if (!matched) continue;
    const objectId = matched.feature.properties.OBJECTID;
    const offset = Math.round(matched.distance * 100) / 100;
    claims.push({ id: `city-location-${objectId}-${node.id}`, subject: { kind: 'junction', id: node.id }, dimension: 'intersectionLocation', status: 'Verified', sourceIds: ['city-intersection-catalog-2023'],
      scope: 'Named physical intersection center in the City catalog. Does not survey the exact OSM carriageway node or establish at-grade connectivity/access/turns.',
      reason: `City OBJECTID=${objectId}, CROSS_ST_NAMES=${matched.feature.properties.CROSS_ST_NAMES}; at least two exact normalized source-road names match, with ${offset} m between City center and source node (review policy <=${locationRadius} m). City point ${JSON.stringify(matched.feature.geometry.coordinates)}; OSM node ${JSON.stringify(node.position)}.`,
    });
    associations.push({ kind: 'city-location', subject: node.id, sourceObjectId: objectId, sourceName: matched.feature.properties.CROSS_ST_NAMES, sourcePosition: matched.feature.geometry.coordinates, graphPosition: node.position, offsetMetres: offset });
  }
  for (const proposal of proposals.facts.filter((item: any) => item.subject.kind === 'named-intersection' && item.implementationStatus === 'Implemented')) {
    const names = proposal.subject.roadNames.map(canonicalRoadName);
    if (names.length < 2) continue;
    for (const node of namedNodes) {
      const offset = distance(node.position, proposal.subject.position);
      if (offset > locationRadius || !names.every((name: string) => node.names.includes(name))) continue;
      for (const dimension of ['intersectionLocation', 'topology', 'gradeSeparation'] as AuditDimension[]) {
        // Keep the stronger implementation evidence separate from location
        // catalog facts; both agree about the scoped named junction.
        claims.push({ id: `${proposal.id}-${dimension}-${node.id}`, subject: { kind: 'junction', id: node.id }, dimension, status: 'Verified', sourceIds: proposal.sourceIds,
          scope: proposal.scope,
          reason: `Official implemented protected-intersection project OBJECTID=${proposal.subject.sourceObjectId}, ${proposal.subject.sourceLabel}; exact named roads match and project point is ${Math.round(offset * 100) / 100} m from the source node. Status=Implemented, not merely a planned proposal. This verifies existence of the named physical at-grade intersection, not each graph movement.`,
        });
      }
      associations.push({ kind: 'implemented-protected-intersection', subject: node.id, sourceObjectId: proposal.subject.sourceObjectId, sourceName: proposal.subject.sourceLabel, sourcePosition: proposal.subject.position, graphPosition: node.position, offsetMetres: Math.round(offset * 100) / 100 });
    }
  }
  const crossings = read('docs/data/study-intersections.json').unconnectedVisualCrossings;
  const namesForWay = (id: string): Set<string> => {
    const way = wayById.get(id)!;
    const names = [way.name ?? ''];
    // Exact established interstate identity, not a general fuzzy-name alias.
    for (const entry of network.entries.filter(entry => entry.ref && entry.sourceWayIds.includes(id))) {
      if (entry.originalLabel === 'Interstate 880 (I-880)') names.push('Interstate 880', 'I 880');
      if (entry.originalLabel === 'Interstate 680 (I-680)') names.push('Interstate 680', 'I 680');
    }
    return new Set(names.map(canonicalRoadName));
  };
  const bridgeRadius = 50;
  for (const proposal of proposals.facts.filter((item: any) => item.subject.kind === 'grade-separated-crossing')) {
    const carried = canonicalRoadName(proposal.subject.facilityCarried), below = canonicalRoadName(proposal.subject.featureBelow);
    for (let index = 0; index < crossings.length; index++) {
      const crossing = crossings[index], [first, second] = crossing.sourceWayIds.map(namesForWay);
      if (!((first.has(carried) && second.has(below)) || (second.has(carried) && first.has(below)))) continue;
      const offset = distance(crossing.position, proposal.subject.position);
      if (offset > bridgeRadius) continue;
      const subject = `source-crossing-${index + 1}`;
      claims.push({ id: `${proposal.id}-${subject}`, subject: { kind: 'crossing', id: subject }, dimension: 'gradeSeparation', status: 'Verified', sourceIds: proposal.sourceIds,
        scope: proposal.scope,
        reason: `National Bridge Inventory structure ${proposal.subject.structureNumber} carries ${proposal.subject.facilityCarried} over ${proposal.subject.featureBelow}. Exact named facilities (or retained explicit interstate identities) match; bridge inventory point is ${Math.round(offset * 100) / 100} m from the nonconnecting source-line crossing (policy <=${bridgeRadius} m). Adjacent ramps and turning permissions are not established.`,
      });
      associations.push({ kind: 'bridge-grade-separation', subject, structureNumber: proposal.subject.structureNumber, facilityCarried: proposal.subject.facilityCarried, featureBelow: proposal.subject.featureBelow, sourcePosition: proposal.subject.position, graphPosition: crossing.position, offsetMetres: Math.round(offset * 100) / 100 });
    }
  }
  const result = { schema: 1 as const, sources, claims,
    policy: { namedIntersectionAssociationMetres: locationRadius, bridgeAssociationMetres: bridgeRadius, note: 'Exact source names and explicit retained interstate identities plus bounded location associations. A match establishes only the documented scoped fact. No source graph or scoring registry changes.' },
    associations,
    sourceManifestSha256: createHash('sha256').update(readFileSync(directory + 'retrieval-manifest.json')).digest('hex'),
  };
  writeFileSync('data-sources/geographic-evidence.json', JSON.stringify(result, null, 2) + '\n');
  return result;
}
