import { project } from './projection';
import type { LonLat, RoadGraph } from './types';

export type ZoneGeometry = { type: 'Polygon'; coordinates: LonLat[][] } | { type: 'MultiPolygon'; coordinates: LonLat[][][] };
export interface ZoneCalibration {
  method: string;
  uncertaintyMeters: number;
  controlPoints?: Array<{ image: [number, number]; geographic: LonLat }>;
  spatialReference?: string;
  sourceItemId?: string;
  [key: string]: unknown;
}
export interface ZoneMetadata {
  sourceUrl: string;
  boundaryVersion: string | null;
  accuracy?: 'approximate' | 'official' | 'unverified';
  geometrySource?: 'official-gis' | 'calibrated-screenshot' | 'unverified';
  screenshotReference?: string | null;
  digitizedAt?: string | null;
  importedAt?: string | null;
  sourceDatasetUrl?: string;
  dataVersion?: string;
  calibration?: ZoneCalibration;
  limitations?: string | string[];
  [key: string]: unknown;
}
export interface StudyZone {
  id: string;
  name: string;
  color?: string;
  status: 'available' | 'partial' | 'unavailable';
  geometry: ZoneGeometry | null;
  boundaryVersion?: string | null;
  reason?: string;
  [key: string]: unknown;
}
export interface ZoneDocument { metadata: ZoneMetadata; zones: StudyZone[] }
export interface GeometryValidation { valid: boolean; errors: string[] }
export interface ZoneValidation extends GeometryValidation { warnings: string[] }
export type PointZoneMembership = 'inside' | 'outside' | 'uncertain';
export interface SegmentZoneMembership { zoneIds: string[]; uncertainZoneIds: string[]; crossesBoundary: boolean }
export interface ClassifiedSegment extends SegmentZoneMembership { segmentId: string; edgeIds: string[] }
export interface ZoneRoadCoverage {
  id: string;
  available: boolean;
  coverage: 'none' | 'partial';
  segmentIds: string[];
  edgeIds: string[];
  streetNames: string[];
  safeDestinationNodeIds: string[];
  ambiguousSegmentIds: string[];
}
export interface ZoneCoverage {
  zones: Record<string, ZoneRoadCoverage>;
  segments: Map<string, ClassifiedSegment>;
  byEdge: Map<string, ClassifiedSegment>;
  validation: ZoneValidation;
}

/** A broad Fremont vicinity guard, not a claimed municipal boundary. */
export const FREMONT_VALIDATION_BOUNDS = [-122.20, 37.40, -121.75, 37.70] as const;
export const APPROXIMATE_ZONE_NOTICE = 'Patrol-zone boundaries are approximate study areas based on the Fremont Police Department\'s published map. They are not verified official GIS boundaries.';

type Point = { x: number; y: number };
type Ring = Point[];
type Polygon = Ring[];
type Bounds = [number, number, number, number];
interface BoundarySegment { a: Point; b: Point }
interface PreparedZone { zone: StudyZone; polygons: Polygon[]; bounds: Bounds; uncertainty: number; boundarySegments: BoundarySegment[]; boundaryGrid: Map<string, number[]> }
interface PreparedDocument { zones: PreparedZone[]; validation: ZoneValidation }
const preparedCache = new WeakMap<ZoneDocument, PreparedDocument>();
const pointZoneCache = new WeakMap<StudyZone, PreparedZone | null>();
const coverageCache = new WeakMap<RoadGraph, WeakMap<ZoneDocument, ZoneCoverage>>();
const GRID_METRES = 250;
const EPS = 1e-7;

function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function coordinate(value: unknown): value is LonLat { return Array.isArray(value) && value.length === 2 && value.every(item => typeof item === 'number' && Number.isFinite(item)); }
function cross(a: Point, b: Point, c: Point): number { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / lengthSquared)) : 0;
  return Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y));
}
function onSegment(p: Point, a: Point, b: Point): boolean { return pointSegmentDistance(p, a, b) <= EPS; }
function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  if (Math.max(a.x, b.x) + EPS < Math.min(c.x, d.x) || Math.max(c.x, d.x) + EPS < Math.min(a.x, b.x) || Math.max(a.y, b.y) + EPS < Math.min(c.y, d.y) || Math.max(c.y, d.y) + EPS < Math.min(a.y, b.y)) return false;
  const aSide = cross(a, b, c), bSide = cross(a, b, d), cSide = cross(c, d, a), dSide = cross(c, d, b);
  if (((aSide > EPS && bSide < -EPS) || (aSide < -EPS && bSide > EPS)) && ((cSide > EPS && dSide < -EPS) || (cSide < -EPS && dSide > EPS))) return true;
  return Math.abs(aSide) <= EPS && onSegment(c, a, b) || Math.abs(bSide) <= EPS && onSegment(d, a, b) || Math.abs(cSide) <= EPS && onSegment(a, c, d) || Math.abs(dSide) <= EPS && onSegment(b, c, d);
}
function inRing(point: Point, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
function inPolygon(point: Point, polygon: Polygon): boolean { return inRing(point, polygon[0]) && !polygon.slice(1).some(hole => inRing(point, hole)); }
function boundsOf(polygons: Polygon[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const polygon of polygons) for (const ring of polygon) for (const point of ring) { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); }
  return [minX, minY, maxX, maxY];
}
function polygonsOf(geometry: ZoneGeometry): Polygon[] { return (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).map(polygon => polygon.map(ring => ring.map(project))); }
function prepareZone(zone: StudyZone, uncertainty: number): PreparedZone {
  const polygons = polygonsOf(zone.geometry!);
  const boundarySegments: BoundarySegment[] = [], boundaryGrid = new Map<string, number[]>();
  for (const polygon of polygons) for (const ring of polygon) for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1], index = boundarySegments.length;
    boundarySegments.push({ a, b });
    for (let x = Math.floor(Math.min(a.x, b.x) / GRID_METRES); x <= Math.floor(Math.max(a.x, b.x) / GRID_METRES); x++) for (let y = Math.floor(Math.min(a.y, b.y) / GRID_METRES); y <= Math.floor(Math.max(a.y, b.y) / GRID_METRES); y++) {
      const key = `${x}:${y}`, items = boundaryGrid.get(key);
      if (items) items.push(index); else boundaryGrid.set(key, [index]);
    }
  }
  return { zone, polygons, bounds: boundsOf(polygons), uncertainty, boundarySegments, boundaryGrid };
}
function nearbyBoundary(zone: PreparedZone, bounds: Bounds): BoundarySegment[] {
  const minX = Math.floor(bounds[0] / GRID_METRES), minY = Math.floor(bounds[1] / GRID_METRES), maxX = Math.floor(bounds[2] / GRID_METRES), maxY = Math.floor(bounds[3] / GRID_METRES);
  if ((maxX - minX + 1) * (maxY - minY + 1) > 5000) return zone.boundarySegments;
  const indices = new Set<number>();
  for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (const index of zone.boundaryGrid.get(`${x}:${y}`) ?? []) indices.add(index);
  return [...indices].map(index => zone.boundarySegments[index]);
}
function ringsIntersect(a: Ring, b: Ring): boolean {
  for (let i = 0; i < a.length - 1; i++) for (let j = 0; j < b.length - 1; j++) if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) return true;
  return false;
}

export function validateZoneGeometry(value: unknown): GeometryValidation {
  const errors: string[] = [];
  if (!object(value) || !['Polygon', 'MultiPolygon'].includes(String(value.type)) || !Array.isArray(value.coordinates)) return { valid: false, errors: ['Boundary must be a GeoJSON Polygon or MultiPolygon.'] };
  const input = value.type === 'Polygon' ? [value.coordinates] : value.coordinates;
  if (!input.length) errors.push('Boundary has no polygons.');
  const polygons: Polygon[] = [];
  for (let p = 0; p < input.length; p++) {
    const rawPolygon = input[p];
    if (!Array.isArray(rawPolygon) || !rawPolygon.length) { errors.push(`Polygon ${p + 1} has no exterior ring.`); continue; }
    const polygon: Polygon = [];
    for (let r = 0; r < rawPolygon.length; r++) {
      const ring = rawPolygon[r];
      if (!Array.isArray(ring) || ring.length < 4 || !ring.every(coordinate)) { errors.push(`Polygon ${p + 1} ring ${r + 1} needs at least four finite longitude/latitude positions.`); continue; }
      if (ring.some(position => position[0] < FREMONT_VALIDATION_BOUNDS[0] || position[0] > FREMONT_VALIDATION_BOUNDS[2] || position[1] < FREMONT_VALIDATION_BOUNDS[1] || position[1] > FREMONT_VALIDATION_BOUNDS[3])) errors.push(`Polygon ${p + 1} ring ${r + 1} is outside the Fremont vicinity validation bounds.`);
      if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) errors.push(`Polygon ${p + 1} ring ${r + 1} must be closed.`);
      const metric = ring.map(project);
      polygon.push(metric);
      let area = 0;
      for (let i = 0; i < metric.length - 1; i++) area += (metric[i].x - metric[0].x) * (metric[i + 1].y - metric[0].y) - (metric[i + 1].x - metric[0].x) * (metric[i].y - metric[0].y);
      if (Math.abs(area) < 1e-12) errors.push(`Polygon ${p + 1} ring ${r + 1} has zero area.`);
      for (let i = 0; i < metric.length - 1; i++) {
        if (Math.hypot(metric[i].x - metric[i + 1].x, metric[i].y - metric[i + 1].y) < EPS) errors.push(`Polygon ${p + 1} ring ${r + 1} has consecutive duplicate vertices.`);
        for (let j = i + 2; j < metric.length - 1; j++) {
          if (i === 0 && j === metric.length - 2) continue;
          if (segmentsIntersect(metric[i], metric[i + 1], metric[j], metric[j + 1])) { errors.push(`Polygon ${p + 1} ring ${r + 1} self-intersects.`); i = metric.length; break; }
        }
      }
    }
    if (polygon.length !== rawPolygon.length) continue;
    for (let h = 1; h < polygon.length; h++) {
      if (!inRing(polygon[h][0], polygon[0]) || ringsIntersect(polygon[0], polygon[h])) errors.push(`Polygon ${p + 1} hole ${h} must be strictly inside its exterior.`);
      for (let j = 1; j < h; j++) if (ringsIntersect(polygon[h], polygon[j]) || inRing(polygon[h][0], polygon[j]) || inRing(polygon[j][0], polygon[h])) errors.push(`Polygon ${p + 1} holes overlap.`);
    }
    polygons.push(polygon);
  }
  if (!errors.length) for (let p = 0; p < polygons.length; p++) for (let q = 0; q < p; q++) {
    if (ringsIntersect(polygons[p][0], polygons[q][0]) || inPolygon(polygons[p][0][0], polygons[q]) || inPolygon(polygons[q][0][0], polygons[p])) errors.push('MultiPolygon components overlap or touch; keep separate interiors.');
  }
  return { valid: !errors.length, errors: [...new Set(errors)] };
}

function provenanceErrors(metadata: ZoneMetadata): string[] {
  const errors: string[] = [];
  if (!nonempty(metadata.sourceUrl) || !/^https:\/\//.test(metadata.sourceUrl)) errors.push('A public HTTPS original source URL is required.');
  if (!nonempty(metadata.boundaryVersion)) errors.push('A boundary version is required.');
  if (!['approximate', 'official'].includes(metadata.accuracy ?? '')) errors.push('Boundaries need an explicit approximate or official accuracy status.');
  if (!nonempty(metadata.digitizedAt) && !nonempty(metadata.importedAt)) errors.push('A digitization or import date is required.');
  if (![metadata.digitizedAt, metadata.importedAt].some(value => typeof value === 'string' && Number.isFinite(Date.parse(value)))) errors.push('Boundary date must be a valid date.');
  if (!(nonempty(metadata.limitations) || Array.isArray(metadata.limitations) && metadata.limitations.some(nonempty))) errors.push('Known source and coverage limitations are required.');
  const calibration = metadata.calibration;
  if (!calibration || !nonempty(calibration.method) || !Number.isFinite(calibration.uncertaintyMeters) || calibration.uncertaintyMeters < 0 || metadata.accuracy === 'approximate' && calibration.uncertaintyMeters <= 0) errors.push('Calibration method and a valid uncertainty band in metres are required.');
  if (metadata.accuracy === 'approximate' && !nonempty(metadata.screenshotReference)) errors.push('Approximate study boundaries must retain the supplied screenshot reference.');
  if (metadata.geometrySource === 'official-gis') {
    if (!nonempty(metadata.sourceDatasetUrl) || !/^https:\/\//.test(metadata.sourceDatasetUrl)) errors.push('Direct GIS geometry requires its public dataset URL.');
    if (!nonempty(metadata.dataVersion)) errors.push('Direct GIS geometry requires the source data version.');
    if (!calibration || !nonempty(calibration.spatialReference) || !nonempty(calibration.sourceItemId)) errors.push('Direct GIS geometry requires its spatial reference and source item identifier.');
  } else if (metadata.geometrySource === 'calibrated-screenshot') {
    const points = calibration?.controlPoints;
    if (!Array.isArray(points) || points.length < 3 || !points.every(point => object(point) && coordinate(point.image) && coordinate(point.geographic))) errors.push('Screenshot digitization requires at least three finite image/geographic calibration ties.');
    else {
      let imageArea = false, geographicArea = false;
      for (let i = 2; i < points.length; i++) {
        imageArea ||= Math.abs(cross({ x: points[0].image[0], y: points[0].image[1] }, { x: points[1].image[0], y: points[1].image[1] }, { x: points[i].image[0], y: points[i].image[1] })) > EPS;
        geographicArea ||= Math.abs(cross(project(points[0].geographic), project(points[1].geographic), project(points[i].geographic))) > EPS;
      }
      if (!imageArea || !geographicArea) errors.push('Screenshot calibration ties must be non-collinear in both image and geographic space.');
    }
    if (metadata.accuracy === 'official') errors.push('Screenshot digitization cannot be labeled official GIS geometry.');
  } else errors.push('Boundary geometry needs a supported georeferenced source.');
  if (metadata.accuracy === 'official' && metadata.verificationStatus !== 'verified') errors.push('Official status requires independently verified adoption evidence.');
  return errors;
}

export function validateZoneManifest(value: unknown): ZoneValidation {
  const errors: string[] = [], warnings: string[] = [];
  if (!object(value) || !object(value.metadata) || !Array.isArray(value.zones)) return { valid: false, errors: ['Expected a zone document with metadata and zones.'], warnings };
  const document = value as unknown as ZoneDocument;
  const seen = new Set<string>();
  const geometryPresent = document.zones.some(zone => object(zone) && zone.geometry !== null);
  if (geometryPresent) errors.push(...provenanceErrors(document.metadata));
  for (const zone of document.zones) {
    if (!object(zone) || !nonempty(zone.id) || !nonempty(zone.name)) { errors.push('Every zone requires an ID and name.'); continue; }
    if (['__proto__', 'prototype', 'constructor'].includes(zone.id) || seen.has(zone.id)) errors.push(`Zone ID ${zone.id} is duplicated or reserved.`);
    seen.add(zone.id);
    if (!['available', 'partial', 'unavailable'].includes(zone.status)) errors.push(`Zone ${zone.id} has an invalid availability status.`);
    if (zone.geometry === null) {
      if (zone.status !== 'unavailable') errors.push(`Zone ${zone.id} cannot be enabled without a boundary.`);
      warnings.push(`Zone ${zone.id} has no sourced boundary and is unavailable.`);
    } else {
      const validation = validateZoneGeometry(zone.geometry);
      errors.push(...validation.errors.map(error => `${zone.id}: ${error}`));
    }
  }
  if (!geometryPresent) warnings.push('No calibrated or verified source polygons are available.');
  if (document.metadata.accuracy === 'approximate') warnings.push(APPROXIMATE_ZONE_NOTICE);
  return { valid: !errors.length, errors, warnings };
}

function prepare(document: ZoneDocument): PreparedDocument {
  const cached = preparedCache.get(document);
  if (cached) return cached;
  const validation = validateZoneManifest(document);
  const zones = validation.valid ? document.zones.filter(zone => zone.geometry && zone.status !== 'unavailable').map(zone => prepareZone(zone, document.metadata.calibration?.uncertaintyMeters ?? 0)) : [];
  const result = { zones, validation };
  preparedCache.set(document, result);
  return result;
}

function membership(point: Point, zone: PreparedZone, uncertainty = zone.uncertainty): PointZoneMembership {
  const [minX, minY, maxX, maxY] = zone.bounds;
  if (point.x < minX - uncertainty || point.x > maxX + uncertainty || point.y < minY - uncertainty || point.y > maxY + uncertainty) return 'outside';
  for (const { a, b } of nearbyBoundary(zone, [point.x - uncertainty - EPS, point.y - uncertainty - EPS, point.x + uncertainty + EPS, point.y + uncertainty + EPS])) if (pointSegmentDistance(point, a, b) <= uncertainty + EPS) return 'uncertain';
  return zone.polygons.some(polygon => inPolygon(point, polygon)) ? 'inside' : 'outside';
}

export function pointZoneMembership(point: LonLat, zone: StudyZone, uncertaintyMeters: number): PointZoneMembership {
  if (!coordinate(point) || !zone.geometry || !Number.isFinite(uncertaintyMeters) || uncertaintyMeters < 0) return 'outside';
  // Zone documents are immutable snapshots; editor operations create a new
  // zone object. Cache only derived geometry, never change source vertices.
  if (!pointZoneCache.has(zone)) pointZoneCache.set(zone, validateZoneGeometry(zone.geometry).valid ? prepareZone(zone, uncertaintyMeters) : null);
  const prepared = pointZoneCache.get(zone);
  return prepared ? membership(project(point), prepared, uncertaintyMeters) : 'outside';
}

function intersectionParameters(a: Point, b: Point, c: Point, d: Point): number[] {
  const vx = b.x - a.x, vy = b.y - a.y, wx = d.x - c.x, wy = d.y - c.y;
  const denominator = vx * wy - vy * wx;
  if (Math.abs(denominator) < EPS) {
    if (Math.abs(cross(a, b, c)) > EPS) return [];
    const length = vx * vx + vy * vy;
    if (!length) return [];
    return [((c.x - a.x) * vx + (c.y - a.y) * vy) / length, ((d.x - a.x) * vx + (d.y - a.y) * vy) / length].filter(t => t >= 0 && t <= 1);
  }
  const t = ((c.x - a.x) * wy - (c.y - a.y) * wx) / denominator;
  const u = ((c.x - a.x) * vy - (c.y - a.y) * vx) / denominator;
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? [Math.max(0, Math.min(1, t))] : [];
}

function classifyPrepared(a: Point, b: Point, prepared: PreparedDocument): SegmentZoneMembership {
  const zoneIds: string[] = [], uncertainZoneIds: string[] = [];
  let crossesBoundary = false;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  for (const zone of prepared.zones) {
    const [minX, minY, maxX, maxY] = zone.bounds;
    const uncertainty = zone.uncertainty;
    if (Math.max(a.x, b.x) < minX - uncertainty || Math.min(a.x, b.x) > maxX + uncertainty || Math.max(a.y, b.y) < minY - uncertainty || Math.min(a.y, b.y) > maxY + uncertainty) continue;
    const cuts = [0, 1];
    let nearBoundary = false;
    for (const { a: c, b: d } of nearbyBoundary(zone, [Math.min(a.x, b.x) - uncertainty - EPS, Math.min(a.y, b.y) - uncertainty - EPS, Math.max(a.x, b.x) + uncertainty + EPS, Math.max(a.y, b.y) + uncertainty + EPS])) {
      const intersections = intersectionParameters(a, b, c, d);
      cuts.push(...intersections);
      if (intersections.length || Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d), pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b)) <= uncertainty + EPS) nearBoundary = true;
    }
    if (nearBoundary) uncertainZoneIds.push(zone.zone.id);
    cuts.sort((x, y) => x - y);
    const unique = cuts.filter((value, index) => index === 0 || value - cuts[index - 1] > EPS);
    let inside = false, outside = false, safelyInside = false;
    const at = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    for (let i = 0; i < unique.length - 1; i++) {
      const from = unique[i], to = unique[i + 1];
      const mid = at((from + to) / 2);
      const interior = zone.polygons.some(polygon => inPolygon(mid, polygon));
      inside ||= interior; outside ||= !interior;
      if (!interior) continue;
      if (!nearBoundary) { safelyInside = true; continue; }
      // A positive classification requires an actual tested point beyond the
      // ambiguity band. Long crossing segments can belong to both zones.
      const samples = Math.max(2, Math.min(256, Math.ceil(length * (to - from) / Math.max(5, uncertainty / 2))));
      for (let s = 0; s <= samples; s++) if (membership(at(from + (to - from) * s / samples), zone) === 'inside') { safelyInside = true; break; }
    }
    if (length < EPS && membership(a, zone) === 'inside') safelyInside = true;
    if (safelyInside) zoneIds.push(zone.zone.id);
    crossesBoundary ||= inside && outside;
  }
  return { zoneIds, uncertainZoneIds, crossesBoundary };
}

export function classifySegmentZones(start: LonLat, end: LonLat, document: ZoneDocument): SegmentZoneMembership {
  if (!coordinate(start) || !coordinate(end)) return { zoneIds: [], uncertainZoneIds: [], crossesBoundary: false };
  return classifyPrepared(project(start), project(end), prepare(document));
}

export function buildZoneCoverage(graph: RoadGraph, document: ZoneDocument): ZoneCoverage {
  const cached = coverageCache.get(graph)?.get(document);
  if (cached) return cached;
  const prepared = prepare(document);
  const zones: Record<string, ZoneRoadCoverage> = Object.create(null);
  for (const zone of document.zones) zones[zone.id] = { id: zone.id, available: false, coverage: 'none', segmentIds: [], edgeIds: [], streetNames: [], safeDestinationNodeIds: [], ambiguousSegmentIds: [] };
  const segments = new Map<string, ClassifiedSegment>(), byEdge = new Map<string, ClassifiedSegment>();
  for (const edge of graph.edges.values()) {
    const segmentId = edge.id.replace(/:[fr]$/, '');
    let segment = segments.get(segmentId);
    if (!segment) {
      const from = graph.nodes.get(edge.from)!, to = graph.nodes.get(edge.to)!;
      segment = { ...classifyPrepared(from, to, prepared), segmentId, edgeIds: [] };
      segments.set(segmentId, segment);
      for (const id of segment.zoneIds) zones[id].segmentIds.push(segmentId);
      for (const id of segment.uncertainZoneIds) zones[id].ambiguousSegmentIds.push(segmentId);
    }
    segment.edgeIds.push(edge.id);
    byEdge.set(edge.id, segment);
    for (const id of segment.zoneIds) { zones[id].edgeIds.push(edge.id); if (edge.name) zones[id].streetNames.push(edge.name); }
  }
  for (const zone of prepared.zones) {
    const target = zones[zone.zone.id];
    target.streetNames = [...new Set(target.streetNames)].sort();
    for (const node of graph.nodes.values()) if ((graph.outgoing.get(node.id)?.length ?? 0) > 0 && membership(node, zone) === 'inside') target.safeDestinationNodeIds.push(node.id);
    target.available = target.segmentIds.length > 0;
    // This application ships a bounded road extract. A sourced polygon alone
    // never establishes that every street in it has been imported.
    target.coverage = target.available ? 'partial' : 'none';
  }
  const result = { zones, segments, byEdge, validation: prepared.validation };
  let graphCache = coverageCache.get(graph);
  if (!graphCache) { graphCache = new WeakMap(); coverageCache.set(graph, graphCache); }
  graphCache.set(document, result);
  return result;
}

export function safeZoneDestinationNodes(graph: RoadGraph, document: ZoneDocument, zoneId: string): string[] { return buildZoneCoverage(graph, document).zones[zoneId]?.safeDestinationNodeIds ?? []; }

export function zoneBounds(zone: StudyZone): [[number, number], [number, number]] | null {
  if (!zone.geometry) return null;
  const positions = zone.geometry.type === 'Polygon' ? zone.geometry.coordinates.flat() : zone.geometry.coordinates.flat(2);
  if (!positions.length || !positions.every(coordinate)) return null;
  return [[Math.min(...positions.map(point => point[0])), Math.min(...positions.map(point => point[1]))], [Math.max(...positions.map(point => point[0])), Math.max(...positions.map(point => point[1]))]];
}

export function zoneDocumentToGeoJSON(document: ZoneDocument): { type: 'FeatureCollection'; metadata: ZoneMetadata; features: Array<{ type: 'Feature'; properties: Omit<StudyZone, 'geometry'>; geometry: ZoneGeometry | null }> } {
  return structuredClone({ type: 'FeatureCollection', metadata: document.metadata, features: document.zones.map(({ geometry, ...properties }) => ({ type: 'Feature', properties, geometry })) });
}

export function zoneDocumentFromGeoJSON(value: unknown): ZoneDocument {
  if (object(value) && object(value.metadata) && Array.isArray(value.zones)) {
    const validation = validateZoneManifest(value);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    return structuredClone(value) as unknown as ZoneDocument;
  }
  if (!object(value) || value.type !== 'FeatureCollection' || !object(value.metadata) || !Array.isArray(value.features)) throw new Error('Import a zone document or GeoJSON FeatureCollection with source metadata.');
  const zones: StudyZone[] = value.features.map((feature, index) => {
    if (!object(feature) || feature.type !== 'Feature' || !object(feature.properties) || !('geometry' in feature)) throw new Error(`Invalid zone feature ${index + 1}.`);
    return { ...feature.properties, geometry: feature.geometry } as unknown as StudyZone;
  });
  const document = { metadata: value.metadata, zones } as ZoneDocument;
  const validation = validateZoneManifest(document);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  return structuredClone(document);
}
