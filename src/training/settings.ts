import type {AccelerationProfile} from '../core';
export const SETTINGS_KEY='fremont-streets-settings-v1';
export interface DrivingSettings {version:1;profile:AccelerationProfile;maxSpeed:number;assist:boolean;guidance:boolean}
export const defaultSettings=():DrivingSettings=>({version:1,profile:'QUICK',maxSpeed:100,assist:true,guidance:true});
export function loadSettings(storage:Pick<Storage,'getItem'>):DrivingSettings{
 try{const s=JSON.parse(storage.getItem(SETTINGS_KEY)??'null');if(s?.version!==1)return defaultSettings();return {version:1,profile:['NORMAL','QUICK','SPORT'].includes(s.profile)?s.profile:'QUICK',maxSpeed:Number.isFinite(s.maxSpeed)?Math.max(10,Math.min(100,s.maxSpeed)):100,assist:typeof s.assist==='boolean'?s.assist:true,guidance:typeof s.guidance==='boolean'?s.guidance:true};}catch{return defaultSettings();}
}
export function saveSettings(storage:Pick<Storage,'setItem'>,value:DrivingSettings):boolean{try{storage.setItem(SETTINGS_KEY,JSON.stringify(value));return true;}catch{return false;}}
