#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { normalizeExtract } from './import-roads.mjs';
import { appendRoadExtract } from './extend-roads.mjs';

const cache = process.argv[2];
if (!cache) throw new Error('Provide the cached OSM extract directory.');
const prefix = process.argv[3] ?? 'zone1-full-bbox';
const raw = await readFile(`${cache}/extract.json`, 'utf8');
const input = JSON.parse(raw);
const manifest = JSON.parse(await readFile(`${cache}/manifest.json`, 'utf8'));
const extract = normalizeExtract(input, { bbox: manifest.bbox, sourceUrl: 'https://api.openstreetmap.org/api/0.6/map', sha256: createHash('sha256').update(raw).digest('hex') });
const dates = input.elements.map(element => element.timestamp).filter(Boolean).sort();
extract.metadata.dataTimestamp = dates.at(-1);
extract.metadata.dataTimestampMeaning = 'Latest individual source-object edit time, not a replication snapshot. OSM API map responses supply no dataset snapshot timestamp.';
extract.metadata.objectEditTimeRange = [dates[0], dates.at(-1)];
extract.metadata.sourceQuery = manifest.tiles.map(tile => tile.url).join(' ; ');
extract.metadata.coverage = manifest.coverage;
const baseRaw = await readFile('public/data/roads.json', 'utf8');
const { data, report } = appendRoadExtract(JSON.parse(baseRaw), extract, {
  baseFileSha256: createHash('sha256').update(baseRaw).digest('hex'), versionPrefix: prefix,
  coverage: 'Versioned, buffered Zone 1 and personalized-study OSM imports with all prior roads preserved. Not full-city coverage or complete traffic-rule verification.',
});
// Replaying a cached import must not replace the original provenance report.
if (!report.addedWays && !report.addedRestrictions && !report.addedUnsupportedRestrictions) {
  console.log('Cached source already imported; dataset and provenance report unchanged.');
  process.exit(0);
}
await writeFile('public/data/roads.json', JSON.stringify(data)+'\n');
await mkdir('docs/data', { recursive: true });
await writeFile(`docs/data/${prefix}-import.json`, JSON.stringify({manifest, report, previousFileSha256:createHash('sha256').update(baseRaw).digest('hex')},null,2)+'\n');
console.log(JSON.stringify({counts:data.metadata.counts, added:report.addedWays, skipped:report.skipped.newWays.length, coordinateConflicts:report.skipped.conflictingNodes.length, changedExisting:report.skipped.changedExistingWays.length}));
