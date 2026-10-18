#!/usr/bin/env node
/** Import a bounded OpenStreetMap network without inventing intersections.
 * Uses only OSM node IDs for connectivity; grade-separated crossings remain separate.
 * Usage: node scripts/import-roads.mjs [--input extract.json] [--output public/data/roads.json]
 *        [--bbox west,south,east,north] [--endpoint https://overpass-api.de/api/interpreter]
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const DEFAULT_BBOX = [-122.004, 37.534, -121.963, 37.568];
const CAR_HIGHWAYS = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'road']);
const BLOCKED_ACCESS = new Set(['no', 'private']);

export function buildQuery(bbox) {
  const [west, south, east, north] = bbox;
  return `[out:json][timeout:120];way["highway"](${south},${west},${north},${east})->.roads;rel(bw.roads)["type"="restriction"]->.restrictions;(.roads;.restrictions;);(._;>;);out body;`;
}

export function normalizeExtract(extract, { bbox = DEFAULT_BBOX, sourceUrl = 'local OSM Overpass JSON', fetchedAt = new Date().toISOString(), sha256 } = {}) {
  if (!Array.isArray(extract.elements)) throw new Error('Expected an Overpass JSON elements array.');
  const rawNodes = new Map(extract.elements.filter(e => e.type === 'node').map(e => [String(e.id), e]));
  const nodes = {};
  const ways = [];
  let excludedWays = 0;
  for (const raw of extract.elements.filter(e => e.type === 'way')) {
    const tags = raw.tags ?? {};
    if (!CAR_HIGHWAYS.has(tags.highway) || BLOCKED_ACCESS.has(tags.access) || BLOCKED_ACCESS.has(tags.motor_vehicle) || BLOCKED_ACCESS.has(tags.motorcar)) {
      excludedWays++;
      continue;
    }
    if (!raw.nodes || raw.nodes.length < 2) continue;
    const ids = raw.nodes.map(String);
    for (const id of ids) {
      const n = rawNodes.get(id);
      if (!n || !Number.isFinite(n.lon) || !Number.isFinite(n.lat)) throw new Error(`Missing or invalid node ${id} on OSM way ${raw.id}.`);
      nodes[id] = [n.lon, n.lat];
    }
    ways.push({
      id: String(raw.id), nodes: ids, name: tags.name ?? '', highway: tags.highway,
      ...(tags.oneway ? { oneway: tags.oneway } : {}),
      ...(tags.maxspeed ? { maxspeed: tags.maxspeed } : {}),
      ...Object.fromEntries(['bridge', 'tunnel', 'layer', 'access', 'motor_vehicle', 'motorcar', 'junction', 'service'].filter(k => tags[k] !== undefined).map(k => [k, tags[k]])),
      tags,
    });
  }
  if (!ways.length) throw new Error('The extract contains no public motor-vehicle roads. Refusing to overwrite the dataset.');
  const included = new Set(ways.map(w => w.id));
  const restrictions = [];
  const unsupportedRestrictions = [];
  for (const relation of extract.elements.filter(e => e.type === 'relation' && e.tags?.type === 'restriction')) {
    const from = relation.members?.find(m => m.role === 'from' && m.type === 'way');
    const to = relation.members?.find(m => m.role === 'to' && m.type === 'way');
    // Keep an only_* rule even if its target road is access-filtered out:
    // every remaining alternative must remain prohibited from that approach.
    if (!from || !to || !included.has(String(from.ref))) continue;
    const via = relation.members.filter(m => m.role === 'via');
    const base = { id: String(relation.id), fromWay: String(from.ref), toWay: String(to.ref), restriction: relation.tags.restriction, tags: relation.tags };
    if (via.length === 1 && via[0].type === 'node' && relation.tags.restriction && !relation.tags['restriction:conditional']) {
      restrictions.push({ ...base, viaNode: String(via[0].ref) });
    } else {
      unsupportedRestrictions.push({ ...base, viaWays: via.filter(m => m.type === 'way').map(m => String(m.ref)), members: relation.members, reason: 'Via-way or conditional restriction requires additional routing support.' });
    }
  }
  return {
    metadata: {
      schemaVersion: 1,
      source: 'OpenStreetMap', sourceUrl,
      license: 'ODbL-1.0', licenseUrl: 'https://www.openstreetmap.org/copyright',
      attribution: '© OpenStreetMap contributors',
      fetchedAt, dataTimestamp: extract.osm3s?.timestamp_osm_base ?? null,
      ...(sha256 ? { sourceSha256: sha256 } : {}),
      bbox, coverage: 'Bounded central Fremont study extract; partial city coverage with a surrounding buffer. Whole source ways may extend outside the requested bounding box.',
      projection: { name: 'Local equirectangular metric', origin: [-121.9886, 37.5485], earthRadiusM: 6371008.8, formula: 'x=R*(lon-lon0)*pi/180*cos(lat0*pi/180); y=R*(lat-lat0)*pi/180' },
      connectivity: 'Only identical OSM node IDs connect roads. No line-crossing or proximity snapping.',
      counts: { nodes: Object.keys(nodes).length, ways: ways.length, namedStreets: new Set(ways.map(w => w.name).filter(Boolean)).size, restrictions: restrictions.length, unsupportedRestrictions: unsupportedRestrictions.length, excludedWays },
      limitations: ['Partial Fremont coverage; not a complete city street inventory.', 'OSM data completeness, traffic signals, lane geometry, and all turn restrictions have not been independently verified.', 'Approximate 3D road widths and generic scenery are visual aids.', 'Missing maxspeed tags mean unknown speed limits.', ...(unsupportedRestrictions.length ? ['Some conditional or via-way restrictions require additional routing support; see unsupportedRestrictions.'] : [])],
    },
    nodes, ways, restrictions, unsupportedRestrictions,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const bbox = option('--bbox', DEFAULT_BBOX.join(',')).split(',').map(Number);
  if (bbox.length !== 4 || !bbox.every(Number.isFinite) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) throw new Error('Invalid bbox: expected west,south,east,north.');
  if ((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) > 0.04) throw new Error('Bounding box is too large for this bounded importer; import a smaller versioned study extract.');
  const input = option('--input');
  const endpoint = option('--endpoint', 'https://overpass-api.de/api/interpreter');
  let raw;
  if (input) raw = await readFile(input, 'utf8');
  else {
    if (!endpoint.startsWith('https://')) throw new Error('The source endpoint must use HTTPS.');
    // curl follows the environment's existing HTTPS proxy and trust settings.
    // Do not disable TLS verification or extract proxy-held authentication.
    const result = await promisify(execFile)('curl', ['--fail', '--show-error', '--silent', '--max-time', '150', '--get', '--data-urlencode', `data=${buildQuery(bbox)}`, '--user-agent', 'FremontStreets/0.1 (bounded educational OSM extract)', endpoint], { maxBuffer: 64 * 1024 * 1024 });
    raw = result.stdout;
  }
  const dataset = normalizeExtract(JSON.parse(raw), { bbox, sourceUrl: option('--source-url', input ? `OSM Overpass export imported from ${input.split('/').at(-1)}` : endpoint), sha256: createHash('sha256').update(raw).digest('hex') });
  dataset.metadata.sourceQuery = buildQuery(bbox);
  const output = resolve(option('--output', 'public/data/roads.json'));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(dataset)}\n`);
  console.log(`Imported ${dataset.metadata.counts.ways} OSM ways, ${dataset.metadata.counts.nodes} nodes and ${dataset.metadata.counts.restrictions} node-via restrictions into ${output}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
