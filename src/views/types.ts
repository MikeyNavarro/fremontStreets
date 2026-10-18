import type { FeatureCollection, LineString, MultiLineString } from 'geojson';
import { PROJECTION_ORIGIN, project as projectMetric } from '../core/projection';

export { PROJECTION_ORIGIN } from '../core/projection';

export type LonLat = [number, number];
export type RoadCollection = FeatureCollection<LineString | MultiLineString>;

/** Both renderers consume this snapshot; neither owns or advances the simulation. */
export interface VehicleSnapshot {
  position: LonLat;
  /** Clockwise from geographic north, in radians. */
  heading: number;
  /** Metres per second. */
  speed: number;
}

export interface TurnPreview {
  coordinates: LonLat[];
  selected?: boolean;
}

/** Shared local metric projection: equirectangular, WGS84 origin in Fremont.
 * Easting = R cos(origin latitude) Δlongitude; northing = R Δlatitude.
 * This deliberately uses one fixed origin for every study area and camera.
 */
export function project([longitude, latitude]: LonLat, origin: LonLat = PROJECTION_ORIGIN): [number, number] {
  const point = projectMetric([longitude, latitude]);
  const offset = projectMetric(origin);
  return [point.x - offset.x, point.y - offset.y];
}

export function roadLines(roads: RoadCollection): number[][][] {
  return roads.features.flatMap((feature) => {
    if (!feature.geometry) return [];
    return feature.geometry.type === 'MultiLineString'
      ? feature.geometry.coordinates
      : [feature.geometry.coordinates];
  });
}

export function showRendererFailure(container: HTMLElement, name: string, error: unknown): void {
  container.dataset.rendererError = String(error);
  const message = document.createElement('div');
  message.className = 'renderer-fallback';
  message.style.cssText = 'position:absolute;inset:0;display:grid;place-content:center;padding:32px;color:#ecf4f1;background:#142522;text-align:center;z-index:4;';
  message.textContent = `${name} could not start. This view requires WebGL. Try a browser with hardware acceleration enabled; driving state is preserved when switching views.`;
  container.append(message);
}
