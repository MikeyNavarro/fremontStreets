import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildGraph,createVehicle,legalOutgoing,selectNextEdge,stepVehicle} from '../src/core';
import type {RoadData} from '../src/core';

const raw=readFileSync(new URL('../public/data/roads.json',import.meta.url),'utf8');
const data=JSON.parse(raw) as RoadData;
const blockedBefore=new Set([...(data.restrictions??[]).filter(rule=>rule.viaNode===undefined),...(data.unsupportedRestrictions??[])].flatMap(rule=>[...(rule.viaWays??[]),...(rule.fromWay===undefined?[]:[rule.fromWay])].map(String)));
const before=buildGraph({...data,ways:data.ways.filter(way=>!blockedBefore.has(String(way.id)))}),after=buildGraph(data);
const beforeWays=new Set([...before.edges.values()].map(edge=>edge.wayId)),afterWays=new Set([...after.edges.values()].map(edge=>edge.wayId));
const rows=['417617996:3:f','1104357052:0:f','417102045:0:f'].map(id=>{
 const incoming=after.edges.get(id)!,next=selectNextEdge(after,incoming,null).edge;
 const vehicle=stepVehicle(after,createVehicle(after,id,incoming.length-2),{throttle:true,brake:false},2,{cornerAssist:true});
 if(!next||next.from!==incoming.to||next.name!=='Stevenson Boulevard'||vehicle.edgeId===id)throw Error('Stevenson continuity audit failed: '+id);
 return {incomingEdge:id,nodeId:incoming.to,position:after.nodes.get(incoming.to)!.position,previousOutgoing:legalOutgoing(before,before.edges.get(id)!).map(edge=>edge.id),currentOutgoing:legalOutgoing(after,incoming).map(edge=>edge.id),defaultContinuation:next.id,simulatedTwoSecondDrive:{edgeId:vehicle.edgeId,distanceMetres:vehicle.totalDistance,speedMps:vehicle.speed},sourceWays:[incoming.wayId,next.wayId].map(way=>`https://www.openstreetmap.org/way/${way}`)};
});
const report={routingPolicy:'prohibited-via-blocked-approach-retained-v2',roadsSha256:createHash('sha256').update(raw).digest('hex'),oldDirectedEdges:before.edges.size,currentDirectedEdges:after.edges.size,restoredSourceDirectedEdges:[...after.edges.keys()].filter(id=>!before.edges.has(id)).length,removedPreviouslySupportedEdges:[...before.edges.keys()].filter(id=>!after.edges.has(id)),restoredStevensonWays:data.ways.filter(way=>(way.name??way.tags?.name)==='Stevenson Boulevard'&&!beforeWays.has(String(way.id))&&afterWays.has(String(way.id))).map(way=>String(way.id)),repairedFalseStops:rows,limits:['Prohibited via-way connectors remain excluded; no complete history-based via-way movement support is claimed.','Only-turn, conditional and incomplete approaches remain conservatively excluded.','Unknown traffic rules, complete corridor coverage and current official patrol-zone adoption remain unverified.']};
writeFileSync(new URL('../docs/data/stevenson-continuity.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
