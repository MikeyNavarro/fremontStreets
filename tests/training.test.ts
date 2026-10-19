import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EMPTY_LEARNING,streetProgress,buildExam,examScore,validateBackup,addAttempt,type Attempt,type TrainingTask} from '../src/training/model';
import type {VerificationRegistry} from '../src/training/verification';
const actual=JSON.parse(readFileSync(new URL('../public/data/verification.json',import.meta.url),'utf8')) as VerificationRegistry;
// Synthetic evidence only exercises scoring logic; never shipped as real geographic verification.
const fixture=structuredClone(actual);const entry=fixture.entries[0];for(const d of ['identity','geometry','topology','maneuvers'] as const)entry[d].status='Verified';
fixture.junctions[0].entryIds=[entry.id];for(const d of ['identity','geometry','topology','maneuvers'] as const)fixture.junctions[0][d].status='Verified';
const attempt=(n:number,extra:Partial<Attempt>={}):Attempt=>({id:'a'+n,entryId:entry.id,questionId:'q'+n,sessionId:'s'+Math.floor(n/4),geoVersion:fixture.version,at:new Date(Date.UTC(2026,0,1+Math.floor(n/4)*4)+n).toISOString(),category:n<2?'recognition':n===2?'intersection':'navigation',kind:n<2?'identify':n===2?'intersection':'navigate',outcome:'correct',assisted:false,hints:0,eligible:true,...extra});
test('recognized requires two distinct unaided questions; visits and repeated prompts cannot grant it',()=>{
 let state=EMPTY_LEARNING();state.attempts=[attempt(0),attempt(1,{questionId:'q0'})];assert.equal(streetProgress(entry.id,state,fixture).level,'Unfamiliar');
 state.attempts=[attempt(0),attempt(1,{assisted:true})];assert.equal(streetProgress(entry.id,state,fixture).level,'Unfamiliar');state.attempts=[attempt(0),attempt(1)];assert.equal(streetProgress(entry.id,state,fixture).level,'Recognized');
});
test('navigation and retained mastery require distinct sessions, ten attempts and seven days',()=>{
 const state=EMPTY_LEARNING();state.attempts=Array.from({length:10},(_,i)=>attempt(i));assert.equal(streetProgress(entry.id,state,fixture).level,'Mastered');
 const oneDay={...state,attempts:state.attempts.map(a=>({...a,at:'2026-01-01T12:00:00Z'}))};assert.equal(streetProgress(entry.id,oneDay,fixture).level,'Navigable');
 assert.equal(streetProgress(entry.id,{...state,attempts:state.attempts.slice(0,9)},fixture).level,'Navigable');
 const oneSession={...state,attempts:state.attempts.map(a=>({...a,sessionId:'same'}))};assert.equal(streetProgress(entry.id,oneSession,fixture).level,'Recognized');
});
test('unresolved evidence blocks higher levels without converting successes to failures',()=>{
 const state={...EMPTY_LEARNING(),attempts:Array.from({length:10},(_,i)=>attempt(i))};const progress=streetProgress(entry.id,state,actual);assert.equal(progress.level,'Recognized');assert.equal(progress.blockedHigher,true);assert.equal(progress.accuracy,1);
});
test('old geography is historical only and overdue reviews preserve earned mastery',()=>{
 const state={...EMPTY_LEARNING(),attempts:Array.from({length:10},(_,i)=>attempt(i))};const later=streetProgress(entry.id,state,fixture,Date.UTC(2027,0,1));assert.equal(later.level,'Mastered');assert.equal(later.due,true);
 const changed={...fixture,version:'new-geometry'};const historical=streetProgress(entry.id,state,changed);assert.equal(historical.level,'Unfamiliar');assert.equal(historical.historical,10);
 const difficulty={...state,attempts:[...state.attempts,...Array.from({length:10},(_,i)=>attempt(i+10,{outcome:'incorrect'}))]};assert.equal(streetProgress(entry.id,difficulty,fixture).level,'Mastered');assert.equal(streetProgress(entry.id,difficulty,fixture).accuracy,0);assert.equal(streetProgress(entry.id,difficulty,fixture).intervalDays,1);
});
test('actual evidence cannot silently generate the full exam',()=>{
 const pool:TrainingTask[]=actual.entries.flatMap(e=>e.segments.slice(0,2).map(s=>({id:'identify:'+s.edgeId,entryId:e.id,category:'recognition',kind:'identify',edgeId:s.edgeId,geoVersion:actual.version,eligible:true})));const result=buildExam(pool,actual,'session','exam');assert.equal(result.exam,null);assert.equal(result.missing.intersection,6);assert.equal(result.missing.navigation,4);
});
test('exam enforces 20 tasks, 85 percent overall and 75 percent per category',()=>{
 const tasks:TrainingTask[]=Array.from({length:20},(_,i)=>({id:'task'+i,entryId:entry.id,category:i<10?'recognition':i<16?'intersection':'navigation',kind:i<10?'identify':i<16?'intersection':'navigate',edgeId:entry.segments[0].edgeId,junctionId:fixture.junctions[0].id,geoVersion:fixture.version,eligible:true,routeEdgeIds:['fixture-in',entry.segments[0].edgeId]}));
 fixture.movements={['fixture-in>'+entry.segments[0].edgeId]:{status:'Verified',evidence:['synthetic test only'],reason:'Fixture',scope:'Test'}};
 const exam=buildExam(tasks,fixture,'s','exam').exam!;assert.ok(exam);const records=tasks.map((t,i)=>attempt(i,{category:t.category,questionId:t.id,outcome:i===10||i===11?'incorrect':'correct'}));exam.status='complete';exam.attemptIds=records.map(a=>a.id);assert.equal(examScore(exam,records).score,.9);assert.equal(examScore(exam,records).passed,false);
 records[11].outcome='correct';records[19].outcome='incorrect';assert.equal(examScore(exam,records).passed,true);exam.status='active';assert.equal(examScore(exam,records).score,null);
});
test('attempt IDs are idempotent and corrupted or incompatible backups do not replace history',()=>{
 const a=attempt(0),state=addAttempt(EMPTY_LEARNING(),a);assert.equal(addAttempt(state,a).attempts.length,1);assert.throws(()=>addAttempt(state,{...a,outcome:'incorrect'}));
 assert.throws(()=>validateBackup({format:'fremont-streets-learning',schema:1,attempts:[{...a,at:'invalid'}]},new Set([entry.id])));
 assert.throws(()=>validateBackup({format:'fremont-streets-learning',schema:1,attempts:[a,a]},new Set([entry.id])));
});

test('checkpoint arrival requires the same physical source segment and permits either supported direction',async()=>{
 const {buildGraph,createVehicle}=await import('../src/core');const {missionArrived}=await import('../src/training/missions');
 const graph=buildGraph({nodes:{a:[-121.99,37.55],b:[-121.988,37.55],c:[-121.99,37.5501],d:[-121.988,37.5501]},ways:[{id:'road',nodes:['a','b'],name:'test fixture road',highway:'residential'},{id:'bridge',nodes:['c','d'],name:'test fixture bridge',highway:'residential'}]});
 const target=[...graph.edges.values()].find(e=>e.wayId==='road'&&e.id.endsWith(':f'))!,other=[...graph.edges.values()].find(e=>e.wayId==='bridge')!;
 const mission:any={startedDistance:0,checkpoint:{edgeId:target.id,distance:50}};
 const car={...createVehicle(graph,target.id),distance:45,totalDistance:10};assert.equal(missionArrived(mission,car,graph),true);assert.equal(missionArrived(mission,{...car,edgeId:other.id},graph),false);
 const reverse=target.id.replace(':f',':r');assert.equal(missionArrived(mission,{...car,edgeId:reverse,distance:target.length-50},graph),true);
 assert.equal(missionArrived(mission,{...car,distance:90},graph),false);
});

test('settings preserve QUICK and 100 mph defaults and safely clamp stored capability',async()=>{
 const {loadSettings,saveSettings}=await import('../src/training/settings');let data:string|null=null;const storage={getItem:()=>data,setItem:(_key:string,value:string)=>{data=value;}};
 assert.equal(loadSettings(storage).profile,'QUICK');assert.equal(loadSettings(storage).maxSpeed,100);assert.equal(saveSettings(storage,{version:1,profile:'QUICK',maxSpeed:85,assist:true,guidance:false}),true);assert.equal(loadSettings(storage).maxSpeed,85);assert.equal(loadSettings(storage).guidance,false);
 data=JSON.stringify({version:1,maxSpeed:999,profile:'invented'});assert.equal(loadSettings(storage).maxSpeed,100);assert.equal(loadSettings(storage).profile,'QUICK');
});

test('legacy backup migration merges exploration and saved routes without creating mastery evidence',async()=>{
 const {mergeLegacy}=await import('../src/training/legacy');const {createProgress,recordQuiz,savePracticeRoute}=await import('../src/core/learning');
 let a=recordQuiz(createProgress(),'zone1',true),b=recordQuiz(createProgress(),'zone1',false);b=savePracticeRoute(b,'zone1',{id:'saved',name:'Fixture route',edgeIds:['source-edge'],destinationNode:'node',savedAt:'2026-01-01'});
 const merged=JSON.parse(mergeLegacy('fremont-streets-progress-v1',JSON.stringify(a),JSON.stringify(b))!);assert.equal(merged.zones.zone1.quizTotal,1);assert.equal(merged.zones.zone1.savedRoutes.length,1);
 assert.equal(mergeLegacy('unrelated-key','current','incoming'),null);
});

test('direction tasks require both corroborated reference points and cannot substitute for street identification',async()=>{
 const {taskEligible}=await import('../src/training/model');const ref=fixture.entries[1],task:TrainingTask={id:'direction-fixture',entryId:entry.id,edgeId:entry.segments[0].edgeId,category:'recognition',kind:'direction',geoVersion:fixture.version,referenceEntryId:ref.id,referenceEdgeId:ref.segments[0].edgeId,eligible:true};
 assert.equal(taskEligible(task,fixture),true);assert.equal(taskEligible({...task,referenceEdgeId:'missing'},fixture),false);
 const state={...EMPTY_LEARNING(),attempts:[attempt(0,{kind:'direction'}),attempt(1,{kind:'direction'})]};assert.equal(streetProgress(entry.id,state,fixture).level,'Unfamiliar');
});

test('later recognition cannot retroactively turn an earlier navigation-only streak into mastery',()=>{
 const earlier=Array.from({length:10},(_,i)=>attempt(i,{category:i===0?'intersection':'navigation',kind:i===0?'intersection':'navigate'}));
 const errors=Array.from({length:10},(_,i)=>attempt(i+10,{category:'recognition',kind:'identify',outcome:'incorrect'}));
 const lateRecognition=[attempt(20,{category:'recognition',kind:'identify'}),attempt(21,{category:'recognition',kind:'locate'})];
 const state={...EMPTY_LEARNING(),attempts:[...earlier,...errors,...lateRecognition]};assert.equal(streetProgress(entry.id,state,fixture).level,'Navigable');assert.equal(streetProgress(entry.id,state,fixture).accuracy,.2);
});
