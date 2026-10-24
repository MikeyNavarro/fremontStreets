import type { LonLat, RoadData, RoadWay } from '../core/types';
import type { StudyNetwork } from '../study-network';
import type { IndependentClaim, IndependentEvidence } from '../geographic-audit';
import type { EvidenceStatus } from '../training/verification';

export interface MapJunctionFact {
  status: EvidenceStatus;
  scope: string;
  note: string;
  sourceIds: string[];
  claimIds: string[];
}
export interface MapJunctionRoad {
  id: string;
  name: string;
  ref?: string;
  sourceWayIds: string[];
  entryIds: string[];
}
export interface MapJunctionComponent {
  nodeId: string;
  position: LonLat;
  sourceWayIds: string[];
  roadNames: string[];
  roadIds: string[];
}
export interface MapJunctionPair {
  roadA: string;
  roadB: string;
  roadIds: [string, string];
  nodeIds: string[];
  sourceIds: string[];
  claimIds: string[];
}
export interface MapJunction {
  id: string;
  kind: 'junction' | 'nonconnecting-crossing';
  connectionType: 'shared-node' | 'name-change' | 'nonconnecting-crossing';
  position: LonLat;
  nodeIds: string[];
  sourceWayIds: string[];
  entryIds: string[];
  roadNames: string[];
  roads: MapJunctionRoad[];
  components: MapJunctionComponent[];
  evidence: {location: MapJunctionFact; topology: MapJunctionFact; grade: MapJunctionFact; maneuvers: MapJunctionFact};
  statusLabel: string;
  grouping: string;
  mappedPairs: MapJunctionPair[];
  quizPairs: MapJunctionPair[];
  inZone1: boolean;
}
export interface SourceVisualCrossing {
  edgeIds: string[];
  sourceWayIds: string[];
  entryIds: string[][];
  position: LonLat;
  sourceTags?: Array<Record<string, string>>;
  status?: string;
}
export interface NamedPhysicalFact {
  id: string;
  subject: {kind: string; sourceObjectId?: number; roadNames?: string[]; [key: string]: unknown};
  implementationStatus?: string;
  sourceIds: string[];
}
export interface AssociatedEvidence extends IndependentEvidence {
  associations?: Array<{kind: string; subject: string; sourceObjectId?: number; sourceName?: string; [key: string]: unknown}>;
}

import { canonicalRoadName } from '../study-network';

export interface BaselineJunctionFacts {
  id: string;
  identity?: {status: EvidenceStatus};
  geometry?: {status: EvidenceStatus};
  topology?: {status: EvidenceStatus};
  maneuvers?: {status: EvidenceStatus};
  gradeSeparation?: {status: EvidenceStatus};
}

type Dimension = 'intersectionLocation' | 'topology' | 'gradeSeparation' | 'maneuvers';
const unique = (values: Iterable<string>): string[] => [...new Set(values)].sort();
const validPosition = (value: LonLat | undefined): value is LonLat => Boolean(value && value.length === 2 && value.every(Number.isFinite));
const refOf = (way: RoadWay): string => String(way.ref ?? way.tags?.ref ?? '').trim();
const actualName = (way: RoadWay): string => String(way.name ?? '').trim();
const displayName = (way: RoadWay): string => actualName(way) || refOf(way) || 'Unnamed mapped ramp';
/** Exact source names/ref identities only; grouped curriculum titles are not road names. */
export function junctionRoadId(way: RoadWay): string {
  const name = actualName(way), ref = refOf(way);
  return name ? `road-name:${canonicalRoadName(name)}` : ref ? `road-ref:${canonicalRoadName(ref)}` : `road-way:${String(way.id)}`;
}
function inspectableWay(way: RoadWay): boolean {
  return Boolean(actualName(way) || refOf(way) || /^(motorway|trunk|primary|secondary|tertiary)_link$/.test(String(way.highway ?? '')));
}
function roadRecords(ways: RoadWay[], entryByWay: Map<string, string[]>): MapJunctionRoad[] {
  const records = new Map<string, MapJunctionRoad>();
  for (const way of ways) {
    const id = junctionRoadId(way), wayId = String(way.id), current = records.get(id);
    if (current) {
      current.sourceWayIds = unique([...current.sourceWayIds, wayId]);
      current.entryIds = unique([...current.entryIds, ...(entryByWay.get(wayId) ?? [])]);
    } else records.set(id, {id, name: displayName(way), ...(refOf(way) ? {ref: refOf(way)} : {}), sourceWayIds: [wayId], entryIds: entryByWay.get(wayId) ?? []});
  }
  return [...records.values()].sort((a, b) => a.id.localeCompare(b.id));
}
function pairsAt(nodeId: string, roads: MapJunctionRoad[]): MapJunctionPair[] {
  const pairs: MapJunctionPair[] = [];
  for (let i = 0; i < roads.length; i++) for (let j = i + 1; j < roads.length; j++) {
    pairs.push({roadA: roads[i].name, roadB: roads[j].name, roadIds: [roads[i].id, roads[j].id], nodeIds: [nodeId], sourceIds: [], claimIds: []});
  }
  return pairs;
}
function mergePairs(pairs: MapJunctionPair[]): MapJunctionPair[] {
  const result = new Map<string, MapJunctionPair>();
  for (const pair of pairs) {
    const key = pair.roadIds.join('\u0000'), previous = result.get(key);
    if (previous) {
      previous.nodeIds = unique([...previous.nodeIds, ...pair.nodeIds]);
      previous.sourceIds = unique([...previous.sourceIds, ...pair.sourceIds]);
      previous.claimIds = unique([...previous.claimIds, ...pair.claimIds]);
    } else result.set(key, structuredClone(pair));
  }
  return [...result.values()].sort((a, b) => a.roadIds.join('|').localeCompare(b.roadIds.join('|')));
}
function dimensionFact(claims: IndependentClaim[], dimension: Dimension, baseline?: BaselineJunctionFacts): MapJunctionFact {
  const selected = claims.filter(claim => claim.dimension === dimension);
  const baselineStatus = dimension === 'intersectionLocation' ? baseline?.geometry?.status : baseline?.[dimension === 'gradeSeparation' ? 'gradeSeparation' : dimension]?.status;
  const status: EvidenceStatus = baselineStatus === 'Conflicted' || selected.some(claim => claim.status === 'Conflicted') ? 'Conflicted' : selected.length && selected.every(claim => claim.status === 'Verified') ? 'Verified' : 'Unresolved';
  const scope = dimension === 'intersectionLocation' ? 'Named intersection location; not a survey of every carriageway node.' : dimension === 'topology' ? 'Named physical connection only; not every approach or movement.' : dimension === 'gradeSeparation' ? 'Physical at-grade or separated crossing, within the cited source scope.' : 'Individual permitted turns and current restrictions.';
  return {status, scope, note: status === 'Conflicted' ? 'Conflicting source evidence remains unresolved.' : selected.length ? unique(selected.map(claim => claim.scope)).join(' ') : 'No applicable independent evidence establishes this dimension.', sourceIds: unique(selected.flatMap(claim => claim.sourceIds)), claimIds: unique(selected.map(claim => claim.id))};
}
function aggregateFacts(facts: MapJunctionFact[], dimension: string): MapJunctionFact {
  const verified = facts.filter(fact => fact.status === 'Verified').length;
  const status: EvidenceStatus = facts.some(fact => fact.status === 'Conflicted') ? 'Conflicted' : facts.length && verified === facts.length ? 'Verified' : 'Unresolved';
  return {status, scope: facts[0]?.scope ?? dimension, note: `${verified} of ${facts.length} source-node associations have applicable independent ${dimension} evidence. Grouping never certifies all approaches or turns.`, sourceIds: unique(facts.flatMap(fact => fact.sourceIds)), claimIds: unique(facts.flatMap(fact => fact.claimIds))};
}

/** Derive map relationships from shared OSM nodes. City evidence groups display
 * components and supports explicitly scoped facts, never creates graph edges. */
export function buildMapJunctions(
  roads: RoadData,
  network: StudyNetwork,
  evidence: AssociatedEvidence,
  visualCrossings: SourceVisualCrossing[],
  physicalFacts: NamedPhysicalFact[] = [],
  baselineJunctions: BaselineJunctionFacts[] = [],
): MapJunction[] {
  const knownSources = new Set(evidence.sources.map(source => source.id));
  for (const claim of evidence.claims) {
    if (!claim.sourceIds.length || claim.sourceIds.some(id => !knownSources.has(id)) || !claim.scope.trim() || !claim.reason.trim()) throw new Error(`Unresolvable independent evidence claim ${claim.id}`);
  }
  const claimBySubject = new Map<string, IndependentClaim[]>();
  for (const claim of evidence.claims) {
    const key = `${claim.subject.kind}:${claim.subject.id}`;
    claimBySubject.set(key, [...(claimBySubject.get(key) ?? []), claim]);
  }
  const baselineById = new Map(baselineJunctions.map(junction => [junction.id, junction]));
  const wayById = new Map(roads.ways.map(way => [String(way.id), way]));
  const entryByWay = new Map<string, string[]>();
  const studyNodes = new Set<string>();
  for (const entry of network.entries) for (const wayId of entry.sourceWayIds) {
    entryByWay.set(wayId, unique([...(entryByWay.get(wayId) ?? []), entry.id]));
    for (const nodeId of wayById.get(wayId)?.nodes ?? []) if (validPosition(roads.nodes[String(nodeId)])) studyNodes.add(String(nodeId));
  }
  const waysAtNode = new Map<string, RoadWay[]>(), neighborsAtNode = new Map<string, Set<string>>();
  for (const way of roads.ways.filter(inspectableWay)) {
    for (let i = 0; i < way.nodes.length; i++) {
      const id = String(way.nodes[i]);
      if (!studyNodes.has(id)) continue;
      const present = waysAtNode.get(id) ?? [];
      if (!present.some(other => String(other.id) === String(way.id))) present.push(way);
      waysAtNode.set(id, present);
      const neighbors = neighborsAtNode.get(id) ?? new Set<string>();
      for (const neighbor of [way.nodes[i - 1], way.nodes[i + 1]]) if (neighbor !== undefined && validPosition(roads.nodes[String(neighbor)])) neighbors.add(String(neighbor));
      neighborsAtNode.set(id, neighbors);
    }
  }
  interface Candidate {nodeId: string; roads: MapJunctionRoad[]; ways: RoadWay[]; claims: IndependentClaim[]; baseline?: BaselineJunctionFacts; facts: MapJunction['evidence']; pairs: MapJunctionPair[]; quizPairs: MapJunctionPair[]; connectionType: 'shared-node' | 'name-change'; conflicted: boolean}
  const candidates = new Map<string, Candidate>();
  for (const [nodeId, ways] of waysAtNode) {
    const records = roadRecords(ways, entryByWay);
    if (records.length < 2 || !records.some(road => road.entryIds.length)) continue;
    const subject = `osm-node-${nodeId}`, claims = claimBySubject.get(`junction:${subject}`) ?? [], baseline = baselineById.get(subject);
    const facts = {location: dimensionFact(claims, 'intersectionLocation', baseline), topology: dimensionFact(claims, 'topology', baseline), grade: dimensionFact(claims, 'gradeSeparation', baseline), maneuvers: dimensionFact(claims, 'maneuvers', baseline)};
    const pairs = pairsAt(nodeId, records), quizPairs: MapJunctionPair[] = [];
    const hasRelevantConflict = [baseline?.identity?.status, baseline?.geometry?.status, baseline?.topology?.status, baseline?.gradeSeparation?.status].includes('Conflicted') || [facts.location, facts.topology, facts.grade].some(fact => fact.status === 'Conflicted');
    if (!hasRelevantConflict && facts.topology.status === 'Verified' && facts.grade.status === 'Verified') {
      for (const fact of physicalFacts) {
        if (fact.subject.kind !== 'named-intersection' || fact.implementationStatus !== 'Implemented' || !fact.sourceIds.length || fact.sourceIds.some(id => !knownSources.has(id))) continue;
        const expected = fact.subject.roadNames?.map(canonicalRoadName) ?? [];
        if (expected.length !== 2 || expected[0] === expected[1]) continue;
        const topology = claims.find(claim => claim.id === `${fact.id}-topology-${subject}` && claim.status === 'Verified');
        const grade = claims.find(claim => claim.id === `${fact.id}-gradeSeparation-${subject}` && claim.status === 'Verified');
        if (!topology || !grade || !fact.sourceIds.every(id => topology.sourceIds.includes(id) && grade.sourceIds.includes(id))) continue;
        const pair = pairs.find(pair => expected.includes(canonicalRoadName(pair.roadA)) && expected.includes(canonicalRoadName(pair.roadB)));
        if (pair) quizPairs.push({...pair, sourceIds: [...fact.sourceIds], claimIds: [topology.id, grade.id]});
      }
    }
    candidates.set(nodeId, {nodeId, roads: records, ways, claims, baseline, facts, pairs, quizPairs, conflicted: hasRelevantConflict, connectionType: (neighborsAtNode.get(nodeId)?.size ?? 0) >= 3 ? 'shared-node' : 'name-change'});
  }

  const parent = new Map([...candidates.keys()].map(id => [id, id]));
  const find = (id: string): string => {let root = id; while (parent.get(root) !== root) root = parent.get(root)!; return root;};
  const union = (first: string, next: string) => {const a = find(first), b = find(next); if (a !== b) parent.set(b, a);};
  const existingGroups = new Map<string, string[]>();
  for (const junction of network.intersections) if (candidates.has(junction.nodeId)) existingGroups.set(junction.logicalId, [...(existingGroups.get(junction.logicalId) ?? []), junction.nodeId]);
  for (const ids of existingGroups.values()) for (const id of ids.slice(1)) union(ids[0], id);
  const sourceGroups = new Map<string, string[]>();
  for (const association of evidence.associations ?? []) {
    if (!['city-location', 'implemented-protected-intersection'].includes(association.kind) || association.sourceObjectId === undefined || !association.subject.startsWith('osm-node-')) continue;
    const id = association.subject.slice('osm-node-'.length), candidate = candidates.get(id);
    if (!candidate || candidate.facts.location.status !== 'Verified') continue;
    const key = `${association.kind}:${association.sourceObjectId}`;
    sourceGroups.set(key, [...(sourceGroups.get(key) ?? []), id]);
  }
  for (const ids of sourceGroups.values()) {
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      // The same City record plus a shared named relationship is evidence of a
      // logical site. Merely nearby nodes or crossing lines are never grouped.
      const a = candidates.get(ids[i])!, b = candidates.get(ids[j])!;
      if (a.roads.filter(road => b.roads.some(other => other.id === road.id)).length >= 2) union(ids[i], ids[j]);
    }
  }
  const groups = new Map<string, Candidate[]>();
  for (const [id, candidate] of candidates) groups.set(find(id), [...(groups.get(find(id)) ?? []), candidate]);
  const result: MapJunction[] = [];
  for (const components of groups.values()) {
    components.sort((a, b) => Number(b.facts.topology.status === 'Verified') - Number(a.facts.topology.status === 'Verified') || Number(b.facts.location.status === 'Verified') - Number(a.facts.location.status === 'Verified') || a.nodeId.localeCompare(b.nodeId));
    const nodeIds = unique(components.map(component => component.nodeId));
    const records = roadRecords(components.flatMap(component => component.ways), entryByWay);
    const facts = {location: aggregateFacts(components.map(component => component.facts.location), 'named-location'), topology: aggregateFacts(components.map(component => component.facts.topology), 'physical-connection'), grade: aggregateFacts(components.map(component => component.facts.grade), 'grade'), maneuvers: aggregateFacts(components.map(component => component.facts.maneuvers), 'maneuver')};
    const quizPairs = mergePairs(components.flatMap(component => component.quizPairs)).filter(pair => !components.some(component => component.conflicted && component.pairs.some(mapped => mapped.roadIds.join('|') === pair.roadIds.join('|'))));
    result.push({id: `map-junction-${nodeIds[0]}`, kind: 'junction', connectionType: components.some(component => component.connectionType === 'shared-node') ? 'shared-node' : 'name-change', position: [...roads.nodes[components[0].nodeId]], nodeIds, sourceWayIds: unique(records.flatMap(road => road.sourceWayIds)), entryIds: unique(records.flatMap(road => road.entryIds)), roadNames: unique(records.map(road => road.name)), roads: records,
      components: components.map(component => ({nodeId: component.nodeId, position: [...roads.nodes[component.nodeId]], sourceWayIds: unique(component.ways.map(way => String(way.id))), roadNames: component.roads.map(road => road.name), roadIds: component.roads.map(road => road.id)})),
      evidence: facts, statusLabel: components.some(component => component.conflicted) || Object.values(facts).some(fact => fact.status === 'Conflicted') ? 'Conflicting evidence — exploratory only' : quizPairs.length ? 'Independently corroborated named physical intersection' : facts.location.sourceIds.length ? 'City-corroborated named location; physical approaches unresolved' : 'Source-mapped junction; independent corroboration unresolved',
      grouping: components.length > 1 ? 'Grouped using retained logical-junction identity or a matching City record and named relationship. Original source-node components are retained; no new connecting edges were created.' : 'One original OSM source node.', mappedPairs: mergePairs(components.flatMap(component => component.pairs)), quizPairs, inZone1: false});
  }
  for (let index = 0; index < visualCrossings.length; index++) {
    const crossing = visualCrossings[index], subject = `source-crossing-${index + 1}`;
    const ways = crossing.sourceWayIds.map(id => wayById.get(id)).filter((way): way is RoadWay => Boolean(way));
    if (ways.length !== crossing.sourceWayIds.length || !validPosition(crossing.position)) continue;
    const records = roadRecords(ways, entryByWay), claims = claimBySubject.get(`crossing:${subject}`) ?? [];
    const facts = {location: dimensionFact(claims, 'intersectionLocation'), topology: dimensionFact(claims, 'topology'), grade: dimensionFact(claims, 'gradeSeparation'), maneuvers: dimensionFact(claims, 'maneuvers')};
    result.push({id: subject, kind: 'nonconnecting-crossing', connectionType: 'nonconnecting-crossing', position: [...crossing.position], nodeIds: [], sourceWayIds: [...crossing.sourceWayIds], entryIds: unique(crossing.entryIds.flat()), roadNames: unique(records.map(road => road.name)), roads: records, components: [], evidence: facts,
      statusLabel: facts.grade.status === 'Conflicted' ? 'Conflicting grade evidence — no mapped connection' : facts.grade.status === 'Verified' ? 'Independently corroborated grade-separated crossing — no connection' : 'Nonconnecting source-line crossing; grade evidence unresolved',
      grouping: 'Original nonconnecting visual-crossing record. No shared source node, intersection marker or quiz connection is created.', mappedPairs: [], quizPairs: [], inZone1: false});
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}
