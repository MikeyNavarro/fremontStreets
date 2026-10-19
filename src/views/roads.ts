import type {FeatureCollection,LineString} from 'geojson';
import {excludedRestrictionWays} from '../core/graph';
import type {RoadData,RoadGraph} from '../core/types';

/** Preserve source geometry; distinguish visible roads from the playable graph. */
export function roadPresentation(data:RoadData,graph:RoadGraph):FeatureCollection<LineString>{
  const playable=new Set([...graph.edges.values()].map(edge=>edge.wayId));
  const restricted=excludedRestrictionWays(data);
  return {type:'FeatureCollection',features:data.ways.filter(way=>way.nodes.every(id=>data.nodes[String(id)])).map(way=>({
    type:'Feature',properties:{wayId:String(way.id),name:way.name??way.tags?.name??'',highway:way.highway??way.tags?.highway??'',playable:playable.has(String(way.id)),unavailableReason:playable.has(String(way.id))?'':restricted.has(String(way.id))?'Unsupported turn restriction':'Not in the supported driving graph'},
    geometry:{type:'LineString',coordinates:way.nodes.map(id=>data.nodes[String(id)])},
  }))};
}
