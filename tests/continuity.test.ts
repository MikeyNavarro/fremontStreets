import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGraph,createVehicle,excludedRestrictionWays,legalOutgoing,selectNextEdge,stepVehicle,unproject} from '../src/core';
import type {RoadData} from '../src/core';
import {roadPresentation} from '../src/views/roads';

// Synthetic topology only for safety tests; never shipped as Fremont data.
function fixture():RoadData{return {nodes:{a:unproject({x:0,y:0}),b:unproject({x:0,y:30}),c:unproject({x:10,y:30}),d:unproject({x:0,y:80})},ways:[{id:'approach',nodes:['a','b'],highway:'primary',oneway:'yes'},{id:'via',nodes:['b','c'],highway:'primary',oneway:'yes'},{id:'return',nodes:['c','a'],highway:'primary',oneway:'yes'},{id:'through',nodes:['b','d'],highway:'primary',oneway:'yes'}],unsupportedRestrictions:[{id:'rule',fromWay:'approach',viaWays:['via'],toWay:'return',restriction:'no_u_turn'}]};}

test('a blocked unsupported no-turn via preserves the actual approach and through road',()=>{
 const data=fixture(),graph=buildGraph(data);assert.deepEqual([...excludedRestrictionWays(data)],['via']);
 assert.ok(graph.edges.has('approach:0:f'));assert.ok(!graph.edges.has('via:0:f'));
 const incoming=graph.edges.get('approach:0:f')!;assert.deepEqual(legalOutgoing(graph,incoming).map(edge=>edge.id),['through:0:f']);
 let vehicle=createVehicle(graph,incoming.id,incoming.length-2);vehicle=stepVehicle(graph,vehicle,{throttle:true,brake:false},2);
 assert.equal(vehicle.edgeId,'through:0:f');assert.equal(vehicle.previousEdgeId,incoming.id);assert.ok(vehicle.totalDistance>8);
});

test('only-turn, conditional, vehicle-specific only-turn and incomplete rules still block the approach',()=>{
 const variants=[{restriction:'only_straight_on'},{tags:{'restriction:conditional':'no_u_turn @ (Mo-Fr)'}},{tags:{'restriction:motorcar':'only_right_turn'}},{tags:{'restriction:motor_vehicle':'only_right_turn'}},{toWay:undefined},{viaWays:[]}];
 for(const variant of variants){const data=fixture();Object.assign(data.unsupportedRestrictions![0],variant);const graph=buildGraph(data);assert.equal(graph.edges.has('approach:0:f'),false,JSON.stringify(variant));}
 const data=fixture();data.unsupportedRestrictions!.push({...data.unsupportedRestrictions![0],id:'second',restriction:'only_straight_on'});assert.equal(buildGraph(data).edges.has('approach:0:f'),false);
});

const data=JSON.parse(readFileSync(new URL('../public/data/roads.json',import.meta.url),'utf8')) as RoadData;
const graph=buildGraph(data);
test('the three reported-source Stevenson false stops continue over shared OSM nodes',()=>{
 for(const id of ['417617996:3:f','1104357052:0:f','417102045:0:f']){
  const incoming=graph.edges.get(id)!,next=selectNextEdge(graph,incoming,null).edge;assert.ok(next,id);assert.equal(next.name,'Stevenson Boulevard');assert.equal(next.from,incoming.to);
  const start=createVehicle(graph,id,incoming.length-2),vehicle=stepVehicle(graph,start,{throttle:true,brake:false},2,{cornerAssist:true});
  assert.notEqual(vehicle.edgeId,id);assert.ok(vehicle.totalDistance>8);assert.ok(vehicle.speed>0);assert.equal(graph.edges.get(vehicle.edgeId)!.name,'Stevenson Boulevard');
 }
 for(const id of ['417095793','417403349','417403359','392688397','394433090','417103306'])assert.ok([...graph.edges.values()].some(edge=>edge.wayId===id),id);
 assert.equal([...graph.edges.values()].some(edge=>edge.wayId==='37784280'),false,'Unsupported no-U-turn connector stays blocked.');
});

test('map availability follows the graph and preserves original OSM geometry instead of study colors',()=>{
 const features=roadPresentation(data,graph).features,byId=new Map(features.map(feature=>[feature.properties!.wayId,feature]));
 for(const id of ['417403349','417403359','37784280']){const feature=byId.get(id)!,way=data.ways.find(way=>String(way.id)===id)!;assert.deepEqual(feature.geometry.coordinates,way.nodes.map(node=>data.nodes[String(node)]));assert.equal(feature.properties!.playable,id!=='37784280');}
 const playable=new Set([...graph.edges.values()].map(edge=>edge.wayId));for(const feature of features)assert.equal(feature.properties!.playable,playable.has(feature.properties!.wayId));
});
