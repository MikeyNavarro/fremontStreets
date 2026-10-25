import type {MultiLineString} from 'geojson';
import type {LonLat} from '../core/types';
import {project} from '../core/projection';
import type {MapJunction, MapJunctionComponent, MapJunctionPair} from './junctions';
import type {MapRoadSection, MapScope, MapStudyData, MapStudyEntry} from './types';
import {assignedPairComponents,studyEntries} from './data';

export type QuizKind = 'identify'|'find'|'intersection';
export interface QuizChoice {id:string;label:string}
export interface QuizQuestion {
  instanceId:string; geoVersion:string; kind:QuizKind; mode:MapScope;
  entryId:string; prompt:string; answerId:string; answerLabel:string;
  choices:QuizChoice[]; sectionIds:string[];
  /** A corroborated section only. Find questions intentionally have no highlight. */
  highlight:MultiLineString;
  position?:LonLat; junctionId?:string; contextRoadId?:string; nodeId?:string;
}
export interface QuizResult {
  outcome:'correct'|'incorrect'|'unscored'|'withdrawn';
  scored:boolean; message:string;
}
export interface QuizOptions {kind:QuizKind;mode:MapScope;entryId?:string;random?:()=>number}
const emptyGeometry=():MultiLineString=>({type:'MultiLineString',coordinates:[]});
const randomId=()=>globalThis.crypto.randomUUID();
function pick<T>(values:readonly T[],random:()=>number):T|undefined {
  const value=random();
  return values[Math.min(values.length-1,Math.max(0,Math.floor((Number.isFinite(value)?value:0)*values.length)))];
}
function shuffle<T>(values:readonly T[],random:()=>number):T[]{
  const copy=[...values];
  for(let i=copy.length-1;i>0;i--){const value=random();const j=Math.min(i,Math.max(0,Math.floor((Number.isFinite(value)?value:0)*(i+1))));[copy[i],copy[j]]=[copy[j],copy[i]];}
  return copy;
}
const validLine=(line:number[][])=>line.length>=2&&line.every(point=>point.length===2&&point.every(Number.isFinite));
const lines=(section:MapRoadSection,mode:MapScope)=>
  (mode==='zone1'?section.verifiedInside:section.verified).coordinates.filter(validLine);

export function eligibleQuizSections(data:MapStudyData,entryId:string,mode:MapScope):MapRoadSection[]{
  const entry=data.entries.find(value=>value.id===entryId);
  if(!entry||entry.evidence.identity.status!=='Verified'||entry.evidence.geometry.status==='Conflicted'
    ||mode==='zone1'&&!data.zone1EntryIds.includes(entryId))return [];
  const ids=new Set(entry.recognitionSectionIds);
  return data.sections.filter(section=>section.entryId===entryId&&ids.has(section.id)&&lines(section,mode).length>0);
}

/** quizPairs carry independent physical-pair claims, not merely City point matches.
 * Check that the exact pair still shares a genuine source node. No permission to
 * make a driving maneuver is implied or required by a physical-location quiz. */
export function eligibleIntersectionPair(junction:MapJunction,pair:MapJunctionPair):boolean {
  if(junction.kind!=='junction'||junction.connectionType!=='shared-node'
    ||[junction.evidence.location,junction.evidence.topology,junction.evidence.grade].some(fact=>fact.status==='Conflicted')
    ||!pair.sourceIds.length||!pair.claimIds.length||!pair.nodeIds.length
    ||pair.roadIds[0]===pair.roadIds[1]
    ||!pair.roadIds.every(id=>junction.roads.some(road=>road.id===id&&road.name&&road.sourceWayIds.length)))return false;
  const hasPair=(candidate:MapJunctionPair)=>pair.roadIds.every(id=>candidate.roadIds.includes(id));
  if(!junction.mappedPairs.some(hasPair)||!junction.quizPairs.some(candidate=>hasPair(candidate)&&candidate.claimIds.some(id=>pair.claimIds.includes(id))))return false;
  return pair.nodeIds.some(nodeId=>junction.components.some(component=>component.nodeId===nodeId
    &&pair.roadIds.every(id=>component.roadIds.includes(id))));
}

function usableEntries(data:MapStudyData,mode:MapScope):MapStudyEntry[]{
  return data.entries.filter(entry=>eligibleQuizSections(data,entry.id,mode).length>0);
}
/** Logical junctions may span the boundary or contain unrelated components.
 * A quiz is scoped to an independently supported pair's actual shared node. */
function scopedPairComponents(data:MapStudyData,junction:MapJunction,pair:MapJunctionPair,mode:MapScope):MapJunctionComponent[]{
  if(!eligibleIntersectionPair(junction,pair))return [];
  return assignedPairComponents(data,junction,pair,mode);
}
export function createQuiz(data:MapStudyData,options:QuizOptions):QuizQuestion|null {
  const random=options.random??Math.random;
  const entries=usableEntries(data,options.mode);
  const targets=entries.filter(entry=>!options.entryId||entry.id===options.entryId);
  if(!targets.length)return null;
  if(options.kind==='intersection'){
    const candidates:Array<{entry:MapStudyEntry;junction:MapJunction;pair:MapJunctionPair;contextId:string;answerId:string;components:MapJunctionComponent[]}>=[];
    for(const entry of targets)for(const junction of data.junctions){
      for(const pair of junction.quizPairs){
        const components=scopedPairComponents(data,junction,pair,options.mode);if(!components.length)continue;
        const contextId=pair.roadIds.find(id=>junction.roads.find(road=>road.id===id)?.entryIds.includes(entry.id));
        const answerId=pair.roadIds.find(id=>id!==contextId);
        if(contextId&&answerId)candidates.push({entry,junction,pair,contextId,answerId,components});
      }
    }
    const chosen=pick(candidates,random);if(!chosen)return null;
    const {entry,junction,contextId,answerId}=chosen;
    const context=junction.roads.find(road=>road.id===contextId)!;
    const answer=junction.roads.find(road=>road.id===answerId)!;
    const component=pick(chosen.components,random)!;
    const optionsByName=new Map<string,QuizChoice>();
    const localNames=new Set(junction.roads.map(road=>road.name.toLowerCase()));
    const active=new Set(studyEntries(data,options.mode).map(value=>value.id));
    for(const other of data.junctions)for(const road of other.roads){
      if(road.name&&road.entryIds.some(id=>active.has(id))&&!localNames.has(road.name.toLowerCase()))optionsByName.set(road.name.toLowerCase(),{id:road.id,label:road.name});
    }
    const distractors=shuffle([...optionsByName.values()],random).slice(0,3);
    if(!distractors.length)return null;
    return {instanceId:randomId(),geoVersion:data.version,kind:'intersection',mode:options.mode,entryId:entry.id,
      prompt:`Which road meets ${context.name} at this marked, independently corroborated physical junction?`,
      answerId,answerLabel:answer.name,choices:shuffle([{id:answerId,label:answer.name},...distractors],random),
      sectionIds:[],highlight:emptyGeometry(),position:[...component.position],nodeId:component.nodeId,junctionId:junction.id,contextRoadId:contextId};
  }
  const entry=pick(targets,random)!;
  const sections=eligibleQuizSections(data,entry.id,options.mode);
  const section=pick(sections,random)!;
  const line=pick(lines(section,options.mode),random)!;
  const alternatives=shuffle(entries.filter(other=>other.id!==entry.id),random).slice(0,3);
  if(options.kind==='identify'&&!alternatives.length)return null;
  return {instanceId:randomId(),geoVersion:data.version,kind:options.kind,mode:options.mode,entryId:entry.id,
    prompt:options.kind==='find'?`Find ${entry.label} on the map. Click a corroborated section of the road.`:'Which assigned road contains this highlighted, corroborated section?',
    answerId:entry.id,answerLabel:entry.label,
    choices:options.kind==='find'?[]:shuffle([entry,...alternatives].map(value=>({id:value.id,label:value.label})),random),
    sectionIds:options.kind==='find'?sections.map(value=>value.id):[section.id],
    highlight:options.kind==='find'?emptyGeometry():{type:'MultiLineString',coordinates:[line.map(point=>[...point])]},
  };
}

function questionCurrent(question:QuizQuestion,data:MapStudyData):boolean {
  if(question.geoVersion!==data.version)return false;
  if(question.kind==='intersection'){
    const junction=data.junctions.find(value=>value.id===question.junctionId);
    return !!junction&&eligibleQuizSections(data,question.entryId,question.mode).length>0
      &&!!junction.roads.find(road=>road.id===question.contextRoadId)?.entryIds.includes(question.entryId)
      &&junction.quizPairs.some(pair=>pair.roadIds.includes(question.contextRoadId??'')&&pair.roadIds.includes(question.answerId)
        &&scopedPairComponents(data,junction,pair,question.mode).some(component=>component.nodeId===question.nodeId
          &&question.position?.[0]===component.position[0]&&question.position?.[1]===component.position[1]));
  }
  const eligible=new Set(eligibleQuizSections(data,question.entryId,question.mode).map(section=>section.id));
  return question.sectionIds.length>0&&question.sectionIds.every(id=>eligible.has(id));
}
const withdrawn=():QuizResult=>({outcome:'withdrawn',scored:false,message:'This question no longer matches the current geographic evidence. No result was scored.'});
export function answerQuiz(question:QuizQuestion,answerId:string,data:MapStudyData):QuizResult {
  if(!questionCurrent(question,data))return withdrawn();
  if(question.kind==='find')return {outcome:'unscored',scored:false,message:'Choose an actual road on the map for this question.'};
  if(!question.choices.some(choice=>choice.id===answerId))return {outcome:'unscored',scored:false,message:'Choose one of the displayed answers. No result was scored.'};
  const correct=answerId===question.answerId;
  return {outcome:correct?'correct':'incorrect',scored:true,message:correct?`Correct — ${question.answerLabel}.`:`The answer is ${question.answerLabel}. Review its mapped location, then try another question.`};
}
function distanceToLines(position:LonLat,coordinates:number[][][]):number {
  const point=project(position);let closest=Infinity;
  for(const line of coordinates)for(let i=1;i<line.length;i++){
    const a=project(line[i-1] as LonLat),b=project(line[i] as LonLat);
    const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)):0;
    closest=Math.min(closest,Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy));
  }
  return closest;
}
/** Hit testing supplies an explicit source way and a point snapped onto its
 * original geometry. Half a metre tolerates coordinate arithmetic, not nearby
 * unverified road extents. A visual crossing cannot satisfy the question. */
export function answerMapQuiz(question:QuizQuestion,click:{wayId:string;position:LonLat},data:MapStudyData):QuizResult {
  if(!questionCurrent(question,data))return withdrawn();
  if(question.kind!=='find'||!click.wayId||click.position.length!==2||!click.position.every(Number.isFinite))return {outcome:'unscored',scored:false,message:'Select a mapped road section. No result was scored.'};
  const road=data.roads.features.find(feature=>feature.properties.wayId===click.wayId);
  if(!road||distanceToLines(click.position,[road.geometry.coordinates])>.5)return {outcome:'unscored',scored:false,message:'No matching source-road hit was found. No result was scored.'};
  const matched=usableEntries(data,question.mode).filter(entry=>road.properties.entryIds.includes(entry.id)
    &&eligibleQuizSections(data,entry.id,question.mode).some(section=>section.sourceWayIds.includes(click.wayId)&&distanceToLines(click.position,lines(section,question.mode))<=.5));
  if(!matched.length)return {outcome:'unscored',scored:false,message:'That section lacks the corroborated geometry needed for scoring. Choose another section; no result was scored.'};
  if(matched.length>1)return {outcome:'unscored',scored:false,message:'That source section belongs to several study entries. Choose a distinct section; no result was scored.'};
  const correct=matched[0].id===question.entryId;
  return {outcome:correct?'correct':'incorrect',scored:true,message:correct?`Correct — ${question.answerLabel}.`:`You selected ${matched[0].label}. The target was ${question.answerLabel}.`};
}

/** One policy for canvas labels, search, details, list, tooltips and ARIA text. */
export function quizVisibility(question:QuizQuestion|null,finished=false,hinted=false){
  const hidden=!!question&&!finished&&!hinted;
  return {hideLabels:hidden,hideSearch:hidden,hideStudyList:hidden,hideRoadDetails:hidden,
    hideIntersectionDetails:hidden,hideComparison:hidden,hideNameAnnouncements:hidden,assisted:!!question&&hinted};
}

export const MAP_STUDY_HISTORY_KEY='fremont-streets-map-study-history-v1';
interface StudyVisit {id:string;entryId:string;geoVersion:string;at:string}
interface MapAttempt extends StudyVisit {kind:QuizKind;outcome:'correct'|'incorrect';assisted:boolean}
export interface MapHistoryData {schema:1;visits:StudyVisit[];attempts:MapAttempt[]}
export interface MapHistorySummary {studiedIds:string[];identifiedIds:string[];intersectionQuestions:number;correctIntersectionQuestions:number;lastStudiedId:string|null;attempts:number}
type SmallStorage=Pick<Storage,'getItem'|'setItem'>;
const emptyHistory=():MapHistoryData=>({schema:1,visits:[],attempts:[]});
const MAX_RECORDS=50_000;
const MAX_TEXT_LENGTH=200;
const MAX_TIMESTAMP_LENGTH=40;
// Six UTF-8 bytes per UTF-16 unit covers JSON's longest escape (\\u0000),
// including malformed surrogate pairs. Count the longest schema field values,
// three bounded identity strings, the timestamp, commas, and outer envelope.
// This is a ceiling for any supported compact export, not a suggested file size.
const MAX_RECORD_BYTES=JSON.stringify({id:'',entryId:'',geoVersion:'',at:'',kind:'intersection',outcome:'incorrect',assisted:false}).length
  +6*(3*MAX_TEXT_LENGTH+MAX_TIMESTAMP_LENGTH);
export const MAP_STUDY_MAX_BACKUP_BYTES=JSON.stringify(emptyHistory()).length+MAX_RECORDS*(MAX_RECORD_BYTES+1);
function validText(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.length<=MAX_TEXT_LENGTH;}
function validTimestamp(value:unknown):value is string{return typeof value==='string'&&value.length<=MAX_TIMESTAMP_LENGTH&&Number.isFinite(Date.parse(value));}
function withinBackupSize(text:string):boolean{return text.length<=MAP_STUDY_MAX_BACKUP_BYTES&&new TextEncoder().encode(text).byteLength<=MAP_STUDY_MAX_BACKUP_BYTES;}
function validateHistory(value:unknown,known:Set<string>):MapHistoryData|null {
  if(!value||typeof value!=='object')return null;
  const raw=value as Partial<MapHistoryData>;
  if(raw.schema!==1||!Array.isArray(raw.visits)||!Array.isArray(raw.attempts)||raw.visits.length+raw.attempts.length>MAX_RECORDS)return null;
  const visit=(record:StudyVisit)=>!!record&&validText(record.id)&&validText(record.entryId)&&known.has(record.entryId)&&validText(record.geoVersion)
    &&validTimestamp(record.at);
  if(!raw.visits.every(visit)||!raw.attempts.every(record=>visit(record)&&['identify','find','intersection'].includes(record.kind)
    &&['correct','incorrect'].includes(record.outcome)&&typeof record.assisted==='boolean'))return null;
  const visits=raw.visits.map(({id,entryId,geoVersion,at})=>({id,entryId,geoVersion,at}));
  const attempts=raw.attempts.map(({id,entryId,geoVersion,at,kind,outcome,assisted})=>({id,entryId,geoVersion,at,kind,outcome,assisted}));
  if(new Set(visits.map(record=>record.id)).size!==visits.length||new Set(attempts.map(record=>record.id)).size!==attempts.length)return null;
  return {schema:1,visits,attempts};
}
function mergeHistory(saved:MapHistoryData,current:MapHistoryData):MapHistoryData|null {
  const visits=new Map(saved.visits.map(visit=>[visit.id,visit]));
  const attempts=new Map(saved.attempts.map(attempt=>[attempt.id,attempt]));
  for(const visit of current.visits)visits.set(visit.id,visit);
  for(const attempt of current.attempts)attempts.set(attempt.id,attempt);
  return visits.size+attempts.size<=MAX_RECORDS?{schema:1,visits:[...visits.values()],attempts:[...attempts.values()]}:null;
}

/** Separate, minimal history. Existing driving keys and IndexedDB are untouched.
 * Import merges events rather than replacing or resetting the current history. */
export class MapStudyHistory {
  state:MapHistoryData=emptyHistory();
  warning='';
  private storage:SmallStorage|null=null;
  private writesAllowed=true;
  private readonly known:Set<string>;
  constructor(storage:SmallStorage|(()=>SmallStorage)|null,private readonly data:MapStudyData,private readonly onWarning:(message:string)=>void=()=>{}){
    this.known=new Set(data.entries.map(entry=>entry.id));
    try {
      this.storage=typeof storage==='function'?storage():storage;
      if(!this.storage)throw new Error('Storage is unavailable');
      const text=this.storage.getItem(MAP_STUDY_HISTORY_KEY);
      if(text){const parsed=withinBackupSize(text)?validateHistory(JSON.parse(text),this.known):null;if(!parsed){this.writesAllowed=false;this.warn('Saved map-study history has an unsupported or invalid format. It was preserved; current study is session-only.');}else this.state=parsed;}
    }catch{this.writesAllowed=false;this.warn('Study history could not be loaded. Current study is session-only; export a backup before leaving.');}
  }
  private warn(message:string){this.warning=message;this.onWarning(message);}
  private save(){
    if(!this.storage||!this.writesAllowed)return false;
    try{
      // Another tab may have saved since this instance was opened. Merge its
      // immutable events before writing instead of replacing its newer history.
      const text=this.storage.getItem(MAP_STUDY_HISTORY_KEY);
      if(text){
        let saved:MapHistoryData|null=null;
        try{if(withinBackupSize(text))saved=validateHistory(JSON.parse(text),this.known);}catch{/* Preserve incompatible backing data. */}
        if(!saved){this.writesAllowed=false;this.warn('Saved map-study history changed to an unsupported or invalid format. It was preserved; current study is session-only. Export a backup before leaving.');return false;}
        const merged=mergeHistory(saved,this.state);
        if(!merged){this.warn('Combined study history exceeds the supported size. Existing saved records were preserved; export your current session before leaving.');return false;}
        this.state=merged;
      }
      this.storage.setItem(MAP_STUDY_HISTORY_KEY,JSON.stringify(this.state));if(this.warning)this.onWarning('');this.warning='';return true;
    }
    catch{this.warn('Study history could not be saved. Your current session remains available; export a backup before leaving.');return false;}
  }
  study(entryId:string,at=new Date().toISOString()):boolean {
    if(!validText(entryId)||!this.known.has(entryId)||!validText(this.data.version)||!validTimestamp(at))return false;
    if(this.state.visits.length+this.state.attempts.length>=MAX_RECORDS){this.warn('Study history is full. Export a backup; existing records have been preserved.');return false;}
    this.state.visits.push({id:randomId(),entryId,geoVersion:this.data.version,at});return this.save();
  }
  record(question:QuizQuestion,result:QuizResult,assisted=false,at=new Date().toISOString()):boolean {
    if(!result.scored||!['correct','incorrect'].includes(result.outcome)||question.geoVersion!==this.data.version
      ||!validText(question.instanceId)||!validText(question.entryId)||!validText(question.geoVersion)
      ||!questionCurrent(question,this.data)||!validTimestamp(at)||this.state.attempts.some(attempt=>attempt.id===question.instanceId))return false;
    if(this.state.visits.length+this.state.attempts.length>=MAX_RECORDS){this.warn('Study history is full. Export a backup; existing records have been preserved.');return false;}
    this.state.attempts.push({id:question.instanceId,entryId:question.entryId,geoVersion:question.geoVersion,at,kind:question.kind,outcome:result.outcome as 'correct'|'incorrect',assisted});return this.save();
  }
  summary():MapHistorySummary {
    const visits=this.state.visits.filter(visit=>visit.geoVersion===this.data.version);
    const attempts=this.state.attempts.filter(attempt=>attempt.geoVersion===this.data.version);
    return {studiedIds:[...new Set(visits.map(visit=>visit.entryId))],
      identifiedIds:[...new Set(attempts.filter(attempt=>attempt.kind!=='intersection'&&attempt.outcome==='correct'&&!attempt.assisted).map(attempt=>attempt.entryId))],
      intersectionQuestions:attempts.filter(attempt=>attempt.kind==='intersection').length,
      correctIntersectionQuestions:attempts.filter(attempt=>attempt.kind==='intersection'&&attempt.outcome==='correct'&&!attempt.assisted).length,
      lastStudiedId:[...visits].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0]?.entryId??null,attempts:attempts.length};
  }
  exportJSON():string{return JSON.stringify(this.state);}
  importJSON(text:string):{ok:boolean;message:string}{
    let incoming:MapHistoryData|null=null;
    try{if(withinBackupSize(text))incoming=validateHistory(JSON.parse(text),this.known);}catch{/* Invalid backups never replace current data. */}
    if(!incoming)return {ok:false,message:'This is not a valid map-study backup. Existing history was preserved.'};
    const merged=mergeHistory(incoming,this.state);
    if(!merged)return {ok:false,message:'This backup exceeds the supported history size. Existing history was preserved.'};
    this.state=merged;
    const saved=this.save();return {ok:true,message:saved?'Backup merged with your existing map-study history.':'Backup merged for this session, but could not be saved. Export it before leaving.'};
  }
}
