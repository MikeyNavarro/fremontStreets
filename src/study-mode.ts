import { buildRouteTree, createVehicle, drivableOutgoing, isValidRoute, nextDecision } from './core';
import type { RoadGraph, Route, VehicleState } from './core';
import type { FeatureCollection, LineString, Point } from 'geojson';
import { stationDeparture } from './departure';
import { emptyStudyRecord, loadStudyProgress, randomStudyEntry, readyStudyEntries, saveStudyProgress, studyArrival } from './study-network';
import type { StudyEntry, StudyExercise, StudyJunction, StudyMission, StudyNetwork, StudyProgress } from './study-network';
import type { OverheadView } from './views/overhead';

interface Options {
  container:HTMLElement;network:StudyNetwork;graph:RoadGraph;overhead:OverheadView;storage:Storage;
  getVehicle:()=>VehicleState;getGuidance:()=>boolean;setGuidance:(enabled:boolean)=>void;
  onMessage:(message:string)=>void;onStart:(vehicle:VehicleState,route:Route|null)=>void;onRoute:(route:Route|null)=>void;
}
const esc=(value:unknown)=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));

/** Presentation and learning state only. The existing authoritative simulation
 * owns all movement; starting a chosen exercise is an explicit reset action. */
export class StudyMode {
  private active=false;
  private progress:StudyProgress;
  private mission:StudyMission|null=null;
  private selected='ns04';
  private group='all';
  private primary:Set<string>;
  private entryByEdge=new Map<string,string[]>();
  private seenThisSession=new Set<string>();
  private junctionByNode=new Map<string,StudyJunction>();
  private lastRecovery=0;
  private quiz:{junctionId:string;answer:string;choices:string[];answered:boolean}|null=null;
  private sourceTree:{edgeId:string;tree:ReturnType<typeof buildRouteTree>}|null=null;
  private lastLookahead=0;

  constructor(private options:Options){
    this.progress=loadStudyProgress(options.storage);
    this.primary=new Set(options.network.entries.filter(entry=>!entry.needsConfirmation).flatMap(entry=>entry.edgeIds));
    for(const entry of options.network.entries)if(!entry.needsConfirmation)for(const id of entry.edgeIds){const list=this.entryByEdge.get(id)??[];list.push(entry.id);this.entryByEdge.set(id,list);}
    for(const junction of options.network.intersections)this.junctionByNode.set(junction.nodeId,junction);
  }
  private el<T extends HTMLElement=HTMLElement>(id:string):T{return this.options.container.querySelector(`#${id}`) as T;}
  private entry(id=this.selected){return this.options.network.entries.find(entry=>entry.id===id)!;}
  private persist(){if(!saveStudyProgress(this.options.storage,this.progress))this.options.onMessage('Personal study progress is available for this session only; browser storage is disabled.');}
  private entries(){return this.options.network.entries.filter(entry=>this.group==='all'||this.group==='zone1'&&Boolean(entry.zone1Location)||entry.group===this.group);}
  private location(entry:StudyEntry){return this.group==='zone1'?entry.zone1Location:entry.representativeEdge&&entry.fromHeadquarters&&entry.toHeadquarters?{representativeEdge:entry.representativeEdge,fromHeadquarters:entry.fromHeadquarters,toHeadquarters:entry.toHeadquarters}:null;}
  private entryStatus(entry:StudyEntry){
    if(entry.status!=='ready')return entry.status==='needs-confirmation'?'Needs geographic confirmation':'Route unavailable';
    const record=this.progress.entries[entry.id];if(!record)return 'Not practiced';
    return record.unguided?'Reached without guidance':record.roadToRoad?'Road-to-road completed':record.guided?'Practiced with guidance':record.visits?'Encountered · not yet demonstrated':'Not practiced';
  }

  enter(zone1=false){
    this.active=true;this.group=zone1?'zone1':'all';this.mission=null;this.quiz=null;this.seenThisSession.clear();
    this.options.onStart(stationDeparture(this.options.graph),null);
    this.render();this.overlay();this.options.overhead.focusPosition(this.options.network.station.departurePosition);
    this.options.onMessage('New training session at police headquarters. Preview your roads, then choose an exercise.');
  }
  leave(){if(!this.active)return;this.active=false;this.mission=null;this.quiz=null;this.options.overhead.setStudyOverlay({type:'FeatureCollection',features:[]},{type:'FeatureCollection',features:[]},null);this.options.overhead.clearStudyDestination();const info=document.getElementById('drive-view-label');if(info)info.textContent='Real roads. One shared simulation.';this.persist();}
  cancel(){this.mission=null;this.quiz=null;if(this.active)this.renderMission();}
  snapshot(){return {active:this.active,entryCount:this.options.network.entries.length,group:this.group,selected:this.selected,mission:this.mission?structuredClone(this.mission):null,progress:structuredClone(this.progress),quiz:this.quiz?structuredClone(this.quiz):null,readyIds:readyStudyEntries(this.options.network).map(entry=>entry.id)};}
  get missionState(){return this.active?this.mission:null;}
  guidanceChanged(){this.renderMission();if(this.active)this.options.onMessage(this.options.getGuidance()?'Study route guidance enabled.':'Study route guidance hidden. Navigate using street names and intersections.');}

  private render(){
    const list=this.entries();if(!list.some(entry=>entry.id===this.selected))this.selected=list.find(entry=>entry.status==='ready')?.id??list[0]?.id??'ns04';
    const available=readyStudyEntries(this.options.network);
    const ready=available.filter(entry=>this.group!=='zone1'||entry.zone1Location);
    const option=(entry:StudyEntry)=>`<option value="${entry.id}">${esc(entry.originalLabel)}${entry.status==='ready'?'':' · needs verification'}</option>`;
    this.options.container.innerHTML=`<h3>My Street List — 38 Entries</h3><p class="muted">${available.length} mapped training targets; ${this.options.network.entries.length-available.length} need verification. Blue: east–west study group. Orange: north–south. These are memory categories, not exact bearings.</p>
      <label class="study-field">Study group<select id="study-group" data-testid="study-group"><option value="all">All 38 entries</option><option value="ew">East–West — 21 Entries</option><option value="ns">North–South — 17 Entries</option><option value="zone1">Zone 1 portions of my list</option></select></label>
      <label class="study-field">Target road<select id="study-target" data-testid="study-target">${list.map(option).join('')}</select></label>
      <p id="study-target-note" class="muted"></p><button id="study-preview" data-testid="study-preview">Preview target on map</button>
      <label class="study-field">Exercise<select id="study-exercise" data-testid="study-exercise"><option value="reach">Reach a Street · from HQ</option><option value="random">Random Street · from HQ</option><option value="road-to-road">Road to Road · choose a start</option><option value="intersection">Intersection Challenge</option><option value="no-gps">No-GPS · from HQ</option><option value="return">Return to Headquarters · from target</option><option value="quiz">Street Connection Quiz</option></select></label>
      <label class="study-field" id="study-from-field" hidden>Starting road (explicit override)<select id="study-from" data-testid="study-from">${ready.map(option).join('')}</select></label>
      <label class="study-field" id="study-junction-field" hidden>Source-backed intersection<select id="study-junction" data-testid="study-junction"></select></label>
      <div class="study-actions"><button id="study-start" data-testid="study-start" class="primary">Start challenge</button><button id="study-new-session">New HQ session</button></div>
      <p class="muted">Use Route guidance in Settings to enable or hide directions. Any supported legal route to the marked destination counts.</p>
      <div id="study-mission" data-testid="study-mission" class="notice">Choose a target and exercise.</div><div id="study-quiz" data-testid="study-quiz" class="quiz-box"></div>
      <details><summary>My 38-entry progress</summary><p class="muted">Reached locations and repetitions, not whole-road mastery.</p><div id="study-progress" class="study-progress" data-testid="study-progress"></div></details>
      <details><summary>Orientation reminders</summary><p class="muted">Your memory cues: Hills — East; Hayward — North; I-880 North — Look for Northgate. These are study notes, not turn instructions. The Northgate exit relationship has not been independently verified.</p></details>
      <details><summary>Geographic verification</summary><p class="muted">${esc(this.options.network.station.note)} Source: <a target="_blank" rel="noopener" href="${esc(this.options.network.station.sourceUrl)}">OSM headquarters building</a>. Missing traffic rules and conditional restrictions remain uncertain. Long roads have sampled approaches, not verified full end-to-end coverage. The Lake Arrowhead suffix and the combined Grimmer/South Grimmer entry follow your confirmed choices.</p></details>`;
    this.el<HTMLSelectElement>('study-group').value=this.group;this.el<HTMLSelectElement>('study-target').value=this.selected;
    const from=this.el<HTMLSelectElement>('study-from');from.value=ready.find(entry=>entry.id!==this.selected)?.id??this.selected;
    this.el('study-group').onchange=()=>{this.group=this.el<HTMLSelectElement>('study-group').value;this.render();this.overlay();};
    this.el('study-target').onchange=()=>{this.selected=this.el<HTMLSelectElement>('study-target').value;this.updateTarget();this.overlay();};
    this.el('study-exercise').onchange=()=>this.updateTarget();
    this.el('study-preview').onclick=()=>this.preview();this.el('study-start').onclick=()=>this.begin();
    this.el('study-new-session').onclick=()=>this.enter(this.group==='zone1');
    this.updateTarget();this.renderMission();this.renderProgress();
  }

  private updateTarget(){
    const entry=this.entry(),exercise=this.el<HTMLSelectElement>('study-exercise').value;
    this.el('study-target-note').textContent=`${entry.mappedNames.join(' / ')||entry.originalLabel} · ${this.entryStatus(entry)}. ${entry.note??''} ${entry.status==='ready'?'Routes checked in supported data; traffic restrictions incomplete.':entry.reason}`;
    this.el<HTMLButtonElement>('study-start').textContent=exercise==='quiz'?'Start connection quiz':'Start Driving';
    this.el<HTMLButtonElement>('study-start').disabled=entry.status!=='ready'&&exercise!=='random'&&exercise!=='quiz';
    this.el<HTMLButtonElement>('study-preview').disabled=!entry.representativeEdge||Boolean(entry.needsConfirmation);
    this.el('study-from-field').hidden=exercise!=='road-to-road';this.el('study-junction-field').hidden=exercise!=='intersection';
    const junctions=this.options.network.intersections.filter(junction=>(this.group!=='zone1'||junction.inZone1Study)&&junction.entryIds.includes(this.selected)&&junction.entryIds.some(id=>id!==this.selected&&this.entry(id).status==='ready'));
    const station=this.options.network.station.position;
    junctions.sort((a,b)=>Math.hypot(a.position[0]-station[0],a.position[1]-station[1])-Math.hypot(b.position[0]-station[0],b.position[1]-station[1]));
    this.el('study-junction').innerHTML=junctions.map(junction=>`<option value="${junction.id}">${esc(junction.entryIds.map(id=>this.entry(id).originalLabel).join(' × '))} · node ${junction.nodeId}</option>`).join('');
    if(exercise==='intersection'&&!junctions.length){this.el<HTMLButtonElement>('study-start').disabled=true;this.el('study-target-note').textContent+=' No source-node intersection with another listed road is available here; freeway overpasses are not intersections.';}
  }

  private overlay(){
    const graph=this.options.graph,entries=this.entries().filter(entry=>!entry.needsConfirmation);
    const roads:FeatureCollection<LineString>={type:'FeatureCollection',features:entries.flatMap(entry=>(this.group==='zone1'?entry.zone1EdgeIds:entry.edgeIds).filter(id=>!id.endsWith(':r')||!graph.edges.has(id.replace(/:r$/,':f'))).map(id=>{const edge=graph.edges.get(id)!;return {type:'Feature' as const,properties:{group:entry.group,selected:entry.id===this.selected,name:edge.name||entry.originalLabel},geometry:{type:'LineString' as const,coordinates:[graph.nodes.get(edge.from)!.position,graph.nodes.get(edge.to)!.position]}};}))};
    const ids=new Set(entries.map(entry=>entry.id));
    const junctions:FeatureCollection<Point>={type:'FeatureCollection',features:this.options.network.intersections.filter(junction=>(this.group!=='zone1'||junction.inZone1Study)&&junction.entryIds.some(id=>ids.has(id))).map(junction=>({type:'Feature',properties:{id:junction.id},geometry:{type:'Point',coordinates:junction.position}}))};
    this.options.overhead.setStudyOverlay(roads,junctions,entries.flatMap(entry=>entry.mappedNames));
  }
  private preview(){const entry=this.entry(),location=this.location(entry);if(!location||entry.needsConfirmation)return;const edge=this.options.graph.edges.get(location.representativeEdge)!;this.options.overhead.focusPosition(this.options.graph.nodes.get(edge.to)!.position,entry.originalLabel);this.options.onMessage(`Preview: ${entry.originalLabel}. This does not move the vehicle.`);}
  private tree(source:string){if(this.sourceTree?.edgeId!==source)this.sourceTree={edgeId:source,tree:buildRouteTree(this.options.graph,source,false,this.primary)};return this.sourceTree.tree;}
  private completeRoute(edgeIds:string[]):Route {const graph=this.options.graph;return {edgeIds,nodeIds:[graph.edges.get(edgeIds[0])!.from,...edgeIds.map(id=>graph.edges.get(id)!.to)],distance:edgeIds.reduce((sum,id)=>sum+graph.edges.get(id)!.length,0)};}

  private begin(){
    const exercise=this.el<HTMLSelectElement>('study-exercise').value;
    if(exercise==='quiz'){this.askQuiz();return;}
    if(exercise==='random'){const entry=randomStudyEntry(this.group==='zone1'?{...this.options.network,entries:this.entries()}:this.options.network);if(!entry)return;this.selected=entry.id;if(this.group!=='zone1')this.group='all';this.render();this.el<HTMLSelectElement>('study-exercise').value='random';this.updateTarget();this.overlay();}
    const entry=this.entry(),location=this.location(entry);if(entry.status!=='ready'||!location)return;
    const targetEdge=location.representativeEdge;
    const graph=this.options.graph;let vehicle=stationDeparture(graph),route:Route|null=location.fromHeadquarters;let sourceId:string|undefined;
    let goal:StudyMission['goal']={kind:'road',edgeIds:[targetEdge,...[targetEdge.replace(/:[fr]$/,targetEdge.endsWith(':f')?':r':':f')].filter(id=>graph.edges.has(id))]};
    if(exercise==='road-to-road'){
      const source=this.entry(this.el<HTMLSelectElement>('study-from').value),start=this.location(source);if(source.id===entry.id||!start){this.options.onMessage('Choose two different ready study roads.');return;}
      sourceId=source.id;vehicle=createVehicle(graph,start.representativeEdge);route=this.tree(vehicle.edgeId).routeTo(targetEdge);
    }else if(exercise==='return'){
      sourceId=entry.id;vehicle=createVehicle(graph,targetEdge);route=location.toHeadquarters;goal={kind:'headquarters',edgeId:this.options.network.station.edgeId,distance:this.options.network.station.distance};
    }else if(exercise==='intersection'){
      const junction=this.options.network.intersections.find(item=>item.id===this.el<HTMLSelectElement>('study-junction').value);
      const movement=junction?.movements.find(move=>this.entryByEdge.has(move.incoming)&&move.outgoing.some(id=>(this.entryByEdge.get(id)??[]).some(target=>!(this.entryByEdge.get(move.incoming)??[]).includes(target))));
      if(!junction||!movement){this.options.onMessage('No supported drivable approach for this intersection.');return;}
      const outgoing=movement.outgoing.filter(id=>(this.entryByEdge.get(id)??[]).some(target=>!(this.entryByEdge.get(movement.incoming)??[]).includes(target)));
      const approach=[movement.incoming];let metres=graph.edges.get(movement.incoming)!.length;
      while(metres<90&&approach.length<30){const first=graph.edges.get(approach[0])!;const previous=(graph.incoming.get(first.from)??[]).find(id=>this.primary.has(id)&&!approach.includes(id)&&drivableOutgoing(graph,graph.edges.get(id)!).some(edge=>edge.id===first.id));if(!previous)break;approach.unshift(previous);metres+=graph.edges.get(previous)!.length;}
      vehicle=createVehicle(graph,approach[0]);route=this.completeRoute([...approach,outgoing[0]]);goal={kind:'intersection',nodeId:junction.nodeId,incomingEdgeId:movement.incoming,outgoingEdgeIds:outgoing};
    }
    if(!route||!isValidRoute(graph,route.edgeIds)){this.options.onMessage('No supported connected route is available. No road connection has been invented.');return;}
    if(exercise==='no-gps')this.options.setGuidance(false);
    this.mission={exercise:exercise as StudyExercise,targetId:entry.id,sourceId,guided:this.options.getGuidance(),startedDistance:vehicle.totalDistance,goal,status:'active',route};this.quiz=null;this.el('study-quiz').innerHTML='';
    const record=this.progress.entries[entry.id]??emptyStudyRecord();this.progress.entries[entry.id]={...record,repetitions:record.repetitions+1};this.persist();
    this.options.onStart(vehicle,route);this.renderMission();this.renderProgress();
    const destination=goal.kind==='headquarters'?this.options.network.station.departurePosition:graph.nodes.get(graph.edges.get(route.edgeIds.at(-1)!)!.to)!.position;
    this.options.overhead.focusPosition(destination,goal.kind==='headquarters'?'Police HQ departure point':entry.originalLabel);this.options.overhead.setFollowVehicle(true);
    this.options.onMessage(`Challenge started: ${exercise==='return'?'return to police headquarters':exercise==='intersection'?'traverse the selected source junction':`reach the marked location on ${entry.originalLabel}`}. ${this.options.getGuidance()?'Guidance is on.':'No GPS guidance.'}`);
  }

  tick(vehicle:VehicleState){
    if(!this.active)return;
    let changed=false;
    for(const id of this.entryByEdge.get(vehicle.edgeId)??[])if(!this.seenThisSession.has(id)){this.seenThisSession.add(id);const record=this.progress.entries[id]??emptyStudyRecord();this.progress.entries[id]={...record,visits:record.visits+1};changed=true;}
    const mission=this.mission;
    if(mission?.status==='active'){
      if(this.options.getGuidance())mission.guided=true;
      if(studyArrival(mission,vehicle)){
        mission.status='complete';const record=this.progress.entries[mission.targetId]??emptyStudyRecord();this.progress.entries[mission.targetId]={...record,guided:record.guided+Number(mission.guided),unguided:record.unguided+Number(!mission.guided),roadToRoad:record.roadToRoad+Number(mission.exercise==='road-to-road'),returns:record.returns+Number(mission.exercise==='return')};
        if(mission.goal.kind==='intersection'){const id=`osm-node-${mission.goal.nodeId}`,previous=this.progress.intersections[id]??{completed:0,identified:0};this.progress.intersections[id]={...previous,completed:previous.completed+1};}
        changed=true;this.renderMission();this.options.onMessage('Personal study challenge completed. This records a practiced location, not mastery of the entire road.');
      }else if(!mission.route.edgeIds.includes(vehicle.edgeId)&&performance.now()-this.lastRecovery>2500){
        this.lastRecovery=performance.now();const destination=mission.goal.kind==='intersection'?mission.goal.incomingEdgeId:mission.route.edgeIds.at(-1)!;let recovered=this.tree(vehicle.edgeId).routeTo(destination);
        if(recovered&&mission.goal.kind==='intersection')recovered=this.completeRoute([...recovered.edgeIds,mission.goal.outgoingEdgeIds[0]]);
        if(recovered){mission.route=recovered;this.options.onRoute(recovered);this.options.onMessage(this.options.getGuidance()?'Connected route recalculated after the wrong turn.':'You are off the previewed route. Continue using connected roads; guidance stays hidden.');}
      }
    }
    if(performance.now()-this.lastLookahead>800){this.lastLookahead=performance.now();const decision=nextDecision(this.options.graph,vehicle);const node=decision?this.options.graph.edges.get(decision.incomingEdgeId)!.to:null,junction=node?this.junctionByNode.get(node):null;
      const info=document.getElementById('drive-view-label');if(info)info.textContent=junction?`Study junction in ${Math.round(decision!.distance)} m: ${junction.entryIds.map(id=>this.entry(id).originalLabel).join(' × ')}`:`${(this.entryByEdge.get(vehicle.edgeId)??[]).map(id=>this.entry(id).originalLabel).join(' / ')||'Connector road'} · heading ${Math.round((vehicle.heading*180/Math.PI+360)%360)}°. UI study labels; physical signs unverified.`;
    }
    if(changed){this.persist();this.renderProgress();}
  }

  private renderMission(){
    if(!this.active||!this.el('study-mission'))return;
    const mission=this.mission;this.el('study-mission').textContent=!mission?'Preview a road, then start from headquarters.':mission.status==='complete'?'Challenge complete · practiced location recorded.':`${mission.exercise==='return'?'Return to Police Headquarters':mission.exercise==='intersection'?'Approach and traverse the selected intersection':`Reach the marked location on ${this.entry(mission.targetId).originalLabel}`} · ${this.options.getGuidance()?'guidance on':'no GPS'} · ${(mission.route.distance/1000).toFixed(2)} km suggested route. Other supported legal routes count.`;
  }
  private renderProgress(){
    if(!this.active||!this.el('study-progress'))return;
    this.el('study-progress').innerHTML=this.options.network.entries.map(entry=>{const record=this.progress.entries[entry.id]??emptyStudyRecord();return `<div data-study-entry="${entry.id}" class="study-record"><strong>${esc(entry.originalLabel)}</strong><span>${esc(this.entryStatus(entry))} · ${record.repetitions} attempts · ${record.identified} identifications${entry.needsConfirmation?` · ${esc(entry.reason)}`:''}</span></div>`;}).join('');
  }
  private askQuiz(){
    this.mission=null;this.options.onRoute(null);this.renderMission();
    const ready=new Set(readyStudyEntries(this.options.network).filter(entry=>this.group!=='zone1'||entry.zone1Location).map(entry=>entry.id));
    const junctions=this.options.network.intersections.filter(item=>this.group!=='zone1'||item.inZone1Study);
    const junction=junctions.find(item=>item.entryIds.includes(this.selected)&&item.entryIds.filter(id=>ready.has(id)).length>=2)??junctions.find(item=>item.entryIds.filter(id=>ready.has(id)).length>=2);
    if(!junction)return;
    const current=junction.entryIds.find(id=>ready.has(id))!,answer=junction.entryIds.find(id=>id!==current&&ready.has(id))!;
    const wrong=this.options.network.entries.filter(entry=>ready.has(entry.id)&&!junction.entryIds.includes(entry.id)).slice(0,3).map(entry=>entry.id);
    const choices=[answer,...wrong].sort(()=>Math.random()-.5);this.quiz={junctionId:junction.id,answer,choices,answered:false};
    this.el('study-quiz').innerHTML=`<p class="muted">At the marked source junction (OSM node ${esc(junction.nodeId)}), which listed road directly connects with ${esc(this.entry(current).originalLabel)}?</p>${choices.map(id=>`<button data-study-answer="${id}">${esc(this.entry(id).originalLabel)}</button>`).join('')}`;
    for(const button of this.el('study-quiz').querySelectorAll<HTMLButtonElement>('button'))button.onclick=()=>{
      if(!this.quiz||this.quiz.answered)return;this.quiz.answered=true;
      const correct=button.dataset.studyAnswer===answer;
      if(correct){const record=this.progress.entries[answer]??emptyStudyRecord();this.progress.entries[answer]={...record,identified:record.identified+1};const previous=this.progress.intersections[junction.id]??{completed:0,identified:0};this.progress.intersections[junction.id]={...previous,identified:previous.identified+1};this.persist();this.renderProgress();}
      this.el('study-quiz').innerHTML=`<p class="muted">${correct?'Correct.':'Keep practicing.'} The source junction connects ${esc(junction.entryIds.map(id=>this.entry(id).originalLabel).join(' and '))}. This question asserts node connectivity, not every possible traffic movement.</p>`;
    };
    this.options.overhead.focusPosition(junction.position,'Source-backed study junction');
  }
}
