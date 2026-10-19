import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error The standalone dependency-free import CLI is JavaScript.
import { appendRoadExtract, contentDigest } from '../scripts/extend-roads.mjs';

function fixture() {
  const metadata = { source: 'OpenStreetMap', sourceSha256: 'a'.repeat(64), sourceQuery: 'unit fixture', dataTimestamp: '2026-10-18T23:47:00Z', projection: { origin: [-121.9886, 37.5485] } };
  const base = { metadata, nodes: { a: [-121.98, 37.54], b: [-121.979, 37.54] }, ways: [{ id: 'old', nodes: ['a', 'b'], highway: 'residential' }], restrictions: [], unsupportedRestrictions: [] };
  const extra = { metadata, nodes: { a: [-121.98, 37.54], b: [-121.979, 37.54], c: [-121.98, 37.539] }, ways: [{ id: 'new', nodes: ['c', 'a'], highway: 'residential' }], restrictions: [] as object[], unsupportedRestrictions: [] as object[] };
  return { base, extra };
}

test('road extension rejects source-node coordinate conflicts without moving existing roads', () => {
  const { base, extra } = fixture();
  const digest = contentDigest(base);
  extra.nodes.a = [-121.97, 37.54];
  const { data, report } = appendRoadExtract(base, extra);
  assert.equal(data, base);
  assert.equal(contentDigest(base), digest);
  assert.equal(report.addedWays, 0);
  assert.deepEqual(report.skipped.conflictingNodes, ['a']);
});

test('unsupported new restrictions cannot remove an existing via road', () => {
  const { base, extra } = fixture();
  extra.unsupportedRestrictions.push({ id: 'rule', fromWay: 'new', toWay: 'old', viaWays: ['old'], restriction: 'no_u_turn' });
  const { data, report } = appendRoadExtract(base, extra);
  assert.deepEqual(data.ways, base.ways);
  assert.deepEqual(data.unsupportedRestrictions, []);
  assert.equal(report.addedWays, 0, 'new approach is omitted instead of excluding the old via road');
  assert.equal(report.skipped.newWays[0].id, 'new');
});

test('novel turn restrictions on preserved approaches cannot create an unrestricted new movement', () => {
  const { base, extra } = fixture();
  extra.restrictions.push({ id: 'rule', fromWay: 'old', toWay: 'new', viaNode: 'a', restriction: 'no_left_turn' });
  const { data, report } = appendRoadExtract(base, extra);
  assert.deepEqual(data.ways, base.ways);
  assert.deepEqual(data.restrictions, []);
  assert.equal(report.addedWays, 0, 'unrepresentable new target is omitted conservatively');
  assert.equal(report.skipped.newWays[0].id, 'new');
});
