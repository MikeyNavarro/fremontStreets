#!/usr/bin/env node
/** Import the City's historical GIS as approximate study areas, never as proof
 * of current patrol adoption. Does not read or modify the road dataset.
 * node scripts/import-study-zones.mjs [--output public/data/zones.json]
 * Offline: --input zones.geojson --layer-metadata layer.json --item-metadata item.json
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const SOURCE_ITEM_ID = '6e6db16bb5da46daa24e063b1507268e';
export const SOURCE_LAYER_URL = 'https://services2.arcgis.com/AVso4yDITKsybTJg/arcgis/rest/services/Police_Zones/FeatureServer/0';
export const SOURCE_QUERY_URL = `${SOURCE_LAYER_URL}/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson`;
const ITEM_URL = `https://www.arcgis.com/sharing/rest/content/items/${SOURCE_ITEM_ID}?f=pjson`;
const NOTICE = "Patrol-zone boundaries are approximate study areas based on the Fremont Police Department's published map. They are not verified official GIS boundaries.";

export function createStudyZones(raw, layerMetadata, itemMetadata, importedAt = new Date().toISOString()) {
  const source = JSON.parse(raw);
  if (source.type !== 'FeatureCollection' || source.features?.length !== 3) throw new Error('Expected exactly three City police zone features.');
  if (layerMetadata.serviceItemId !== SOURCE_ITEM_ID || itemMetadata.id !== SOURCE_ITEM_ID || itemMetadata.owner !== 'OpenData_cofgis') throw new Error('The source metadata does not match the reviewed City GIS item and owner.');
  const sourceDate = new Date(layerMetadata.editingInfo?.dataLastEditDate).toISOString();
  const catalogDate = new Date(itemMetadata.modified).toISOString();
  const boundaryVersion = `city-gis-${sourceDate.slice(0, 10)}-study-v1`;
  const seen = new Set();
  const labels = { 1: ['Zone 1 — Central Fremont', '#5b8cff'], 2: ['Zone 2 — North Fremont', '#ef86b5'], 3: ['Zone 3 — South Fremont', '#f7a35c'] };
  const zones = source.features.map(feature => {
    const id = feature.properties?.ZONE;
    if (![1, 2, 3].includes(id) || seen.has(id)) throw new Error('Unexpected or duplicate source ZONE identifier.');
    seen.add(id);
    const geometry = feature.geometry;
    if (!['Polygon', 'MultiPolygon'].includes(geometry?.type)) throw new Error(`Source Zone ${id} is not a polygon.`);
    for (const polygon of geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) for (const ring of polygon) {
      if (ring.length < 4 || JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1))) throw new Error(`Source Zone ${id} has an unclosed ring.`);
      for (const point of ring) if (point.length !== 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1]) || point[0] < -122.3 || point[0] > -121.6 || point[1] < 37.3 || point[1] > 37.9) throw new Error('Expected source-exported WGS84 coordinates near Fremont.');
    }
    return {
      id: `zone${id}`, name: labels[id][0], color: labels[id][1], status: 'partial',
      reason: 'Approximate historical-source study boundary; road coverage is partial and is computed from the current sourced road graph. Current official adoption is unverified.',
      geometry, boundaryVersion, sourceAttributes: feature.properties,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return {
    metadata: {
      schemaVersion: 2,
      source: 'City of Fremont GIS Division — Police_Zones public feature service; historical official-source geometry used as approximate study areas',
      sourceUrl: 'https://www.fremontpolice.gov/about-us/about-fremont-police/police-zone-map',
      sourceDatasetUrl: SOURCE_QUERY_URL,
      sourceItemUrl: `https://www.arcgis.com/home/item.html?id=${SOURCE_ITEM_ID}`,
      sourceItemId: SOURCE_ITEM_ID, sourceOwner: itemMetadata.owner,
      sourceAttribution: itemMetadata.accessInformation ?? 'City of Fremont - GIS Division',
      sourceSha256: createHash('sha256').update(raw).digest('hex'),
      sourceDataLastEditDate: sourceDate, sourceCatalogModifiedAt: catalogDate,
      dataVersion: sourceDate, boundaryVersion, geometrySource: 'official-gis', accuracy: 'approximate',
      verificationStatus: 'City GIS source and geographic coordinates verified; current legal adoption unverified',
      importedAt, digitizedAt: null,
      screenshotReference: 'User-supplied 905×617 Fremont Police patrol-zone map screenshot received 2026-10-18 in this conversation; used for visual comparison, not coordinate digitization. No local image file or original image publication date was exposed.',
      calibration: {
        method: 'Direct import of georeferenced City GIS polygon coordinates, exported by the service into WGS84 EPSG:4326. No manual coordinate invention or screenshot digitization. Independent manual comparison with the supplied screenshot matches the city silhouette, north Zone 1 apex, Zone 2 western corner, Newark recess, Zone 2/3 southwest junction and Zone 3 southeast edge.',
        spatialReference: 'EPSG:4326', sourceItemId: SOURCE_ITEM_ID,
        uncertaintyMeters: 75,
        uncertaintyInterpretation: '75 m is a conservative application boundary-review band for ambiguous street assignments. It is not a measured GIS positional accuracy, image-registration residual, or guarantee of current patrol adoption.',
      },
      notice: NOTICE, proposedChangeDate: '2026-10-06',
      adoptionStatus: 'The current official status of the proposed October 6, 2026 changes has not been confirmed. A historical GIS publication and visual screenshot match do not establish legal adoption.',
      sourceAccessNote: 'The public ArcGIS City GIS feature service was retrieved successfully on 2026-10-18. The police webpage and municipal website returned upstream Akamai HTTP 403, preventing an independent check of the latest adoption record.',
      geometryValidation: 'The original bundled snapshot was independently valid under GEOS/Shapely, with zero pairwise interior overlap. The application performs its own geometric validation. All original source rings and tiny holes are retained without simplification.',
      license: 'The City ArcGIS item and XML metadata state City of Fremont - GIS Division credit but provide no explicit reuse license. Preserve source credit and review City data terms before public redistribution.',
      limitations: [
        'Historical official-source GIS geometry is used as approximate learning areas; current 2026 patrol adoption and exact match to current legal boundaries are unverified.',
        'The screenshot has no exposed source image file or publication date, so comparison is qualitative rather than a measured image registration.',
        'The 75 m ambiguity band is application policy, not a source accuracy claim; historical version uncertainty may exceed that band.',
        'Road coverage is limited to bounded central Fremont and northern Irvington source extracts. None of these polygons implies complete zone street coverage.',
        'Street segments near a boundary or crossing more than one zone need ambiguous classification rather than a forced unique assignment.',
        'Original GIS rings and holes are preserved. The developer editor changes only local study polygons and never changes the road graph.',
      ],
    }, zones,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const fetchText = async url => (await promisify(execFile)('curl', ['--fail', '--silent', '--show-error', '--max-time', '60', url], { maxBuffer: 16 * 1024 * 1024 })).stdout;
  const input = option('--input');
  const layerFile = option('--layer-metadata');
  const itemFile = option('--item-metadata');
  if (input && (!layerFile || !itemFile)) throw new Error('Offline import requires --input, --layer-metadata and --item-metadata so source versions are never invented.');
  const [raw, layerText, itemText] = input
    ? await Promise.all([readFile(input, 'utf8'), readFile(layerFile, 'utf8'), readFile(itemFile, 'utf8')])
    : await Promise.all([fetchText(SOURCE_QUERY_URL), fetchText(`${SOURCE_LAYER_URL}?f=pjson`), fetchText(ITEM_URL)]);
  const document = createStudyZones(raw, JSON.parse(layerText), JSON.parse(itemText));
  const output = resolve(option('--output', 'public/data/zones.json'));
  if (output === resolve('public/data/roads.json')) throw new Error('Patrol import must never overwrite the road graph.');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(document)}\n`);
  console.log(`Imported ${document.zones.length} historical-source study polygons (${document.metadata.boundaryVersion}); current adoption remains unverified. No road files were changed.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
