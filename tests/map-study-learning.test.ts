import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {MapStudyData,MapStudyEntry,MapRoadSection} from '../src/map-study/types';
import type {MapJunction} from '../src/map-study/junctions';
import {pointInZone} from '../src/map-study/geometry';
import {answerMapQuiz,answerQuiz,createQuiz,eligibleIntersectionPair,eligibleQuizSections,MapStudyHistory,MAP_STUDY_HISTORY_KEY,MAP_STUDY_MAX_BACKUP_BYTES,quizVisibility} from '../src/map-study/learning';

const fact=(status:'Verified'|'Unresolved'|'Conflicted'='Verified')=>({status,evidence:['test-source'],scope:'Test fixture fact',reason:'Synthetic test evidence'});
const line=(latitude:number)=>[[-121.99,latitude],[-121.98,latitude]];
function fixture():MapStudyData {
  const ids=['a','b','c','outside'];
  const entries=ids.map((id,i)=>({id,label:`Road ${id.toUpperCase()}`,originalLabel:`Road ${id.toUpperCase()}`,group:'ew',mappedNames:[`Road ${id.toUpperCase()}`],names:[`Road ${id.toUpperCase()}`],sourceWayIds:[`way-${id}`],defaultZone1:i<3,requestedZone1Group:i<3?'partial':null,zone1Relationship:i<3?'partial':'outside',lengths:{full:1000,zone1:i<3?500:0,outside:i<3?500:1000},evidence:{identity:fact(),geometry:fact('Unresolved'),topology:fact('Unresolved'),maneuvers:fact('Unresolved')},sectionIds:[`section-${id}`],junctionIds:['junction-ab'],recognitionSectionIds:[`section-${id}`],limitations:['Synthetic fixture, not Fremont geography']}) as MapStudyEntry);
  const sections=ids.map((id,i)=>({id:`section-${id}`,entryId:id,name:`Road ${id.toUpperCase()}`,sourceWayIds:[`way-${id}`],sourceNodeIds:[`${id}-start`,`${id}-end`],sourceSegments:[{wayId:`way-${id}`,index:0,reversed:false}],geometry:{type:'LineString',coordinates:line(37.55+i*.01)},inside:{type:'MultiLineString',coordinates:i<3?[line(37.55+i*.01)]:[]},outside:{type:'MultiLineString',coordinates:[]},verified:{type:'MultiLineString',coordinates:[line(37.55+i*.01)]},verifiedInside:{type:'MultiLineString',coordinates:i<3?[line(37.55+i*.01)]:[]},lengths:{full:1000,zone1:500,outside:500},junctionOrder:[]}) as MapRoadSection);
  // Only the first half of A is independently corroborated, despite the full source line.
  sections[0].verified.coordinates=[[[-121.99,37.55],[-121.985,37.55]]];
  sections[0].verifiedInside=structuredClone(sections[0].verified);
  const jfact=(status:'Verified'|'Unresolved'|'Conflicted')=>({status,scope:'Synthetic junction fact',note:'Fixture only',sourceIds:['official-physical-source'],claimIds:['physical-ab']});
  const pair={roadA:'Road A',roadB:'Road B',roadIds:['road-a','road-b'] as [string,string],nodeIds:['shared-ab'],sourceIds:['official-physical-source'],claimIds:['physical-ab']};
  const junction:MapJunction={id:'junction-ab',kind:'junction',connectionType:'shared-node',position:[-121.985,37.55],nodeIds:['shared-ab'],sourceWayIds:['way-a','way-b'],entryIds:['a','b'],roadNames:['Road A','Road B'],roads:[{id:'road-a',name:'Road A',sourceWayIds:['way-a'],entryIds:['a']},{id:'road-b',name:'Road B',sourceWayIds:['way-b'],entryIds:['b']}],components:[{nodeId:'shared-ab',position:[-121.985,37.55],sourceWayIds:['way-a','way-b'],roadNames:['Road A','Road B'],roadIds:['road-a','road-b']}],evidence:{location:jfact('Verified'),topology:jfact('Unresolved'),grade:jfact('Unresolved'),maneuvers:jfact('Unresolved')},statusLabel:'Pair-specific independent physical evidence; other group facts unresolved',grouping:'Source group',mappedPairs:[pair],quizPairs:[pair],inZone1:true};
  const other=structuredClone(junction);other.id='junction-c-outside';other.entryIds=['c','outside'];other.roads=[{id:'road-c',name:'Road C',sourceWayIds:['way-c'],entryIds:['c']},{id:'road-outside',name:'Road OUTSIDE',sourceWayIds:['way-outside'],entryIds:['outside']}];other.quizPairs=[];
  return {schema:1,version:'fixture-v1',sourceHashes:{},metadata:{boundaryVersion:'fixture-boundary',evidenceVersion:'fixture-evidence',generatedBy:'test',sourceDate:'2026-10-24',attribution:'Synthetic test fixture',limitations:[]},zone1EntryIds:['a','b','c'],zones:{metadata:{} as never,zones:[{id:'zone1',name:'Synthetic study boundary',status:'partial',geometry:{type:'Polygon',coordinates:[[[-122,37.5],[-121.9,37.5],[-121.9,37.575],[-122,37.575],[-122,37.5]]]}}]},headquarters:{name:'Fixture',address:'Fixture',position:[-121.985,37.55],sourceUrl:'https://example.org/fixture',note:'Test only'},roads:{type:'FeatureCollection',features:sections.map(section=>({type:'Feature',geometry:section.geometry,properties:{wayId:section.sourceWayIds[0],roadId:`road-${section.entryId}`,name:section.name,ref:'',highway:'secondary',entryIds:[section.entryId],bridge:'',tunnel:'',layer:'0',access:'',oneway:''}}))},labels:{type:'FeatureCollection',features:[]},entries,sections,junctions:[junction,other]};
}
class MemoryStorage {
  values=new Map<string,string>();writes:string[]=[];
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.writes.push(key);this.values.set(key,value);}
}

test('map quizzes use the explicit curriculum and corroborated section instead of the whole partial road',()=>{
  const data=fixture();
  assert.equal(createQuiz(data,{kind:'identify',mode:'zone1',entryId:'outside'}),null);
  assert.ok(createQuiz(data,{kind:'identify',mode:'all',entryId:'outside'}));
  const task=createQuiz(data,{kind:'identify',mode:'zone1',entryId:'a',random:()=>0})!;
  assert.deepEqual(task.highlight.coordinates,data.sections[0].verifiedInside.coordinates);
  assert.notDeepEqual(task.highlight.coordinates,[data.sections[0].geometry.coordinates]);
  assert.ok(task.choices.every(choice=>data.zone1EntryIds.includes(choice.id)));
  assert.equal(answerQuiz(task,'a',data).outcome,'correct');
  assert.equal(answerQuiz(task,'b',data).outcome,'incorrect');
  assert.equal(answerQuiz(task,'invented-road',data).scored,false);
});

test('conflicted identity or geometry and empty verified sections never generate scored recognition',()=>{
  const data=fixture();
  data.entries[0].evidence.identity=fact('Unresolved');assert.equal(eligibleQuizSections(data,'a','all').length,0);
  data.entries[0].evidence.identity=fact();data.entries[0].evidence.geometry=fact('Conflicted');assert.equal(createQuiz(data,{kind:'find',mode:'all',entryId:'a'}),null);
  data.entries[0].evidence.geometry=fact('Unresolved');data.sections[0].verifiedInside.coordinates=[];
  assert.equal(createQuiz(data,{kind:'find',mode:'zone1',entryId:'a'}),null);
  assert.ok(createQuiz(data,{kind:'find',mode:'all',entryId:'a'}));
});

test('find-road answers require an actual source-way hit on corroborated geometry',()=>{
  const data=fixture(),task=createQuiz(data,{kind:'find',mode:'zone1',entryId:'a'})!;
  assert.deepEqual(task.highlight.coordinates,[],'Find questions do not highlight the answer');
  assert.equal(answerMapQuiz(task,{wayId:'way-a',position:[-121.988,37.55]},data).outcome,'correct');
  assert.equal(answerMapQuiz(task,{wayId:'way-b',position:[-121.988,37.56]},data).outcome,'incorrect');
  assert.equal(answerMapQuiz(task,{wayId:'way-a',position:[-121.981,37.55]},data).outcome,'unscored','Unverified portion of the right road is not a failure');
  assert.equal(answerMapQuiz(task,{wayId:'way-a',position:[-121.9849,37.55]},data).outcome,'unscored','An unverified continuation about9m beyond a corroborated endpoint cannot earn recognition credit');
  assert.equal(answerMapQuiz(task,{wayId:'way-a',position:[-121.985,37.55]},data).outcome,'correct','The actual corroborated endpoint remains eligible');
  assert.equal(answerMapQuiz(task,{wayId:'way-a',position:[-121.988,37.5501]},data).outcome,'unscored','Raw pointer proximity must be snapped to the actual selected source geometry before scoring');
  assert.equal(answerMapQuiz(task,{wayId:'way-b',position:[-121.988,37.55]},data).outcome,'unscored','A nearby or crossing line cannot substitute for the actual selected source way');
  assert.equal(answerMapQuiz(task,{wayId:'missing',position:[-121.988,37.55]},data).scored,false);
  assert.equal(answerQuiz(task,'a',data).scored,false,'Find must use a map hit rather than a typed entry ID');
});

test('mapping changes withdraw questions without treating them as failed attempts',()=>{
  const data=fixture(),task=createQuiz(data,{kind:'identify',mode:'zone1',entryId:'a'})!;
  data.version='fixture-v2';assert.equal(answerQuiz(task,'a',data).outcome,'withdrawn');
  data.version=task.geoVersion;data.sections[0].verifiedInside.coordinates=[];
  assert.equal(answerQuiz(task,'a',data).outcome,'withdrawn');
});

test('intersection questions use exact independently supported physical pairs without claiming legal maneuvers',()=>{
  const data=fixture(),junction=data.junctions[0];
  assert.equal(junction.evidence.maneuvers.status,'Unresolved');
  assert.equal(eligibleIntersectionPair(junction,junction.quizPairs[0]),true,'Pair proof is scoped more narrowly than the unresolved logical-junction aggregate');
  const task=createQuiz(data,{kind:'intersection',mode:'zone1',entryId:'a'})!;
  assert.equal(task.answerLabel,'Road B');assert.equal(task.contextRoadId,'road-a');assert.equal(task.junctionId,junction.id);
  assert.equal(answerQuiz(task,task.answerId,data).outcome,'correct');
  assert.ok(!task.prompt.includes('turn'));
  const otherValidRoad={id:'road-third',name:'Road THIRD',sourceWayIds:['way-third'],entryIds:[]};junction.roads.push(otherValidRoad);
  data.junctions[1].roads.push(otherValidRoad);
  const next=createQuiz(data,{kind:'intersection',mode:'zone1',entryId:'a'})!;
  assert.ok(!next.choices.some(choice=>choice.id==='road-third'),'Other roads at the same junction are not used as misleading wrong choices');
});

test('City location alone, grade-separated crossings, conflict and fictitious shared nodes are excluded from intersection scoring',()=>{
  for(const change of [
    (j:MapJunction)=>{j.quizPairs=[];},
    (j:MapJunction)=>{j.kind='nonconnecting-crossing';j.connectionType='nonconnecting-crossing';},
    (j:MapJunction)=>{j.evidence.grade.status='Conflicted';},
    (j:MapJunction)=>{j.components[0].roadIds=['road-a'];},
    (j:MapJunction)=>{j.quizPairs[0].sourceIds=[];},
    (j:MapJunction)=>{j.components[0].position=[-121.985,37.6];},
  ]){const data=fixture();change(data.junctions[0]);assert.equal(createQuiz(data,{kind:'intersection',mode:'zone1',entryId:'a'}),null);}
});

test('intersection quiz markers and revalidation use the exact eligible pair node, not the logical-group position',()=>{
  const data=fixture(),junction=data.junctions[0];
  junction.position=[-121.985,37.6];
  const task=createQuiz(data,{kind:'intersection',mode:'zone1',entryId:'a'})!;
  assert.ok(task);assert.equal(task.nodeId,'shared-ab');assert.deepEqual(task.position,junction.components[0].position);
  assert.notDeepEqual(task.position,junction.position);
  assert.equal(answerQuiz(task,task.answerId,data).outcome,'correct');
  assert.equal(answerQuiz({...task,position:[...junction.position]},task.answerId,data).outcome,'withdrawn','An unrelated group representative cannot silently replace the question location');
  junction.components[0].position=[-121.985,37.6];
  assert.equal(answerQuiz(task,task.answerId,data).outcome,'withdrawn');
  assert.equal(createQuiz(data,{kind:'intersection',mode:'zone1',entryId:'a'}),null,'Logical inZone1=true does not qualify an out-of-zone physical pair');
  assert.ok(createQuiz(data,{kind:'intersection',mode:'all',entryId:'a'}),'The physical relationship remains available in All Assigned Streets');
});

test('one quiz visibility policy hides every answer-revealing surface until answer or an explicit recorded hint',()=>{
  const task=createQuiz(fixture(),{kind:'identify',mode:'zone1',entryId:'a'})!;
  const hidden=quizVisibility(task);
  assert.ok(Object.entries(hidden).filter(([key])=>key.startsWith('hide')).every(([,value])=>value===true));
  assert.equal(hidden.assisted,false);
  for(const policy of [quizVisibility(null),quizVisibility(task,true),quizVisibility(task,false,true)])assert.ok(Object.entries(policy).filter(([key])=>key.startsWith('hide')).every(([,value])=>value===false));
  assert.equal(quizVisibility(task,false,true).assisted,true);
});

test('minimal history preserves old driving data and distinguishes studied from unaided identification',()=>{
  const data=fixture(),storage=new MemoryStorage();storage.values.set('fremont-streets-personal-study-v1','old-driving-data');
  const history=new MapStudyHistory(storage,data);assert.equal(history.study('a'),true);
  assert.deepEqual(history.summary().studiedIds,['a']);assert.deepEqual(history.summary().identifiedIds,[]);
  const task=createQuiz(data,{kind:'identify',mode:'zone1',entryId:'a'})!;
  const result=answerQuiz(task,'a',data);assert.equal(history.record(task,result,true),true);
  assert.deepEqual(history.summary().identifiedIds,[],'Hinted answers are retained without unaided credit');
  assert.equal(history.record(task,result),false,'Repeated clicks cannot duplicate an attempt');
  const unaided=createQuiz(data,{kind:'identify',mode:'zone1',entryId:'a'})!;history.record(unaided,answerQuiz(unaided,'a',data));
  assert.deepEqual(history.summary().identifiedIds,['a']);assert.equal(history.summary().attempts,2);
  assert.equal(storage.values.get('fremont-streets-personal-study-v1'),'old-driving-data');
  assert.ok(storage.writes.every(key=>key===MAP_STUDY_HISTORY_KEY));
  assert.deepEqual(new MapStudyHistory(storage,data).summary(),history.summary());
});

test('history keeps geographic versions separate and merges backups without deleting or double-counting records',()=>{
  const data=fixture(),storage=new MemoryStorage(),history=new MapStudyHistory(storage,data);
  history.study('a','2026-10-23T10:00:00Z');const backup=history.exportJSON();history.study('b','2026-10-24T10:00:00Z');
  assert.equal(history.importJSON(backup).ok,true);assert.equal(history.state.visits.length,2);assert.equal(history.summary().lastStudiedId,'b');
  assert.equal(history.importJSON(backup).ok,true);assert.equal(history.state.visits.length,2);
  const changed=fixture();changed.version='fixture-v2';const later=new MapStudyHistory(storage,changed);
  assert.equal(later.state.visits.length,2);assert.deepEqual(later.summary().studiedIds,[]);
  const before=later.exportJSON();assert.equal(later.importJSON('{"schema":2}').ok,false);assert.equal(later.exportJSON(),before);
  const invalid=JSON.parse(backup);invalid.visits[0].entryId='invented-entry';assert.equal(later.importJSON(JSON.stringify(invalid)).ok,false);
});

test('storage denial and malformed saved data leave study usable with explicit warnings and exportable session history',()=>{
  const data=fixture(),warnings:string[]=[];
  const denied=new MapStudyHistory(()=>{throw new Error('SecurityError');},data,message=>warnings.push(message));
  assert.equal(denied.study('a'),false);assert.deepEqual(denied.summary().studiedIds,['a']);assert.ok(warnings[0].includes('session-only'));assert.equal(JSON.parse(denied.exportJSON()).visits[0].entryId,'a');
  const storage=new MemoryStorage();storage.values.set(MAP_STUDY_HISTORY_KEY,'{"schema":99}');
  const malformed=new MapStudyHistory(storage,data);malformed.study('b');
  assert.equal(storage.values.get(MAP_STUDY_HISTORY_KEY),'{"schema":99}','Unknown stored schema is not silently overwritten');
  assert.ok(malformed.warning.includes('preserved'));
  const quota=new MapStudyHistory({getItem:()=>null,setItem:()=>{throw new Error('QuotaExceeded');}},data);
  assert.equal(quota.study('a'),false);assert.ok(quota.warning.includes('could not be saved'));assert.deepEqual(quota.summary().studiedIds,['a']);
});

test('stale tabs merge newer saved visits and attempts instead of overwriting them',()=>{
  const data=fixture(),storage=new MemoryStorage();
  const first=new MapStudyHistory(storage,data),second=new MapStudyHistory(storage,data);
  first.study('a');second.study('b');
  const task=createQuiz(data,{kind:'identify',mode:'zone1',entryId:'a'})!;
  first.record(task,answerQuiz(task,'a',data));second.study('c');
  const reloaded=new MapStudyHistory(storage,data);
  assert.deepEqual(new Set(reloaded.summary().studiedIds),new Set(['a','b','c']));
  assert.deepEqual(reloaded.summary().identifiedIds,['a']);assert.equal(reloaded.state.visits.length,3);
  // A backup merge is also a save and must preserve newer events in storage.
  const backup=second.exportJSON();first.study('outside');second.importJSON(backup);
  assert.equal(new MapStudyHistory(storage,data).state.visits.length,4);
  assert.equal(new MapStudyHistory(storage,data).state.attempts.length,1);
});

test('a changed incompatible backing record or read failure is preserved without losing exportable session work',()=>{
  const data=fixture();
  for(const backing of ['{"schema":99}','{invalid json']){
    const storage=new MemoryStorage(),history=new MapStudyHistory(storage,data);history.study('a');
    storage.values.set(MAP_STUDY_HISTORY_KEY,backing);
    assert.equal(history.study('b'),false);assert.equal(storage.values.get(MAP_STUDY_HISTORY_KEY),backing);
    assert.ok(history.warning.includes('preserved'));assert.equal(JSON.parse(history.exportJSON()).visits.length,2);
  }
  let denied=false;const storage=new MemoryStorage();
  const history=new MapStudyHistory({getItem:key=>{if(denied)throw new Error('Storage read denied');return storage.getItem(key);},setItem:(key,value)=>storage.setItem(key,value)},data);
  history.study('a');const before=storage.getItem(MAP_STUDY_HISTORY_KEY);denied=true;
  assert.equal(history.study('b'),false);assert.equal(storage.getItem(MAP_STUDY_HISTORY_KEY),before);
  assert.equal(JSON.parse(history.exportJSON()).visits.length,2);assert.ok(history.warning.includes('could not be saved'));
});

test('the supported 50,000-record history exports and reimports under one shared byte limit without pruning',()=>{
  const data=fixture(),storage=new MemoryStorage(),history=new MapStudyHistory(storage,data);
  const stale=new MapStudyHistory(storage,data);
  const attempts=Array.from({length:50_000},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,entryId:'a',geoVersion:data.version,at:'2026-10-24T00:00:00.000Z',kind:'intersection',outcome:'incorrect',assisted:false}));
  assert.equal(history.importJSON(JSON.stringify({schema:1,visits:[],attempts})).ok,true);
  const exported=history.exportJSON(),bytes=Buffer.byteLength(exported);
  assert.ok(bytes>8_000_000,'A valid export exceeds the former UI-only 8 MB limit');
  assert.ok(bytes<=MAP_STUDY_MAX_BACKUP_BYTES);
  const restored=new MapStudyHistory(new MemoryStorage(),data);
  assert.equal(restored.importJSON(exported).ok,true);assert.equal(restored.state.attempts.length,50_000);
  assert.equal(restored.exportJSON(),exported);
  const saved=storage.getItem(MAP_STUDY_HISTORY_KEY);
  assert.equal(stale.study('b'),false,'Merging a full backing record cannot silently prune either history');
  assert.equal(storage.getItem(MAP_STUDY_HISTORY_KEY),saved);assert.equal(stale.state.visits.length,1);
  assert.ok(stale.warning.includes('Existing saved records were preserved'));
});

test('backup schema bounds cover escaped strings and strip unrelated object fields without prototype pollution',()=>{
  const data=fixture();data.entries[0].id='\u0000'.repeat(200);
  const record={id:'\u0000'.repeat(200),entryId:data.entries[0].id,geoVersion:'\u0000'.repeat(200),at:'2026-10-24'.padEnd(40,' '),kind:'intersection',outcome:'incorrect',assisted:false};
  const history=new MapStudyHistory(null,data),payload=JSON.stringify({schema:1,visits:[],attempts:[record]});
  assert.equal(history.importJSON(payload).ok,true);
  assert.ok(Buffer.byteLength(JSON.stringify(record))*50_000+50_000<=MAP_STUDY_MAX_BACKUP_BYTES,'The shared limit accounts for six-byte JSON escapes in every bounded string');
  const ordinary=fixture(),safe=new MapStudyHistory(null,ordinary);
  const extra=JSON.parse('{"schema":1,"visits":[{"id":"event","entryId":"a","geoVersion":"fixture-v1","at":"2026-10-24","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}],"attempts":[],"__proto__":{"polluted":true}}');
  assert.equal(safe.importJSON(JSON.stringify(extra)).ok,true);
  assert.equal('polluted' in {},false);assert.deepEqual(Object.keys(safe.state.visits[0]),['id','entryId','geoVersion','at']);
  const before=safe.exportJSON();extra.visits[0].id='x'.repeat(201);
  assert.equal(safe.importJSON(JSON.stringify(extra)).ok,false);assert.equal(safe.exportJSON(),before);
});

test('the actual generated map supports all 18 default recognition targets and retains all 38 identities',()=>{
  const data=JSON.parse(readFileSync(new URL('../public/data/map-study.json',import.meta.url),'utf8')) as MapStudyData;
  assert.equal(data.entries.length,38);assert.equal(data.zone1EntryIds.length,18);
  let physicalQuestions=0;
  for(const entry of data.entries){
    const mode=entry.defaultZone1?'zone1':'all';
    const identify=createQuiz(data,{kind:'identify',mode,entryId:entry.id,random:()=>0});
    assert.ok(identify,`No corroborated recognition section for ${entry.label}`);
    assert.equal(answerQuiz(identify,entry.id,data).outcome,'correct');
    assert.ok(identify.highlight.coordinates.every(coordinates=>coordinates.length>=2));
    const find=createQuiz(data,{kind:'find',mode,entryId:entry.id,random:()=>0});assert.ok(find);assert.equal(find.highlight.coordinates.length,0);
    const intersection=createQuiz(data,{kind:'intersection',mode,entryId:entry.id,random:()=>0});
    if(intersection){
      physicalQuestions++;
      assert.equal(answerQuiz(intersection,intersection.answerId,data).outcome,'correct');
      const junction=data.junctions.find(j=>j.id===intersection.junctionId)!;
      assert.equal(junction.kind,'junction');
      assert.ok(junction.quizPairs.some(pair=>pair.roadIds.includes(intersection.answerId)&&eligibleIntersectionPair(junction,pair)));
    }
  }
  assert.ok(physicalQuestions>0,'Independently supported physical-location questions are available without requiring legal-turn certification');
});

test('the real Driscoll/Osgood/Washington boundary-spanning group cannot lend Zone 1 eligibility to its outside corroborated pair',()=>{
  const original=JSON.parse(readFileSync(new URL('../public/data/map-study.json',import.meta.url),'utf8')) as MapStudyData;
  const zone=original.zones.zones.find(value=>value.id==='zone1')!.geometry!;
  const junction=original.junctions.find(value=>value.roadNames.includes('Driscoll Road')&&value.roadNames.includes('Osgood Road')&&value.roadNames.includes('Washington Boulevard'))!;
  assert.ok(junction);assert.equal(junction.inZone1,true);
  assert.ok(junction.components.some(component=>pointInZone(component.position,zone)));
  const pair=junction.quizPairs.find(value=>[value.roadA,value.roadB].includes('Osgood Road')&&[value.roadA,value.roadB].includes('Washington Boulevard'))!;
  assert.ok(pair);assert.ok(pair.nodeIds.every(nodeId=>!pointInZone(junction.components.find(component=>component.nodeId===nodeId)!.position,zone)));
  // Keep every sourced name for distractors while isolating this one real pair.
  const data={...original,junctions:original.junctions.map(value=>({...value,quizPairs:value.id===junction.id?[pair]:[]}))};
  assert.equal(createQuiz(data,{kind:'intersection',mode:'zone1',entryId:'ew15'}),null);
  const all=createQuiz(data,{kind:'intersection',mode:'all',entryId:'ew15',random:()=>0})!;
  assert.ok(all);assert.ok(pair.nodeIds.includes(all.nodeId!));assert.equal(pointInZone(all.position!,zone),false);
  assert.equal(answerQuiz(all,all.answerId,data).outcome,'correct');
  assert.equal(answerQuiz({...all,mode:'zone1'},all.answerId,data).outcome,'withdrawn','Answer validation enforces the same actual-node study scope as generation');
});
