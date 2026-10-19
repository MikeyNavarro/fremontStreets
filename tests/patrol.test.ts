import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PatrolStudy } from '../src/patrol';
import { buildGraph, createVehicle, createProgress } from '../src/core';
import type { RoadData } from '../src/core';
import type { ZoneDocument } from '../src/core/zones';

const roads=JSON.parse(readFileSync(new URL('../public/data/roads.json',import.meta.url),'utf8')) as RoadData;
const zones=JSON.parse(readFileSync(new URL('../public/data/zones.json',import.meta.url),'utf8')) as ZoneDocument;
const graph=buildGraph(roads);
const study=new PatrolStudy(graph,zones);
const defaultEdge=graph.edges.keys().next().value!;

test('actual covered study areas start practice on an unchanged, safely interior source road',()=>{
  const before=JSON.stringify([...graph.edges]);
  assert.equal(study.startEdge('all',defaultEdge),defaultEdge);
  for(const zone of zones.zones){
    const start=study.startEdge(zone.id,defaultEdge);
    if(!study.coverage.zones[zone.id].available){assert.equal(start,null);continue;}
    assert.ok(start);const vehicle=createVehicle(graph,start);
    assert.ok(study.contains(vehicle.position,zone.id));
    assert.ok(study.names(zone.id).includes(graph.edges.get(start)!.name));
  }
  assert.equal(JSON.stringify([...graph.edges]),before);
});

test('actual zone exploration updates its location and citywide records without overwriting another area',()=>{
  const edge=study.startEdge('zone2',defaultEdge)!;
  const vehicle=createVehicle(graph,edge);
  const initial=createProgress();
  const recorded=study.record(initial,vehicle);
  assert.ok(recorded.zones.zone2.streetNames.includes(graph.edges.get(edge)!.name));
  assert.ok(recorded.zones.all.streetNames.includes(graph.edges.get(edge)!.name));
  assert.equal(recorded.zones.zone1,undefined);
  assert.equal(initial.zones.zone2,undefined);
  assert.ok(recorded.zones.all.quizTotal===0&&recorded.zones.all.challengesCompleted===0);
});

test('actual cross-zone street collections retain their original shared names and segment geometry',()=>{
  const central=new Set(study.names('zone1'));
  const shared=study.names('zone2').filter(name=>central.has(name));
  assert.ok(shared.length>2,'Real streets can belong to more than one learning collection');
  for(const name of shared)assert.ok(roads.ways.some(way=>(way.name??way.tags?.name)===name));
  for(const segment of study.coverage.segments.values())for(const edgeId of segment.edgeIds){
    const edge=graph.edges.get(edgeId)!;
    assert.deepEqual(graph.nodes.get(edge.from)!.position,roads.nodes[edge.from]);
    assert.deepEqual(graph.nodes.get(edge.to)!.position,roads.nodes[edge.to]);
  }
});
