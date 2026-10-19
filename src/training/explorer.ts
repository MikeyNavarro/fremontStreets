import {project} from '../core';
import type {RoadGraph,RoadEdge,LonLat} from '../core';
import type {StudyNetwork} from '../study-network';
import type {VerificationRegistry} from './verification';
import type {OverheadView} from '../views/overhead';
import type {FeatureCollection,LineString} from 'geojson';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Components use source nodes, not proximity. Divided/disconnected roads stay distinct. */
export function roadSections(edges:RoadEdge[]):RoadEdge[][] {
 const at=new Map<string,RoadEdge[]>();for(const e of edges)for(const node of [e.from,e.to]){const list=at.get(node)??[];list.push(e);at.set(node,list);}
 const visited=new Set<string>(),result:RoadEdge[][]=[];
 for(const seed of edges){if(visited.has(seed.id))continue;const section:RoadEdge[]=[],queue=[seed];visited.add(seed.id);while(queue.length){const e=queue.pop()!;section.push(e);for(const node of [e.from,e.to])for(const next of at.get(node)??[])if(!visited.has(next.id)){visited.add(next.id);queue.push(next);}}result.push(section);}
 return result.sort((a,b)=>b.reduce((n,e)=>n+e.length,0)-a.reduce((n,e)=>n+e.length,0));
}
export function edgeGeometry(graph:RoadGraph,edges:RoadEdge[]):FeatureCollection<LineString>{return {type:'FeatureCollection',features:edges.filter(e=>!e.id.endsWith(':r')||!graph.edges.has(e.id.replace(/:r$/,':f'))).map(e=>({type:'Feature',properties:{edgeId:e.id,wayId:e.wayId,name:e.name},geometry:{type:'LineString',coordinates:[graph.nodes.get(e.from)!.position,graph.nodes.get(e.to)!.position]}}))};}
export class StreetExplorer {
 private byName=new Map<string,RoadEdge[]>();
 private selected:RoadEdge[]=[];
 private selectionName='';
 private hidden=false;
 private container:HTMLDetailsElement;
 onStudy:((entryId:string)=>void)|null=null;
 onAmbiguous:(()=>void)|null=null;
 onSelect:((edgeId:string)=>boolean)|null=null;
 constructor(private graph:RoadGraph,private network:StudyNetwork,private evidence:VerificationRegistry,private overhead:OverheadView,host:HTMLElement){
  for(const edge of graph.edges.values())if(edge.name){const list=this.byName.get(edge.name)??[];list.push(edge);this.byName.set(edge.name,list);}
  this.container=document.createElement('details');this.container.className='street-explorer';this.container.dataset.testid='street-explorer';
  this.container.innerHTML=`<summary>Explore streets</summary><label>Search loaded streets<input id="street-search" type="search" autocomplete="off" placeholder="Street name" aria-label="Search loaded streets"></label><div id="street-results"></div><label><input type="checkbox" id="street-labels" checked>Street labels</label><label><input type="checkbox" id="geographic-qa">Geographic QA details</label><div id="street-inspection" aria-live="polite">Search or click a mapped road. Other roads remain usable connectors.</div>`;
  host.append(this.container);
  this.el<HTMLInputElement>('street-search').oninput=()=>this.search();
  this.el<HTMLInputElement>('street-labels').onchange=()=>overhead.setLabelsVisible(this.el<HTMLInputElement>('street-labels').checked);
  this.el<HTMLInputElement>('geographic-qa').onchange=()=>this.inspect();
  overhead.onAmbiguousClick=()=>{if(this.hidden)this.onAmbiguous?.();else{this.container.open=true;this.el('street-inspection').textContent='Several source roads overlap here. Zoom in and select the middle of a road section, or search for a specific street.';}};
  overhead.onRoadClick=(way,position)=>{const edges=[...graph.edges.values()].filter(e=>e.wayId===way);if(!edges.length)return;const point=project(position),distance=(e:RoadEdge)=>{const a=graph.nodes.get(e.from)!,b=graph.nodes.get(e.to)!,dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);};const nearest=edges.reduce((best,e)=>distance(e)<distance(best)?e:best);if(this.onSelect?.(nearest.id))return;this.selectName(nearest.name,nearest.id,false);};
 }
 private el<T extends HTMLElement=HTMLElement>(id:string){return this.container.querySelector<T>('#'+id)!;}
 setHidden(hidden:boolean){this.hidden=hidden;this.container.hidden=hidden;if(hidden){this.container.open=false;this.el('street-results').replaceChildren();this.el('street-inspection').replaceChildren();this.overhead.setInspection({type:'FeatureCollection',features:[]});this.overhead.setQANodes([]);}else this.inspect();}
 private search(){if(this.hidden)return;const query=this.el<HTMLInputElement>('street-search').value.trim().toLowerCase();const aliases=this.network.entries.filter(e=>e.originalLabel.toLowerCase().includes(query)).flatMap(e=>e.mappedNames);const matches=[...this.byName.keys()].filter(name=>query&&(name.toLowerCase().includes(query)||aliases.includes(name))).sort().slice(0,12);this.el('street-results').innerHTML=matches.map(name=>`<button data-name="${esc(name)}">${esc(name)}</button>`).join('')||'<p>No matching loaded street.</p>';for(const b of this.el('street-results').querySelectorAll<HTMLButtonElement>('button'))b.onclick=()=>this.selectName(b.dataset.name!);}
 selectName(name:string,edgeId?:string,focus=true){
  if(this.hidden)return;const sections=roadSections(this.byName.get(name)??[]);this.selectionName=name;
  if(sections.length>1&&!edgeId){this.el('street-results').innerHTML=`<p>${esc(name)} has ${sections.length} separate source-connected sections/carriageways. Choose one:</p>`+sections.map((s,i)=>`<button data-section="${i}">Section ${i+1} · ${s.length} directed segments · near ${this.graph.nodes.get(s[0].from)!.position.map(n=>n.toFixed(4)).join(', ')}</button>`).join('');for(const b of this.el('street-results').querySelectorAll<HTMLButtonElement>('button'))b.onclick=()=>this.show(name,sections[Number(b.dataset.section)],focus);return;}
  this.show(name,sections.find(s=>s.some(e=>e.id===edgeId))??sections[0]??[],focus);
 }
 private show(name:string,edges:RoadEdge[],focus:boolean){this.container.open=true;this.selectionName=name;this.selected=edges;this.overhead.setInspection(edgeGeometry(this.graph,edges));if(focus)this.overhead.focusRoad(edges.flatMap(e=>[this.graph.nodes.get(e.from)!.position,this.graph.nodes.get(e.to)!.position]));this.inspect();}
 private inspect(){if(this.hidden||!this.selected.length)return;const ids=new Set(this.selected.map(e=>e.id)),entries=this.network.entries.filter(e=>e.edgeIds.some(id=>ids.has(id))),corroborated=this.evidence.entries.flatMap(e=>e.segments).filter(e=>ids.has(e.edgeId)).length;
  const junctions=this.network.intersections.filter(j=>j.incomingEdgeIds.some(id=>ids.has(id))||j.outgoingEdgeIds.some(id=>ids.has(id)));
  this.overhead.setQANodes(this.el<HTMLInputElement>('geographic-qa').checked?[...new Set(this.selected.flatMap(e=>[e.from,e.to]))].map(id=>this.graph.nodes.get(id)!):[]);
  this.el('street-inspection').innerHTML=`<strong>${esc(this.selectionName)}</strong><p>${corroborated} corroborated directed segments in this selection. Junctions and turns require independent evidence.</p>${entries.map(e=>`<button data-study="${e.id}">Study ${esc(e.originalLabel)}</button>`).join('')}<p>${junctions.length} OSM shared-node curriculum junctions; unscored pending independent verification.</p>${this.el<HTMLInputElement>('geographic-qa').checked?`<details open><summary>Source IDs and unresolved facts</summary><p>Evidence ${esc(this.evidence.version)}. Amber dashes mark unavailable roads. A crossing is never connected by proximity.</p><ul>${this.selected.slice(0,80).map(e=>`<li>Edge ${esc(e.id)} · OSM ${esc(e.wayId)} · nodes ${esc(e.from)} → ${esc(e.to)}</li>`).join('')}</ul><p>${this.selected.length>80?'First 80 IDs shown; full selection remains highlighted.':''}</p></details>`:''}`;
  for(const b of this.el('street-inspection').querySelectorAll<HTMLButtonElement>('[data-study]'))b.onclick=()=>this.onStudy?.(b.dataset.study!);
 }
}
