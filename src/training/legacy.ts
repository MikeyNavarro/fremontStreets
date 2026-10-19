import {deserializeProgress,emptyZoneProgress} from '../core/learning';
import {loadStudyProgress,emptyStudyRecord} from '../study-network';
/** Legacy counters lack attempt IDs. Merge conservatively with maxima, never
 * manufacture new scored attempts or add two possibly overlapping totals. */
export function mergeLegacy(key:string,current:string|null,incoming:string):string|null {
 if(key==='fremont-streets-progress-v1'){
  const a=deserializeProgress(current),b=deserializeProgress(incoming);
  for(const [id,y] of Object.entries(b.zones)){const x=a.zones[id]??emptyZoneProgress();a.zones[id]={streetNames:[...new Set([...x.streetNames,...y.streetNames])],intersectionIds:[...new Set([...x.intersectionIds,...y.intersectionIds])],challengesCompleted:Math.max(x.challengesCompleted,y.challengesCompleted),quizCorrect:Math.max(x.quizCorrect,y.quizCorrect),quizTotal:Math.max(x.quizTotal,y.quizTotal),unguidedRoutesCompleted:Math.max(x.unguidedRoutesCompleted,y.unguidedRoutesCompleted),savedRoutes:[...new Map([...y.savedRoutes,...x.savedRoutes].map(r=>[r.id,r])).values()],recentStreets:[...new Set([...x.recentStreets,...y.recentStreets])].slice(0,8)};}
  return JSON.stringify(a);
 }
 if(key==='fremont-streets-personal-study-v1'){
  const a=loadStudyProgress({getItem:()=>current}),b=loadStudyProgress({getItem:()=>incoming});
  for(const [id,y] of Object.entries(b.entries)){if(!/^(ew(0[1-9]|1[0-9]|2[01])|ns(0[1-9]|1[0-7]))$/.test(id))continue;const x=a.entries[id]??emptyStudyRecord();const merged={...x};for(const k of Object.keys(x) as Array<keyof typeof x>)merged[k]=Math.max(x[k],y[k]);a.entries[id]=merged;}
  for(const [id,y] of Object.entries(b.intersections)){if(!/^osm-node-\d+$/.test(id))continue;const x=a.intersections[id]??{completed:0,identified:0};a.intersections[id]={completed:Math.max(x.completed,y.completed),identified:Math.max(x.identified,y.identified)};}
  return JSON.stringify(a);
 }
 return null;
}
