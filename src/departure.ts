import { createVehicle, findRoute, isValidRoute, project, routeFromVehicle } from './core';
import type { LonLat, ProgressStorage, RoadGraph, Route, VehicleState } from './core';
import type { PatrolStudy } from './patrol';

export const PRACTICE_ZONE_KEY = 'fremont-streets-practice-zone-v1';
export const DEFAULT_PRACTICE_ZONE = 'zone1';

/** Building reference, not a surveyed entrance or parking-space coordinate. */
export const POLICE_STATION = {
  name: 'Fremont Police Department',
  position: [-121.96914156153846, 37.55273364615385] as LonLat,
  street: 'Stevenson Boulevard',
  departureEdgeId: '417403358:0:f',
  departureSourceUrl: 'https://www.openstreetmap.org/way/417403358',
  sourceUrl: 'https://www.openstreetmap.org/way/37751672',
  sourceVersion: 8,
  sourceTimestamp: '2022-12-31T21:36:08Z',
  checkedAt: '2026-10-19',
};
const departures = new WeakMap<RoadGraph, {edgeId:string;distance:number}>();

/** Reviewed westbound public-road departure on the existing OSM centerline.
 * This is not a modeled driveway. Pinning the reviewed source edge keeps
 * sessions reproducible; topology and round-trip reachability are audited. */
export function stationDeparture(graph: RoadGraph): VehicleState {
  const cached=departures.get(graph);if(cached)return createVehicle(graph,cached.edgeId,cached.distance);
  const edge=graph.edges.get(POLICE_STATION.departureEdgeId);
  if(!edge||edge.name!==POLICE_STATION.street)throw new Error('The reviewed police headquarters public-road departure is missing.');
  const point=project(POLICE_STATION.position),from=graph.nodes.get(edge.from)!,to=graph.nodes.get(edge.to)!;
  const dx=to.x-from.x,dy=to.y-from.y;
  const t=Math.max(0,Math.min(1,((point.x-from.x)*dx+(point.y-from.y)*dy)/(dx*dx+dy*dy)));
  if(Math.hypot(from.x+t*dx-point.x,from.y+t*dy-point.y)>300)throw new Error('The reviewed departure is no longer near headquarters.');
  // Leave a genuine approach so a turn can be queued while stopped.
  const distance=Math.max(0,Math.min(edge.length*t,edge.length-20));
  departures.set(graph,{edgeId:edge.id,distance});
  return createVehicle(graph,edge.id,distance);
}

export function loadPracticeZone(storage: Pick<ProgressStorage, 'getItem'>, study: PatrolStudy): string {
  try {
    const id = storage.getItem(PRACTICE_ZONE_KEY);
    if (id && study.zone(id)?.geometry && study.coverage.zones[id]?.available) return id;
  } catch { /* Storage can be disabled; Zone 1 remains the session default. */ }
  return DEFAULT_PRACTICE_ZONE;
}

export function rememberPracticeZone(storage: Pick<ProgressStorage, 'setItem'>, id: string): void {
  if (!['zone1', 'zone2', 'zone3'].includes(id)) return;
  try { storage.setItem(PRACTICE_ZONE_KEY, id); } catch { /* Session remains usable. */ }
}

/** A zone outside the station's neighborhood needs a connected approach route,
 * rather than the old 950 m destination cutoff or an in-zone teleport. */
export function chooseStudyRoute(graph: RoadGraph, study: PatrolStudy, vehicle: VehicleState, zoneId: string): Route | null {
  const edge = graph.edges.get(vehicle.edgeId)!;
  const inside = study.contains(vehicle.position, zoneId);
  const distance = (id: string) => {
    const node = graph.nodes.get(id)!;
    return Math.hypot(node.x - vehicle.metric.x, node.y - vehicle.metric.y);
  };
  const candidates = [...graph.nodes.values()].filter(node => study.safeDestination(zoneId, node.id) && distance(node.id) > 250 && (!inside || distance(node.id) < 950) && (graph.outgoing.get(node.id)?.length ?? 0) > 2)
    .sort((a, b) => Math.abs(distance(a.id) - 550) - Math.abs(distance(b.id) - 550));
  for (const node of candidates.slice(0, 60)) {
    const tail = routeFromVehicle(graph, vehicle, node.id, study.preferredEdges(zoneId));
    if (tail && tail.edgeIds.length > 3 && isValidRoute(graph, [edge.id, ...tail.edgeIds])) {
      return { nodeIds: [edge.from, ...tail.nodeIds], edgeIds: [edge.id, ...tail.edgeIds], distance: edge.length - vehicle.distance + tail.distance };
    }
  }
  return null;
}

/** Preserve saved roads, joining older in-zone starts from the station only
 * when the complete approach and join respect the existing road graph. */
export function practiceRouteFromStation(graph: RoadGraph, vehicle: VehicleState, saved: Route, preferred?: ReadonlySet<string>): Route | null {
  if (!isValidRoute(graph, saved.edgeIds)) return null;
  const current = graph.edges.get(vehicle.edgeId)!;
  let edgeIds = saved.edgeIds;
  if (edgeIds[0] !== current.id) {
    const first = graph.edges.get(edgeIds[0])!;
    const approach = findRoute(graph, current.to, first.from, preferred, current.id);
    if (!approach) return null;
    edgeIds = [current.id, ...approach.edgeIds, ...edgeIds];
  }
  if (!isValidRoute(graph, edgeIds)) return null;
  return { edgeIds, nodeIds: [current.from, ...edgeIds.map(id => graph.edges.get(id)!.to)], distance: edgeIds.reduce((sum, id) => sum + graph.edges.get(id)!.length, 0) - vehicle.distance };
}
