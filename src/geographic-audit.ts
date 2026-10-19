import type { Fact, EvidenceStatus } from './training/verification';

/** Evidence for one assertion must never silently establish another assertion.
 * This offline audit extends the four runtime eligibility dimensions without
 * changing the runtime scoring registry or the authoritative road graph. */
export const AUDIT_DIMENSIONS = [
  'identity', 'geometry', 'intersectionLocation', 'topology', 'gradeSeparation',
  'vehicleAccess', 'oneWay', 'maneuvers', 'reachability',
] as const;
export type AuditDimension = typeof AUDIT_DIMENSIONS[number];
export type AuditDimensions = Record<AuditDimension, Fact>;
export interface IndependentSource {
  id: string; url: string; provider: string; retrievedAt: string;
  publishedAt?: string; limitations: string; [key: string]: unknown;
}
export interface IndependentClaim {
  id: string;
  subject: { kind: 'junction' | 'entry' | 'connector' | 'movement' | 'crossing'; id: string };
  dimension: AuditDimension; status: EvidenceStatus; sourceIds: string[];
  scope: string; reason: string;
}
export interface IndependentEvidence {
  schema: 1; sources: IndependentSource[]; claims: IndependentClaim[];
}
export const ROUTE_STATUSES = [
  'independently-supported', 'graph-reachable-partially-verified',
  'unreachable-current-graph', 'missing-geographic-coverage', 'blocked-known-restriction',
] as const;
export type AuditRouteStatus = typeof ROUTE_STATUSES[number];

export function unresolvedDimensions(scope: string, evidence: string[] = []): AuditDimensions {
  return Object.fromEntries(AUDIT_DIMENSIONS.map(dimension => [dimension, {
    status: 'Unresolved', scope, evidence: [...evidence],
    reason: `Independent evidence for ${dimension} has not established this fact. Source graph observations are reported separately.`,
  }])) as AuditDimensions;
}

/** A claim is applied only to its exact subject and dimension. Conflicting
 * claims cannot be overwritten by a later favorable claim. */
export function applyIndependentClaims(
  facts: AuditDimensions, kind: IndependentClaim['subject']['kind'], id: string,
  evidence: IndependentEvidence,
): AuditDimensions {
  const sources = new Map(evidence.sources.map(source => [source.id, source]));
  const result = structuredClone(facts);
  for (const dimension of AUDIT_DIMENSIONS) {
    const claims = evidence.claims.filter(claim => claim.subject.kind === kind && claim.subject.id === id && claim.dimension === dimension);
    if (!claims.length) continue;
    for (const claim of claims) {
      if (!claim.sourceIds.length || claim.sourceIds.some(source => !sources.has(source))) {
        throw new Error(`Independent claim ${claim.id} lacks a resolvable source record.`);
      }
      if (!claim.scope.trim() || !claim.reason.trim()) throw new Error(`Independent claim ${claim.id} lacks an explicit scope or reason.`);
    }
    const statuses = new Set(claims.map(claim => claim.status));
    const priorConflict = facts[dimension].status === 'Conflicted' ? facts[dimension] : null;
    result[dimension] = {
      status: priorConflict || statuses.has('Conflicted') ? 'Conflicted' : statuses.has('Unresolved') ? 'Unresolved' : 'Verified',
      scope: [...(priorConflict ? [priorConflict.scope] : []), ...claims.map(claim => claim.scope)].join(' | '),
      reason: [...(priorConflict ? [`Existing unresolved conflict: ${priorConflict.reason}`] : []), ...claims.map(claim => `${claim.id}: ${claim.reason}`)].join(' | '),
      evidence: [...new Set([...(priorConflict?.evidence ?? []), ...claims.flatMap(claim => claim.sourceIds)])],
    };
  }
  return result;
}

/** Pathfinding success establishes only software reachability. A whole-route
 * legal claim needs every actual edge/movement and all material dimensions. */
export function classifyAuditRoute(input: {
  hasCoverage: boolean; graphReachable: boolean; independentlySupported: boolean;
  knownProhibition?: { sourceIds: string[]; appliesToWholeRoute: boolean };
}): AuditRouteStatus {
  if (!input.hasCoverage) return 'missing-geographic-coverage';
  if (input.knownProhibition?.appliesToWholeRoute && input.knownProhibition.sourceIds.length) return 'blocked-known-restriction';
  if (!input.graphReachable) return 'unreachable-current-graph';
  return input.independentlySupported ? 'independently-supported' : 'graph-reachable-partially-verified';
}

export function independentlySupportedDimensions(facts: AuditDimensions): boolean {
  return AUDIT_DIMENSIONS.every(dimension => facts[dimension].status === 'Verified' && facts[dimension].evidence.length > 0);
}
