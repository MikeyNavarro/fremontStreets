import type {ExpressionSpecification, FilterSpecification, SymbolLayerSpecification} from 'maplibre-gl';

export const ROAD_LABEL_SOURCE='road-labels';
export const ROAD_LABEL_LAYERS=['road-label-local','road-label-secondary','road-label-major-wide','road-label-major','road-label-connector','road-label-study-wide','road-label-study','road-label-active-wide','road-label-active'] as const;

const wideRoad:ExpressionSpecification=['in',['get','highway'],['literal',['motorway','trunk','primary']]];

/** Native line placement receives the complete source-backed coordinates and
 * uses MapLibre's ordinary subpixel display tessellation, like the road layer.
 * No glyph endpoint is needed: MapLibre >=5.11 rasterizes local fonts itself.
 * More important layers are last, so collision placement gives them precedence.
 */
export function roadLabelLayers():SymbolLayerSpecification[]{
  const specs:Array<{id:typeof ROAD_LABEL_LAYERS[number];minzoom:number;maxzoom?:number;filter:ExpressionSpecification}>=
    [{id:'road-label-local',minzoom:14.5,filter:['>=',['get','priority'],5]},
      {id:'road-label-secondary',minzoom:12,filter:['all',['==',['get','priority'],4],['!',wideRoad]]},
      {id:'road-label-major-wide',minzoom:10,maxzoom:12,filter:['all',['==',['get','priority'],4],wideRoad]},
      {id:'road-label-major',minzoom:12,filter:['all',['==',['get','priority'],4],wideRoad]},
      {id:'road-label-connector',minzoom:12,filter:['==',['get','priority'],3]},
      {id:'road-label-study-wide',minzoom:10,maxzoom:12,filter:['==',['get','priority'],2]},
      {id:'road-label-study',minzoom:12,filter:['==',['get','priority'],2]},
      {id:'road-label-active-wide',minzoom:10,maxzoom:12,filter:['<=',['get','priority'],1]},
      {id:'road-label-active',minzoom:12,filter:['<=',['get','priority'],1]}];
  return specs.map(({id,minzoom,maxzoom,filter})=>({
    id,type:'symbol',source:ROAD_LABEL_SOURCE,minzoom,...(maxzoom?{maxzoom}:{}),filter:filter as FilterSpecification,
    layout:{
      'symbol-placement':'line',
      'symbol-spacing':maxzoom?140:['interpolate',['linear'],['zoom'],12,440,14,360,17,300,20,280],
      'symbol-sort-key':['get','priority'],
      'symbol-z-order':'auto',
      'text-field':['get',maxzoom?'compactLabel':'label'],
      'text-font':['sans-serif'],
      // A separate constant-size wide layer avoids reserving zoom-18 text
      // length in MapLibre's line-anchor calculation at city scale.
      'text-size':maxzoom?11:['interpolate',['linear'],['zoom'],12,12,14,13,17,14,20,15],
      'text-rotation-alignment':'map',
      'text-pitch-alignment':'map',
      'text-keep-upright':true,
      'text-max-angle':maxzoom?60:35,
      'text-letter-spacing':0.015,
      'text-padding':6,
      'text-allow-overlap':false,
      'text-ignore-placement':false,
      'text-optional':false,
      visibility:'visible',
    },
    paint:{
      'text-color':['case',['<=',['get','priority'],1],'#f3e8cf',['==',['get','priority'],2],'#e2edf3','#bacbd4'],
      'text-halo-color':'#10202b',
      'text-halo-width':1.2,
      'text-halo-blur':0.3,
    },
  }));
}
