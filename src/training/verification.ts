import type { LonLat } from '../core';
export type EvidenceStatus = 'Verified' | 'Unresolved' | 'Conflicted';
export type Dimension = 'identity' | 'geometry' | 'topology' | 'maneuvers';
export interface Fact { status: EvidenceStatus; evidence: string[]; scope: string; reason: string }
export type Dimensions = Record<Dimension, Fact>;
export interface VerifiedSegment { edgeId: string; cityObjectIds: number[]; maxOffsetMetres: number; samples: number }
export interface EntryEvidence extends Dimensions { id: string; label: string; segments: VerifiedSegment[]; totalEdges: number }
export interface JunctionEvidence extends Dimensions { id: string; entryIds: string[]; position: LonLat }
export interface VerificationRegistry {
  schema: 1; version: string; roadsSha256: string; curriculumSha256: string;
  sources: Record<string, { url: string; sha256: string; retrievedAt: string; version: string; limitations: string }>;
  policy: { geometryToleranceMetres: number; sampleSpacingMetres: number; note: string };
  entries: EntryEvidence[]; junctions: JunctionEvidence[];
}
export function recognitionEligible(entry: EntryEvidence | undefined, edgeId?: string): boolean {
  return !!entry && entry.identity.status === 'Verified' && entry.geometry.status !== 'Conflicted'
    && entry.segments.some(segment => !edgeId || segment.edgeId === edgeId);
}
export function intersectionEligible(junction: JunctionEvidence | undefined): boolean {
  return !!junction && Object.values(junction).filter((v):v is Fact => !!v && typeof v === 'object' && 'status' in v)
    .every(fact => fact.status === 'Verified');
}
/** No inference of permission from a missing restriction or a City line crossing. */
export function navigationEligible(entry: EntryEvidence | undefined): boolean {
  return !!entry && recognitionEligible(entry) && entry.topology.status === 'Verified' && entry.maneuvers.status === 'Verified';
}
export function fact(status: EvidenceStatus, scope: string, reason: string, evidence: string[] = []): Fact {
  return { status, scope, reason, evidence };
}
