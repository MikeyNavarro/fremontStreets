import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// The standalone dependency-free import CLI is authored as JavaScript.
// @ts-expect-error No declaration file is necessary for this development script.
import { normalizeExtract, buildQuery } from '../scripts/import-roads.mjs';

test('bundled geography is a bounded attributed Fremont OSM network with intact source node references', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/roads.json', import.meta.url), 'utf8'));
  assert.equal(data.metadata.source, 'OpenStreetMap');
  assert.equal(data.metadata.license, 'ODbL-1.0');
  assert.match(data.metadata.sourceUrl, /^https:\/\/overpass-api\.de/);
  assert.match(data.metadata.dataTimestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(data.metadata.sourceSha256, /^[a-f0-9]{64}$/);
  assert.ok(data.ways.length > 100);
  assert.ok(data.ways.some((w: { name: string }) => w.name === 'Fremont Boulevard'));
  assert.ok(data.ways.some((w: { name: string }) => w.name === 'Mowry Avenue'));
  const ids = new Set<string>();
  for (const way of data.ways) {
    assert.ok(!ids.has(way.id), `duplicate source way ${way.id}`);
    ids.add(way.id);
    assert.ok(way.nodes.length >= 2);
    assert.ok(!['no', 'private'].includes(way.tags.access));
    for (const id of way.nodes) {
      const point = data.nodes[id];
      assert.ok(point, `missing source node ${id}`);
      assert.ok(point[0] > -122.1 && point[0] < -121.8);
      assert.ok(point[1] > 37.45 && point[1] < 37.65);
    }
  }
  assert.deepEqual(data.metadata.projection.origin, [-121.9886, 37.5485]);
  assert.equal(data.metadata.counts.nodes, Object.keys(data.nodes).length);
  assert.equal(data.metadata.counts.ways, data.ways.length);
  assert.equal(data.metadata.counts.unsupportedRestrictions, data.unsupportedRestrictions.length);
});

test('OSM importer preserves disconnected crossing IDs, road tags and unsupported restriction evidence', () => {
  const elements = [
    { type: 'node', id: 1, lon: -121.99, lat: 37.55 },
    { type: 'node', id: 2, lon: -121.98, lat: 37.55 },
    { type: 'node', id: 3, lon: -121.985, lat: 37.545 },
    { type: 'node', id: 4, lon: -121.985, lat: 37.555 },
    { type: 'way', id: 10, nodes: [1, 2], tags: { name: 'Fixture bridge', highway: 'primary', bridge: 'yes', layer: '1', oneway: '-1', maxspeed: '35 mph' } },
    { type: 'way', id: 11, nodes: [3, 4], tags: { name: 'Fixture road', highway: 'residential' } },
    { type: 'relation', id: 30, tags: { type: 'restriction', restriction: 'no_u_turn' }, members: [{ type: 'way', ref: 10, role: 'from' }, { type: 'way', ref: 11, role: 'via' }, { type: 'way', ref: 10, role: 'to' }] },
  ];
  const data = normalizeExtract({ elements });
  assert.deepEqual(data.ways[0].nodes, ['1', '2']);
  assert.deepEqual(data.ways[1].nodes, ['3', '4']);
  assert.equal(Object.keys(data.nodes).length, 4, 'no fabricated crossing node');
  assert.equal(data.ways[0].bridge, 'yes');
  assert.equal(data.ways[0].layer, '1');
  assert.equal(data.ways[0].oneway, '-1');
  assert.equal(data.ways[0].maxspeed, '35 mph');
  assert.deepEqual(data.unsupportedRestrictions[0].viaWays, ['11']);
  assert.equal(data.unsupportedRestrictions[0].members.length, 3);
});

test('only-turn restrictions remain restrictive when their sole target is filtered out', () => {
  const data = normalizeExtract({ elements: [
    { type: 'node', id: 1, lon: -121.99, lat: 37.55 },
    { type: 'node', id: 2, lon: -121.98, lat: 37.55 },
    { type: 'node', id: 3, lon: -121.97, lat: 37.55 },
    { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'residential' } },
    { type: 'way', id: 11, nodes: [2, 3], tags: { highway: 'service', access: 'private' } },
    { type: 'relation', id: 30, tags: { type: 'restriction', restriction: 'only_right_turn' }, members: [{ type: 'way', ref: 10, role: 'from' }, { type: 'node', ref: 2, role: 'via' }, { type: 'way', ref: 11, role: 'to' }] },
  ] });
  assert.equal(data.ways.length, 1);
  assert.equal(data.restrictions.length, 1);
  assert.equal(data.restrictions[0].toWay, '11');
});

test('patrol study geometry retains historical City GIS provenance without claiming current adoption', async () => {
  const data = JSON.parse(await readFile(new URL('../public/data/zones.json', import.meta.url), 'utf8'));
  assert.equal(data.metadata.accuracy, 'approximate');
  assert.equal(data.metadata.geometrySource, 'official-gis');
  assert.equal(data.metadata.sourceItemId, '6e6db16bb5da46daa24e063b1507268e');
  assert.equal(data.metadata.sourceDataLastEditDate, '2020-12-10T01:27:59.899Z');
  assert.match(data.metadata.adoptionStatus, /has not been confirmed/);
  assert.equal(data.metadata.digitizedAt, null, 'georeferenced source coordinates were imported directly');
  assert.equal(data.metadata.calibration.uncertaintyMeters, 75);
  assert.match(data.metadata.calibration.uncertaintyInterpretation, /not a measured GIS positional accuracy/);
  assert.equal(data.zones.length, 3);
  for (const zone of data.zones) {
    assert.equal(zone.status, 'partial');
    assert.equal(zone.geometry.type, 'Polygon');
    assert.ok(zone.geometry.coordinates[0].length > 1000, 'real source polygon vertices retained');
    assert.equal(zone.sourceAttributes.ZONE, Number(zone.id.slice(-1)));
    assert.equal(zone.boundaryVersion, data.metadata.boundaryVersion);
    assert.ok(zone.reason.length > 20);
  }
  assert.match(data.zones[2].reason, /coverage is partial/);
});

test('bounded query includes source restriction relations and recursively retains source geometry', () => {
  const query = buildQuery([-122.004, 37.534, -121.963, 37.568]);
  assert.ok(query.includes('(37.534,-122.004,37.568,-121.963)'));
  assert.ok(query.includes('rel(bw.roads)["type"="restriction"]'));
  assert.ok(query.includes('(._;>;)'));
});
