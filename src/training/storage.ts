import {mergeLegacy} from './legacy';
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
   await new Promise<void>((resolve,reject)=>{const tx=this.db!.transaction(['attempts','meta'],'readwrite');if(attempt){const store=tx.objectStore('attempts'),check=store.get(attempt.id);check.onsuccess=()=>{if(check.result&&JSON.stringify(check.result)!==JSON.stringify(attempt)){tx.abort();return;}if(!check.result)store.add(attempt);};}const {attempts,...meta}=snapshot;tx.objectStore('meta').put(meta,'state');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  }).catch(error=>this.warn('Progress could not be saved. Your session is intact; export a backup. '+String(error)));
  await this.writes;
 }
 async export(network:StudyNetwork){await this.writes;for(const key of ['fremont-streets-progress-v1','fremont-streets-personal-study-v1']){try{const value=localStorage.getItem(key);if(value)this.state.legacy[key]=value;}catch{/* Previously captured legacy history remains in the backup. */}}if(this.db){const saved=await new Promise<Attempt[]>((resolve,reject)=>{const r=this.db!.transaction('attempts','readonly').objectStore('attempts').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});for(const a of saved)this.state=addAttempt(this.state,a);}return JSON.stringify({format:'fremont-streets-learning',...this.state,exportedAt:new Date().toISOString(),curriculum:network.entries.map(e=>({id:e.id,label:e.originalLabel}))},null,2);}
 async import(text:string,network:StudyNetwork){
  if(text.length>20_000_000)throw new Error('Backup is too large.');
  const parsed=JSON.parse(text);if(JSON.stringify(parsed.curriculum)!==JSON.stringify(network.entries.map(e=>({id:e.id,label:e.originalLabel}))))throw new Error('This backup has a different curriculum. Nothing imported.');
  const incoming=validateBackup(parsed,new Set(network.entries.map(e=>e.id)));let merged=this.state;for(const a of incoming.attempts)merged=addAttempt(merged,a);
  if(!this.db)throw new Error('Storage unavailable; import cannot be safely committed.');
  await this.writes;
  await new Promise<void>((resolve,reject)=>{const tx=this.db!.transaction(['attempts','meta'],'readwrite');for(const a of incoming.attempts){const store=tx.objectStore('attempts'),check=store.get(a.id);check.onsuccess=()=>{if(check.result&&JSON.stringify(check.result)!==JSON.stringify(a)){tx.abort();return;}if(!check.result)store.add(a);};}const {attempts,...meta}=merged;tx.objectStore('meta').put(meta,'state');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  this.state=merged;for(const [key,value] of Object.entries(incoming.legacy)){this.state.legacy[key]=value;try{const combined=mergeLegacy(key,localStorage.getItem(key),value);if(combined)localStorage.setItem(key,combined);}catch{this.warn('New learning history imported; legacy progress could not be restored. The backup is still available.');}}await this.save();return incoming.attempts.length;
 }
}
