import { project } from './projection';
import type { RoadData, RoadEdge, RoadGraph, RoadWay, Route, Turn, TurnChoice, VehicleState } from './types';

const DRIVABLE = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'road']);
const PRIVATE = new Set(['no', 'private']);

/** Unknown and conditional limits stay unknown; OSM numeric maxspeed is km/h. */
export function parseSpeedLimit(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?$/i);
  if (!match) return null;
  const speed = Number(match[1]);
  if (!(speed > 0)) return null;
  return match[2]?.toLowerCase() === 'mph' ? speed : speed / 1.609344;
}

function drivingAllowed(way: RoadWay): boolean {
  const tags = way.tags ?? {};
  if (!DRIVABLE.has(way.highway ?? tags.highway ?? '')) return false;
  const access = tags.motorcar ?? tags.motor_vehicle ?? tags.vehicle ?? tags.access ?? way.access;
  if (PRIVATE.has(String(access ?? '').toLowerCase())) return false;
  if (tags.area === 'yes') return false;
  return true;
}

/** Blocking a via way prevents an unsupported prohibited movement without
 * deleting its approach road. Only/conditional/incomplete rules still require
 * the conservative approach exclusion. Never enable an unparsed movement. */
export function excludedRestrictionWays(data: RoadData): Set<string> {
  const rules = [...(data.restrictions ?? []).filter(rule => rule.viaNode === undefined), ...(data.unsupportedRestrictions ?? [])];
  const excluded = new Set<string>();
  for (const rule of rules) {
    for (const way of rule.viaWays ?? []) excluded.add(String(way));
    const prohibitedVia = rule.viaNode === undefined && Boolean(rule.viaWays?.length)
      && rule.fromWay !== undefined && rule.toWay !== undefined
      && /^no_(?:u_turn|left_turn|right_turn|straight_on|entry|exit)$/.test(rule.restriction ?? '')
      && ['restriction:motorcar', 'restriction:motor_vehicle', 'restriction:vehicle'].every(key => !rule.tags?.[key] || rule.tags[key].startsWith('no_'))
      && !Object.keys(rule.tags ?? {}).some(key => key.includes('conditional'));
    if (!prohibitedVia && rule.fromWay !== undefined) excluded.add(String(rule.fromWay));
  }
  return excluded;
}

/** Edges connect only consecutive nodes of original OSM ways. A geometric
 * crossing without a shared node remains disconnected, including bridges. */
export function buildGraph(data: RoadData): RoadGraph {
  const graph: RoadGraph = { nodes: new Map(), edges: new Map(), outgoing: new Map(), incoming: new Map(), restrictions: data.restrictions ?? [], warnings: [], metadata: data.metadata ?? {} };
  const unverifiedWays = excludedRestrictionWays(data);
  for (const [id, position] of Object.entries(data.nodes)) {
    if (!Array.isArray(position) || position.length !== 2 || !position.every(Number.isFinite)) {
      graph.warnings.push(`Invalid node ${id} omitted.`);
      continue;
    }
    const metric = project(position);
    graph.nodes.set(id, { id, position: [position[0], position[1]], ...metric });
    graph.outgoing.set(id, []);
    graph.incoming.set(id, []);
  }
  for (const way of data.ways) {
    if (!drivingAllowed(way)) continue;
    if (unverifiedWays.has(String(way.id))) {
      graph.warnings.push(`Way ${way.id} excluded because its via-way turn restriction is not yet supported.`);
      continue;
    }
    const tags = way.tags ?? {};
    const highway = way.highway ?? tags.highway ?? '';
    const rawOneWay = String(way.oneway ?? tags.oneway ?? (tags.junction === 'roundabout' || highway === 'motorway' ? 'yes' : 'no')).toLowerCase();
    const direction = rawOneWay === '-1' || rawOneWay === 'reverse' ? -1 : ['yes', '1', 'true'].includes(rawOneWay) ? 1 : 0;
    if (['reversible', 'alternating'].includes(rawOneWay)) {
      graph.warnings.push(`Way ${way.id} has ${rawOneWay} direction and is excluded until verified.`);
      continue;
    }
    const name = way.name ?? tags.name ?? '';
    const speedLimitMph = parseSpeedLimit(way.maxspeed ?? tags.maxspeed);
    for (let i = 0; i < way.nodes.length - 1; i++) {
      const a = graph.nodes.get(String(way.nodes[i]));
      const b = graph.nodes.get(String(way.nodes[i + 1]));
      if (!a || !b) {
        graph.warnings.push(`Way ${way.id} segment ${i} has a missing node; segment excluded.`);
        continue;
      }
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < 0.01) continue;
      const addEdge = (from: typeof a, to: typeof a, suffix: string) => {
        const id = `${way.id}:${i}:${suffix}`;
        const access=tags.motorcar??tags.motor_vehicle??tags.vehicle??tags.access;
        const edge: RoadEdge = { id, from: from.id, to: to.id, wayId: String(way.id), name, highway, length, heading: Math.atan2(to.x - from.x, to.y - from.y), speedLimitMph, ...(access?{access}: {}) };
        graph.edges.set(id, edge);
        graph.outgoing.get(from.id)!.push(id);
        graph.incoming.get(to.id)!.push(id);
      };
      if (direction !== -1) addEdge(a, b, 'f');
      if (direction !== 1) addEdge(b, a, 'r');
    }
  }
  for (const restriction of graph.restrictions) {
    if (restriction.viaNode === undefined) graph.warnings.push(`Turn restriction ${restriction.id ?? ''} has no node-via geometry; not verified.`);
  }
  return graph;
}

export function normalizeAngle(angle: number): number {
  return ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
}

export function classifyTurn(angle: number): Turn {
  if (Math.abs(angle) > Math.PI * 5 / 6) return 'uturn';
  if (angle < -Math.PI / 7.2) return 'left';
  if (angle > Math.PI / 7.2) return 'right';
  return 'straight';
}

/** The caller must retain the incoming edge because legal turn restrictions
 * are transitions, not properties of an outgoing edge alone. */
export function legalOutgoing(graph: RoadGraph, incoming: RoadEdge): RoadEdge[] {
  return (graph.outgoing.get(incoming.to) ?? []).map(id => graph.edges.get(id)!).filter(outgoing => {
    for (const rule of graph.restrictions) {
      if (String(rule.viaNode) !== incoming.to || String(rule.fromWay) !== incoming.wayId) continue;
      const except = rule.tags?.except?.split(';').map(value => value.trim()) ?? [];
      if (except.some(value => ['motorcar', 'motor_vehicle', 'vehicle'].includes(value))) continue;
      const restriction = rule.tags?.['restriction:motorcar'] ?? rule.restriction;
      const isTarget = String(rule.toWay) === outgoing.wayId;
      const isReverse = outgoing.to === incoming.from;
      // A way can appear as both members of a same-road restriction. In
      // that case selecting its ID alone would mistake a legal continuation
      // for a prohibited reversal (or admit a reversal under only_straight).
      const sameWayMembers = String(rule.fromWay) === String(rule.toWay);
      const angle = normalizeAngle(outgoing.heading - incoming.heading);
      let targetMovement = isTarget;
      if (sameWayMembers && restriction.endsWith('straight_on')) targetMovement &&= !isReverse;
      if (sameWayMembers && restriction.endsWith('left_turn')) targetMovement &&= angle < 0 && !isReverse;
      if (sameWayMembers && restriction.endsWith('right_turn')) targetMovement &&= angle > 0 && !isReverse;
      if (restriction === 'no_u_turn') {
        if (isTarget && isReverse) return false;
      } else if (restriction === 'only_u_turn') {
        if (!isTarget || !isReverse) return false;
      } else if (restriction.startsWith('no_') && targetMovement) {
        return false;
      } else if (restriction.startsWith('only_') && !targetMovement) {
        return false;
      }
    }
    return true;
  });
}

export function outgoingChoices(graph: RoadGraph, state: Pick<VehicleState, 'edgeId'>): TurnChoice[] {
  const incoming = graph.edges.get(state.edgeId);
  if (!incoming) return [];
  return drivableOutgoing(graph, incoming).map(edge => {
    const angle = normalizeAngle(edge.heading - incoming.heading);
    return { edgeId: edge.id, name: edge.name, nodeId: incoming.to, angle, kind: classifyTurn(angle) };
  });
}

export function isIntersection(graph: RoadGraph, nodeId: string): boolean {
  const neighbors = new Set<string>();
  for (const id of graph.outgoing.get(nodeId) ?? []) neighbors.add(graph.edges.get(id)!.to);
  for (const id of graph.incoming.get(nodeId) ?? []) neighbors.add(graph.edges.get(id)!.from);
  return neighbors.size >= 3;
}

interface EdgeSelection { edge: RoadEdge | null; consumed: boolean; isIntersection: boolean }

function selectFromCandidates(incoming: RoadEdge, legal: RoadEdge[], junction: boolean, pending: Turn | null): EdgeSelection {
  const forward = legal.filter(edge => edge.to !== incoming.from);
  const candidates = forward.length ? forward : legal;
  if (!candidates.length) return { edge: null, consumed: false, isIntersection: junction };
  const angled = candidates.map(edge => ({ edge, angle: normalizeAngle(edge.heading - incoming.heading) }));
  if (pending && (junction || !forward.length)) {
    const turnPool = pending === 'uturn' ? legal.map(edge => ({ edge, angle: normalizeAngle(edge.heading - incoming.heading) })) : angled;
    const matches = turnPool.filter(choice => classifyTurn(choice.angle) === pending);
    if (matches.length) {
      const target = pending === 'left' ? -Math.PI / 2 : pending === 'right' ? Math.PI / 2 : pending === 'uturn' ? Math.PI : 0;
      matches.sort((a, b) => Math.abs(Math.abs(a.angle) - Math.abs(target)) - Math.abs(Math.abs(b.angle) - Math.abs(target)));
      return { edge: matches[0].edge, consumed: true, isIntersection: junction };
    }
  }
  angled.sort((a, b) => {
    const score = (choice: typeof a) => Math.abs(choice.angle) + (choice.edge.wayId === incoming.wayId ? -0.15 : 0) + (incoming.name && choice.edge.name === incoming.name ? -0.1 : 0);
    return score(a) - score(b);
  });
  return { edge: angled[0].edge, consumed: false, isIntersection: junction };
}

/** One shared turn policy for simulation, available controls and routing. */
export function selectNextEdge(graph: RoadGraph, incoming: RoadEdge, pending: Turn | null): EdgeSelection {
  return selectFromCandidates(incoming, legalOutgoing(graph, incoming), isIntersection(graph, incoming.to), pending);
}

/** Source legality stays in legalOutgoing. Navigation uses transitions the
 * directional controls can actually select. In particular, a geometry node
 * cannot be used as a U-turn, and a multi-branch fork uses the same forgiving
 * canonical left/right choice as the driving controller. */
export function drivableOutgoing(graph: RoadGraph, incoming: RoadEdge): RoadEdge[] {
  const legal = legalOutgoing(graph, incoming);
  const junction = isIntersection(graph, incoming.to);
  if (!junction) {
    const selected = selectFromCandidates(incoming, legal, false, null).edge;
    return selected ? [selected] : [];
  }
  const result = new Map<string, RoadEdge>();
  for (const turn of ['left', 'right', 'straight', 'uturn'] as const) {
    const selected = selectFromCandidates(incoming, legal, true, turn);
    if (selected.edge && selected.consumed) result.set(selected.edge.id, selected.edge);
  }
  return [...result.values()];
}

export interface UpcomingDecision {
  incomingEdgeId: string;
  distance: number;
  choices: TurnChoice[];
}

/** Look through polyline shape nodes to the next real intersection/deadend.
 * Uses the fixed default continuation without changing buffered turn/state. */
export function nextDecision(graph: RoadGraph, state: Pick<VehicleState, 'edgeId' | 'distance'>, maxDistance = 2000): UpcomingDecision | null {
  const initial = graph.edges.get(state.edgeId);
  if (!initial) return null;
  let incoming: RoadEdge = initial;
  let distance = Math.max(0, incoming.length - state.distance);
  const seen = new Set<string>();
  while (distance <= maxDistance && seen.size < 2000) {
    if (seen.has(incoming.id)) return null;
    seen.add(incoming.id);
    const legal = legalOutgoing(graph, incoming);
    if (isIntersection(graph, incoming.to) || !legal.some(edge => edge.to !== incoming.from)) {
      return { incomingEdgeId: incoming.id, distance, choices: outgoingChoices(graph, { edgeId: incoming.id }) };
    }
    const next: RoadEdge | null = selectFromCandidates(incoming, legal, false, null).edge;
    if (!next) return { incomingEdgeId: incoming.id, distance, choices: [] };
    incoming = next;
    distance += incoming.length;
  }
  return null;
}

/** Dijkstra over incoming-edge states, so an otherwise short route cannot
 * bypass a source turn restriction. Optional preferred edges bias learning
 * routes gently but never alter road connectivity. */
export function findRoute(graph: RoadGraph, startNode: string | number, targetNode: string | number, preferredEdges?: ReadonlySet<string>, incomingEdgeId?: string): Route | null {
  const start = String(startNode);
  const target = String(targetNode);
  if (!graph.nodes.has(start) || !graph.nodes.has(target)) return null;
  if (start === target) return { nodeIds: [start], edgeIds: [], distance: 0 };
  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const queue = new MinQueue();
  const incoming = incomingEdgeId ? graph.edges.get(incomingEdgeId) : undefined;
  if (incomingEdgeId && (!incoming || incoming.to !== start)) return null;
  const firstEdges = incoming ? drivableOutgoing(graph, incoming).map(edge => edge.id) : graph.outgoing.get(start) ?? [];
  for (const id of firstEdges) {
    const edge = graph.edges.get(id)!;
    const cost = edge.length * (preferredEdges?.has(id) ? 0.8 : 1);
    distances.set(id, cost);
    previous.set(id, null);
    queue.push({ id, cost });
  }
  while (queue.length) {
    const current = queue.pop()!;
    if (current.cost !== distances.get(current.id)) continue;
    const edge = graph.edges.get(current.id)!;
    if (edge.to === target) {
      const edgeIds: string[] = [];
      let cursor: string | null = current.id;
      while (cursor !== null) { edgeIds.push(cursor); cursor = previous.get(cursor) ?? null; }
      edgeIds.reverse();
      return { edgeIds, nodeIds: [start, ...edgeIds.map(id => graph.edges.get(id)!.to)], distance: edgeIds.reduce((sum, id) => sum + graph.edges.get(id)!.length, 0) };
    }
    for (const next of drivableOutgoing(graph, edge)) {
      const cost = current.cost + next.length * (preferredEdges?.has(next.id) ? 0.8 : 1) + (next.to === edge.from ? 30 : 0);
      if (cost >= (distances.get(next.id) ?? Infinity)) continue;
      distances.set(next.id, cost);
      previous.set(next.id, current.id);
      queue.push({ id: next.id, cost });
    }
  }
  return null;
}

/** Starts beyond the current edge while preserving the first legal turn. */
export function routeFromVehicle(graph: RoadGraph, state: Pick<VehicleState, 'edgeId'>, targetNode: string | number, preferredEdges?: ReadonlySet<string>): Route | null {
  const edge = graph.edges.get(state.edgeId);
  return edge ? findRoute(graph, edge.to, targetNode, preferredEdges, edge.id) : null;
}

export function isValidRoute(graph: RoadGraph, edgeIds: string[]): boolean {
  if (!edgeIds.length) return false;
  let previous: RoadEdge | undefined;
  for (const id of edgeIds) {
    const edge = graph.edges.get(id);
    if (!edge) return false;
    if (previous && !drivableOutgoing(graph, previous).some(candidate => candidate.id === edge.id)) return false;
    previous = edge;
  }
  return true;
}

class MinQueue {
  private items: Array<{ id: string; cost: number }> = [];
  get length(): number { return this.items.length; }
  push(item: { id: string; cost: number }): void {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent].cost <= item.cost) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }
  pop(): { id: string; cost: number } | undefined {
    const result = this.items[0];
    const last = this.items.pop();
    if (!this.items.length || !last) return result;
    let index = 0;
    while (index * 2 + 1 < this.items.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.items.length && this.items[child + 1].cost < this.items[child].cost) child++;
      if (this.items[child].cost >= last.cost) break;
      this.items[index] = this.items[child];
      index = child;
    }
    this.items[index] = last;
    return result;
  }
}

export function nearestNode(graph: RoadGraph, position: [number, number]): string | null {
  const metric = project(position);
  let closest: string | null = null;
  let distance = Infinity;
  for (const node of graph.nodes.values()) {
    if (!(graph.outgoing.get(node.id)?.length)) continue;
    const d = (node.x - metric.x) ** 2 + (node.y - metric.y) ** 2;
    if (d < distance) { closest = node.id; distance = d; }
  }
  return closest;
}
