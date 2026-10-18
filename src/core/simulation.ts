import { normalizeAngle, selectNextEdge } from './graph';
import { unproject } from './projection';
import type { AccelerationProfile, CameraMode, DrivingInput, GameState, RoadEdge, RoadGraph, Route, SimulationOptions, Turn, VehicleState } from './types';

export const MPH_TO_MPS = 0.44704;
export const DEFAULT_PROFILE: AccelerationProfile = 'QUICK';
export const MAX_VEHICLE_SPEED_MPH = 55;
export const ACCELERATION_PROFILES: Record<AccelerationProfile, { low: number; middle: number; high: number }> = {
  NORMAL: { low: 3.3, middle: 2.2, high: 1.7 },
  QUICK: { low: 30 * MPH_TO_MPS / 2.5, middle: 15 * MPH_TO_MPS / 2, high: 2.5 },
  SPORT: { low: 7, middle: 5, high: 3.5 },
};

function amount(value: number | boolean): number {
  return typeof value === 'boolean' ? Number(value) : Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/** Immediate throttle. No speed/ramp delay or throttle smoothing. Fixed small
 * integration steps make 30/45 mph profile thresholds frame-rate stable. */
export function advanceSpeed(speed: number, input: Pick<DrivingInput, 'throttle' | 'brake'>, dt: number, options: SimulationOptions = {}): number {
  const profile = ACCELERATION_PROFILES[options.profile ?? DEFAULT_PROFILE];
  const cap = Math.max(0, Math.min(MAX_VEHICLE_SPEED_MPH, options.maxSpeedMph ?? MAX_VEHICLE_SPEED_MPH)) * MPH_TO_MPS;
  const throttle = amount(input.throttle);
  const brake = amount(input.brake);
  let result = Math.max(0, speed);
  let remaining = Math.max(0, Number.isFinite(dt) ? dt : 0);
  while (remaining > 1e-9) {
    const step = Math.min(remaining, 0.01);
    const acceleration = result < 30 * MPH_TO_MPS - 1e-7 ? profile.low : result < 45 * MPH_TO_MPS - 1e-7 ? profile.middle : profile.high;
    const delta = brake > 0 ? -6.5 * brake : throttle > 0 ? acceleration * throttle : -0.55;
    result = Math.max(0, Math.min(cap, result + delta * step));
    remaining -= step;
  }
  return result;
}

function placeVehicle(graph: RoadGraph, state: VehicleState): VehicleState {
  const edge = graph.edges.get(state.edgeId)!;
  const from = graph.nodes.get(edge.from)!;
  const to = graph.nodes.get(edge.to)!;
  const t = Math.max(0, Math.min(1, state.distance / edge.length));
  const metric = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  return { ...state, metric, position: unproject(metric), heading: edge.heading };
}

export function createVehicle(graph: RoadGraph, edgeId?: string, distance = 0): VehicleState {
  const selected = edgeId ?? graph.edges.keys().next().value;
  if (!selected || !graph.edges.has(selected)) throw new Error('A vehicle requires an existing drivable road edge.');
  const edge = graph.edges.get(selected)!;
  return placeVehicle(graph, {
    edgeId: selected, distance: Math.max(0, Math.min(edge.length, distance)), speed: 0,
    position: [0, 0], metric: { x: 0, y: 0 }, heading: 0,
    pendingTurn: null, previousEdgeId: null, totalDistance: 0,
    events: edge.name ? [{ type: 'street', id: edge.name, name: edge.name }] : [],
  });
}

/** Turn requests remain buffered until a legal matching branch is reached.
 * At ordinary geometry nodes the car follows the continuous road, preserving
 * the requested turn for the next intersection. */
/** All movement follows an actual directed edge, then a shared OSM node.
 * Simulation assists do not create traffic rules or missing geographic data. */
export function stepVehicle(graph: RoadGraph, state: VehicleState, input: DrivingInput, dt: number, options: SimulationOptions = {}): VehicleState {
  if (!graph.edges.has(state.edgeId)) throw new Error('Vehicle edge is outside this road graph.');
  if (!Number.isFinite(dt) || dt < 0) throw new Error('Simulation dt must be finite and nonnegative.');
  let current: VehicleState = { ...state, position: [...state.position], metric: { ...state.metric }, pendingTurn: input.turn ?? state.pendingTurn, events: [] };
  let remaining = dt;
  while (remaining > 1e-9) {
    const step = Math.min(remaining, 0.02);
    const edge = graph.edges.get(current.edgeId)!;
    const limit = options.obeyKnownSpeedLimits && edge.speedLimitMph !== null ? Math.min(options.maxSpeedMph ?? MAX_VEHICLE_SPEED_MPH, edge.speedLimitMph) : options.maxSpeedMph;
    const nextSpeed = advanceSpeed(current.speed, input, step, { ...options, maxSpeedMph: limit });
    let movement = (current.speed + nextSpeed) / 2 * step;
    current.speed = nextSpeed;
    // One time step may span several short OSM segments. Consume every edge
    // in sequence rather than teleporting to a nearest road.
    let transitions = 0;
    while (movement > 1e-9 && transitions < 256) {
      const active = graph.edges.get(current.edgeId)!;
      const available = Math.max(0, active.length - current.distance);
      const traveled = Math.min(available, movement);
      current.distance += traveled;
      current.totalDistance += traveled;
      movement -= traveled;
      if (current.distance < active.length - 1e-7) break;
      if (traveled > 0) current.events.push({ type: 'node', id: active.to, edgeId: active.id });
      const next = selectNextEdge(graph, active, current.pendingTurn);
      if (next.isIntersection && traveled > 0) current.events.push({ type: 'intersection', id: active.to });
      if (!next.edge) { current.speed = 0; movement = 0; break; }
      if (next.edge.name && next.edge.name !== active.name) current.events.push({ type: 'street', id: next.edge.name, name: next.edge.name });
      if (next.consumed) current.pendingTurn = null;
      if (options.cornerAssist && Math.abs(normalizeAngle(next.edge.heading - active.heading)) > Math.PI / 3) current.speed = Math.min(current.speed, 18 * MPH_TO_MPS);
      current.previousEdgeId = active.id;
      current.edgeId = next.edge.id;
      current.distance = 0;
      transitions++;
    }
    remaining -= step;
  }
  return placeVehicle(graph, current);
}

export function createGameState(vehicle: VehicleState, zoneId = 'all'): GameState {
  return { vehicle, camera: 'overhead', activeRoute: null, zoneId };
}

/** Pure camera presentation change; vehicle, route and zone references are
 * preserved exactly. Renderers read this single authoritative vehicle. */
export function setCamera(state: GameState, camera: CameraMode): GameState {
  return { ...state, camera };
}

export function setActiveRoute(state: GameState, route: Route | null): GameState {
  return { ...state, activeRoute: route };
}
