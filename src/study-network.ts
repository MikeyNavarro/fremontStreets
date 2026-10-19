import type { LonLat, RoadGraph, Route, VehicleState } from './core';

export interface StudyEntry {
  id: string; group: 'ew' | 'ns'; originalLabel: string; names: string[]; note?: string; ref?: string; needsConfirmation?: boolean;
  mappedNames: string[]; edgeIds: string[]; sourceWayIds: string[]; cityObjectIds: number[]; cityClasses: string[]; osmClasses: string[];
  zone1EdgeIds: string[];
  zone1Location: { representativeEdge:string; fromHeadquarters:Route; toHeadquarters:Route } | null;
  zones: string[]; approximateLengthMetres: number; status: 'ready' | 'needs-confirmation' | 'missing-geometry' | 'unreachable';
  reason: string; representativeEdge: string | null; fromHeadquarters: Route | null; toHeadquarters: Route | null;
  approaches: Array<{ edgeId: string; fromHeadquarters: boolean; toHeadquarters: boolean; forwardMetres: number | null; returnMetres: number | null }>;
  intersectionIds: string[]; coverage: string;
}
export interface StudyJunction {
  id: string; logicalId: string; nodeId: string; position: LonLat; entryIds: string[];
  inZone1Study: boolean;
  incomingEdgeIds: string[]; outgoingEdgeIds: string[]; sourceWayIds: string[];
  movements: Array<{ incoming: string; outgoing: string[] }>;
  restrictionIds: string[]; status: string; connectionType: string;
}
export interface StudyNetwork {
  version: string; roadsSha256: string; boundaryVersion: string | null;
  station: { name: string; position: LonLat; sourceUrl: string; sourceVersion: number; sourceTimestamp: string; checkedAt: string; street: string; edgeId: string; distance: number; departurePosition: LonLat; note: string };
  entries: StudyEntry[]; intersections: StudyJunction[];
  limitations: string[]; source: { osm: string; city: string; handwritten: string };
}

export function canonicalRoadName(name: string): string {
  const words: Record<string, string> = { avenue:'ave',boulevard:'blvd',road:'rd',street:'st',drive:'dr',parkway:'pkwy',court:'ct',lane:'ln',terrace:'ter',place:'pl',circle:'cir',common:'cmn',east:'e',west:'w',north:'n',south:'s' };
  return name.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).map(word => words[word] ?? word).join(' ').trim();
}

export type StudyExercise = 'reach' | 'random' | 'road-to-road' | 'intersection' | 'no-gps' | 'return';
export interface StudyMission {
  exercise: StudyExercise; targetId: string; sourceId?: string; guided: boolean; startedDistance: number;
  goal: { kind:'road'; edgeIds:string[] } | { kind:'headquarters'; edgeId:string; distance:number } | { kind:'intersection'; nodeId:string; incomingEdgeId:string; outgoingEdgeIds:string[] };
  status:'active'|'complete'; route:Route;
}

/** Arrival follows the driven road/edge events, independent of suggested route.
 * Crossing a bridge above a destination cannot satisfy its directed-edge goal. */
export function studyArrival(mission: StudyMission, vehicle: VehicleState): boolean {
  if (vehicle.totalDistance <= mission.startedDistance + 2) return false;
  const goal = mission.goal;
  if (goal.kind === 'road') return goal.edgeIds.includes(vehicle.edgeId) || vehicle.events.some(event => Boolean(event.edgeId && goal.edgeIds.includes(event.edgeId)));
  if (goal.kind === 'headquarters') return vehicle.edgeId === goal.edgeId && vehicle.distance >= goal.distance || vehicle.events.some(event => event.type === 'node' && event.edgeId === goal.edgeId);
  const crossing=vehicle.events.findIndex(event=>event.type==='node'&&event.id===goal.nodeId&&event.edgeId===goal.incomingEdgeId);
  return crossing>=0&&(goal.outgoingEdgeIds.includes(vehicle.edgeId)||vehicle.events.slice(crossing+1).some(event=>Boolean(event.edgeId&&goal.outgoingEdgeIds.includes(event.edgeId))));
}

export const STUDY_PROGRESS_KEY = 'fremont-streets-personal-study-v1';
export interface StudyRecord { visits: number; guided: number; unguided: number; roadToRoad: number; returns: number; identified: number; repetitions: number }
export interface StudyProgress { version:1; entries:Record<string,StudyRecord>; intersections:Record<string,{completed:number;identified:number}> }
export function emptyStudyRecord(): StudyRecord { return { visits:0,guided:0,unguided:0,roadToRoad:0,returns:0,identified:0,repetitions:0 }; }
export function loadStudyProgress(storage: Pick<Storage,'getItem'>): StudyProgress {
  try {
    const value=JSON.parse(storage.getItem(STUDY_PROGRESS_KEY)??'null');
    if(value?.version===1&&value.entries&&value.intersections){
      const entries:Record<string,StudyRecord>={};
      for(const [id,record] of Object.entries(value.entries)){const cleaned=emptyStudyRecord();for(const key of Object.keys(cleaned) as Array<keyof StudyRecord>){const number=(record as StudyRecord)?.[key];cleaned[key]=typeof number==='number'&&Number.isFinite(number)&&number>=0?number:0;}entries[id]=cleaned;}
      return {version:1,entries,intersections:Object.fromEntries(Object.entries(value.intersections).map(([id,record])=>[id,{completed:Math.max(0,Number((record as any)?.completed)||0),identified:Math.max(0,Number((record as any)?.identified)||0)}]))};
    }
  } catch { /* Old/malformed browser data must not prevent driving. */ }
  return {version:1,entries:{},intersections:{}};
}
export function saveStudyProgress(storage: Pick<Storage,'setItem'>, progress: StudyProgress): boolean { try { storage.setItem(STUDY_PROGRESS_KEY,JSON.stringify(progress));return true; } catch { return false; } }
export function readyStudyEntries(network: StudyNetwork): StudyEntry[] { return network.entries.filter(entry=>entry.status==='ready'&&entry.fromHeadquarters&&entry.toHeadquarters); }
export function randomStudyEntry(network: StudyNetwork, random = Math.random): StudyEntry | null { const ready=readyStudyEntries(network); return ready.length ? ready[Math.min(ready.length-1,Math.max(0,Math.floor(random()*ready.length)))] : null; }
export function routeRoads(graph: RoadGraph, route: Route): string[] { return [...new Set(route.edgeIds.map(id=>graph.edges.get(id)?.name).filter((name):name is string=>Boolean(name)))]; }
