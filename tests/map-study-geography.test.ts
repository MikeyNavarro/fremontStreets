import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {LonLat,RoadData} from '../src/core/types';
import type {ZoneGeometry} from '../src/core/zones';
import type {StudyNetwork} from '../src/study-network';
import type {MapStudyData} from '../src/map-study/types';
import {ZONE1_ENTRY_IDS} from '../src/map-study/types';
import {clipLineToZone,geometryLength,lineLength,pointInZone} from '../src/map-study/geometry';
import {compareEntries,entryCrossings,entryGeometry,entryJunctions,roadAtWay,searchRoads,studyEntries} from '../src/map-study/data';

const read=<T>(file:string)=>JSON.parse(readFileSync(new URL(`../${file}`,import.meta.url),'utf8')) as T;
const data=read<MapStudyData>('public/data/map-study.json');
const roads=read<RoadData>('public/data/roads.json');
const network=read<StudyNetwork>('public/data/study-network.json');
const square:ZoneGeometry={type:'Polygon',coordinates:[[[0,0],[10,0],[10,10],[0,10],[0,0]]]};
const approximate=(actual:number,expected:number,tolerance=.00001)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);

test('exact requested 18 defaults retain all 38 original identities and mappings',()=>{
  assert.equal(studyEntries(data).length,18);assert.equal(studyEntries(data,'all').length,38);
  assert.deepEqual(data.zone1EntryIds,[...ZONE1_ENTRY_IDS]);
  assert.equal(new Set(data.zone1EntryIds).size,18);
  const defaults=new Set<string>(data.zone1EntryIds);
  assert.ok(!defaults.has('ew08')&&!defaults.has('ns09'),'legacy broad zone metadata cannot expand the requested curriculum');
  for(const original of network.entries){const entry=data.entries.find(e=>e.id===original.id)!;assert.ok(entry);assert.equal(entry.originalLabel,original.originalLabel);assert.equal(entry.group,original.group);assert.deepEqual(entry.names,original.names);assert.deepEqual(entry.sourceWayIds,original.sourceWayIds);}
  assert.equal(data.entries.find(e=>e.id==='ns08')!.originalLabel,'Grimmer Boulevard');
  assert.ok(data.entries.find(e=>e.id==='ns08')!.mappedNames.includes('South Grimmer Boulevard'));
});

test('line clipping finds boundary crossings even when both source endpoints are outside',()=>{
  const original:LonLat[]=[[-5,5],[15,5]],snapshot=structuredClone(original);
  const result=clipLineToZone(original,square);
  assert.deepEqual(result.inside.coordinates,[[[0,5],[10,5]]]);
  assert.deepEqual(result.outside.coordinates,[[[-5,5],[0,5]],[[10,5],[15,5]]]);
  approximate(geometryLength(result.inside)+geometryLength(result.outside),lineLength(original));
  assert.deepEqual(original,snapshot);
});

test('line clipping respects holes, multiple polygon components, tangency and boundary-aligned roads',()=>{
  const holed:ZoneGeometry={type:'Polygon',coordinates:[square.coordinates[0],[[3,3],[7,3],[7,7],[3,7],[3,3]]]};
  const line:LonLat[]=[[-1,5],[11,5]];
  const result=clipLineToZone(line,holed);
  assert.deepEqual(result.inside.coordinates,[[[0,5],[3,5]],[[7,5],[10,5]]]);
  assert.equal(pointInZone([5,5],holed),false);
  const islands:ZoneGeometry={type:'MultiPolygon',coordinates:[[[[0,0],[2,0],[2,2],[0,2],[0,0]]],[[[4,0],[6,0],[6,2],[4,2],[4,0]]]]};
  const multiple=clipLineToZone([[-1,1],[7,1]],islands);
  assert.deepEqual(multiple.inside.coordinates,[[[0,1],[2,1]],[[4,1],[6,1]]]);
  assert.equal(clipLineToZone([[-1,1],[1,-1]],square).inside.coordinates.length,0,'touching one corner does not create a road section');
  assert.deepEqual(clipLineToZone([[-1,0],[11,0]],square).inside.coordinates,[[[0,0],[10,0]]]);
});

test('clipping retains original curves and every interior source vertex without fabricated shortcuts',()=>{
  const line:LonLat[]=[[-2,2],[2,2],[3,7],[8,8],[12,8]],result=clipLineToZone(line,square);
  assert.deepEqual(result.inside.coordinates,[[[0,2],[2,2],[3,7],[8,8],[10,8]]]);
  approximate(geometryLength(result.inside)+geometryLength(result.outside),lineLength(line));
});

test('derived background roads preserve every original source way, coordinate and version hash',()=>{
  const source=new Map(roads.ways.map(w=>[String(w.id),w]));
  assert.equal(data.roads.features.length,roads.ways.length);assert.equal(new Set(data.roads.features.map(f=>f.id)).size,roads.ways.length);
  for(const feature of data.roads.features){const way=source.get(feature.properties.wayId)!;assert.ok(way);assert.equal(feature.id,feature.properties.wayId);assert.deepEqual(feature.geometry.coordinates,way.nodes.map(n=>roads.nodes[String(n)]));}
  for(const [file,expected]of Object.entries(data.sourceHashes))assert.equal(createHash('sha256').update(readFileSync(new URL(`../${file}`,import.meta.url))).digest('hex'),expected,file);
  assert.deepEqual(data.headquarters.position,network.station.position);assert.notDeepEqual(data.headquarters.position,network.station.departurePosition);
});

test('all actual study section clips partition original centerlines and never create junction nodes',()=>{
  const zone=data.zones.zones.find(z=>z.id==='zone1')!.geometry!;
  for(const section of data.sections){
    approximate(geometryLength(section.inside)+geometryLength(section.outside),geometryLength(section.geometry),.001);
    assert.equal(section.sourceNodeIds.length,section.geometry.coordinates.length);
    section.sourceNodeIds.forEach((node,i)=>assert.deepEqual(section.geometry.coordinates[i],roads.nodes[node]));
    for(const line of section.inside.coordinates)for(let i=1;i<line.length;i++)assert.ok(pointInZone([(line[i-1][0]+line[i][0])/2,(line[i-1][1]+line[i][1])/2],zone));
    for(const row of section.junctionOrder){const j=data.junctions.find(j=>j.id===row.junctionId)!;assert.ok(j.nodeIds.some(node=>section.sourceNodeIds.includes(node)));}
  }
});

test('Zone 1 highlights, full available extent and outside overlays are consistent for Stevenson and interstate corridors',()=>{
  for(const id of ['ew13','ns01','ns02','ns03']){
    const entry=data.entries.find(e=>e.id===id)!;
    const inside=entryGeometry(data,id),full=entryGeometry(data,id,{fullRoad:true}),outside=entryGeometry(data,id,{outsideOnly:true});
    const length=(fc:typeof inside)=>fc.features.reduce((sum,f)=>sum+geometryLength(f.geometry),0);
    assert.ok(length(inside)>0,id);assert.ok(length(outside)>0,id);assert.ok(length(full)>length(inside),id);
    approximate(length(inside)+length(outside),length(full),.001);
    approximate(length(inside),entry.lengths.zone1,.3);
    assert.ok(inside.features.every(f=>f.properties.entryId===id&&f.properties.clipped));
  }
});

test('recognition geometry contains only independently corroborated source segments',()=>{
  const verification=read<{entries:Array<{id:string;segments:Array<{edgeId:string}>}>}>('public/data/verification.json');
  for(const entry of data.entries){
    const allowed=new Set(verification.entries.find(e=>e.id===entry.id)!.segments.map(s=>s.edgeId.replace(/:[fr]$/,'')));
    for(const section of data.sections.filter(s=>s.entryId===entry.id)){
      const expected=section.sourceSegments.reduce((sum,s,i)=>sum+(allowed.has(`${s.wayId}:${s.index}`)?lineLength([section.geometry.coordinates[i] as LonLat,section.geometry.coordinates[i+1] as LonLat]):0),0);
      approximate(geometryLength(section.verified),expected,.00001);
      assert.ok(geometryLength(section.verifiedInside)<=geometryLength(section.verified)+.00001);
    }
  }
});

test('actual shared topology supports comparison while I-680 / Auto Mall remains a nonconnecting crossing',()=>{
  const direct=compareEntries(data,'ew13','ns03');assert.ok(direct.junctions.length);
  assert.ok(direct.junctions.every(j=>j.nodeIds.length&&j.mappedPairs.length));
  const grade=compareEntries(data,'ew17','ns02',{fullRoad:true});
  assert.equal(grade.junctions.length,0);assert.equal(grade.crossings.length,4);
  assert.ok(grade.crossings.every(j=>j.nodeIds.length===0&&j.quizPairs.length===0));
  assert.equal(entryJunctions(data,'ew17',{fullRoad:true}).some(row=>grade.crossings.some(c=>c.id===row.junction.id)),false);
});

test('walkthrough order follows real section distances and search preserves study priority and connector identity',()=>{
  const sequence=entryJunctions(data,'ew13');assert.ok(sequence.length>1);
  const grouped=new Map<string,number[]>();for(const row of sequence){const values=grouped.get(row.sectionId)??[];values.push(row.distanceMetres);grouped.set(row.sectionId,values);}
  for(const values of grouped.values())assert.deepEqual(values,[...values].sort((a,b)=>a-b));
  const stevenson=searchRoads(data,'Stevenson');assert.equal(stevenson[0].entryId,'ew13');assert.equal(stevenson[0].defaultZone1,true);
  assert.equal(searchRoads(data,'Stevenson Blvd')[0].entryId,'ew13','existing road-type aliases work without changing geographic identity');
  const arrowhead=searchRoads(data,'Lake Arrowhead');assert.equal(arrowhead[0].entryId,'ew01');assert.equal(arrowhead[0].label,'Lake Arrowhead Avenue');
  const liberty=searchRoads(data,'Liberty Street');assert.ok(liberty.some(result=>result.kind==='connector'));
  for(const candidate of liberty.filter(r=>r.kind==='connector')){assert.ok(candidate.wayIds.length);assert.ok(roadAtWay(data,candidate.wayIds[0]).some(r=>r.id===candidate.id));}
  assert.equal(studyEntries(data).length,18,'connector search never adds targets');
});

test('selecting a later carriageway section retains its actual shared logical junctions',()=>{
  const entry=data.entries.find(e=>e.id==='ns03')!;
  const global=entryJunctions(data,entry.id,{fullRoad:true});
  let repeatedSectionCase=false;
  for(const section of data.sections.filter(s=>s.entryId===entry.id)){
    const selected=entryJunctions(data,entry.id,{fullRoad:true,sectionId:section.id});
    assert.deepEqual(new Set(selected.map(row=>row.junction.id)),new Set(section.junctionOrder.map(row=>row.junctionId)));
    assert.ok(selected.every(row=>row.sectionId===section.id));
    if(selected.some(row=>global.some(other=>other.junction.id===row.junction.id&&other.sectionId!==row.sectionId)))repeatedSectionCase=true;
  }
  assert.ok(repeatedSectionCase,'real divided source roads exercise deduplication after section selection');
});

test('clipped junction markers use real selected-road nodes inside Zone 1 without moving global records',()=>{
  const zone=data.zones.zones.find(z=>z.id==='zone1')!.geometry!;
  const originals=data.junctions.map(j=>({id:j.id,position:[...j.position]}));
  const originalEvidence=JSON.stringify(data.junctions.map(j=>j.evidence));
  let adjusted=0;
  for(const entryId of data.zone1EntryIds)for(const row of entryJunctions(data,entryId)){
    const section=data.sections.find(s=>s.id===row.sectionId)!,global=data.junctions.find(j=>j.id===row.junction.id)!;
    assert.ok(pointInZone(row.junction.position,zone));
    assert.ok(section.sourceNodeIds.includes(row.junction.displayNodeId));
    assert.deepEqual(row.junction.position,roads.nodes[row.junction.displayNodeId]);
    assert.ok(section.geometry.coordinates.some(point=>point[0]===row.junction.position[0]&&point[1]===row.junction.position[1]));
    assert.equal(row.junction.components,global.components);assert.equal(row.junction.evidence.location,global.evidence.location);assert.equal(row.junction.evidence.maneuvers,global.evidence.maneuvers);
    if(row.junction.evidence.topology.status==='Verified')assert.ok(row.junction.displayQuizPairs.length&&row.junction.displayQuizPairs.every(pair=>pair.nodeIds.includes(row.junction.displayNodeId)));
    if(row.junction.position[0]!==global.position[0]||row.junction.position[1]!==global.position[1])adjusted++;
  }
  assert.ok(adjusted>=18,'real boundary/carriageway cases exercise scoped display positions');
  assert.deepEqual(data.junctions.map(j=>({id:j.id,position:[...j.position]})),originals);
  assert.equal(JSON.stringify(data.junctions.map(j=>j.evidence)),originalEvidence);
  const driscoll=entryJunctions(data,'ew14').find(row=>row.junction.id==='map-junction-1676005285')!;
  assert.equal(driscoll.junction.displayNodeId,'1676005285');
  assert.deepEqual(driscoll.junction.position,[-121.9533095,37.5333264]);
  assert.equal(driscoll.junction.displayQuizPairs.length,0,'Osgood/Washington physical evidence does not establish a Driscoll pair');
  assert.equal(driscoll.junction.evidence.topology.status,'Unresolved');
  assert.equal(driscoll.junction.evidence.grade.status,'Unresolved');
  assert.ok(driscoll.junction.quizPairs.length,'original separately scoped physical facts are retained');
  const stevenson=entryJunctions(data,'ew13').find(row=>row.junction.id==='map-junction-1578762389')!;
  assert.equal(stevenson.junction.evidence.topology.status,'Verified');
  assert.equal(stevenson.junction.displayQuizPairs.length,1);
});

test('a selected carriageway section only displays nonconnections on its own real source line',()=>{
  const all=entryCrossings(data,'ew17',{fullRoad:true});assert.ok(all.length>=4);
  const sections=data.sections.filter(section=>section.entryId==='ew17');
  const seen=new Set<string>();let strictSubset=false;
  for(const section of sections){
    const scoped=entryCrossings(data,'ew17',{fullRoad:true,sectionId:section.id});
    if(scoped.length<all.length)strictSubset=true;
    for(const crossing of scoped){
      assert.ok(crossing.sourceWayIds.some(way=>section.sourceWayIds.includes(way)));
      seen.add(crossing.id);
    }
  }
  assert.ok(strictSubset,'individual sections cannot inherit every crossing of the full grouped corridor');
  assert.deepEqual(seen,new Set(all.map(c=>c.id)),'actual available sections still account for every recorded crossing');
  assert.equal(entryCrossings(data,'ew17',{fullRoad:true,sectionId:data.sections.find(s=>s.entryId==='ew13')!.id}).length,0);
});

test('comparison does not borrow a different carriageway component from the same logical junction',()=>{
  const cases=[
    ['ew13','ns10','map-junction-1666844095','ew13:road-label:1047229688:0'],
    ['ew15','ew14','map-junction-1676005285','ew15:road-label:1043463197:0'],
    ['ew17','ns12','map-junction-350562785','ew17:road-label:1051475103:0'],
    ['ew17','ns12','map-junction-350562785','ew17:road-label:516683152:0'],
    ['ns06','ns07','map-junction-53068020','ns06:road-label:1098456712:0'],
    ['ns06','ns07','map-junction-53068020','ns06:road-label:30914929:0'],
    ['ns06','ns08','map-junction-364262209','ns06:road-label:1049382509:0'],
    ['ns08','ns13','map-junction-1316955658','ns08:road-label:1032843091:0'],
    ['ns13','ew21','map-junction-1695636899','ns13:road-label:1027034681:0'],
    ['ns13','ns14','map-junction-1695636899','ns13:road-label:1027034683:0'],
  ];
  for(const [a,b,junctionId,sectionId]of cases){
    assert.ok(entryJunctions(data,a,{fullRoad:true,sectionId}).some(row=>row.junction.id===junctionId),'logical group itself is visible');
    assert.ok(compareEntries(data,a,b,{fullRoad:true}).junctions.some(j=>j.id===junctionId),'other source sections retain the real pair connection');
    assert.equal(compareEntries(data,a,b,{fullRoad:true,sectionId}).junctions.some(j=>j.id===junctionId),false,`${a}/${b} has no pair node on ${sectionId}`);
  }
});

test('every comparison marker belongs to the exact compared pair, selected source section and visible zone',()=>{
  const zone=data.zones.zones.find(z=>z.id==='zone1')!.geometry!;
  const globalBefore=JSON.stringify(data.junctions);
  let count=0;
  for(const a of data.entries)for(const b of data.entries){
    if(a.id===b.id)continue;
    for(const fullRoad of [false,true])for(const j of compareEntries(data,a.id,b.id,{fullRoad}).junctions){
      count++;
      const section=data.sections.find(s=>s.id===j.displaySectionId)!;
      const component=j.components.find(c=>c.nodeId===j.displayNodeId)!;
      const isPair=(pair:typeof j.mappedPairs[number])=>pair.nodeIds.includes(j.displayNodeId)&&pair.roadIds.some(id=>j.roads.some(road=>road.id===id&&road.entryIds.includes(a.id)))&&pair.roadIds.some(id=>j.roads.some(road=>road.id===id&&road.entryIds.includes(b.id)));
      assert.equal(section.entryId,a.id);assert.ok(section.sourceNodeIds.includes(j.displayNodeId));
      assert.deepEqual(j.position,roads.nodes[j.displayNodeId]);assert.deepEqual(j.position,component.position);
      assert.ok(component.sourceWayIds.some(id=>a.sourceWayIds.includes(id)));
      assert.ok(component.sourceWayIds.some(id=>b.sourceWayIds.includes(id)));
      assert.ok(j.mappedPairs.some(isPair));assert.ok(j.displayQuizPairs.every(isPair));
      if(!fullRoad)assert.ok(pointInZone(j.position,zone));
      assert.ok(compareEntries(data,a.id,b.id,{fullRoad,sectionId:section.id}).junctions.some(other=>other.id===j.id));
    }
  }
  assert.ok(count>100,'the source-backed full and clipped catalogs exercise both scopes');
  assert.equal(JSON.stringify(data.junctions),globalBefore,'comparison never mutates original geometry or evidence');
});
