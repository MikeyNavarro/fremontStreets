import {EMPTY_LEARNING,type LearningState,type Attempt,addAttempt,validateBackup} from './model';
import type {StudyNetwork} from '../study-network';
/** Atomic attempt + exam checkpoint writes. No deletion/reset API is exposed. */
export class LearningStore {
 private db:IDBDatabase|null=null;
 state=EMPTY_LEARNING();
 private writes:Promise<void>=Promise.resolve();
 constructor(private warn:(message:string)=>void){}
 async open(){
  try{
   this.db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('fremont-streets-learning',1);r.onupgradeneeded=()=>{r.result.createObjectStore('attempts',{keyPath:'id'});r.result.createObjectStore('meta');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Close another old Fremont tab to upgrade progress storage.'));});
   this.db.onversionchange=()=>{this.db?.close();this.db=null;this.warn('Progress storage changed in another tab. Export a backup and reload.');};
   const tx=this.db.transaction(['attempts','meta'],'readonly');
   const get=<T>(request:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   const [attempts,meta]=await Promise.all([get(tx.objectStore('attempts').getAll()),get(tx.objectStore('meta').get('state'))]);
   this.state={...EMPTY_LEARNING(),...meta,attempts};
   if(this.state.schema!==1)throw new Error('Unrecognized progress schema; existing data retained.');
   if(!Object.keys(this.state.legacy).length){for(const key of ['fremont-streets-personal-study-v1','fremont-streets-progress-v1']){const old=localStorage.getItem(key);if(old)this.state.legacy[key]=old;}}
  }catch(error){this.db?.close();this.db=null;this.warn('Progress cannot be saved in this browser. Export a JSON backup before leaving. '+String(error));}
 }
 async save(attempt?:Attempt){
  if(attempt)this.state=addAttempt(this.state,attempt);
  const snapshot=structuredClone(this.state);
  this.writes=this.writes.then(async()=>{
   if(!this.db){this.warn('Progress is session-only. Export a JSON backup before leaving.');return;}
   await new Promise<void>((resolve,reject)=>{const tx=this.db!.transaction(['attempts','meta'],'readwrite');if(attempt)tx.objectStore('attempts').put(attempt);const {attempts,...meta}=snapshot;tx.objectStore('meta').put(meta,'state');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  }).catch(error=>this.warn('Progress could not be saved. Your session is intact; export a backup. '+String(error)));
  await this.writes;
 }
 async export(network:StudyNetwork){await this.writes;return JSON.stringify({format:'fremont-streets-learning',...this.state,exportedAt:new Date().toISOString(),curriculum:network.entries.map(e=>({id:e.id,label:e.originalLabel}))},null,2);}
 async import(text:string,network:StudyNetwork){
  if(text.length>20_000_000)throw new Error('Backup is too large.');
  const parsed=JSON.parse(text);if(JSON.stringify(parsed.curriculum)!==JSON.stringify(network.entries.map(e=>({id:e.id,label:e.originalLabel}))))throw new Error('This backup has a different curriculum. Nothing imported.');
  const incoming=validateBackup(parsed,new Set(network.entries.map(e=>e.id)));let merged=this.state;for(const a of incoming.attempts)merged=addAttempt(merged,a);
  if(!this.db)throw new Error('Storage unavailable; import cannot be safely committed.');
  await this.writes;
  await new Promise<void>((resolve,reject)=>{const tx=this.db!.transaction(['attempts','meta'],'readwrite');for(const a of incoming.attempts)tx.objectStore('attempts').put(a);const {attempts,...meta}=merged;tx.objectStore('meta').put(meta,'state');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  this.state=merged;return incoming.attempts.length;
 }
}
