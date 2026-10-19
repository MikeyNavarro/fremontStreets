import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {advanceSpeed,buildGraph,buildRouteTree,createVehicle,drivableOutgoing,isValidRoute,MPH_TO_MPS,project,setCamera,createGameState,stepVehicle} from '../src/core';
import type {RoadData,Route} from '../src/core';
import {stationDeparture,POLICE_STATION,loadPracticeZone,rememberPracticeZone,PRACTICE_ZONE_KEY} from '../src/departure';
import {PatrolStudy} from '../src/patrol';
import {canonicalRoadName,loadStudyProgress,randomStudyEntry,studyArrival,saveStudyProgress} from '../src/study-network';
import type {StudyNetwork,StudyMission} from '../src/study-network';
// @ts-expect-error The existing dependency-free import tool is JavaScript.
import {contentDigest} from '../scripts/extend-roads.mjs';

const json=(file:string)=>JSON.parse(readFileSync(new URL(`../${file}`,import.meta.url),'utf8'));
const raw=readFileSync(new URL('../public/data/roads.json',import.meta.url),'utf8');
const roads=JSON.parse(raw) as RoadData,network=json('public/data/study-network.json') as StudyNetwork;
const graph=buildGraph(roads),station=stationDeparture(graph);

test('exactly 38 original study entries retain the 21/17 groups without unrelated targets',()=>{
  const original=json('data-sources/study-entries.json').entries;
  assert.equal(network.entries.length,38);assert.equal(new Set(network.entries.map(entry=>entry.id)).size,38);
  assert.equal(network.entries.filter(entry=>entry.group==='ew').length,21);assert.equal(network.entries.filter(entry=>entry.group==='ns').length,17);
  assert.deepEqual(network.entries.map(entry=>entry.originalLabel),original.map((entry:any)=>entry.originalLabel));
  assert.equal(network.roadsSha256,createHash('sha256').update(raw).digest('hex'),'Reports must match the shipped geographic dataset.');
  assert.equal(canonicalRoadName('Alvarado-Niles Road'),canonicalRoadName('Alvarado Niles Rd'));
  assert.equal(canonicalRoadName('Paseo Padre Parkway'),canonicalRoadName('Paseo Padre Pkwy'));
  assert.notEqual(canonicalRoadName('Lake Arrowhead Avenue'),canonicalRoadName('Lake Arrowhead Court'));
});

test('confirmed Avenue and combined Grimmer preserve 38 targets; unresolved fixtures never enter random challenges',()=>{
  const lake=network.entries.find(entry=>entry.id==='ew01')!;assert.equal(lake.status,'ready');assert.deepEqual(lake.names,['Lake Arrowhead Avenue']);assert.match(lake.note!,/User confirmed/);
  const grimmer=network.entries.find(entry=>entry.id==='ns08')!;assert.deepEqual(grimmer.names,['Grimmer Boulevard','South Grimmer Boulevard']);assert.match(grimmer.note!,/single original study entry/);
  const unresolved:StudyNetwork={...network,entries:network.entries.map(entry=>entry.id==='ew01'?{...entry,status:'needs-confirmation',needsConfirmation:true,fromHeadquarters:null,toHeadquarters:null}:entry)};for(let i=0;i<100;i++)assert.notEqual(randomStudyEntry(unresolved,()=>i/100)?.id,'ew01');
});

test('headquarters spawn is a stopped, permitted, repeatable public-road position in a two-way reachable component',()=>{
  assert.ok(graph.edges.get(station.edgeId)!.length-station.distance>=19.99,'Spawn leaves time to queue the first turn.');assert.equal(station.speed,0);assert.equal(station.totalDistance,0);assert.deepEqual(station,stationDeparture(graph));
  assert.equal(station.edgeId,network.station.edgeId);assert.equal(station.distance,network.station.distance);assert.deepEqual(station.position,network.station.departurePosition);
  const edge=graph.edges.get(station.edgeId)!;assert.equal(edge.name,'Stevenson Boulevard');assert.equal(station.heading,edge.heading);
  const p=project(POLICE_STATION.position);assert.ok(Math.hypot(p.x-station.metric.x,p.y-station.metric.y)<300);assert.match(network.station.note,/not a verified driveway/i);
  const forward=buildRouteTree(graph,station.edgeId),reverse=buildRouteTree(graph,station.edgeId,true);assert.ok(forward.cost.size>10000&&reverse.cost.size>10000);
  assert.ok([...forward.cost.keys()].filter(id=>reverse.cost.has(id)).length>10000);
  let driven=station;const junctions=new Set<string>();for(let i=0;i<1000;i++){driven=stepVehicle(graph,driven,{throttle:true,brake:false},.1,{maxSpeedMph:35});for(const event of driven.events)if(event.type==='intersection')junctions.add(event.id);}
  assert.ok(driven.totalDistance>600,'Straight-ahead departure must cross real intersections without terminating at a nearby data gap.');
  assert.ok(junctions.size>=2);
});

test('every ready target has genuine headquarters and return routes, independent City identity evidence, and directed approach samples',()=>{
  assert.equal(network.entries.filter(entry=>entry.status==='ready').length,38);
  for(const entry of network.entries){
    if(entry.status!=='ready')continue;
    assert.ok(entry.cityObjectIds.length>0);assert.ok(entry.sourceWayIds.length>0);assert.ok(entry.approaches.length>=2);
    assert.ok(isValidRoute(graph,entry.fromHeadquarters!.edgeIds));assert.ok(isValidRoute(graph,entry.toHeadquarters!.edgeIds));
    assert.equal(entry.fromHeadquarters!.edgeIds[0],station.edgeId);assert.equal(entry.toHeadquarters!.edgeIds.at(-1),station.edgeId);
    assert.ok(entry.edgeIds.includes(entry.fromHeadquarters!.edgeIds.at(-1)!));
    for(const approach of entry.approaches)assert.ok(graph.edges.has(approach.edgeId));
  }
});

test('directed matrix evaluates all ordered pairs and records unresolved entries and inaccessible approaches honestly',()=>{
  const {matrix}=json('docs/data/study-connectivity.json');assert.equal(matrix.length,38*37);assert.equal(new Set(matrix.map((cell:any)=>`${cell.from}/${cell.to}`)).size,matrix.length);
  assert.equal(matrix.filter((cell:any)=>cell.route).length,38*37);
  for(const cell of matrix){
    assert.equal(cell.status,'reachable-with-uncertain-restrictions');assert.ok(cell.route.lengthMetres>0);
    assert.ok(graph.edges.has(cell.route.sourceEdge));assert.ok(graph.edges.has(cell.route.destinationEdge));
    assert.ok(matrix.some((reverse:any)=>reverse.from===cell.to&&reverse.to===cell.from&&reverse.route));
  }
  const summary=json('docs/data/study-verification.json');assert.ok(summary.inaccessibleApproaches.length>0);assert.equal(summary.matrixPairs,matrix.length);
});

test('source-node intersections, logical groups, and grade-separated visual crossings never add shortcut edges',()=>{
  const before=graph.edges.size;
  for(const junction of network.intersections){
    assert.deepEqual(junction.position,graph.nodes.get(junction.nodeId)!.position);assert.ok(junction.entryIds.length>=2);
    for(const movement of junction.movements){const incoming=graph.edges.get(movement.incoming)!;assert.equal(incoming.to,junction.nodeId);assert.deepEqual(movement.outgoing,drivableOutgoing(graph,incoming).map(edge=>edge.id));for(const id of movement.outgoing)assert.equal(graph.edges.get(id)!.from,junction.nodeId);}
  }
  const crossings=json('docs/data/study-intersections.json').unconnectedVisualCrossings;assert.ok(crossings.length>0);
  for(const crossing of crossings){const [a,b]=crossing.edgeIds.map((id:string)=>graph.edges.get(id)!);assert.equal([a.from,a.to].some(id=>[b.from,b.to].includes(id)),false);}
  assert.equal(graph.edges.size,before);
});

test('freeway targets match source route references, enter through real ramps, and preserve one-way carriageways',()=>{
  for(const id of ['ns01','ns02']){
    const entry=network.entries.find(entry=>entry.id===id)!;assert.equal(entry.status,'ready');
    for(const edgeId of entry.edgeIds){const edge=graph.edges.get(edgeId)!;assert.equal(edge.highway,'motorway');const reverse=graph.edges.get(edgeId.replace(/:[fr]$/,edgeId.endsWith(':f')?':r':':f'));assert.equal(reverse,undefined);}
    const route=entry.fromHeadquarters!;assert.ok(route.edgeIds.some(edgeId=>graph.edges.get(edgeId)!.highway==='motorway_link'));
    assert.ok(isValidRoute(graph,route.edgeIds));
  }
});

test('all prior source objects, zones, and road coverage remain intact after the bounded imports',()=>{
  const snapshot=roads.metadata!.baseSnapshot as any,extensions=roads.metadata!.extensions as any[];
  const baseline=extensions[0];
  const nodeIds=[...snapshot.nodeIds,...baseline.addedIds.nodes],wayIds=new Set([...snapshot.wayIds,...baseline.addedIds.ways]);
  const restrictionIds=new Set([...snapshot.restrictionIds,...baseline.addedIds.restrictions]);const unsupportedIds=new Set([...snapshot.unsupportedRestrictionIds,...baseline.addedIds.unsupportedRestrictions]);
  const expected=json('data-sources/preserved-road-digests.json');
  assert.equal(nodeIds.length,19523);assert.equal(wayIds.size,5839);
  assert.equal(contentDigest(Object.fromEntries(nodeIds.map(id=>[id,roads.nodes[id]]))),expected.nodes);
  assert.equal(contentDigest(roads.ways.filter(way=>wayIds.has(String(way.id)))),expected.ways);
  assert.equal(contentDigest(roads.restrictions!.filter(rule=>restrictionIds.has(String(rule.id)))),expected.restrictions);
  assert.equal(contentDigest(roads.unsupportedRestrictions!.filter(rule=>unsupportedIds.has(String(rule.id)))),expected.unsupportedRestrictions);
  assert.equal(new Set(roads.ways.map(way=>String(way.id))).size,roads.ways.length);
  const zones=json('public/data/zones.json');assert.equal(zones.zones.length,3);
});

test('Zone 1 is the default and remembered practice selection never overwrites saved learning data',()=>{
  const store=new Map<string,string>(),storage={getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>{store.set(key,value);}};
  const study=new PatrolStudy(graph,json('public/data/zones.json'));
  assert.equal(loadPracticeZone(storage,study),'zone1');rememberPracticeZone(storage,'zone3');assert.equal(loadPracticeZone(storage,study),'zone3');
  rememberPracticeZone(storage,'all');assert.equal(store.get(PRACTICE_ZONE_KEY),'zone3');store.set(PRACTICE_ZONE_KEY,'bad-zone');assert.equal(loadPracticeZone(storage,study),'zone1');
});

test('arrivals accept a different legal route but cannot be triggered from an overpass or a stationary start',()=>{
  const target=network.entries.find(entry=>entry.id==='ns04')!;const route=target.fromHeadquarters!;
  const mission:StudyMission={exercise:'reach',targetId:target.id,guided:false,startedDistance:0,goal:{kind:'road',edgeIds:[target.representativeEdge!]},status:'active',route};
  assert.equal(studyArrival(mission,station),false);
  const arrived={...createVehicle(graph,target.representativeEdge!),totalDistance:200};
  assert.equal(studyArrival(mission,arrived),true);
  assert.equal(studyArrival(mission,{...station,totalDistance:200}),false);
  const home:StudyMission={...mission,exercise:'return',goal:{kind:'headquarters',edgeId:station.edgeId,distance:station.distance}};
  assert.equal(studyArrival(home,{...station,totalDistance:1000}),true);
  assert.equal(studyArrival(home,{...station,distance:0,totalDistance:1000}),station.distance===0);
  const junction=network.intersections[0],movement=junction.movements.find(item=>item.outgoing.length)!;
  const intersection:StudyMission={...mission,exercise:'intersection',goal:{kind:'intersection',nodeId:junction.nodeId,incomingEdgeId:movement.incoming,outgoingEdgeIds:movement.outgoing}};
  const crossing={...createVehicle(graph,movement.outgoing[0]),totalDistance:100,events:[{type:'node' as const,id:junction.nodeId,edgeId:movement.incoming}]};
  assert.equal(studyArrival(intersection,crossing),true);assert.equal(studyArrival(intersection,{...crossing,events:[]}),false);
});

test('100 mph stepping consumes every connected segment, brakes immediately, and keeps both cameras invariant',()=>{
  const edge=graph.edges.get(station.edgeId)!,initial={...station,speed:100*MPH_TO_MPS};
  const one=stepVehicle(graph,initial,{throttle:true,brake:false},1,{maxSpeedMph:100,cornerAssist:false});
  let many=initial;for(let i=0;i<100;i++)many=stepVehicle(graph,many,{throttle:true,brake:false},.01,{maxSpeedMph:100,cornerAssist:false});
  assert.equal(one.edgeId,many.edgeId);assert.ok(Math.abs(one.totalDistance-many.totalDistance)<1e-5);
  assert.ok(one.totalDistance>40);assert.notEqual(one.edgeId,initial.edgeId);assert.ok(graph.edges.has(one.edgeId));
  assert.ok(advanceSpeed(100*MPH_TO_MPS,{throttle:true,brake:true},.01)<100*MPH_TO_MPS);
  const game=createGameState(initial,'zone1');assert.equal(setCamera(game,'driver').vehicle,initial);assert.equal(setCamera(game,'overhead').vehicle,initial);
  assert.equal(edge.heading,initial.heading);
});

test('personal progress survives reload independently of exploration and malformed data cannot crash startup',()=>{
  const map=new Map<string,string>(),storage={getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value);}};
  const progress=loadStudyProgress(storage);progress.entries.ew13={visits:2,guided:1,unguided:0,roadToRoad:0,returns:0,identified:1,repetitions:1};
  assert.equal(saveStudyProgress(storage,progress),true);assert.deepEqual(loadStudyProgress(storage),progress);
  assert.deepEqual(loadStudyProgress({getItem:()=>'{damaged'}),{version:1,entries:{},intersections:{}});
});

test('City pagination, the complete Zone 1 source audit, and in-zone training locations remain traceable',()=>{
  const city=json('data-sources/city-streets-full.geojson');assert.equal(city.metadata.pages.reduce((sum:number,page:any)=>sum+page.count,0),city.features.length);assert.ok(city.metadata.pages.length>1);assert.ok(city.metadata.pages.at(-1).count<1000);assert.equal(new Set(city.features.map((feature:any)=>feature.properties.OBJECTID)).size,city.features.length);
  const inventory=json('docs/data/zone1-road-inventory.json').inventory;
  assert.ok(inventory.filter((row:any)=>row.role==='official major corridor').length>=20);
  for(const row of inventory.filter((row:any)=>row.role==='official major corridor')){assert.ok(row.osmWayIds.length>0);assert.ok(row.cityObjectIds.every((id:number)=>city.features.some((feature:any)=>feature.properties.OBJECTID===id)));}
  const study=new PatrolStudy(graph,json('public/data/zones.json'));
  const selected=network.entries.filter(entry=>entry.zone1Location);assert.ok(selected.length>5&&selected.length<38);
  for(const entry of selected){const place=entry.zone1Location!,edge=graph.edges.get(place.representativeEdge)!;assert.ok(study.contains(graph.nodes.get(edge.from)!.position,'zone1'));assert.ok(study.contains(graph.nodes.get(edge.to)!.position,'zone1'));assert.ok(isValidRoute(graph,place.fromHeadquarters.edgeIds));assert.ok(isValidRoute(graph,place.toHeadquarters.edgeIds));}
});
