import type {Feature, FeatureCollection, LineString} from 'geojson';
import type {LonLat, RoadData, RoadWay} from '../core/types';

/** Curriculum associations are metadata, never display names or invented geometry. */
export interface LabelCurriculumEntry {id: string; sourceWayIds: readonly string[]}
export interface RoadLabelProperties {
  /** Promoted native feature identity; vector tiles cannot encode string IDs directly. */
  labelId: string;
  name: string;
  sourceName: string;
  ref: string;
  label: string;
  /** Cartographic suffix abbreviations only; source identity remains untouched. */
  compactLabel: string;
  highway: string;
  sourceWayIds: string[];
  curriculumIds: string[];
  isStudy: boolean;
  basePriority: number;
  priority: number;
}
export interface RoadLabelChain {
  feature: Feature<LineString, RoadLabelProperties>;
  /** Exact source-node order, kept out of the worker payload. */
  sourceNodeIds: string[];
  /** Each original source segment occurs once; direction describes drawing only. */
  sourceSegments: Array<{wayId: string; index: number; reversed: boolean}>;
  identity: string;
}
export interface PreparedRoadLabels {
  collection: FeatureCollection<LineString, RoadLabelProperties>;
  byId: Map<string, RoadLabelChain>;
  byWayId: Map<string, string[]>;
  byCurriculumId: Map<string, string[]>;
  byName: Map<string, string[]>;
  byIdentity: Map<string, string[]>;
  identityByWayId: Map<string, string>;
  diagnostics: {sourceWays: number; labelledWays: number; sourceSegments: number; sourceNodes: number; missingOrInvalidSegments: number; duplicateWayIds: string[]};
}
interface WayInfo {
  wayId: string; name: string; ref: string; label: string; highway: string;
  identity: string; branchIdentity: string; compatibility: string; oneWay: boolean; reverse: boolean;
}
interface Segment {id: string; from: string; to: string; index: number; info: WayInfo}

const majorClasses = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
const value = (way: RoadWay, key: string): string => String(way[key] ?? way.tags?.[key] ?? '');
const validPosition = (p: unknown): p is LonLat => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
const append = (index: Map<string, string[]>, key: string, id: string): void => {const ids = index.get(key); if (ids) ids.push(id); else index.set(key, [id]);};
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const suffixes: Record<string, string> = {Boulevard:'Blvd', Parkway:'Pkwy', Avenue:'Ave', Road:'Rd', Street:'St', Drive:'Dr'};
/** A presentation abbreviation, never a matching key or curriculum rename. */
export function compactRoadLabel(label: string): string {
  return label.replace(/\b(Boulevard|Parkway|Avenue|Road|Street|Drive)$/, suffix => suffixes[suffix]);
}

function turnsBack(data: RoadData, before: string, node: string, after: string): boolean {
  const a=data.nodes[before], b=data.nodes[node], c=data.nodes[after];
  const longitudeScale=Math.cos(b[1]*Math.PI/180);
  const incoming=[(b[0]-a[0])*longitudeScale,b[1]-a[1]],outgoing=[(c[0]-b[0])*longitudeScale,c[1]-b[1]];
  const lengths=Math.hypot(...incoming)*Math.hypot(...outgoing);
  // A display-chain boundary at a real node, not a new connection or a turn ban.
  return lengths>0 && (incoming[0]*outgoing[0]+incoming[1]*outgoing[1])/lengths < -0.5;
}

function describe(way: RoadWay): WayInfo | null {
  const wayId = String(way.id), name = value(way, 'name'), ref = value(way, 'ref'), highway = value(way, 'highway');
  // Never turn a curriculum title (including slash-grouped corridors) into a road name.
  const label = (highway === 'motorway' || highway === 'motorway_link') && ref ? ref : name || ref;
  if (!label || !highway) return null;
  const rawDirection = value(way, 'oneway').toLowerCase() || (highway === 'motorway' || value(way, 'junction') === 'roundabout' ? 'yes' : 'no');
  const reverse = ['-1', 'reverse'].includes(rawDirection);
  const oneWay = reverse || ['yes', '1', 'true'].includes(rawDirection);
  const knownDirection = oneWay || ['no', '0', 'false'].includes(rawDirection);
  const identity = JSON.stringify([name, ref]);
  const branchIdentity = name ? `name:${name}` : `ref:${ref}`;
  const compatibility = JSON.stringify([
    identity, highway, oneWay ? 'oneway' : knownDirection ? 'both' : `unresolved:${rawDirection}:${wayId}`,
    value(way, 'layer') || '0', value(way, 'bridge') || 'no', value(way, 'tunnel') || 'no',
    value(way, 'covered') || 'no', value(way, 'location'), value(way, 'level'), value(way, 'junction'),
    value(way, 'carriageway'), value(way, 'dual_carriageway'), value(way, 'divider'),
    value(way, 'motorcar'), value(way, 'motor_vehicle'), value(way, 'vehicle'), value(way, 'access'),
    value(way, 'oneway:conditional'),
  ]);
  return {wayId, name, ref, label, highway, identity, branchIdentity, compatibility, oneWay, reverse};
}

/** Prepare the label source once. This never modifies source data or the driving graph.
 *
 * Chains contain only consecutive source segments joined at identical OSM node IDs.
 * Exact identity, road class, direction, grade and access tags must agree. A branch
 * of the same named identity terminates a chain, including branches inside a way.
 * No proximity joins, carriageway shortcuts, alias merges or line simplification.
 * Joining for typography is not evidence that a movement is legally permitted.
 */
export function prepareRoadLabels(data: RoadData, curriculum: readonly LabelCurriculumEntry[] = []): PreparedRoadLabels {
  const result: PreparedRoadLabels = {
    collection: {type: 'FeatureCollection', features: []}, byId: new Map(), byWayId: new Map(),
    byCurriculumId: new Map(curriculum.map(entry => [entry.id, []])), byName: new Map(), byIdentity: new Map(), identityByWayId: new Map(),
    diagnostics: {sourceWays: data.ways.length, labelledWays: 0, sourceSegments: 0, sourceNodes: 0, missingOrInvalidSegments: 0, duplicateWayIds: []},
  };
  const entriesByWay = new Map<string, string[]>();
  for (const entry of curriculum) for (const id of new Set(entry.sourceWayIds)) append(entriesByWay, String(id), entry.id);
  const counts = new Map<string, number>();
  for (const way of data.ways) counts.set(String(way.id), (counts.get(String(way.id)) ?? 0) + 1);
  result.diagnostics.duplicateWayIds = [...counts].filter(([, count]) => count > 1).map(([id]) => id).sort(compare);
  const segments = new Map<string, Segment>(), incident = new Map<string, Map<string, string[]>>();
  const uniqueNodes = new Set<string>();
  for (const way of data.ways) {
    // A conflicting source ID cannot be resolved by guessing which record is right.
    if (counts.get(String(way.id)) !== 1) continue;
    const info = describe(way);
    if (!info) continue;
    let included = false;
    for (let index = 0; index < way.nodes.length - 1; index++) {
      const a = String(way.nodes[index]), b = String(way.nodes[index + 1]);
      if (!validPosition(data.nodes[a]) || !validPosition(data.nodes[b])) {result.diagnostics.missingOrInvalidSegments++; continue;}
      const segment: Segment = {id: `${info.wayId}:${index}`, from: info.reverse ? b : a, to: info.reverse ? a : b, index, info};
      segments.set(segment.id, segment); uniqueNodes.add(a); uniqueNodes.add(b); included = true;
      let nodes = incident.get(info.branchIdentity);
      if (!nodes) {nodes = new Map(); incident.set(info.branchIdentity, nodes);}
      append(nodes, a, segment.id); append(nodes, b, segment.id);
    }
    if (included) {result.diagnostics.labelledWays++; result.identityByWayId.set(info.wayId, info.identity);}
  }
  result.diagnostics.sourceSegments = segments.size;
  result.diagnostics.sourceNodes = uniqueNodes.size;
  const next = (segment: Segment, node: string): Segment | null => {
    const ids = incident.get(segment.info.branchIdentity)?.get(node);
    if (ids?.length !== 2 || segment.from === segment.to) return null;
    const other = segments.get(ids[0] === segment.id ? ids[1] : ids[0]);
    if (!other || other.id === segment.id || other.from === other.to || other.info.compatibility !== segment.info.compatibility) return null;
    // Opposing one-way ends stay separate even if an anomalous source shares a node.
    if (segment.info.oneWay && (segment.to === node ? other.from !== node : other.to !== node)) return null;
    // Actual turnaround links may connect opposite carriageways with identical
    // names/tags. Keep each source segment, but do not wrap one label chain
    // around a >120-degree one-way reversal onto the opposite carriageway.
    if (segment.info.oneWay && turnsBack(data, segment.from===node?segment.to:segment.from, node, other.from===node?other.to:other.from)) return null;
    return other;
  };
  const visited = new Set<string>();
  for (const id of [...segments.keys()].sort(compare)) {
    if (visited.has(id)) continue;
    const seed = segments.get(id)!;
    let head = seed, start = seed.from;
    const backward = new Set([seed.id]);
    for (;;) {
      const previous = next(head, start);
      if (!previous || visited.has(previous.id)) break;
      if (backward.has(previous.id)) {head = seed; start = seed.from; break;}
      backward.add(previous.id); head = previous; start = previous.from === start ? previous.to : previous.from;
    }
    let current: Segment | null = head, from = start;
    const nodeIds = [start], sourceSegments: RoadLabelChain['sourceSegments'] = [], wayIds = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      const to: string = current.from === from ? current.to : current.from;
      nodeIds.push(to); wayIds.add(current.info.wayId);
      sourceSegments.push({wayId: current.info.wayId, index: current.index, reversed: (from !== current.from) !== current.info.reverse});
      current = next(current, to); from = to;
    }
    const sourceWayIds = [...wayIds].sort(compare);
    const curriculumIds = [...new Set(sourceWayIds.flatMap(wayId => entriesByWay.get(wayId) ?? []))].sort(compare);
    const info = seed.info;
    const basePriority = curriculumIds.length ? 2 : majorClasses.has(info.highway.replace(/_link$/, '')) ? 4 : 5;
    // Every segment belongs to one chain, so its minimum stable source ID is unique.
    const featureId = `road-label:${sourceSegments.map(segment => `${segment.wayId}:${segment.index}`).sort(compare)[0]}`;
    const feature: Feature<LineString, RoadLabelProperties> = {
      type: 'Feature', id: featureId,
      properties: {labelId: featureId, name: info.name, sourceName: info.name, ref: info.ref, label: info.label, compactLabel: compactRoadLabel(info.label), highway: info.highway, sourceWayIds, curriculumIds, isStudy: curriculumIds.length > 0, basePriority, priority: basePriority},
      geometry: {type: 'LineString', coordinates: nodeIds.map(nodeId => [...data.nodes[nodeId]])},
    };
    result.collection.features.push(feature);
    result.byId.set(featureId, {feature, sourceNodeIds: nodeIds, sourceSegments, identity: info.identity});
    for (const wayId of sourceWayIds) append(result.byWayId, wayId, featureId);
    for (const entryId of curriculumIds) result.byCurriculumId.get(entryId)!.push(featureId);
    if (info.name) append(result.byName, info.name, featureId);
    append(result.byIdentity, info.identity, featureId);
  }
  return result;
}

export interface RoadLabelPrioritySelection {
  selectedWayIds?: Iterable<string>;
  selectedCurriculumIds?: Iterable<string>;
  currentWayId?: string | null;
  connectorWayIds?: Iterable<string>;
}
export interface RoadLabelPriorityDiff {update: Array<{id: string; addOrUpdateProperties: Array<{key: 'priority'; value: number}>}>}

/** Event-driven layout updates: no geometry rebuild or scan of all roads.
 * MapLibre layout expressions cannot use feature-state. The diff is accepted by
 * GeoJSONSource.updateData. Only this presentation source's priorities mutate;
 * original roads, curriculum, routing and coordinates are never modified.
 */
export class RoadLabelPriorityController {
  private active = new Set<string>();
  constructor(private readonly labels: PreparedRoadLabels) {}
  update(selection: RoadLabelPrioritySelection): RoadLabelPriorityDiff {
    const priorities = new Map<string, number>();
    const assign = (ids: readonly string[] | undefined, priority: number) => {
      for (const id of ids ?? []) priorities.set(id, Math.min(priorities.get(id) ?? Infinity, priority));
    };
    for (const id of selection.connectorWayIds ?? []) assign(this.labels.byWayId.get(id), 3);
    if (selection.currentWayId) {
      const identity = this.labels.identityByWayId.get(selection.currentWayId);
      if (identity) assign(this.labels.byIdentity.get(identity), 1);
    }
    for (const id of selection.selectedWayIds ?? []) assign(this.labels.byWayId.get(id), 0);
    for (const id of selection.selectedCurriculumIds ?? []) assign(this.labels.byCurriculumId.get(id), 0);
    const diff: RoadLabelPriorityDiff = {update: []};
    for (const id of new Set([...this.active, ...priorities.keys()])) {
      const properties = this.labels.byId.get(id)!.feature.properties;
      const priority = Math.min(properties.basePriority, priorities.get(id) ?? Infinity);
      if (priority === properties.priority) continue;
      properties.priority = priority;
      diff.update.push({id, addOrUpdateProperties: [{key: 'priority', value: priority}]});
    }
    this.active = new Set(priorities.keys());
    return diff;
  }
}
