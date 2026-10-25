import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {MapStudyData,MapScope} from '../src/map-study/types';
import {assignedEntryJunctions,assignedPairComponents,entryJunctions,studyEntries} from '../src/map-study/data';
import {pointInZone} from '../src/map-study/geometry';
import {createQuiz,eligibleIntersectionPair,answerQuiz} from '../src/map-study/learning';

const data=JSON.parse(readFileSync(new URL('../public/data/map-study.json',import.meta.url),'utf8')) as MapStudyData;
const zone=data.zones.zones.find(value=>value.id==='zone1')!.geometry!;
const pairKey=(ids:readonly string[])=>[...ids].sort().join('|');

test('assigned intersection rows reference exact in-scope source nodes and two distinct active entries',()=>{
  const before=JSON.stringify(data);
  for(const scope of ['zone1','all'] as const){
    const active=new Set(studyEntries(data,scope).map(entry=>entry.id));
    for(const entry of studyEntries(data,scope)){
      const rows=assignedEntryJunctions(data,entry.id,scope),seen=new Set<string>();
      for(const row of rows){
        const j=row.junction,original=data.junctions.find(value=>value.id===j.sourceJunctionId)!;
        assert.ok(original);assert.equal(j.kind,'junction');assert.ok(['shared-node','name-change'].includes(j.connectionType));
        const section=data.sections.find(value=>value.id===row.sectionId)!;
        assert.equal(section.entryId,entry.id);assert.ok(section.sourceNodeIds.includes(j.displayNodeId));
        assert.deepEqual(j.position,original.components.find(value=>value.nodeId===j.displayNodeId)!.position);
        if(scope==='zone1')assert.ok(pointInZone(j.position,zone));
        assert.ok(j.roads.every(road=>road.entryIds.some(id=>active.has(id))));
        assert.ok(j.mappedPairs.length);
        for(const pair of j.mappedPairs){
          assert.ok(pair.nodeIds.includes(j.displayNodeId));
          const [a,b]=pair.roadIds.map(id=>j.roads.find(road=>road.id===id)!);
          assert.ok(a.entryIds.some(id=>b.entryIds.some(other=>id!==other)));
          assert.ok(a.entryIds.includes(entry.id)||b.entryIds.includes(entry.id));
          const sourcePair=original.mappedPairs.find(value=>pairKey(value.roadIds)===pairKey(pair.roadIds))!;
          assert.ok(assignedPairComponents(data,original,sourcePair,scope).some(component=>component.nodeId===j.displayNodeId));
          const identity=`${original.id}:${pairKey(pair.roadIds)}`;
          assert.ok(!seen.has(identity),'duplicate carriageway nodes must not repeat the same named physical pair');seen.add(identity);
        }
        assert.ok(j.displayQuizPairs.every(pair=>j.mappedPairs.some(mapped=>pairKey(mapped.roadIds)===pairKey(pair.roadIds))&&pair.nodeIds.includes(j.displayNodeId)));
      }
    }
  }
  assert.equal(JSON.stringify(data),before,'study filtering never edits retained geographic coordinates or evidence');
});

test('Stevenson offers six Zone 1 assigned-road junctions rather than residential and connector sites',()=>{
  const rows=assignedEntryJunctions(data,'ew13','zone1');
  assert.equal(rows.length,6);assert.ok(entryJunctions(data,'ew13').length>rows.length);
  assert.deepEqual(rows.map(row=>row.junction.roadNames.find(name=>name!=='Stevenson Boulevard')).sort(),
    ['Mission Boulevard','Paseo Padre Parkway','Fremont Boulevard','Sundale Drive','Blacow Road','Farwell Drive'].sort());
  assert.deepEqual(assignedEntryJunctions(data,'ew13','zone1',{fullRoad:true}).map(row=>row.junction.id),rows.map(row=>row.junction.id),'full-road styling cannot expand the Zone 1 curriculum or boundary');
  const all=assignedEntryJunctions(data,'ew13','all');assert.equal(all.length,7);
  assert.ok(all.some(row=>row.junction.roadNames.includes('Albrae Street')));
  assert.equal(studyEntries(data,'zone1').length,18);assert.equal(studyEntries(data,'all').length,38);
});

test('source-node membership is required in both assigned road sections, not just the logical group',()=>{
  const j=data.junctions.find(value=>value.id==='map-junction-1578762389')!,pair=j.quizPairs[0];
  assert.ok(assignedPairComponents(data,j,pair,'zone1').length);
  const changed={...data,sections:data.sections.map(section=>section.entryId==='ns03'?{...section,sourceNodeIds:section.sourceNodeIds.map(node=>pair.nodeIds.includes(node)?`unshared-${node}`:node)}:section)};
  assert.equal(assignedPairComponents(changed,j,pair,'zone1').length,0,'identical displayed geometry with incompatible topology must not qualify');
  assert.ok(!assignedEntryJunctions(changed,'ew13','zone1').some(row=>row.junction.sourceJunctionId===j.id));
});

test('ordinary main-road intersections exclude ramps, freeways and grade-separated line crossings',()=>{
  assert.deepEqual(assignedEntryJunctions(data,'ns01','zone1'),[]);
  assert.deepEqual(assignedEntryJunctions(data,'ns02','all'),[]);
  const autoMall=assignedEntryJunctions(data,'ew17','all');assert.ok(autoMall.length);
  assert.ok(autoMall.every(row=>!row.junction.entryIds.includes('ns02')),'I-680 overpass does not connect directly to Auto Mall');
  assert.ok(autoMall.every(row=>row.junction.kind!=='nonconnecting-crossing'));
  const j=data.junctions.find(value=>value.id==='map-junction-1578762389')!,pair=j.quizPairs[0];
  const freewayWays=new Set(data.entries.find(value=>value.id==='ns03')!.sourceWayIds);
  const changed={...data,roads:{...data.roads,features:data.roads.features.map(feature=>freewayWays.has(feature.properties.wayId)?{...feature,properties:{...feature.properties,highway:'motorway_link'}}:feature)}};
  assert.equal(assignedPairComponents(changed,j,pair,'zone1').length,0,'a ramp-mediated interchange cannot become a direct study-road intersection');
});

test('distinct components in a retained logical site keep separate actual locations and names',()=>{
  const rows=assignedEntryJunctions(data,'ns13','all').filter(row=>row.junction.sourceJunctionId==='map-junction-1695636899');
  assert.equal(rows.length,2);assert.equal(new Set(rows.map(row=>row.junction.id)).size,2);
  assert.notDeepEqual(rows[0].junction.position,rows[1].junction.position);
  assert.deepEqual(rows.map(row=>row.junction.roadNames.filter(name=>name!=='Warm Springs Boulevard')).flat().sort(),['Kato Road','Scott Creek Road']);
  for(const row of rows){assert.equal(row.junction.components.length,1);assert.equal(row.junction.roadNames.length,2);assert.equal(row.junction.mappedPairs.length,1);}
});

test('a section cannot inherit a different carriageway connection or outside boundary evidence',()=>{
  const rows=assignedEntryJunctions(data,'ew13','all',{sectionId:'ew13:road-label:1047229688:0'});
  assert.ok(rows.every(row=>!row.junction.roadNames.includes('Albrae Street')));
  const driscoll=assignedEntryJunctions(data,'ew14','zone1').find(row=>row.junction.sourceJunctionId==='map-junction-1676005285')!;
  assert.ok(driscoll);assert.deepEqual(driscoll.junction.roadNames,['Driscoll Road','Washington Boulevard']);
  assert.equal(driscoll.junction.displayNodeId,'1676005285');assert.ok(pointInZone(driscoll.junction.position,zone));
  assert.deepEqual(driscoll.junction.displayQuizPairs,[]);assert.equal(driscoll.junction.evidence.topology.status,'Unresolved');
  const original=data.junctions.find(value=>value.id===driscoll.junction.sourceJunctionId)!;
  const washingtonOsgood=original.quizPairs[0];
  assert.equal(assignedPairComponents(data,original,washingtonOsgood,'zone1').length,0);
  assert.ok(assignedPairComponents(data,original,washingtonOsgood,'all').length);
});

test('same-entry name variants never create a two-entry intersection',()=>{
  let checked=0;
  for(const j of data.junctions)for(const pair of j.mappedPairs){
    const roads=pair.roadIds.map(id=>j.roads.find(road=>road.id===id)!);
    if(roads.every(road=>road.entryIds.length===1&&road.entryIds[0]==='ns08')){checked++;assert.deepEqual(assignedPairComponents(data,j,pair,'all'),[]);}
  }
  assert.ok(checked>0,'actual Grimmer/South Grimmer name transitions exercise the distinct-entry rule');
});

test('genuine assigned-road name transitions remain explicit exploratory connections without scored crossing claims',()=>{
  const blacow=assignedEntryJunctions(data,'ns05','zone1').find(row=>row.junction.sourceJunctionId==='map-junction-443527086')!;
  assert.ok(blacow);assert.equal(blacow.junction.connectionType,'name-change');
  assert.deepEqual(blacow.junction.roadNames,['Blacow Road','Mowry Avenue']);
  assert.ok(pointInZone(blacow.junction.position,zone));assert.deepEqual(blacow.junction.displayQuizPairs,[]);
  const paseo=assignedEntryJunctions(data,'ns04','all').find(row=>row.junction.sourceJunctionId==='map-junction-523180583')!;
  assert.ok(paseo);assert.equal(paseo.junction.connectionType,'name-change');
  assert.deepEqual(paseo.junction.roadNames,['Paseo Padre Parkway','Thornton Avenue']);
  assert.equal(pointInZone(paseo.junction.position,zone),false);
  assert.ok(!assignedEntryJunctions(data,'ns04','zone1',{fullRoad:true}).some(row=>row.junction.sourceJunctionId===paseo.junction.sourceJunctionId));
  for(const row of [blacow,paseo])for(const pair of row.junction.mappedPairs)assert.equal(eligibleIntersectionPair(row.junction,pair),false,'a mapped name transition does not become an independently verified crossing question');
});

test('scored main-road questions retain independent evidence and exclude four noncurriculum pairs',()=>{
  const eligible=(scope:MapScope)=>data.junctions.flatMap(j=>j.quizPairs.filter(pair=>eligibleIntersectionPair(j,pair)&&assignedPairComponents(data,j,pair,scope).length).map(pair=>({j,pair})));
  assert.equal(eligible('zone1').length,5);assert.equal(eligible('all').length,6);
  assert.equal(data.junctions.reduce((sum,j)=>sum+j.quizPairs.length,0),10,'all ten original independently supported facts remain retained');
  const excluded=new Set(['Gallaudet Drive','Guardino Drive','Liberty Street','Eugene Street']);
  for(const scope of ['zone1','all'] as const){
    const active=new Set(studyEntries(data,scope).map(entry=>entry.id));
    for(const entry of studyEntries(data,scope)){
      const quiz=createQuiz(data,{kind:'intersection',mode:scope,entryId:entry.id,random:()=>0});if(!quiz)continue;
      assert.ok(!excluded.has(quiz.answerLabel));assert.equal(answerQuiz(quiz,quiz.answerId,data).outcome,'correct');
      for(const choice of quiz.choices)assert.ok(data.junctions.some(j=>j.roads.some(road=>road.id===choice.id&&road.entryIds.some(id=>active.has(id)))));
    }
  }
});
