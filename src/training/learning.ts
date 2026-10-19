import {buildRouteTree,createVehicle,isValidRoute,type RoadGraph,type Route,type VehicleState} from '../core';
import {stationDeparture} from '../departure';
import type {StudyEntry,StudyNetwork} from '../study-network';
import type {OverheadView} from '../views/overhead';
import {edgeGeometry,type StreetExplorer} from './explorer';
import {recognitionEligible,intersectionEligible,navigationEligible,type VerificationRegistry} from './verification';
import {LearningStore} from './storage';
import {buildExam,examScore,streetProgress,taskEligible,type Attempt,type TrainingTask} from './model';
import {missionArrived,type LearningMission} from './missions';
const esc=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
interface Options {dashboard:HTMLElement;viewport:HTMLElement;network:StudyNetwork;evidence:VerificationRegistry;graph:RoadGraph;overhead:OverheadView;explorer:StreetExplorer;getVehicle:()=>VehicleState;getGuidance:()=>boolean;startDrive:(vehicle:VehicleState,route:Route,guided:boolean)=>void;setRoute:(route:Route|null)=>void;close:()=>void;open:()=>void;map:()=>void;policy:(hidden:boolean)=>void;message:(text:string)=>void;clearInputs:()=>void;prepare:()=>void}
export class LearningSystem {
 private store:LearningStore;
 private selected='ns04';
 private task:TrainingTask|null=null;
 private hints=0;
 private finished=false;
 private saving=false;
 private questionSerial=0;
 private coach:HTMLElement;
 private mission:LearningMission|null=null;
 private previous:VehicleState|null=null;
 private lastReroute=0;
 private storageWarning='';
 private isExam=false;
 private routeTree:{edgeId:string;tree:ReturnType<typeof buildRouteTree>}|null=null;
 private readonly primary:Set<string>;
 constructor(private o:Options){
  this.primary=new Set(o.network.entries.flatMap(e=>e.edgeIds));
  this.store=new LearningStore(message=>{this.storageWarning=message;this.o.message(message);if(this.o.dashboard.isConnected)this.render();});
  this.coach=document.createElement('section');this.coach.className='learning-coach';this.coach.hidden=true;this.coach.dataset.testid='learning-coach';o.viewport.append(this.coach);
  o.explorer.onStudy=id=>{this.selected=id;this.study();};
  o.explorer.onSelect=edgeId=>{if(this.task?.kind!=='locate'||this.finished)return false;void this.answer(this.o.evidence.entries.find(e=>e.id===this.task!.entryId)!.segments.some(s=>s.edgeId===edgeId));return true;};
 }
 async initialize(){await this.store.open();if(!this.store.state.sessionId)this.store.state.sessionId=crypto.randomUUID();const exam=this.store.state.exam;if(exam?.status==='active'&&(exam.geoVersion!==this.o.evidence.version||exam.tasks.some(t=>!taskEligible(t,this.o.evidence)))){exam.status='withdrawn';this.storageWarning='Previous exam withdrawn without penalty because its geographic evidence changed.';}await this.store.save();this.render();}
 get blocking(){return !!this.task&&!this.mission&&!this.finished;}
 get hiddenAnswers(){return !!this.task&&!this.mission&&!this.finished&&this.task.category!=='navigation';}
 snapshot(){return {selected:this.selected,task:this.task?{id:this.task.id,kind:this.task.kind,category:this.task.category,geoVersion:this.task.geoVersion,eligible:this.task.eligible}:null,mission:this.mission?structuredClone(this.mission):null,attemptCount:this.store.state.attempts.length,sessionId:this.store.state.sessionId,exam:this.store.state.exam?{status:this.store.state.exam.status,completed:this.store.state.exam.attemptIds.length}:null,hidden:this.hiddenAnswers,progress:this.o.network.entries.map(e=>({id:e.id,...streetProgress(e.id,this.store.state,this.o.evidence)}))};}
 private entry(id=this.selected){return this.o.network.entries.find(e=>e.id===id)!;}
 private fact(id=this.selected){return this.o.evidence.entries.find(e=>e.id===id)!;}
 private eligibleSegments(id=this.selected){return this.fact(id).segments.map(s=>s.edgeId);}
 private session(){if(!this.store.state.sessionId)this.store.state.sessionId=crypto.randomUUID();return this.store.state.sessionId;}
 private pool():TrainingTask[]{
  const tasks:TrainingTask[]=[];
  for(const e of this.o.network.entries){const f=this.fact(e.id);const preferred=f.segments.filter(s=>e.zone1EdgeIds.includes(s.edgeId));const list=preferred.length?preferred:f.segments;const samples=[list[0],list[Math.floor(list.length/2)],list.at(-1)].filter((s):s is NonNullable<typeof s>=>!!s);
   for(const s of samples)for(const kind of ['identify','locate'] as const)tasks.push({id:`${kind}:${e.id}:${s.edgeId}`,entryId:e.id,edgeId:s.edgeId,category:'recognition',kind,geoVersion:this.o.evidence.version,eligible:recognitionEligible(f,s.edgeId)});
   for(const j of this.o.evidence.junctions.filter(j=>j.entryIds.includes(e.id)&&intersectionEligible(j))){const source=this.o.network.intersections.find(s=>s.id===j.id);const edgeId=source?.incomingEdgeIds.find(id=>f.segments.some(s=>s.edgeId===id));if(edgeId)tasks.push({id:`intersection:${j.id}:${e.id}`,entryId:e.id,edgeId,junctionId:j.id,category:'intersection',kind:'intersection',geoVersion:this.o.evidence.version,eligible:true});}
   if(navigationEligible(f)&&list[0])tasks.push({id:`navigate:${e.id}:${list[0].edgeId}`,entryId:e.id,edgeId:list[0].edgeId,category:'navigation',kind:'navigate',geoVersion:this.o.evidence.version,eligible:true});
  }
  return [...new Map(tasks.map(t=>[t.id,t])).values()];
 }
 private recommend(){return this.o.network.entries.filter(e=>e.zone1Location&&recognitionEligible(this.fact(e.id))).sort((a,b)=>{const x=streetProgress(a.id,this.store.state,this.o.evidence),y=streetProgress(b.id,this.store.state,this.o.evidence);return Number(y.due)-Number(x.due)||x.eligibleAttempts-y.eligibleAttempts;}).slice(0,3);}
 render(){
  const recommended=this.recommend(),entry=this.entry(),evidence=this.fact(),p=streetProgress(entry.id,this.store.state,this.o.evidence);const ready=recognitionEligible(evidence);
  const exam=buildExam(this.pool(),this.o.evidence,this.session(),'availability');const lastSession=this.store.state.attempts.filter(a=>a.sessionId===this.session());
  this.o.dashboard.innerHTML=`<div class="training-intro"><p>Learn a few streets, recall them, then practice a drive. Zone 1 recommendations use the approximate historical training boundary.</p><button id="learning-continue" class="primary">Continue Training</button><button id="learning-new-session">Begin a new training session</button><button id="learning-free">Free Drive</button></div>${this.storageWarning?`<p class="notice" role="alert">${esc(this.storageWarning)}</p>`:''}
   <h3>Recommended Zone 1 review</h3><div class="learning-recommendations">${recommended.map(e=>`<button data-recommend="${e.id}">${esc(e.originalLabel)} · ${streetProgress(e.id,this.store.state,this.o.evidence).due?'review due':'practice'}</button>`).join('')}</div>
   <label class="study-field">All 38 original entries<select id="learning-target">${this.o.network.entries.map(e=>`<option value="${e.id}">${esc(e.originalLabel)}</option>`).join('')}</select></label>
   <div class="evidence-status"><strong>${esc(entry.originalLabel)} · ${p.level}</strong><p>${(['identity','geometry','topology','maneuvers'] as const).map(d=>`${d}: ${evidence[d].status}`).join(' · ')}</p><p>${evidence.segments.length}/${evidence.totalEdges} directed segments corroborated for recognition. ${esc(evidence.geometry.reason)}</p><p>${esc(p.blockReason??'Higher-level evidence available.')}</p></div>
   <div class="training-grid"><button id="learning-study" ${ready?'':'disabled'}>Study Streets</button><button id="learning-identify" ${ready?'':'disabled'}>Identify highlighted street</button><button id="learning-locate" ${ready?'':'disabled'}>Find the street on the map</button><button id="learning-location">Identify my location</button><button id="learning-intersection">Intersection Practice</button><button id="learning-drive" ${ready?'':'disabled'}>Patrol mission · drive from HQ</button><button id="learning-nogps" ${ready?'':'disabled'}>No-GPS mission · drive from HQ</button><button id="learning-return" ${ready?'':'disabled'}>Return to HQ · start on this street</button></div>
   <p class="muted">Driving exercises use the supported OSM graph and accept connected alternative routes. They are unscored while independent movement evidence is unresolved.</p>
   <h3>Street Knowledge Exam</h3><p>20 tasks: 10 recognition, 6 intersection, 4 navigation. Pass: 85% overall and 75% in every category.</p>${exam.exam?'<button id="learning-exam">Start 20-task exam</button>':`<p class="notice" data-testid="exam-unavailable">Exam unavailable: missing ${exam.missing.recognition} eligible recognition, ${exam.missing.intersection} intersection and ${exam.missing.navigation} navigation tasks. No substitute or reduced-denominator score.</p>`}${this.store.state.exam?.status==='active'?'<button id="learning-resume-exam">Resume interrupted exam</button>':''}
   <h3>Session debrief</h3><p data-testid="session-debrief">${lastSession.filter(a=>a.outcome==='correct'&&a.eligible&&!a.assisted).length} unaided eligible successes · ${lastSession.filter(a=>a.outcome==='incorrect'&&a.eligible).length} questions to review · ${lastSession.filter(a=>a.assisted).length} assisted attempts · ${lastSession.filter(a=>!a.eligible&&a.outcome==='correct').length} unscored practice completions. Withdrawn and abandoned tasks are not failures.</p>
   <details><summary>Progress and Mastery · all 38 entries</summary><p>Visits are exploration only. Overdue reviews retain earned levels. Records from earlier geography remain historical until revalidated.</p><div class="curriculum-log">${this.o.network.entries.map(e=>{const p=streetProgress(e.id,this.store.state,this.o.evidence);return `<div data-learning-entry="${e.id}"><strong>${esc(e.originalLabel)}</strong><span>${p.level}${p.blockedHigher?' · higher levels await evidence':''}</span><small>${p.eligibleAttempts} eligible attempts · ${p.assisted} assisted · ${p.historical} historical${p.nextReview?` · review ${new Date(p.nextReview).toLocaleDateString()}`:''}</small></div>`;}).join('')}</div></details>
   <div class="backup-controls"><button id="learning-export">Export progress JSON</button><label>Import backup (merges; preserves history)<input id="learning-import" type="file" accept="application/json,.json"></label><p id="backup-result" role="status"></p></div>`;
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>this.o.dashboard.querySelector<T>('#'+id)!;el<HTMLSelectElement>('learning-target').value=this.selected;
  el('learning-target').onchange=()=>{this.selected=el<HTMLSelectElement>('learning-target').value;this.render();};
  const bind=(id:string,fn:()=>void)=>{const e=el(id);if(e)e.onclick=fn;};
  bind('learning-continue',()=>{this.selected=recommended[0]?.id??this.selected;this.study();});
  bind('learning-new-session',()=>{this.cancel();this.store.state.sessionId=crypto.randomUUID();void this.store.save();this.render();});
  bind('learning-free',()=>{this.cancel();this.o.close();});bind('learning-study',()=>this.study());bind('learning-identify',()=>this.ask('identify'));bind('learning-locate',()=>this.ask('locate'));bind('learning-location',()=>this.ask('location'));bind('learning-intersection',()=>this.intersection());
  bind('learning-drive',()=>this.drive(true));bind('learning-nogps',()=>this.drive(false));bind('learning-return',()=>this.drive(false,true));bind('learning-exam',()=>this.startExam());bind('learning-resume-exam',()=>this.resumeExam());
  for(const b of this.o.dashboard.querySelectorAll<HTMLButtonElement>('[data-recommend]'))b.onclick=()=>{this.selected=b.dataset.recommend!;this.study();};
  bind('learning-export',()=>{void this.store.export(this.o.network).then(text=>{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='fremont-streets-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});});
  el<HTMLInputElement>('learning-import').onchange=()=>{const file=el<HTMLInputElement>('learning-import').files?.[0];if(file)void file.text().then(text=>this.store.import(text,this.o.network)).then(count=>{this.render();this.o.message(`Backup merged: ${count} records checked; existing history preserved.`);}).catch(error=>{el('backup-result').textContent=String(error);});};
 }
 private policy(){this.o.policy(this.hiddenAnswers);this.o.explorer.setHidden(this.hiddenAnswers);this.o.overhead.setAssistanceHidden(this.hiddenAnswers);}
 private buttons(){this.coach.querySelector<HTMLButtonElement>('[data-end]')?.addEventListener('click',()=>{this.cancel();this.render();this.o.open();});}
 study(){this.o.prepare();this.cancel();const entry=this.entry(),ids=this.eligibleSegments(),edges=ids.map(id=>this.o.graph.edges.get(id)!).filter(Boolean);if(!edges.length){this.o.message('Geometry remains unresolved for this target.');return;}
  this.o.map();this.o.overhead.setInspection(edgeGeometry(this.o.graph,edges));const preferred=ids.find(id=>entry.zone1EdgeIds.includes(id))??ids[0];const edge=this.o.graph.edges.get(preferred)!;this.o.overhead.focusPosition(this.o.graph.nodes.get(edge.to)!.position);this.o.close();this.coach.hidden=false;
  this.coach.innerHTML=`<h3>${esc(entry.originalLabel)}</h3><p>Only City-corroborated OSM segments are highlighted. Explore freely; your vehicle stays where it is.</p><p>Connections and turning movements remain unresolved for scoring.</p><button id="study-recall">Begin recognition practice</button><button data-end>Training dashboard</button>`;this.coach.querySelector<HTMLButtonElement>('#study-recall')!.onclick=()=>this.ask('identify');this.buttons();
 }
 ask(kind:'identify'|'locate'|'location',provided?:TrainingTask){
  this.o.prepare();this.cancel(false);const options=this.pool().filter(t=>t.entryId===this.selected&&t.kind===(kind==='location'?'identify':kind));let task=provided??options[this.questionSerial++%Math.max(1,options.length)];
  if(kind==='location'){const edgeId=this.o.getVehicle().edgeId,entry=this.o.evidence.entries.find(e=>recognitionEligible(e,edgeId));if(!entry){this.o.message('Your current segment has insufficient corroborating evidence for a scored location question.');return;}task={id:`location:${entry.id}:${edgeId}`,entryId:entry.id,edgeId,kind,category:'recognition',geoVersion:this.o.evidence.version,eligible:true};this.selected=entry.id;}
  if(!task||!taskEligible(task,this.o.evidence)){this.o.message('This fact is not eligible for scored practice.');return;}
  this.task=task;this.finished=false;this.hints=0;this.o.clearInputs();this.o.map();this.o.close();this.policy();const edge=this.o.graph.edges.get(task.edgeId)!;
  this.o.overhead.setInspection(kind==='locate'?{type:'FeatureCollection',features:[]}:edgeGeometry(this.o.graph,[edge]));
  if(kind!=='locate')this.o.overhead.focusPosition(this.o.graph.nodes.get(edge.from)!.position);
  else this.o.overhead.focusRoad(this.o.network.entries.flatMap(e=>{const id=e.representativeEdge,node=id?this.o.graph.edges.get(id)?.from:null;return node?[this.o.graph.nodes.get(node)!.position]:[];}));
  this.coach.hidden=false;const choices=this.o.network.entries.filter(e=>recognitionEligible(this.fact(e.id))&&e.id!==task.entryId).sort(()=>Math.random()-.5).slice(0,3);choices.push(this.entry(task.entryId));choices.sort(()=>Math.random()-.5);
  this.coach.innerHTML=`<h3>${kind==='locate'?`Find ${esc(this.entry(task.entryId).originalLabel)}`:kind==='location'?'Which street are you on?':'Identify the highlighted street'}</h3><p>${kind==='locate'?'Pan, zoom, then click a corroborated segment of this road. Any eligible section counts.':'Street labels and other answer-revealing assistance are hidden. Driving pauses while you answer.'}</p>${kind==='locate'?'':`<div class="answer-choices">${choices.map(e=>`<button data-answer-entry="${e.id}">${esc(e.originalLabel)}</button>`).join('')}</div>`}${this.isExam?'':'<button id="learning-hint">Show a hint · assisted attempt</button>'}<button data-end>${this.isExam?'Pause exam':'End practice'}</button><p id="learning-feedback" role="status"></p>`;
  for(const b of this.coach.querySelectorAll<HTMLButtonElement>('[data-answer-entry]'))b.onclick=()=>void this.answer(b.dataset.answerEntry===task.entryId);
  this.coach.querySelector<HTMLButtonElement>('#learning-hint')?.addEventListener('click',()=>{this.hints++;this.coach.querySelector('#learning-feedback')!.textContent=`Hint: ${this.entry(task.entryId).originalLabel}. This attempt will not count as unaided evidence.`;});this.buttons();
 }
 private async answer(correct:boolean){
  if(!this.task||this.finished||this.saving)return;this.saving=true;const task=this.task;
  if(!taskEligible(task,this.o.evidence)){this.saving=false;this.cancel();this.o.message('Question withdrawn after a geographic evidence change. No penalty.');return;}
  this.finished=true;const attempt:Attempt={id:crypto.randomUUID(),entryId:task.entryId,questionId:task.id,sessionId:this.isExam?this.store.state.exam!.sessionId:this.session(),geoVersion:task.geoVersion,at:new Date().toISOString(),category:task.category,kind:task.kind,outcome:correct?'correct':'incorrect',assisted:this.hints>0,hints:this.hints,eligible:true};
  if(this.isExam){const exam=this.store.state.exam!;exam.attemptIds.push(attempt.id);if(exam.attemptIds.length===exam.tasks.length)exam.status='complete';}
  await this.store.save(attempt);this.saving=false;this.policy();this.o.overhead.setInspection(edgeGeometry(this.o.graph,[this.o.graph.edges.get(task.edgeId)!]));
  this.coach.innerHTML=`<h3>${correct?'Correct':'Review this location'}</h3><p>${esc(this.entry(task.entryId).originalLabel)}. ${this.hints?'Assisted attempt recorded.':'Unaided answer recorded.'}</p><button id="learning-next">${this.isExam?'Continue exam':'Next question'}</button><button data-end>Session debrief</button>`;this.coach.querySelector<HTMLButtonElement>('#learning-next')!.onclick=()=>this.isExam?this.resumeExam():this.ask(task.kind==='locate'?'locate':'identify');this.buttons();this.render();
 }
 intersection(){this.o.prepare();this.cancel();const eligible=this.pool().filter(t=>t.entryId===this.selected&&t.category==='intersection');
  // The current evidence intentionally has no eligible intersection questions.
  if(!eligible.length){const junction=this.o.network.intersections.find(j=>j.entryIds.includes(this.selected));this.o.close();this.coach.hidden=false;this.coach.innerHTML=`<h3>Intersection Practice · unscored</h3><p>No independently verified movement evidence is available for this road. Source-node connections may be inspected, but they cannot earn intersection scores or mastery.</p>${junction?`<p>OSM node ${esc(junction.nodeId)} lists ${esc(junction.entryIds.map(id=>this.entry(id).originalLabel).join(' / '))}. This is a source record, not verified permission to turn.</p>`:''}<button data-end>Training dashboard</button>`;if(junction){this.o.map();this.o.overhead.focusPosition(junction.position);}this.buttons();return;}
  this.presentIntersection(eligible[0]);
 }
 private presentIntersection(task:TrainingTask){
  this.task=task;this.finished=false;this.hints=0;this.o.clearInputs();this.o.close();this.policy();const junction=this.o.network.intersections.find(j=>j.id===task.junctionId)!;const other=junction.entryIds.find(id=>id!==task.entryId)!;this.o.overhead.focusPosition(junction.position);this.coach.hidden=false;
  const choices=[other,...this.o.network.entries.filter(e=>!junction.entryIds.includes(e.id)).slice(0,3).map(e=>e.id)].sort(()=>Math.random()-.5);
  this.coach.innerHTML=`<h3>Which street connects with ${esc(this.entry(task.entryId).originalLabel)} here?</h3>${choices.map(id=>`<button data-intersection-answer="${id}">${esc(this.entry(id).originalLabel)}</button>`).join('')}<button data-end>Pause practice</button>`;
  for(const b of this.coach.querySelectorAll<HTMLButtonElement>('[data-intersection-answer]'))b.onclick=()=>void this.answer(b.dataset.intersectionAnswer===other);this.buttons();
 }
 private tree(edgeId:string){if(this.routeTree?.edgeId!==edgeId)this.routeTree={edgeId,tree:buildRouteTree(this.o.graph,edgeId,false,this.primary)};return this.routeTree.tree;}
 drive(guided:boolean,returnHQ=false,examTask?:TrainingTask){
  this.o.prepare();this.cancel(false);const entry=this.entry(examTask?.entryId),station=stationDeparture(this.o.graph),eligible=this.eligibleSegments(entry.id);let vehicle=station;let route:Route|null=null;
  if(returnHQ){const source=entry.toHeadquarters;if(source&&isValidRoute(this.o.graph,source.edgeIds)){vehicle=createVehicle(this.o.graph,source.edgeIds[0]);route=source;}}
  else {const tree=this.tree(station.edgeId);const targets=examTask?[examTask.edgeId]:eligible;const chosen=targets.filter(id=>id!==station.edgeId&&tree.cost.has(id)).sort((a,b)=>tree.cost.get(a)!-tree.cost.get(b)!)[0];if(chosen)route=tree.routeTo(chosen);}
  if(!route||!isValidRoute(this.o.graph,route.edgeIds)){this.o.message('No supported connected route is available. No attempt was scored.');return;}
  const task:TrainingTask=examTask??{id:`${returnHQ?'return':'navigate'}:${entry.id}:${route.edgeIds.at(-1)}`,entryId:entry.id,category:'navigation',kind:returnHQ?'checkpoint':'navigate',edgeId:route.edgeIds.at(-1)!,geoVersion:this.o.evidence.version,eligible:false};
  this.task=task;this.finished=false;this.mission={id:crypto.randomUUID(),geoVersion:task.geoVersion,entryId:entry.id,route,edgeIds:eligible,checkpoint:returnHQ?{edgeId:station.edgeId,distance:station.distance}:undefined,startedDistance:vehicle.totalDistance,status:'active',assisted:guided,eligible:taskEligible(task,this.o.evidence),visitedEdges:[vehicle.edgeId],wrongTurns:0};
  this.previous=structuredClone(vehicle);this.o.startDrive(vehicle,route,guided);this.o.close();this.policy();this.coach.hidden=false;this.renderDrive();
 }
 private renderDrive(){if(!this.mission)return;const m=this.mission;this.coach.innerHTML=`<h3>${m.checkpoint?'Return to HQ departure':`Find ${esc(this.entry(m.entryId).originalLabel)}`}</h3><p>${m.eligible?'Eligible navigation task':'Unscored geographic practice · turning evidence unresolved'}</p><p>${this.o.getGuidance()?'GPS assistance on':'No GPS · navigate using memory'}. Any supported connected route counts. ${m.checkpoint?'Arrive within 25 m on the station road segment.':'Reach any corroborated accessible section of this street.'}</p><button data-end>${this.isExam?'Pause exam':'Withdraw practice · no penalty'}</button>`;this.buttons();}
 tick(vehicle:VehicleState){const m=this.mission;if(!m||m.status!=='active'||this.saving)return;
  if(m.geoVersion!==this.o.evidence.version||!isValidRoute(this.o.graph,m.route.edgeIds)){m.status='withdrawn';this.cancel();this.o.message('Mission withdrawn because its geographic version is no longer valid. No penalty.');return;}
  if(this.o.getGuidance())m.assisted=true;if(m.visitedEdges.at(-1)!==vehicle.edgeId)m.visitedEdges.push(vehicle.edgeId);
  if(missionArrived(m,vehicle,this.o.graph,this.previous??undefined)){m.status='complete';this.finished=true;this.saving=true;const task=this.task!;const attempt:Attempt={id:crypto.randomUUID(),entryId:m.entryId,questionId:task.id,sessionId:this.isExam?this.store.state.exam!.sessionId:this.session(),geoVersion:m.geoVersion,at:new Date().toISOString(),category:'navigation',kind:task.kind,outcome:'correct',assisted:m.assisted,hints:0,eligible:m.eligible};if(this.isExam){this.store.state.exam!.attemptIds.push(attempt.id);if(this.store.state.exam!.attemptIds.length===20)this.store.state.exam!.status='complete';}void this.store.save(attempt).then(()=>{this.saving=false;this.o.setRoute(null);this.coach.innerHTML=`<h3>Destination reached</h3><p>${m.visitedEdges.length} connected edges traversed · ${m.wrongTurns} route recalculations. ${m.eligible?'Navigation result recorded.':'Practice recorded; it does not grant mastery while movement evidence is unresolved.'}</p><button data-end>Session debrief</button>${this.isExam?'<button id="exam-next">Continue exam</button>':''}`;this.coach.querySelector<HTMLButtonElement>('#exam-next')?.addEventListener('click',()=>this.resumeExam());this.buttons();this.render();});}
  else if(!m.route.edgeIds.includes(vehicle.edgeId)&&performance.now()-this.lastReroute>2500){this.lastReroute=performance.now();m.wrongTurns++;const tree=this.tree(vehicle.edgeId),target=m.checkpoint?.edgeId??m.edgeIds.filter(id=>tree.cost.has(id)).sort((a,b)=>tree.cost.get(a)!-tree.cost.get(b)!)[0];const route=target?tree.routeTo(target):null;if(route){m.route=route;this.o.setRoute(route);}}
  this.previous=structuredClone(vehicle);
 }
 private startExam(){this.cancel();const result=buildExam(this.pool(),this.o.evidence,crypto.randomUUID(),crypto.randomUUID());if(!result.exam){this.o.message('Insufficient independently verified exam tasks.');return;}this.store.state.exam=result.exam;void this.store.save().then(()=>this.resumeExam());}
 private resumeExam(){const exam=this.store.state.exam;if(!exam)return;if(exam.status==='complete'){const score=examScore(exam,this.store.state.attempts);this.o.message(`Exam ${score.passed?'passed':'review needed'}: ${Math.round((score.score??0)*100)}%.`);this.render();return;}if(exam.status!=='active'||exam.geoVersion!==this.o.evidence.version){this.o.message('This exam cannot resume after a geographic evidence change.');return;}const task=exam.tasks[exam.attemptIds.length];if(!task||!taskEligible(task,this.o.evidence)){exam.status='withdrawn';void this.store.save();this.o.message('Exam withdrawn without penalty: a required fact is no longer eligible.');return;}this.isExam=true;this.selected=task.entryId;if(task.category==='recognition')this.ask(task.kind==='locate'?'locate':'identify',task);else if(task.category==='intersection')this.presentIntersection(task);else this.drive(false,false,task);}
 cancel(clearExam=true){if(this.task&&!this.finished&&!this.isExam){const task=this.task;void this.store.save({id:crypto.randomUUID(),entryId:task.entryId,questionId:task.id,sessionId:this.session(),geoVersion:task.geoVersion,at:new Date().toISOString(),category:task.category,kind:task.kind,outcome:'withdrawn',assisted:this.hints>0||!!this.mission?.assisted,hints:this.hints,eligible:taskEligible(task,this.o.evidence)});}this.task=null;this.finished=false;this.mission=null;this.coach.hidden=true;if(clearExam)this.isExam=false;this.o.overhead.clearStudyDestination();this.o.overhead.setInspection({type:'FeatureCollection',features:[]});this.o.setRoute(null);this.policy();this.o.clearInputs();}
}
