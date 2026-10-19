import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {RoadData, RoadWay} from '../src/core/types';
import {prepareRoadLabels, compactRoadLabel, RoadLabelPriorityController, type PreparedRoadLabels} from '../src/views/road-label-geometry';

const way = (id: string, nodes: string[], values: Partial<RoadWay> = {}): RoadWay => ({id, nodes, name: 'Fremont Boulevard', highway: 'primary', ...values});
const data = (ways: RoadWay[]): RoadData => ({
  nodes: {a: [-121.99,37.54], b: [-121.989,37.541], c: [-121.988,37.54], d: [-121.987,37.542], e: [-121.986,37.541], x: [-121.989,37.541], y: [-121.988,37.542], z: [-121.987,37.541]}, ways,
});
const chains = (labels: PreparedRoadLabels) => [...labels.byId.values()];

function assertSourcePreserved(input: RoadData, labels: PreparedRoadLabels): void {
  const ways = new Map(input.ways.map(source => [String(source.id), source]));
  const represented = new Set<string>();
  for (const chain of labels.byId.values()) {
    assert.equal(chain.sourceNodeIds.length, chain.sourceSegments.length + 1);
    assert.deepEqual(chain.feature.geometry.coordinates, chain.sourceNodeIds.map(id => input.nodes[id]));
    for (const [offset, segment] of chain.sourceSegments.entries()) {
      const source = ways.get(segment.wayId)!;
      const pair = source.nodes.slice(segment.index, segment.index + 2).map(String);
      if (segment.reversed) pair.reverse();
      assert.deepEqual(chain.sourceNodeIds.slice(offset, offset + 2), pair);
      const key = `${segment.wayId}:${segment.index}`;
      assert.equal(represented.has(key), false, `duplicate source segment ${key}`); represented.add(key);
    }
  }
  assert.equal(represented.size, labels.diagnostics.sourceSegments);
}

test('label chains join split source ways by node identity and retain every curved coordinate', () => {
  const source = data([way('10', ['a','b','c']), way('20', ['e','d','c'])]);
  const snapshot = structuredClone(source);
  const labels = prepareRoadLabels(source, [{id:'ns-fremont',sourceWayIds:['10','20']}]);
  assert.equal(labels.collection.features.length, 1);
  const chain = chains(labels)[0];
  assert.deepEqual(chain.sourceNodeIds, ['a','b','c','d','e']);
  assert.deepEqual(chain.feature.properties.curriculumIds, ['ns-fremont']);
  assert.deepEqual(chain.feature.properties.sourceWayIds, ['10','20']);
  assert.equal(chain.feature.properties.basePriority, 2);
  assert.deepEqual(labels.byWayId.get('10'), [String(chain.feature.id)]);
  assert.deepEqual(labels.byName.get('Fremont Boulevard'), [String(chain.feature.id)]);
  assertSourcePreserved(source, labels);
  assert.deepEqual(source, snapshot, 'preparation cannot alter geographic source records');
  assert.deepEqual(prepareRoadLabels({...source, ways:[...source.ways].reverse()}, [{id:'ns-fremont',sourceWayIds:['20','10']}]).collection, labels.collection, 'feature identities and geometry must be deterministic');
});

test('identical coordinates, visual crossings and disconnected same-name ways never create label connections', () => {
  const source = data([way('1',['a','b']), way('2',['x','c']), way('3',['y','z'])]);
  const labels = prepareRoadLabels(source);
  assert.equal(labels.collection.features.length, 3, 'b and x share coordinates but not a source node');
  assert.deepEqual(chains(labels).map(chain=>chain.feature.properties.sourceWayIds), [['1'],['2'],['3']]);
  assertSourcePreserved(source, labels);
});

test('same-name branches terminate chains even inside a source way or when branch classifications differ', () => {
  for (const third of [way('3',['b','d']), way('3',['b','d'],{highway:'secondary',tags:{ref:'CA 84'}})]) {
    const source = data([way('1',['a','b','c']),third]);
    const labels = prepareRoadLabels(source);
    assert.equal(labels.collection.features.length, 3);
    assert.deepEqual(chains(labels).map(chain=>chain.sourceNodeIds), [['a','b'],['b','c'],['b','d']]);
    assertSourcePreserved(source, labels);
  }
});

test('compatible one-way chains follow source direction and never bridge opposing carriageways', () => {
  const connected = data([way('1',['a','b'],{oneway:'yes'}),way('2',['c','b'],{oneway:'-1'}),way('3',['c','d'],{oneway:true})]);
  const labels = prepareRoadLabels(connected);
  assert.equal(labels.collection.features.length, 1);
  assert.deepEqual(chains(labels)[0].sourceNodeIds, ['a','b','c','d']);
  assertSourcePreserved(connected, labels);
  for (const second of [way('2',['c','b'],{oneway:'yes'}),way('2',['b','c'],{oneway:'no'}),way('2',['x','c'],{oneway:'yes'})]) {
    const source = data([way('1',['a','b'],{oneway:'yes'}), second]);
    assert.equal(prepareRoadLabels(source).collection.features.length, 2);
  }
});

test('grade, source identity, road class, access and carriageway differences terminate a label chain', () => {
  const incompatible: Partial<RoadWay>[] = [
    {name:'Fremont Blvd'}, {highway:'secondary'}, {tags:{ref:'CA 84'}},
    {tags:{bridge:'yes',layer:'1'}}, {tags:{tunnel:'yes',layer:'-1'}},
    {tags:{carriageway:'east'}}, {tags:{access:'private'}}, {oneway:'reversible'},
  ];
  for (const properties of incompatible) {
    const source = data([way('1',['a','b']),way('2',['b','c'],properties)]);
    assert.equal(prepareRoadLabels(source).collection.features.length, 2, JSON.stringify(properties));
  }
});

test('source road names and refs stay distinct from grouped study titles and freeway ramp destinations', () => {
  const source = data([
    way('1',['a','b'],{name:'Auto Mall Parkway'}),
    way('2',['b','c'],{name:'Durham Road'}),
    way('3',['d','e'],{name:'Nimitz Freeway',highway:'motorway',tags:{ref:'I 880'}}),
    way('4',['x','y'],{name:'',highway:'motorway',tags:{ref:'I 680'}}),
    way('5',['y','z'],{name:'',highway:'motorway_link',tags:{destination:'I 680'}}),
  ]);
  const labels = prepareRoadLabels(source,[{id:'grouped-auto-durham',sourceWayIds:['1','2']},{id:'i880',sourceWayIds:['3']},{id:'i680',sourceWayIds:['4','5']}]);
  assert.deepEqual(labels.collection.features.map(feature=>feature.properties.label), ['Auto Mall Parkway','Durham Road','I 880','I 680']);
  assert.equal(labels.byCurriculumId.get('grouped-auto-durham')?.length, 2);
  assert.deepEqual(labels.collection.features.map(feature=>feature.properties.compactLabel), ['Auto Mall Pkwy','Durham Rd','I 880','I 680']);
  assert.deepEqual(labels.collection.features.map(feature=>feature.properties.sourceName), ['Auto Mall Parkway','Durham Road','Nimitz Freeway','']);
  assert.equal(labels.collection.features[2].properties.sourceName, 'Nimitz Freeway');
  assert.equal(labels.byWayId.has('5'), false, 'a ramp destination tag is not its own street name or route ref');
  assertSourcePreserved(source, labels);
});

test('missing coordinates never produce shortcuts, malformed data is diagnosed and duplicate source IDs are withheld', () => {
  const source = data([way('1',['a','b','missing','c','d']),way('duplicate',['x','y']),way('duplicate',['y','z'])]);
  const labels = prepareRoadLabels(source);
  assert.deepEqual(chains(labels).map(chain=>chain.sourceNodeIds), [['a','b'],['c','d']]);
  assert.equal(labels.diagnostics.missingOrInvalidSegments, 2);
  assert.deepEqual(labels.diagnostics.duplicateWayIds, ['duplicate']);
  assertSourcePreserved(source, labels);
  const invalid = data([way('1',['a','b','c'])]); invalid.nodes.b = [NaN,37.54];
  assert.equal(prepareRoadLabels(invalid).collection.features.length, 0);
});

test('closed source roads retain their actual loop without duplicate or missing segments', () => {
  const source = data([way('1',['a','b']),way('2',['b','c']),way('3',['c','a'])]);
  const labels = prepareRoadLabels(source);
  assert.equal(labels.collection.features.length, 1);
  assert.deepEqual(chains(labels)[0].sourceNodeIds, ['a','b','c','a']);
  assertSourcePreserved(source, labels);
});

test('priority updates use indexes, restore baseline, and never rebuild label geometry', () => {
  const source = data([
    way('1',['a','b']),way('2',['x','c']),
    way('3',['d','e'],{name:'Stevenson Boulevard'}),
    way('4',['y','z'],{name:'A sourced connector',highway:'residential'}),
  ]);
  const labels = prepareRoadLabels(source,[{id:'study',sourceWayIds:['1','2','3']}]);
  const geometry = labels.collection.features.map(feature=>feature.geometry);
  const sourceSnapshot = structuredClone(source);
  const priorities = new RoadLabelPriorityController(labels);
  let diff = priorities.update({currentWayId:'1',selectedWayIds:['3'],connectorWayIds:['4']});
  assert.equal(diff.update.length, 4, 'current exact identity is prioritized across separate source-way sections');
  assert.deepEqual(labels.collection.features.map(feature=>feature.properties.priority), [1,1,0,3]);
  assert.equal(priorities.update({currentWayId:'1',selectedWayIds:['3'],connectorWayIds:['4']}).update.length, 0, 'unchanged interaction causes no source update');
  diff = priorities.update({selectedCurriculumIds:['study'],currentWayId:'1'});
  assert.deepEqual(labels.collection.features.map(feature=>feature.properties.priority), [0,0,0,5]);
  assert.equal(diff.update.length, 3);
  priorities.update({});
  assert.deepEqual(labels.collection.features.map(feature=>feature.properties.priority), [2,2,2,5]);
  assert.deepEqual(labels.collection.features.map(feature=>feature.geometry), geometry);
  labels.collection.features.forEach((feature,index)=>assert.equal(feature.geometry,geometry[index]));
  assert.deepEqual(source, sourceSnapshot);
});

test('bundled Fremont label chains conserve real source segments and all 38 study associations', () => {
  const source = JSON.parse(readFileSync(new URL('../public/data/roads.json',import.meta.url),'utf8')) as RoadData;
  const network = JSON.parse(readFileSync(new URL('../public/data/study-network.json',import.meta.url),'utf8'));
  const labels = prepareRoadLabels(source,network.entries);
  assert.equal(labels.byCurriculumId.size, 38);
  for (const [id,features] of labels.byCurriculumId) assert.ok(features.length, `missing curriculum label association ${id}`);
  assert.deepEqual(labels.diagnostics.duplicateWayIds, []);
  assert.equal(labels.diagnostics.missingOrInvalidSegments, 0);
  assertSourcePreserved(source, labels);
  assert.ok(labels.collection.features.length < labels.diagnostics.labelledWays, 'real split ways should form longer source-backed label lines');
  for (const name of ['Fremont Boulevard','Stevenson Boulevard','Auto Mall Parkway','Durham Road']) {
    const features = labels.byName.get(name)!.map(id=>labels.byId.get(id)!.feature);
    assert.ok(features.length, name);
    assert.ok(features.every(feature=>feature.properties.label === name));
    assert.ok(features.some(feature=>feature.geometry.coordinates.length > 3), `${name} retains curved source geometry`);
  }
  for (const ref of ['I 680','I 880']) assert.ok(labels.collection.features.some(feature=>feature.properties.ref===ref && feature.properties.label===ref));
});


test('compact map text abbreviates only recognized terminal suffixes without changing identity', () => {
  for (const [name, compact] of [['Fremont Boulevard','Fremont Blvd'],['Mowry Avenue','Mowry Ave'],['Paseo Padre Parkway','Paseo Padre Pkwy'],['Durham Road','Durham Rd'],['Liberty Street','Liberty St'],['Sailway Drive','Sailway Dr'],['I 880','I 880'],['Road Runner Court','Road Runner Court'],['Parkway Terrace','Parkway Terrace']]) assert.equal(compactRoadLabel(name),compact);
});

test('real one-way turnaround connections split display carriageways while preserving both source segments', () => {
  const source: RoadData={nodes:{a:[-122,37.5],b:[-121.999,37.5],c:[-121.9999,37.5001]},ways:[way('1',['a','b'],{oneway:'yes'}),way('2',['b','c'],{oneway:'yes'})]};
  const before=structuredClone(source),labels=prepareRoadLabels(source);
  assert.equal(labels.collection.features.length,2);
  assert.deepEqual(chains(labels).map(chain=>chain.sourceNodeIds),[['a','b'],['b','c']]);
  assertSourcePreserved(source,labels);
  assert.deepEqual(source,before);
});
