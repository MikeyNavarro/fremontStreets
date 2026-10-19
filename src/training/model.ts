import {intersectionEligible,navigationEligible,recognitionEligible,routeEvidenceEligible,type VerificationRegistry} from './verification';
export type Category='recognition'|'intersection'|'navigation';
export type TaskKind='identify'|'locate'|'location'|'intersection'|'navigate'|'checkpoint'|'direction';
export interface Attempt { id:string;entryId:string;questionId:string;sessionId:string;geoVersion:string;at:string;category:Category;kind:TaskKind;outcome:'correct'|'incorrect'|'withdrawn'|'abandoned';assisted:boolean;hints:number;eligible:boolean }
export interface TrainingTask { id:string;entryId:string;category:Category;kind:TaskKind;edgeId:string;geoVersion:string;junctionId?:string;eligible:boolean;routeEdgeIds?:string[];referenceEntryId?:string;referenceEdgeId?:string }
export interface Exam {id:string;geoVersion:string;sessionId:string;tasks:TrainingTask[];attemptIds:string[];status:'active'|'complete'|'withdrawn';createdAt:string;pending?:{taskId:string;hints:number;vehicle?:import('../core').VehicleState;mission?:import('./missions').LearningMission}}
export interface LearningState {schema:1;attempts:Attempt[];exam:Exam|null;sessionId:string;legacy:Record<string,string>}
export const EMPTY_LEARNING=():LearningState=>({schema:1,attempts:[],exam:null,sessionId:'',legacy:{}});
const DAY=86_400_000;
export function taskEligible(task:TrainingTask,registry:VerificationRegistry):boolean {
 if(task.geoVersion!==registry.version)return false;
 const entry=registry.entries.find(e=>e.id===task.entryId);
 if(task.category==='recognition')return recognitionEligible(entry,task.edgeId)&&(task.kind!=='direction'||recognitionEligible(registry.entries.find(e=>e.id===task.referenceEntryId),task.referenceEdgeId));
 if(task.category==='navigation')return navigationEligible(entry)&&recognitionEligible(entry,task.edgeId)&&task.routeEdgeIds?.at(-1)===task.edgeId&&routeEvidenceEligible(task.routeEdgeIds,registry);
 return recognitionEligible(entry,task.edgeId)&&intersectionEligible(registry.junctions.find(j=>j.id===task.junctionId&&j.entryIds.includes(task.entryId)));
}
export function streetProgress(id:string,state:LearningState,registry:VerificationRegistry,now=Date.now()){
 const history=state.attempts.filter(a=>a.entryId===id);
 const attempts=history.filter(a=>a.geoVersion===registry.version&&a.eligible&&(a.outcome==='correct'||a.outcome==='incorrect')).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id));
 const unaided=attempts.filter(a=>!a.assisted&&a.hints===0),correct=unaided.filter(a=>a.outcome==='correct');
 const recognized=new Set(correct.filter(a=>a.category==='recognition'&&['identify','locate','location'].includes(a.kind)).map(a=>a.questionId)).size>=2;
 const nav=correct.filter(a=>a.category==='navigation'),intersection=correct.some(a=>a.category==='intersection');
 const evidence=registry.entries.find(e=>e.id===id),hasIntersection=registry.junctions.some(j=>j.entryIds.includes(id)&&intersectionEligible(j));
 const blocked=!navigationEligible(evidence)||!hasIntersection;
 const navigable=recognized&&!blocked&&nav.length>=2&&new Set(nav.map(a=>a.sessionId)).size>=2&&intersection;
 let mastered=false;
 if(navigable)for(let n=10;n<=unaided.length;n++){
   const prior=unaided.slice(0,n),success=prior.filter(a=>a.outcome==='correct'),recent=prior.slice(-10);
   if(recent.filter(a=>a.outcome==='correct').length<8)continue;
   if(new Set(success.map(a=>a.sessionId)).size<3||Date.parse(success.at(-1)!.at)-Date.parse(success[0].at)<7*DAY)continue;
   if(success.filter(a=>a.category==='navigation').length<2)continue;
   mastered=true;break;
 }
 const recent=unaided.slice(-10),accuracy=recent.length?recent.filter(a=>a.outcome==='correct').length/recent.length:null;
 // Review confidence can fall while an earned level remains. Overdue time alone never changes it.
 let streak=0;for(const a of unaided){if(a.outcome==='correct')streak++;else streak=0;}
 const interval=[1,3,7,14][Math.min(3,Math.max(0,streak-1))],last=attempts.at(-1);
 const nextReview=last?Date.parse(last.at)+interval*DAY:null;
 return {level:mastered?'Mastered':navigable?'Navigable':recognized?'Recognized':'Unfamiliar',accuracy,nextReview,due:nextReview!==null&&nextReview<=now,intervalDays:interval,blockedHigher:blocked,blockReason:blocked?'Higher levels await independently verified connectivity and maneuvers. This is an evidence gap, not a failed attempt.':null,eligibleAttempts:attempts.length,assisted:history.filter(a=>a.assisted).length,historical:history.filter(a=>a.geoVersion!==registry.version).length,lastPracticed:history.at(-1)?.at??null};
}
export function buildExam(pool:TrainingTask[],registry:VerificationRegistry,sessionId:string,id:string,now=new Date().toISOString()):{exam:Exam|null;missing:Record<Category,number>}{
 const unique=[...new Map(pool.filter(t=>taskEligible(t,registry)).map(t=>[t.id,t])).values()];
 const tasks:TrainingTask[]=[],missing={recognition:0,intersection:0,navigation:0};
 for(const [category,count] of Object.entries({recognition:10,intersection:6,navigation:4}) as [Category,number][]){const selected=unique.filter(t=>t.category===category).slice(0,count);tasks.push(...selected);missing[category]=count-selected.length;}
 return {exam:Object.values(missing).some(Boolean)?null:{id,geoVersion:registry.version,sessionId,tasks,attemptIds:[],status:'active',createdAt:now},missing};
}
export function examScore(exam:Exam,attempts:Attempt[]){
 const records=exam.attemptIds.map(id=>attempts.find(a=>a.id===id)).filter((a):a is Attempt=>!!a);
 const complete=exam.status==='complete'&&records.length===20&&exam.tasks.length===20;
 const category=(name:Category)=>{const eligible=records.filter(a=>a.category===name&&a.eligible&&a.geoVersion===exam.geoVersion);return {count:eligible.length,correct:eligible.filter(a=>a.outcome==='correct'&&!a.assisted).length};};
 const categories={recognition:category('recognition'),intersection:category('intersection'),navigation:category('navigation')};
 const correct=Object.values(categories).reduce((n,c)=>n+c.correct,0),score=complete?correct/20:null;
 return {complete,score,categories,passed:complete&&score!>=.85&&categories.recognition.count===10&&categories.intersection.count===6&&categories.navigation.count===4&&Object.values(categories).every(c=>c.correct/c.count>=.75)};
}
export function addAttempt(state:LearningState,attempt:Attempt):LearningState {
 const existing=state.attempts.find(a=>a.id===attempt.id);if(existing){if(JSON.stringify(existing)!==JSON.stringify(attempt))throw new Error('Conflicting attempt ID; existing history preserved.');return state;}
 return {...state,attempts:[...state.attempts,attempt]};
}
export function validateBackup(value:unknown,ids:Set<string>):LearningState {
 const v=value as any;if(!v||v.schema!==1||v.format!=='fremont-streets-learning'||!Array.isArray(v.attempts)||v.attempts.length>100000)throw new Error('Unsupported progress backup.');
 const seen=new Set<string>();for(const a of v.attempts){if(!a||!ids.has(a.entryId)||typeof a.id!=='string'||!a.id||seen.has(a.id)||typeof a.questionId!=='string'||typeof a.sessionId!=='string'||!a.sessionId||typeof a.geoVersion!=='string'||!Number.isFinite(Date.parse(a.at))||!['recognition','intersection','navigation'].includes(a.category)||!['identify','locate','location','intersection','navigate','checkpoint','direction'].includes(a.kind)||!['correct','incorrect','withdrawn','abandoned'].includes(a.outcome)||typeof a.assisted!=='boolean'||typeof a.eligible!=='boolean'||!Number.isInteger(a.hints)||a.hints<0)throw new Error('Invalid attempt history; nothing imported.');seen.add(a.id);}
 // Exams are validated separately; arbitrary imported routes/tasks never resume automatically.
 return {schema:1,attempts:v.attempts,exam:null,sessionId:'',legacy:v.legacy&&typeof v.legacy==='object'?Object.fromEntries(Object.entries(v.legacy).filter(([k,x])=>k.startsWith('fremont-')&&typeof x==='string')) as Record<string,string>:{}};
}
