import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Map as LibreMap} from 'maplibre-gl';
import {prepareRoadLabels} from '../src/views/road-label-geometry';
import {RoadLabels} from '../src/views/road-labels';
import {roadLabelLayers} from '../src/views/road-label-style';

function fixture(){
  const prepared=prepareRoadLabels({nodes:{a:[-121.99,37.54],b:[-121.98,37.54],c:[-121.97,37.54],d:[-121.96,37.54]},ways:[
    {id:'current',name:'Current source road',highway:'primary',nodes:['a','b']},
    {id:'connector',name:'Source connector',highway:'residential',nodes:['b','c']},
    {id:'destination',name:'Source destination',highway:'secondary',nodes:['c','d']},
  ]},[{id:'study',sourceWayIds:['destination']}]);
  const layouts=new Map(roadLabelLayers().map(layer=>[layer.id,{...layer.layout}]));
  let updates=0;
  const map={
    setLayoutProperty:(id:string,key:string,value:unknown)=>Object.assign(layouts.get(id)!,{[key]:value}),
    getLayoutProperty:(id:string,key:string)=>(layouts.get(id) as Record<string,unknown>)[key],
    getLayer:(id:string)=>roadLabelLayers().find(layer=>layer.id===id),
    getSource:()=>({updateData:()=>{updates++;}}),
  } as unknown as LibreMap;
  const labels=new RoadLabels(map,prepared);
  const priority=(way:string)=>prepared.byId.get(prepared.byWayId.get(way)![0])!.feature.properties.priority;
  return {labels,priority,updates:()=>updates};
}

test('guided destination outranks current road and connectors, while guidance removal restores ordinary priorities',()=>{
  const {labels,priority,updates}=fixture();
  labels.loaded();labels.setCurrentRoad('current');labels.setRoute(['current','connector','destination']);
  assert.equal(priority('destination'),0);
  assert.equal(priority('current'),1);
  assert.equal(priority('connector'),3);
  const count=updates();
  for(let frame=0;frame<60;frame++)labels.setCurrentRoad('current');
  assert.equal(updates(),count,'unchanged driving does not retile label priorities');
  labels.setRoute([]);
  assert.equal(priority('destination'),2);
  assert.equal(priority('connector'),5);
});

test('hidden labels remain hidden through camera suspension and priority changes, including initial loading',()=>{
  const {labels,priority}=fixture();
  labels.setVisible(false);labels.loaded();labels.setActive(false);
  labels.setRoute(['current','connector','destination']);
  assert.equal(priority('destination'),2,'inactive overhead defers needless source updates');
  labels.setActive(true);
  assert.equal(priority('destination'),0);
  assert.ok(labels.presentation().layers.every(layer=>layer.visibility==='none'));
  labels.setVisible(true);
  assert.ok(labels.presentation().layers.every(layer=>layer.visibility==='visible'));
  assert.equal(labels.presentation().geometryBuilds,1);
});
