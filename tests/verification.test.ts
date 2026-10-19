import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {recognitionEligible,intersectionEligible,navigationEligible,type VerificationRegistry} from '../src/training/verification';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const registry=JSON.parse(read('public/data/verification.json')) as VerificationRegistry;
const network=JSON.parse(read('public/data/study-network.json'));
test('evidence accounts for the immutable 38-entry curriculum and exact shipped roads',()=>{
 assert.equal(registry.entries.length,38);
 assert.equal(registry.roadsSha256,createHash('sha256').update(read('public/data/roads.json')).digest('hex'));
 assert.equal(registry.curriculumSha256,createHash('sha256').update(read('data-sources/study-entries.json')).digest('hex'));
 assert.deepEqual(registry.entries.map(e=>[e.id,e.label]),network.entries.map((e:any)=>[e.id,e.originalLabel]));
 for(const entry of registry.entries){const source=network.entries.find((e:any)=>e.id===entry.id);assert.ok(entry.identity.evidence.length);for(const segment of entry.segments){assert.ok(source.edgeIds.includes(segment.edgeId));assert.ok(segment.cityObjectIds.length);assert.ok(segment.cityObjectIds.every(id=>source.cityObjectIds.includes(id)));assert.ok(segment.maxOffsetMetres<=registry.policy.geometryToleranceMetres);assert.ok(segment.samples>=2);}}
});
test('name verification cannot enable uncorroborated geometry, conflicted facts, or legal maneuver scores',()=>{
 const entry=registry.entries[0];assert.ok(recognitionEligible(entry,entry.segments[0].edgeId));assert.equal(recognitionEligible(entry,'invented-road'),false);
 assert.equal(recognitionEligible({...entry,identity:{...entry.identity,status:'Conflicted'}}),false);
 assert.equal(recognitionEligible({...entry,geometry:{...entry.geometry,status:'Conflicted'}}),false);
 assert.equal(recognitionEligible({...entry,segments:[]}),false);
 for(const e of registry.entries)assert.equal(navigationEligible(e),false);
 for(const j of registry.junctions)assert.equal(intersectionEligible(j),false);
});
test('partial corroboration remains unresolved at corridor level and independent restrictions are not invented',()=>{
 assert.ok(registry.entries.some(e=>e.segments.length<e.totalEdges));
 for(const e of registry.entries){if(e.segments.length<e.totalEdges)assert.equal(e.geometry.status,'Unresolved');assert.equal(e.maneuvers.status,'Unresolved');assert.match(e.geometry.scope,/individually/);}
 assert.equal(registry.junctions.length,network.intersections.length);
});
