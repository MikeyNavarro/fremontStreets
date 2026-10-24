import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { RoadData } from '../src/core/types';
import type { StudyNetwork } from '../src/study-network';
import { buildMapJunctions, type AssociatedEvidence, type NamedPhysicalFact, type SourceVisualCrossing } from '../src/map-study/junctions';

const physical: NamedPhysicalFact = {id: 'project-1', subject: {kind: 'named-intersection', sourceObjectId: 1, roadNames: ['Main Road', 'Cross Avenue']}, implementationStatus: 'Implemented', sourceIds: ['city-physical']};
function fixture() {
  const roads: RoadData = {nodes: {a: [-121.98,37.55], b: [-121.979,37.55], c: [-121.978,37.55], d: [-121.979,37.549], e: [-121.979,37.551], f: [-121.98,37.549], g: [-121.978,37.551]}, ways: [
    {id: 'main', name: 'Main Road', highway: 'secondary', nodes: ['a','b','c']},
    {id: 'cross', name: 'Cross Avenue', highway: 'secondary', nodes: ['d','b','e']},
  ]};
  const network = {entries: [{id: 'entry-main', sourceWayIds: ['main']}], intersections: []} as unknown as StudyNetwork;
  const evidence: AssociatedEvidence = {schema: 1, sources: [{id: 'city-physical', url: 'https://example.gov/physical', provider: 'Fixture City', retrievedAt: '2026-10-24', limitations: 'Fixture named location only.'}], claims: [], associations: []};
  return {roads, network, evidence};
}
function claims(evidence: AssociatedEvidence, node = 'b') {
  for (const dimension of ['intersectionLocation','topology','gradeSeparation'] as const) evidence.claims.push({id: `project-1-${dimension}-osm-node-${node}`, subject: {kind: 'junction', id: `osm-node-${node}`}, dimension, status: 'Verified', sourceIds: ['city-physical'], scope: 'Named Main Road / Cross Avenue physical junction, not all approaches or turns.', reason: 'Fixture implemented site and exact named pair.'});
}

test('junctions use shared source nodes and retain named noncurriculum connectors', () => {
  const {roads,network,evidence} = fixture(), original = structuredClone(roads);
  const junctions = buildMapJunctions(roads,network,evidence,[]);
  assert.equal(junctions.length,1);
  assert.deepEqual(junctions[0].nodeIds,['b']);
  assert.deepEqual(junctions[0].position,roads.nodes.b);
  assert.equal(junctions[0].roads.find(road=>road.name==='Cross Avenue')?.entryIds.length,0);
  assert.equal(junctions[0].evidence.topology.status,'Unresolved');
  assert.equal(junctions[0].quizPairs.length,0);
  assert.deepEqual(roads,original);
});

test('visual crossings without a common source node remain separate from junctions and quizzes', () => {
  const {roads,network,evidence} = fixture();
  roads.ways[1].nodes=['d','e'];
  const crossings: SourceVisualCrossing[] = [{edgeIds:['main:0:f','cross:0:f'],sourceWayIds:['main','cross'],entryIds:[['entry-main'],[]],position:roads.nodes.b}];
  const records=buildMapJunctions(roads,network,evidence,crossings);
  assert.equal(records.length,1);
  assert.equal(records[0].kind,'nonconnecting-crossing');
  assert.deepEqual(records[0].nodeIds,[]);
  assert.deepEqual(records[0].mappedPairs,[]);
  assert.deepEqual(records[0].quizPairs,[]);
});

test('City named-location evidence cannot qualify a physical-connection quiz', () => {
  const {roads,network,evidence}=fixture();claims(evidence);
  evidence.claims=evidence.claims.filter(claim=>claim.dimension==='intersectionLocation');
  const [junction]=buildMapJunctions(roads,network,evidence,[],[physical]);
  assert.equal(junction.evidence.location.status,'Verified');
  assert.equal(junction.evidence.topology.status,'Unresolved');
  assert.equal(junction.quizPairs.length,0);
});

test('independent physical evidence qualifies only its exact named shared-node pair', () => {
  const {roads,network,evidence}=fixture();claims(evidence);
  roads.ways.push({id:'third',name:'Third Street',highway:'residential',nodes:['f','b','g']});
  const [junction]=buildMapJunctions(roads,network,evidence,[],[physical]);
  assert.equal(junction.mappedPairs.length,3);
  assert.equal(junction.quizPairs.length,1);
  assert.deepEqual(new Set([junction.quizPairs[0].roadA,junction.quizPairs[0].roadB]),new Set(['Main Road','Cross Avenue']));
  assert.equal(junction.evidence.maneuvers.status,'Unresolved');
  assert.ok(junction.quizPairs[0].claimIds.every(id=>evidence.claims.some(claim=>claim.id===id)));
});

test('conflicted existing or new facts cannot be erased by favorable physical claims', () => {
  const {roads,network,evidence}=fixture();claims(evidence);
  const existing=buildMapJunctions(roads,network,evidence,[],[physical],[{id:'osm-node-b',topology:{status:'Conflicted'}}]);
  assert.equal(existing[0].evidence.topology.status,'Conflicted');
  assert.equal(existing[0].quizPairs.length,0);
  evidence.claims.push({...evidence.claims.find(claim=>claim.dimension==='topology')!,id:'conflicting-physical',status:'Conflicted'});
  const [conflicted]=buildMapJunctions(roads,network,evidence,[],[physical]);
  assert.equal(conflicted.evidence.topology.status,'Conflicted');
  assert.equal(conflicted.quizPairs.length,0);
});

test('proximity alone never groups separate intersections; retained City identity can group components', () => {
  const {roads,network,evidence}=fixture();
  roads.nodes.h=[-121.97899,37.55];roads.nodes.i=[-121.97899,37.549];roads.nodes.j=[-121.97899,37.551];
  roads.ways[0].nodes=['a','b','h','c'];
  roads.ways.push({id:'cross-second',name:'Cross Avenue',highway:'secondary',nodes:['i','h','j']});
  assert.equal(buildMapJunctions(roads,network,evidence,[]).length,2);
  claims(evidence,'b');claims(evidence,'h');
  evidence.associations=[{kind:'city-location',subject:'osm-node-b',sourceObjectId:1},{kind:'city-location',subject:'osm-node-h',sourceObjectId:1}];
  const grouped=buildMapJunctions(roads,network,evidence,[],[physical]);
  assert.equal(grouped.length,1);
  assert.deepEqual(grouped[0].nodeIds,['b','h']);
  assert.equal(grouped[0].components.length,2);
  assert.deepEqual(grouped[0].quizPairs[0].nodeIds,['b','h']);
  const conflicted=buildMapJunctions(roads,network,evidence,[],[physical],[{id:'osm-node-h',topology:{status:'Conflicted'}}]);
  assert.equal(conflicted[0].quizPairs.length,0,'a favorable component cannot erase conflicting evidence for the same named pair');
  assert.match(conflicted[0].statusLabel,/Conflicting/);
});

test('grouping preserves component-specific pairs instead of fabricating all-to-all connections', () => {
  const {roads,network,evidence}=fixture();
  roads.nodes.h=[-121.9785,37.55];roads.nodes.i=[-121.9785,37.549];roads.nodes.j=[-121.9785,37.551];
  roads.ways[0].nodes=['a','b','h','c'];roads.ways.push({id:'third',name:'Third Street',highway:'residential',nodes:['i','h','j']});
  network.intersections=[{id:'osm-node-b',nodeId:'b',logicalId:'retained-logical-site'},{id:'osm-node-h',nodeId:'h',logicalId:'retained-logical-site'}] as StudyNetwork['intersections'];
  const [grouped]=buildMapJunctions(roads,network,evidence,[]);
  assert.equal(grouped.roads.length,3);
  assert.equal(grouped.mappedPairs.length,2);
  assert.ok(!grouped.mappedPairs.some(pair=>[pair.roadA,pair.roadB].includes('Cross Avenue')&&[pair.roadA,pair.roadB].includes('Third Street')));
});

test('real Fremont junction evidence remains scoped, source-backed and separate from 68 nonconnections', () => {
  const read=(file:string)=>JSON.parse(readFileSync(new URL('../'+file,import.meta.url),'utf8'));
  const roads=read('public/data/roads.json') as RoadData, network=read('public/data/study-network.json') as StudyNetwork, evidence=read('data-sources/geographic-evidence.json') as AssociatedEvidence;
  const crossings=read('docs/data/study-intersections.json').unconnectedVisualCrossings;
  const records=buildMapJunctions(roads,network,evidence,crossings,read('data-sources/independent-junctions/scoped-proposed-facts.json').facts,read('public/data/verification.json').junctions);
  const junctions=records.filter(record=>record.kind==='junction'), nonconnecting=records.filter(record=>record.kind==='nonconnecting-crossing');
  assert.equal(nonconnecting.length,68);
  assert.ok(junctions.length>219,'named connector intersections extend the legacy study-to-study inventory');
  assert.ok(junctions.some(junction=>junction.quizPairs.length));
  for(const junction of junctions){
    assert.ok(junction.nodeIds.every(nodeId=>roads.nodes[nodeId]));
    assert.ok(junction.components.some(component=>component.position[0]===junction.position[0]&&component.position[1]===junction.position[1]));
    assert.equal(junction.evidence.maneuvers.status,'Unresolved');
    for(const pair of junction.quizPairs){
      assert.ok(junction.mappedPairs.some(mapped=>mapped.roadIds.join('|')===pair.roadIds.join('|')));
      assert.ok(pair.nodeIds.every(nodeId=>junction.components.some(component=>component.nodeId===nodeId&&pair.roadIds.every(id=>component.roadIds.includes(id)))));
      assert.ok(pair.claimIds.every(id=>evidence.claims.some(claim=>claim.id===id&&claim.status==='Verified')));
    }
  }
  assert.ok(nonconnecting.every(record=>!record.mappedPairs.length&&!record.quizPairs.length));
});
