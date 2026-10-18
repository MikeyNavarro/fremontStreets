import type { LonLat } from './types';

/** Fixed citywide equirectangular tangent-plane approximation.
 * Origin: central Fremont (-121.9886, 37.5485), WGS84 spherical radius
 * 6,371,008.8 m. x=east, y=north. At this bounded city-scale extract its
 * metric accuracy is suitable for learning, not surveying/lane placement.
 * Zone/camera changes never change this origin.
 */
export const PROJECTION_ORIGIN: LonLat = [-121.9886, 37.5485];
const RAD = Math.PI / 180;
const RADIUS = 6_371_008.8;
const EAST_SCALE = RADIUS * Math.cos(PROJECTION_ORIGIN[1] * RAD) * RAD;
const NORTH_SCALE = RADIUS * RAD;
export function project(position: LonLat): { x: number; y: number } {
  return {
    x: (position[0] - PROJECTION_ORIGIN[0]) * EAST_SCALE,
    y: (position[1] - PROJECTION_ORIGIN[1]) * NORTH_SCALE,
  };
}
export function unproject(point: { x: number; y: number }): LonLat {
  return [point.x / EAST_SCALE + PROJECTION_ORIGIN[0], point.y / NORTH_SCALE + PROJECTION_ORIGIN[1]];
}
export const toLonLat = unproject;
