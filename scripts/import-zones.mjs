#!/usr/bin/env node
/** Deliberately offline: obtain and review official adopted GeoJSON before import.
 * node scripts/import-zones.mjs --input official-zones.geojson --source-url URL
 *   --boundary-version YYYY-MM-DD --adoption-source URL [--id-property zone]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2);
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const requireOption = name => { const value = option(name); if (!value) throw new Error(`Missing ${name}. Official source and adoption evidence are required.`); return value; };
const officialUrl = value => {
  const u = new URL(value);
  if (u.protocol !== 'https:' || !/(^|\.)(fremont\.gov|fremontpolice\.gov|arcgis\.com)$/.test(u.hostname)) throw new Error('Use an HTTPS official Fremont source or its verified ArcGIS service.');
  return value;
};
try {
  const input = requireOption('--input');
  const sourceUrl = officialUrl(requireOption('--source-url'));
  const adoptionSource = officialUrl(requireOption('--adoption-source'));
  const boundaryVersion = requireOption('--boundary-version');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(boundaryVersion) || Number.isNaN(Date.parse(boundaryVersion))) throw new Error('Use an adopted boundary effective date in YYYY-MM-DD format.');
  const raw = await readFile(input, 'utf8');
  const collection = JSON.parse(raw);
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error('Expected official WGS84 GeoJSON FeatureCollection.');
  const geometries = new Map();
  for (const feature of collection.features) {
    const id = String(feature.properties?.[option('--id-property') ?? 'zone'] ?? feature.id ?? '').toLowerCase().replace(/[\s_-]/g, '').replace(/^([123])$/, 'zone$1');
    if (!['zone1', 'zone2', 'zone3'].includes(id)) throw new Error(`Unrecognized official zone identifier: ${id}. Supply --id-property or normalize only the property names in a separate source export.`);
    const geometry = feature.geometry;
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) throw new Error(`Zone ${id} lacks polygon geometry.`);
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) {
      if (ring.length < 4 || JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1))) throw new Error(`Zone ${id} has an unclosed or degenerate ring.`);
      for (const [lon, lat] of ring) if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -122.3 || lon > -121.6 || lat < 37.3 || lat > 37.9) throw new Error('Expected WGS84 longitude/latitude near Fremont; project official source coordinates before importing.');
    }
    geometries.set(id, [...(geometries.get(id) ?? []), ...polygons]);
  }
  if (geometries.size !== 3) throw new Error('The official export must include all three zones. Refusing to replace a partial source.');
  const output = option('--output') ?? 'public/data/zones.json';
  const current = JSON.parse(await readFile(output, 'utf8'));
  current.metadata = { schemaVersion: 1, source: 'Official Fremont Police patrol-zone polygons', sourceUrl, adoptionSource, boundaryVersion, importedAt: new Date().toISOString(), sourceSha256: createHash('sha256').update(raw).digest('hex'), verificationStatus: 'verified', verificationNote: 'Importer validates basic geometry and provenance fields; operator must review actual adoption evidence and GIS publication ownership before importing.' };
  current.zones = current.zones.map(zone => ({ ...zone, status: 'verified', reason: 'Official adopted boundary imported with version and provenance.', boundaryVersion, geometry: { type: 'MultiPolygon', coordinates: geometries.get(zone.id) } }));
  await writeFile(output, `${JSON.stringify(current)}\n`);
  console.log(`Imported three official patrol polygons, boundary version ${boundaryVersion}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
