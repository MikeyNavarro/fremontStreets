import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildGraph, buildRouteTree, buildZoneCoverage, classifySegmentZones, drivableOutgoing, isValidRoute, pointZoneMembership, project } from '../src/core';
import type { RoadData, Route, LonLat, ZoneDocument } from '../src/core';
import { POLICE_STATION, stationDeparture } from '../src/departure';
import { canonicalRoadName, type StudyEntry, type StudyJunction, type StudyNetwork } from '../src/study-network';

const roadsRaw=await readFile('public/data/roads.json','utf8');
const roads=JSON.parse(roadsRaw) as RoadData;
const zones=JSON.parse(await readFile('public/data/zones.json','utf8')) as ZoneDocument;
const city=JSON.parse(await readFile('data-sources/city-streets-full.geojson','utf8'));
const handwritten=JSON.parse(await readFile('data-sources/study-entries.json','utf8'));
const graph=buildGraph(roads), coverage=buildZoneCoverage(graph,zones), departure=stationDeparture(graph);
const physical=new Map([...graph.edges.values()].map(edge=>[edge.id.replace(/:[fr]$/,''),edge]));
const wayMap=new Map(roads.ways.map(way=>[String(way.id),way]));
const rawEntries=handwritten.entries as Array<Pick<StudyEntry,'id'|'group'|'originalLabel'|'names'|'note'|'ref'|'needsConfirmation'>>;
console.log(`Analyzing ${graph.edges.size} directed source edges and ${rawEntries.length} curriculum entries.`);
const entryByEdge=new Map<string,string[]>();
const entries:StudyEntry[]=rawEntries.map(raw=>{
  const names=new Set(raw.names.map(canonicalRoadName));
  const sourceWays=roads.ways.filter(way=>raw.ref ? String(way.tags?.ref??'').split(';').some(ref=>ref.replace(/[^0-9A-Z]/gi,'').toUpperCase()===raw.ref!.replace(/[^0-9A-Z]/gi,'').toUpperCase()) && way.highway==='motorway' : names.has(canonicalRoadName(way.name??'')));
  const ids=new Set(sourceWays.map(way=>String(way.id)));
  const edges=[...graph.edges.values()].filter(edge=>ids.has(edge.wayId));
  for(const edge of edges){const list=entryByEdge.get(edge.id)??[];list.push(raw.id);entryByEdge.set(edge.id,list);}
  const cityFeatures=city.features.filter((feature:any)=>names.has(canonicalRoadName(feature.properties.ST_NAME??'')));
  const zoneIds=new Set(edges.flatMap(edge=>{const segment=coverage.byEdge.get(edge.id);return [...(segment?.zoneIds??[]),...(segment?.uncertainZoneIds??[])];}));
  return {...raw,mappedNames:[...new Set(sourceWays.map(way=>way.name).filter((name):name is string=>Boolean(name)))],edgeIds:edges.map(edge=>edge.id),zone1EdgeIds:edges.filter(edge=>{const segment=coverage.byEdge.get(edge.id);return segment?.zoneIds.includes('zone1')||segment?.uncertainZoneIds.includes('zone1');}).map(edge=>edge.id),sourceWayIds:[...ids],cityObjectIds:cityFeatures.map((feature:any)=>feature.properties.OBJECTID),cityClasses:[...new Set<string>(cityFeatures.map((feature:any)=>feature.properties.ST_CLASS))].sort(),osmClasses:[...new Set(edges.map(edge=>edge.highway))].sort(),zones:[...zoneIds].sort(),approximateLengthMetres:[...physical.values()].filter(edge=>ids.has(edge.wayId)).reduce((sum,edge)=>sum+edge.length,0),status:raw.needsConfirmation?'needs-confirmation':edges.length?'unreachable':'missing-geometry',reason:raw.needsConfirmation?raw.note!:'Connectivity evaluation pending.',representativeEdge:null,zone1Location:null,fromHeadquarters:null,toHeadquarters:null,approaches:[],intersectionIds:[],coverage:'Bounded imported segments, not proof of complete end-to-end corridor coverage.'};
});
const primary=new Set(entryByEdge.keys());
const zone1SafeNodes=new Set(coverage.zones.zone1.safeDestinationNodeIds);
const forward=buildRouteTree(graph,departure.edgeId,false,primary), reverse=buildRouteTree(graph,departure.edgeId,true,primary);
console.log('Headquarters forward and reverse directed trees computed.');
for(const entry of entries){
  const accessible=entry.edgeIds.filter(id=>forward.cost.has(id)&&reverse.cost.has(id));
  accessible.sort((a,b)=>Math.abs((forward.cost.get(a)??0)-600)-Math.abs((forward.cost.get(b)??0)-600));
  const representative=accessible.find(id=>(forward.cost.get(id)??0)>250)??accessible[0];
  if(representative){entry.representativeEdge=representative;entry.fromHeadquarters=forward.routeTo(representative);entry.toHeadquarters=reverse.routeTo(representative);}
  const zone1Edge=accessible.find(id=>{const edge=graph.edges.get(id)!;return zone1SafeNodes.has(edge.from)&&zone1SafeNodes.has(edge.to);});
  entry.zone1Location=zone1Edge?{representativeEdge:zone1Edge,fromHeadquarters:forward.routeTo(zone1Edge)!,toHeadquarters:reverse.routeTo(zone1Edge)!}:null;
  const spatial=[...entry.edgeIds].sort((a,b)=>{const p=graph.nodes.get(graph.edges.get(a)!.from)!,q=graph.nodes.get(graph.edges.get(b)!.from)!;return p.x+p.y-q.x-q.y;});
  const samples=new Set<string>();
  for(const fraction of [0,.25,.5,.75,1])if(spatial.length)samples.add(spatial[Math.min(spatial.length-1,Math.floor(fraction*spatial.length))]);
  for(const half of [-1,1]){const match=spatial.find(id=>Math.sign(graph.edges.get(id)!.heading)===half);if(match)samples.add(match);}
  if(representative)samples.add(representative);
  entry.approaches=[...samples].map(edgeId=>({edgeId,fromHeadquarters:forward.cost.has(edgeId),toHeadquarters:reverse.cost.has(edgeId),forwardMetres:forward.routeTo(edgeId)?.distance??null,returnMetres:reverse.routeTo(edgeId)?.distance??null}));
  if(!entry.needsConfirmation){entry.status=!entry.edgeIds.length?'missing-geometry':entry.fromHeadquarters&&entry.toHeadquarters&&entry.cityObjectIds.length?'ready':'unreachable';entry.reason=entry.status==='ready'?'Named/ref-matched OSM geometry cross-checked with City street records; connected departure and return routes validated under supported graph rules. Actual traffic movements and all restrictions remain unverified.':!entry.edgeIds.length?'No usable directed source geometry in the available extract.':!entry.cityObjectIds.length?'No independent City street identity match found.':'No supported departure-and-return pair found; this is a graph/data limitation, not proof of physical disconnection.';}
}

const intersections:StudyJunction[]=[];
for(const node of graph.nodes.values()){
  const incoming=graph.incoming.get(node.id)??[],outgoing=graph.outgoing.get(node.id)??[];
  const ids=[...new Set([...incoming,...outgoing].flatMap(id=>entryByEdge.get(id)??[]))];
  if(ids.length<2)continue;
  const movements=incoming.map(id=>({incoming:id,outgoing:drivableOutgoing(graph,graph.edges.get(id)!).map(edge=>edge.id)}));
  const hasConnection=movements.some(movement=>movement.outgoing.some(id=>(entryByEdge.get(id)??[]).some(target=>!(entryByEdge.get(movement.incoming)??[]).includes(target))));
  if(!hasConnection)continue;
  intersections.push({id:`osm-node-${node.id}`,logicalId:`osm-node-${node.id}`,nodeId:node.id,position:node.position,inZone1Study:zone1SafeNodes.has(node.id),entryIds:ids.sort(),incomingEdgeIds:incoming,outgoingEdgeIds:outgoing,sourceWayIds:[...new Set([...incoming,...outgoing].map(id=>graph.edges.get(id)!.wayId))],movements,restrictionIds:graph.restrictions.filter(rule=>String(rule.viaNode)===node.id).map(rule=>String(rule.id)),status:'Source-node connectivity and supported movements validated; absent/conditional traffic restrictions and signals are unverified.',connectionType:ids.length>2?'multi-corridor junction':'shared-node junction'});
}
// Group close same-road-pair nodes ONLY when a real short graph path joins them.
// This changes labels/inventory only: no physical graph edges are collapsed.
const byNode=new Map(intersections.map(item=>[item.nodeId,item]));
for(const junction of intersections){
  const queue=[{node:junction.nodeId,metres:0}],seen=new Set<string>();
  while(queue.length){const current=queue.pop()!;if(seen.has(current.node)||current.metres>120)continue;seen.add(current.node);
    const other=byNode.get(current.node);
    if(other&&other.entryIds.join('|')===junction.entryIds.join('|')){const id=[other.logicalId,junction.logicalId].sort()[0];other.logicalId=id;junction.logicalId=id;}
    for(const id of [...(graph.outgoing.get(current.node)??[]),...(graph.incoming.get(current.node)??[])]){const edge=graph.edges.get(id)!;if(!entryByEdge.has(id))continue;queue.push({node:edge.from===current.node?edge.to:edge.from,metres:current.metres+edge.length});}
  }
}
for(const entry of entries)entry.intersectionIds=intersections.filter(junction=>junction.entryIds.includes(entry.id)).map(junction=>junction.id);

const junctionByNode=new Map(intersections.map(item=>[item.nodeId,item.id]));
function describeRoute(route:Route|null){
  if(!route)return null;
  if(!isValidRoute(graph,route.edgeIds))throw new Error('Connectivity report contains an invalid source route.');
  return {lengthMetres:Math.round(route.distance),sourceEdge:route.edgeIds[0],destinationEdge:route.edgeIds.at(-1),connectorRoads:[...new Set(route.edgeIds.filter(id=>!primary.has(id)).map(id=>graph.edges.get(id)!.name||`Unnamed OSM way ${graph.edges.get(id)!.wayId}`))],intersectionIds:[...new Set(route.nodeIds.flatMap(id=>junctionByNode.has(id)?[junctionByNode.get(id)!]:[]))],crossesOutsideZone1:route.edgeIds.some(id=>!coverage.byEdge.get(id)?.zoneIds.includes('zone1')),uncertainty:'Missing/conditional restrictions and on-street legality are not independently verified; unsupported approaches are conservatively excluded.'};
}
const matrix=[];
for(const from of entries){
  if(!from.representativeEdge||from.needsConfirmation){for(const to of entries)if(to.id!==from.id)matrix.push({from:from.id,to:to.id,status:'not-evaluated-missing-data-or-identity',route:null});continue;}
  const tree=buildRouteTree(graph,from.representativeEdge,false,primary);
  for(const to of entries){if(to.id===from.id)continue;const route=to.representativeEdge&&!to.needsConfirmation?tree.routeTo(to.representativeEdge):null;
    matrix.push({from:from.id,to:to.id,status:!to.representativeEdge||to.needsConfirmation?'not-evaluated-missing-data-or-identity':route?'reachable-with-uncertain-restrictions':'not-reachable-in-available-graph',route:describeRoute(route)});
  }
  console.log(`Directed matrix row ${from.id}: ${from.originalLabel}`);
}

// Record visual line crossings independently of the source-node junction set.
const grid=new Map<string,string[]>(),crossings:any[]=[],tested=new Set<string>();
for(const edge of physical.values()){
  if(!primary.has(edge.id))continue;
  const a=graph.nodes.get(edge.from)!,b=graph.nodes.get(edge.to)!;
  for(let x=Math.floor(Math.min(a.x,b.x)/200);x<=Math.floor(Math.max(a.x,b.x)/200);x++)for(let y=Math.floor(Math.min(a.y,b.y)/200);y<=Math.floor(Math.max(a.y,b.y)/200);y++){
    const key=`${x},${y}`,prior=grid.get(key)??[];
    for(const otherId of prior){const pair=[edge.id,otherId].sort().join('|');if(tested.has(pair))continue;tested.add(pair);const other=graph.edges.get(otherId)!;
      if([edge.from,edge.to].some(id=>[other.from,other.to].includes(id)))continue;
      if((entryByEdge.get(edge.id)??[]).some(id=>(entryByEdge.get(other.id)??[]).includes(id)))continue;
      const c=graph.nodes.get(other.from)!,d=graph.nodes.get(other.to)!;
      const vx=b.x-a.x,vy=b.y-a.y,wx=d.x-c.x,wy=d.y-c.y,det=vx*wy-vy*wx;if(Math.abs(det)<1e-8)continue;
      const t=((c.x-a.x)*wy-(c.y-a.y)*wx)/det,u=((c.x-a.x)*vy-(c.y-a.y)*vx)/det;
      if(t<=0||t>=1||u<=0||u>=1)continue;
      const first=wayMap.get(edge.wayId)!,second=wayMap.get(other.wayId)!;
      crossings.push({edgeIds:[edge.id,other.id],sourceWayIds:[edge.wayId,other.wayId],entryIds:[entryByEdge.get(edge.id),entryByEdge.get(other.id)],position:[a.position[0]+t*(b.position[0]-a.position[0]),a.position[1]+t*(b.position[1]-a.position[1])],sourceTags:[first.tags,second.tags].map(tags=>({bridge:tags?.bridge,tunnel:tags?.tunnel,layer:tags?.layer})),status:'No common source node: not a drivable intersection. Bridge/tunnel/layer tags supplied where available; exact vertical clearance unverified.'});
    }
    prior.push(edge.id);grid.set(key,prior);
  }
}

const qualifying=new Map<string,any>();
for(const feature of city.features){const properties=feature.properties;if(!['ART','PWY','MAJ','COL'].includes(properties.ST_CLASS))continue;
  const lines=feature.geometry.type==='LineString'?[feature.geometry.coordinates]:feature.geometry.coordinates;
  if(!lines.some((line:LonLat[])=>line.slice(1).some((p,index)=>{const membership=classifySegmentZones(line[index],p,zones);return membership.zoneIds.includes('zone1')||membership.uncertainZoneIds.includes('zone1');})))continue;
  const key=canonicalRoadName(properties.ST_NAME??'');if(!key)continue;
  const item=qualifying.get(key)??{name:properties.ST_NAME,cityClasses:[],cityObjectIds:[],osmWayIds:[],inZoneMetres:0,role:'evaluated collector/background'};
  item.cityClasses=[...new Set([...item.cityClasses,properties.ST_CLASS])];item.cityObjectIds.push(properties.OBJECTID);
  if(['ART','PWY','MAJ'].includes(properties.ST_CLASS))item.role='official major corridor';
  qualifying.set(key,item);
}
for(const edge of physical.values()){
  const segment=coverage.byEdge.get(edge.id);if(!segment?.zoneIds.includes('zone1')&&!segment?.uncertainZoneIds.includes('zone1'))continue;
  const key=canonicalRoadName(edge.name);if(!key)continue;
  let item=qualifying.get(key);
  if(!item&&/^(primary|secondary|tertiary)(_link)?$/.test(edge.highway)){item={name:edge.name,cityClasses:[],cityObjectIds:[],osmWayIds:[],inZoneMetres:0,role:'OSM through-road class; City major designation unconfirmed'};qualifying.set(key,item);}
  if(item){item.osmWayIds.push(edge.wayId);const a=graph.nodes.get(edge.from)!.position,b=graph.nodes.get(edge.to)!.position;const midpoint:LonLat=[(a[0]+b[0])/2,(a[1]+b[1])/2];if(pointZoneMembership(midpoint,zones.zones.find(zone=>zone.id==='zone1')!,0)==='inside')item.inZoneMetres+=edge.length;}
}
const zone1Inventory=[...qualifying.values()].map(item=>({...item,osmWayIds:[...new Set(item.osmWayIds)],inZoneMetres:Math.round(item.inZoneMetres),coverage:item.osmWayIds.length?'Source segments found; current road/traffic completeness unverified.':'Official City corridor found without matching usable OSM source geometry.',curriculumTarget:entries.some(entry=>entry.names.some(name=>canonicalRoadName(name)===canonicalRoadName(item.name)))})).sort((a,b)=>a.name.localeCompare(b.name));
const candidates=['Stevenson Boulevard','Fremont Boulevard','Paseo Padre Parkway','Mowry Avenue','Walnut Avenue','Mission Boulevard','Peralta Boulevard','Niles Boulevard','Thornton Avenue','Driscoll Road','Central Avenue','Blacow Road','Grimmer Boulevard','South Grimmer Boulevard','Washington Boulevard','Capitol Avenue','Osgood Road','Decoto Road','Isherwood Way','Auto Mall Parkway'];
const candidateAudit=candidates.map(name=>{const match=zone1Inventory.find(item=>canonicalRoadName(item.name)===canonicalRoadName(name));return {name,inZone1StudyOrBorder:Boolean(match),inventory:match??null,reason:match?match.role:'No intersecting classified City feature or qualifying OSM segment found in the historical Zone 1 study polygon/border band; not added solely from candidate list.'};});
const network:StudyNetwork={version:'personal-38-v1',roadsSha256:createHash('sha256').update(roadsRaw).digest('hex'),boundaryVersion:zones.metadata.boundaryVersion,station:{...POLICE_STATION,edgeId:departure.edgeId,distance:departure.distance,departurePosition:departure.position,note:`Approximate public-road departure on existing Stevenson Boulevard centerline, about ${Math.round(Math.hypot(departure.metric.x-project(POLICE_STATION.position).x,departure.metric.y-project(POLICE_STATION.position).y))} m from the OSM headquarters building reference. Not a verified driveway or parking-space spawn.`},entries,intersections,limitations:['All route results validate the imported directed graph and supported turn rules, not every real-world traffic movement.','Unsupported conditional/via-way approaches are excluded conservatively; missing traffic rules remain unverified.','Lake Arrowhead Avenue and the combined Grimmer/South Grimmer study entry follow explicit user confirmation; original labels remain unchanged.','Bounded road imports preserve earlier objects; they do not establish complete end-to-end road or full-city coverage.','Historical patrol polygons are approximate study boundaries; current adoption unverified.','The 38x38 matrix uses one reproducible directed representative per target; the separate stratified approach samples expose additional inaccessible segments.'],source:{osm:'https://api.openstreetmap.org/api/0.6/map',city:city.metadata.sourceUrl,handwritten:handwritten.source}};
await mkdir('docs/data',{recursive:true});
await writeFile('public/data/study-network.json',JSON.stringify(network)+'\n');
await writeFile('docs/data/study-connectivity.json',JSON.stringify({version:network.version,roadsSha256:network.roadsSha256,representativePolicy:network.limitations.at(-1),matrix},null,2)+'\n');
await writeFile('docs/data/study-intersections.json',JSON.stringify({intersections,unconnectedVisualCrossings:crossings},null,2)+'\n');
await writeFile('docs/data/zone1-road-inventory.json',JSON.stringify({boundaryVersion:network.boundaryVersion,citySource:city.metadata,inventory:zone1Inventory,candidateAudit,lengthMethod:'Approximate unduplicated OSM segment lengths whose midpoints are inside the historical polygon; no exact boundary clipping or lane-distance claim.',note:'Technical inventory only: personalized curriculum remains exactly 38 user entries.'},null,2)+'\n');
const summary={entries:entries.length,ready:entries.filter(entry=>entry.status==='ready').length,needsConfirmation:entries.filter(entry=>entry.needsConfirmation).map(entry=>entry.originalLabel),unavailable:entries.filter(entry=>entry.status!=='ready').map(entry=>({name:entry.originalLabel,status:entry.status,reason:entry.reason})),sourceNodes:graph.nodes.size,directedEdges:graph.edges.size,intersections:intersections.length,unconnectedVisualCrossings:crossings.length,matrixPairs:matrix.length,reachablePairs:matrix.filter(cell=>cell.route).length,approachSamples:entries.reduce((sum,entry)=>sum+entry.approaches.length,0),inaccessibleApproaches:entries.flatMap(entry=>entry.approaches.filter(sample=>!sample.fromHeadquarters||!sample.toHeadquarters).map(sample=>({entry:entry.originalLabel,...sample}))),unsupportedRestrictions:roads.unsupportedRestrictions?.length,zone1OfficialInventory:zone1Inventory.filter(item=>item.role==='official major corridor').length,zone1MissingGeometry:zone1Inventory.filter(item=>item.role==='official major corridor'&&!item.osmWayIds.length).map(item=>item.name)};
await writeFile('docs/data/study-verification.json',JSON.stringify(summary,null,2)+'\n');
await writeFile('docs/study-road-inventory.md',`# Personalized road verification\n\nExactly 21 east–west and 17 north–south user entries. Category names are study groups, not measured bearings.\n\n| Original entry | Mapped names | City classes | Status | HQ / return | Sampled approaches |\n|---|---|---|---|---|---|\n${entries.map(entry=>`| ${entry.originalLabel} | ${entry.mappedNames.join(', ')||'Missing'} | ${entry.cityClasses.join(', ')} | ${entry.status} | ${entry.fromHeadquarters?'yes':'no'} / ${entry.toHeadquarters?'yes':'no'} | ${entry.approaches.filter(sample=>sample.fromHeadquarters&&sample.toHeadquarters).length}/${entry.approaches.length} |`).join('\n')}\n\n${network.limitations.map(note=>'- '+note).join('\n')}\n\nMachine-readable details: [runtime inventory](../public/data/study-network.json), [intersection inventory](data/study-intersections.json), [directed matrix](data/study-connectivity.json), [verification summary](data/study-verification.json), and [Zone 1 technical inventory](data/zone1-road-inventory.json).\n\nCity classifications are independent City GIS attributes; they are not inferred from OSM highway classes. The City source is credited and its supplied metadata has no explicit reuse license.\n`);
console.log(JSON.stringify({...summary,inaccessibleApproaches:summary.inaccessibleApproaches.length}));
