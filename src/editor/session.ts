import type { Polygon, MultiPolygon, FeatureCollection } from 'geojson';
import { validateZoneManifest, validateZoneGeometry, zoneDocumentFromGeoJSON, zoneDocumentToGeoJSON, type ZoneDocument, type ZoneGeometry } from '../core/zones';

export interface EditResult { valid: boolean; errors: string[] }

/** Isolated editing history. It has no reference to the driving graph or game state. */
export class BoundaryEditorSession {
  private readonly original: ZoneDocument;
  private checkpoint: ZoneDocument;
  private current: ZoneDocument;
  private history: ZoneDocument[] = [];

  constructor(baseline: ZoneDocument) {
    this.original = structuredClone(baseline);
    this.checkpoint = structuredClone(baseline);
    this.current = structuredClone(baseline);
  }

  get document(): ZoneDocument { return structuredClone(this.current); }
  get canUndo(): boolean { return this.history.length > 0; }
  get dirty(): boolean { return JSON.stringify(this.current) !== JSON.stringify(this.checkpoint); }

  importDocument(input: unknown): EditResult {
    let candidate: ZoneDocument;
    try {
      candidate = typeof input === 'object' && input !== null && (input as { type?: unknown }).type === 'FeatureCollection'
        ? zoneDocumentFromGeoJSON(input as Parameters<typeof zoneDocumentFromGeoJSON>[0])
        : input as ZoneDocument;
      const result = validateZoneManifest(candidate);
      if (!result.valid) return { valid: false, errors: result.errors };
    } catch (error) {
      return { valid: false, errors: [`Import failed: ${String(error)}`] };
    }
    this.history.push(structuredClone(this.current));
    this.current = structuredClone(candidate);
    this.checkpoint = structuredClone(candidate);
    return { valid: true, errors: [] };
  }

  editGeometry(zoneId: string, geometry: Polygon | MultiPolygon): EditResult {
    const geometryResult = validateZoneGeometry(geometry);
    if (!geometryResult.valid) return geometryResult;
    const candidate = structuredClone(this.current);
    const zone = candidate.zones.find((item) => item.id === zoneId);
    if (!zone) return { valid: false, errors: [`Unknown study area: ${zoneId}`] };
    // The runtime validator above establishes finite, exactly two-coordinate
    // positions; general GeoJSON types also permit unsupported dimensions.
    zone.geometry = structuredClone(geometry) as ZoneGeometry;
    const version = `local-${new Date().toISOString()}`;
    candidate.metadata = {
      ...candidate.metadata,
      accuracy: 'approximate',
      boundaryVersion: version,
      parentBoundaryVersion: this.checkpoint.metadata.boundaryVersion,
      editedAt: new Date().toISOString(),
      editor: 'Fremont Streets local developer boundary editor',
      editNote: 'Manual study-area vertex adjustments; original source and calibration retained. Not verified official GIS boundaries.',
    };
    zone.boundaryVersion = version;
    const result = validateZoneManifest(candidate);
    if (!result.valid) return { valid: false, errors: result.errors };
    this.history.push(structuredClone(this.current));
    this.current = candidate;
    return { valid: true, errors: [] };
  }

  undo(): void {
    const previous = this.history.pop();
    if (previous) this.current = previous;
  }

  discard(): void {
    this.history.push(structuredClone(this.current));
    this.current = structuredClone(this.checkpoint);
  }

  revertOriginal(): void {
    this.history.push(structuredClone(this.current));
    this.current = structuredClone(this.original);
    this.checkpoint = structuredClone(this.original);
  }

  exportGeoJSON(): FeatureCollection<Polygon | MultiPolygon> & { metadata: ZoneDocument['metadata'] } {
    const result = validateZoneManifest(this.current);
    if (!result.valid) throw new Error(result.errors.join(' '));
    if (!this.current.zones.some((zone) => zone.geometry)) throw new Error('No sourced or geographically calibrated boundary geometry is loaded.');
    const output = zoneDocumentToGeoJSON(this.current) as FeatureCollection<Polygon | MultiPolygon> & { metadata: ZoneDocument['metadata'] };
    output.metadata = {
      ...structuredClone(this.current.metadata),
      exportedAt: new Date().toISOString(),
      exportPurpose: 'Approximate geographic study areas; not surveyed or confirmed adopted patrol boundaries.',
    };
    return output;
  }
}
