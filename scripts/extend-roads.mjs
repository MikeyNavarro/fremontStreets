#!/usr/bin/env node
/** Append a bounded, sourced Zone 3 extract while preserving every existing
 * node, way and rule. Never overwrite a shared source object or add a rule
 * that makes the graph builder exclude an existing way.
 * node scripts/extend-roads.mjs [--input normalized-extract.json] [--output roads.json]
 */
import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

export const ZONE3_BBOX = [-121.99, 37.505, -121.94, 37.542];
const sha = raw => createHash('sha256').update(raw).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const contentDigest = value => sha(JSON.stringify(canonical(value)));
const key = value => String(value.id);

export function appendRoadExtract(base, extract, { baseFileSha256 = contentDigest(base), importedAt = new Date().toISOString(), versionPrefix = 'zone3-bounded', coverage = 'Bounded central Fremont plus an appended northern Irvington/Zone 3 study extract. Partial coverage in all three study zones; not full-city or complete zone coverage.' } = {}) {
  if (!base.nodes || !base.ways?.length || !extract.nodes || !extract.ways?.length) throw new Error('Expected existing and extension road datasets.');
  if (extract.metadata?.source !== 'OpenStreetMap' || !extract.metadata.sourceSha256 || !extract.metadata.sourceQuery || !extract.metadata.dataTimestamp) throw new Error('Extension must carry actual OSM import provenance.');
  if (contentDigest(base.metadata.projection) !== contentDigest(extract.metadata.projection)) throw new Error('The extension must use the existing citywide projection.');
  const oldWays = new Map(base.ways.map(way => [key(way), way]));
  const oldIds = new Set(oldWays.keys());
  const candidates = new Map();
  const skipped = { changedExistingWays: [], conflictingNodes: [], newWays: [] };
  for (const way of extract.ways) {
    const id = key(way);
    if (oldWays.has(id)) {
      if (contentDigest(oldWays.get(id)) !== contentDigest(way)) skipped.changedExistingWays.push(id);
      continue;
    }
    const conflict = way.nodes.map(String).find(nodeId => !extract.nodes[nodeId] || (base.nodes[nodeId] && contentDigest(base.nodes[nodeId]) !== contentDigest(extract.nodes[nodeId])));
    if (conflict) {
      skipped.conflictingNodes.push(conflict);
      skipped.newWays.push({ id, reason: 'Missing source node or coordinate conflict with a preserved existing node.' });
    } else candidates.set(id, way);
  }
  const existingRules = new Set([...(base.restrictions ?? []), ...(base.unsupportedRestrictions ?? [])].map(key));
  const newRules = [...(extract.restrictions ?? []), ...(extract.unsupportedRestrictions ?? [])].filter(rule => !existingRules.has(key(rule)));
  const drop = (id, reason) => { if (candidates.delete(String(id))) skipped.newWays.push({ id: String(id), reason }); };
  for (const rule of newRules) {
    const from = String(rule.fromWay);
    const viaWays = (rule.viaWays ?? []).map(String);
    if (oldIds.has(from)) {
      // Do not add a novel turn from an existing approach whose source rule
      // cannot be applied without changing the original approach behavior.
      for (const id of [rule.toWay, ...viaWays]) drop(id, `Source restriction ${rule.id} approaches from an existing way; preserve existing behavior and omit the new movement.`);
    } else if (viaWays.some(id => oldIds.has(id))) {
      // The current conservative graph excludes via ways for unsupported
      // history-dependent rules. Omit the new approach instead of excluding
      // an old road or silently allowing the restricted movement.
      drop(from, `Unsupported source restriction ${rule.id} traverses an existing way; omit its new approach to preserve the existing graph.`);
    }
  }
  const addedWays = [...candidates.values()];
  const addedIds = new Set(addedWays.map(key));
  const addedNodes = {};
  for (const way of addedWays) for (const node of way.nodes) {
    const id = String(node);
    if (!base.nodes[id]) addedNodes[id] = extract.nodes[id];
  }
  const selectRules = rules => (rules ?? []).filter(rule => !existingRules.has(key(rule)) && addedIds.has(String(rule.fromWay)) && !(rule.viaWays ?? []).some(id => oldIds.has(String(id))));
  const addedRestrictions = selectRules(extract.restrictions);
  const addedUnsupported = selectRules(extract.unsupportedRestrictions);
  const report = { addedNodes: Object.keys(addedNodes).length, addedWays: addedWays.length, addedRestrictions: addedRestrictions.length, addedUnsupportedRestrictions: addedUnsupported.length, skipped };
  if (!addedWays.length && !addedRestrictions.length && !addedUnsupported.length) return { data: base, report };
  const snapshot = base.metadata.baseSnapshot ?? {
    fileSha256: baseFileSha256,
    nodeIds: Object.keys(base.nodes), wayIds: base.ways.map(key),
    restrictionIds: (base.restrictions ?? []).map(key), unsupportedRestrictionIds: (base.unsupportedRestrictions ?? []).map(key),
    canonicalSha256: { nodes: contentDigest(base.nodes), ways: contentDigest(base.ways), restrictions: contentDigest(base.restrictions ?? []), unsupportedRestrictions: contentDigest(base.unsupportedRestrictions ?? []) },
    metadata: base.metadata,
  };
  const nodes = { ...base.nodes, ...addedNodes };
  const ways = [...base.ways, ...addedWays];
  const restrictions = [...(base.restrictions ?? []), ...addedRestrictions];
  const unsupportedRestrictions = [...(base.unsupportedRestrictions ?? []), ...addedUnsupported];
  const extension = {
    version: `${versionPrefix}-${importedAt.slice(0, 10)}-v1`, importedAt,
    source: extract.metadata,
    addedIds: { nodes: Object.keys(addedNodes), ways: addedWays.map(key), restrictions: addedRestrictions.map(key), unsupportedRestrictions: addedUnsupported.map(key) },
    skipped,
    policy: 'Append new source IDs only; retain every prior object unchanged. Rules on existing approaches are not added; conflicting new approaches are omitted. Unsupported rules never exclude existing ways.',
  };
  return { data: {
    metadata: {
      ...base.metadata,
      baseSnapshot: snapshot, extensions: [...(base.metadata.extensions ?? []), extension],
      coverage,
      coverageBboxes: [...(base.metadata.coverageBboxes ?? [base.metadata.bbox]), extract.metadata.bbox],
      counts: { ...base.metadata.counts, nodes: Object.keys(nodes).length, ways: ways.length, namedStreets: new Set(ways.map(way => way.name).filter(Boolean)).size, restrictions: restrictions.length, unsupportedRestrictions: unsupportedRestrictions.length },
    }, nodes, ways, restrictions, unsupportedRestrictions,
  }, report };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  const basePath = option('--base', 'public/data/roads.json');
  const baseRaw = await readFile(basePath, 'utf8');
  let temporary;
  try {
    let input = option('--input');
    if (!input) {
      temporary = await mkdtemp(join(tmpdir(), 'fremont-zone3-'));
      input = join(temporary, 'roads.json');
      const importer = fileURLToPath(new URL('./import-roads.mjs', import.meta.url));
      await promisify(execFile)(process.execPath, [importer, '--bbox', option('--bbox', ZONE3_BBOX.join(',')), '--output', input], { maxBuffer: 4 * 1024 * 1024 });
    }
    const base = JSON.parse(baseRaw);
    const extract = JSON.parse(await readFile(input, 'utf8'));
    const { data, report } = appendRoadExtract(base, extract, { baseFileSha256: sha(baseRaw) });
    const output = resolve(option('--output', basePath));
    await mkdir(dirname(output), { recursive: true });
    // A repeated import with no additions preserves the exact original bytes.
    await writeFile(output, data === base ? baseRaw : `${JSON.stringify(data)}\n`);
    console.log(JSON.stringify(report));
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
