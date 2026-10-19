import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateStyleMin, createExpression} from '@maplibre/maplibre-gl-style-spec';
import {roadLabelLayers, ROAD_LABEL_SOURCE} from '../src/views/road-label-style';

test('native road label style validates against the installed MapLibre specification without a glyph service',()=>{
  const layers=roadLabelLayers();
  const errors=validateStyleMin({version:8,sources:{[ROAD_LABEL_SOURCE]:{type:'geojson',data:{type:'FeatureCollection',features:[]}}},layers});
  assert.deepEqual(errors,[]);
  for(const layer of layers){
    assert.equal(layer.layout?.['symbol-placement'],'line');
    assert.equal(layer.layout?.['text-keep-upright'],true);
    assert.equal(layer.layout?.['text-allow-overlap'],false);
  }
});

test('label tiers are disjoint and keep study roads and selected roads eligible at city scale',()=>{
  const layers=roadLabelLayers();
  const compiled=layers.map((layer,index)=>{
    const expression=createExpression(layer.filter,`layers[${index}].filter`);
    assert.equal(expression.result,'success');
    if(expression.result!=='success')throw new Error('Invalid layer filter');
    return expression.value;
  });
  for(const zoom of [10,11,12,13,15,19])for(const highway of ['motorway','motorway_link','primary','primary_link','secondary','tertiary','residential','service']){
    for(let priority=0;priority<=5;priority++){
      const matches=compiled.map((expression,index)=>zoom>=(layers[index].minzoom??0)&&zoom<(layers[index].maxzoom??24)&&expression.evaluate({zoom},{type:2,properties:{highway,priority}}));
      const eligible=priority<=2||zoom>=14.5||priority<5&&(zoom>=12||priority===4&&['motorway','primary'].includes(highway));
      assert.equal(matches.filter(Boolean).length,eligible?1:0,`${highway}/${priority} at ${zoom} must render in exactly one eligible tier`);
      if(!eligible)continue;
      const tier=layers[matches.findIndex(Boolean)];
      if(priority<=2&&zoom<12)assert.equal(tier.minzoom,10,'selected, current and curriculum roads remain available from zoom 10');
      if(priority===3)assert.equal(tier.id,'road-label-connector','needed connectors retain their higher collision priority');
    }
  }
  const layerIndex=(highway:string,priority:number)=>compiled.findIndex((expression,index)=>15>=(layers[index].minzoom??0)&&15<(layers[index].maxzoom??24)&&expression.evaluate({zoom:15},{type:2,properties:{highway,priority}}));
  assert.ok(layerIndex('residential',3)>layerIndex('primary',4),'essential connectors place before background arterials across layers');
  assert.ok(layerIndex('residential',2)>layerIndex('primary',3),'study roads place before route connectors');
  assert.ok(layerIndex('primary',1)>layerIndex('primary',2),'current and selected roads place before other study roads');
});
