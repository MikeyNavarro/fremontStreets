import type { Route, VehicleEvent } from './types';

export interface SavedPracticeRoute {
  id: string;
  name: string;
  edgeIds: string[];
  destinationNode: string;
  savedAt: string;
}
export interface ZoneProgress {
  streetNames: string[];
  intersectionIds: string[];
  challengesCompleted: number;
  quizCorrect: number;
  quizTotal: number;
  savedRoutes: SavedPracticeRoute[];
  unguidedRoutesCompleted: number;
  recentStreets: string[];
}
export interface LearningProgress {
  version: 1;
  zones: Record<string, ZoneProgress>;
}
export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const PROGRESS_KEY = 'fremont-streets-progress-v1';
export function emptyZoneProgress(): ZoneProgress {
  return { streetNames: [], intersectionIds: [], challengesCompleted: 0, quizCorrect: 0, quizTotal: 0, savedRoutes: [], unguidedRoutesCompleted: 0, recentStreets: [] };
}
export function createProgress(): LearningProgress {
  return { version: 1, zones: { all: emptyZoneProgress(), 'zone-1': emptyZoneProgress(), 'zone-2': emptyZoneProgress(), 'zone-3': emptyZoneProgress() } };
}
export function getZoneProgress(progress: LearningProgress, zoneId: string): ZoneProgress {
  return progress.zones[zoneId] ?? emptyZoneProgress();
}

/** Exploration is counted separately from quizzes and completed challenges.
 * No dataset-completion percentage is computed from a partial extract. */
export function recordExploration(progress: LearningProgress, zoneId: string, events: VehicleEvent[]): LearningProgress {
  const zone = getZoneProgress(progress, zoneId);
  const streets = new Set(zone.streetNames);
  const intersections = new Set(zone.intersectionIds);
  let recent = [...zone.recentStreets];
  for (const event of events) {
    if (event.type === 'street' && event.name?.trim()) {
      streets.add(event.name);
      recent = [event.name, ...recent.filter(name => name !== event.name)].slice(0, 8);
    } else if (event.type === 'intersection') intersections.add(event.id);
  }
  return { ...progress, zones: { ...progress.zones, [zoneId]: { ...zone, streetNames: [...streets], intersectionIds: [...intersections], recentStreets: recent } } };
}
export function recordQuiz(progress: LearningProgress, zoneId: string, correct: boolean): LearningProgress {
  const zone = getZoneProgress(progress, zoneId);
  return { ...progress, zones: { ...progress.zones, [zoneId]: { ...zone, quizTotal: zone.quizTotal + 1, quizCorrect: zone.quizCorrect + Number(correct) } } };
}
export function recordChallenge(progress: LearningProgress, zoneId: string, guidanceUsed: boolean): LearningProgress {
  const zone = getZoneProgress(progress, zoneId);
  return { ...progress, zones: { ...progress.zones, [zoneId]: { ...zone, challengesCompleted: zone.challengesCompleted + 1, unguidedRoutesCompleted: zone.unguidedRoutesCompleted + Number(!guidanceUsed) } } };
}
export function savePracticeRoute(progress: LearningProgress, zoneId: string, route: SavedPracticeRoute): LearningProgress {
  if (!route.edgeIds.length) return progress;
  const zone = getZoneProgress(progress, zoneId);
  return { ...progress, zones: { ...progress.zones, [zoneId]: { ...zone, savedRoutes: [...zone.savedRoutes.filter(item => item.id !== route.id), { ...route, edgeIds: [...route.edgeIds] }] } } };
}

function validStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === 'string'); }
function count(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0; }
/** Validate persisted values: damaged browser storage never crashes driving. */
export function deserializeProgress(value: string | null): LearningProgress {
  if (!value) return createProgress();
  try {
    const parsed = JSON.parse(value);
    if (parsed?.version !== 1 || !parsed.zones || typeof parsed.zones !== 'object' || Array.isArray(parsed.zones)) return createProgress();
    const result = createProgress();
    for (const [id, input] of Object.entries(parsed.zones)) {
      if (['__proto__', 'constructor', 'prototype'].includes(id)) continue;
      if (!input || typeof input !== 'object' || Array.isArray(input)) continue;
      const zone = input as Record<string, unknown>;
      const routes: SavedPracticeRoute[] = [];
      if (Array.isArray(zone.savedRoutes)) for (const route of zone.savedRoutes) {
        if (route && typeof route.id === 'string' && typeof route.name === 'string' && validStringArray(route.edgeIds) && route.edgeIds.length > 0 && typeof route.destinationNode === 'string' && typeof route.savedAt === 'string') routes.push(route);
      }
      const total = count(zone.quizTotal);
      result.zones[id] = {
        streetNames: validStringArray(zone.streetNames) ? [...new Set(zone.streetNames)] : [],
        intersectionIds: validStringArray(zone.intersectionIds) ? [...new Set(zone.intersectionIds)] : [],
        challengesCompleted: count(zone.challengesCompleted), quizCorrect: Math.min(total, count(zone.quizCorrect)), quizTotal: total,
        savedRoutes: routes, unguidedRoutesCompleted: Math.min(count(zone.challengesCompleted), count(zone.unguidedRoutesCompleted)),
        recentStreets: validStringArray(zone.recentStreets) ? zone.recentStreets.slice(0, 8) : [],
      };
    }
    return result;
  } catch { return createProgress(); }
}
export function loadProgress(storage: ProgressStorage): LearningProgress {
  try { return deserializeProgress(storage.getItem(PROGRESS_KEY)); } catch { return createProgress(); }
}
export function persistProgress(storage: ProgressStorage, progress: LearningProgress): boolean {
  try { storage.setItem(PROGRESS_KEY, JSON.stringify(progress)); return true; } catch { return false; }
}

export interface NavigationChallenge {
  route: Route;
  destinationNode: string;
  completed: boolean;
  guidanceUsed: boolean;
  visitedEdgeIds: string[];
}
export function createChallenge(route: Route, guidanceUsed = true): NavigationChallenge {
  if (!route.edgeIds.length) throw new Error('A challenge must require driving to a different node.');
  return { route, destinationNode: route.nodeIds[route.nodeIds.length - 1], completed: false, guidanceUsed, visitedEdgeIds: [] };
}
/** Reaching the destination after movement completes a navigation task. A
 * detour is legal: learning routes are suggestions, not physical walls. */
export function updateChallenge(challenge: NavigationChallenge, fromNode: string, toNode: string, edgeId: string): NavigationChallenge {
  if (challenge.completed) return challenge;
  const visitedEdgeIds = [...challenge.visitedEdgeIds, edgeId];
  return { ...challenge, visitedEdgeIds, completed: toNode === challenge.destinationNode && fromNode !== toNode };
}
