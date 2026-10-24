import type {LineString, MultiLineString, Geometry, FeatureCollection} from 'geojson';
import type {LonLat} from '../core/types';
import type {ZoneGeometry} from '../core/zones';
import {project} from '../core/projection';

type Bounds = [number,number,number,number];
interface BoundaryEdge {a:LonLat;b:LonLat;bounds:Bounds}
interface PreparedBoundary {polygons:LonLat[][][];edges:BoundaryEdge[];bounds:Bounds}
const prepared = new WeakMap<ZoneGeometry,PreparedBoundary>();
const EPS = 1e-11;
const cross=(ax:number,ay:number,bx:number,by:number)=>ax*by-ay*bx;
const same=(a:LonLat,b:LonLat)=>Math.abs(a[0]-b[0])<EPS&&Math.abs(a[1]-b[1])<EPS;

export function coordinatesBounds(coordinates:readonly LonLat[]): Bounds|null {
  if(!coordinates.length)return null;
  let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
  for(const p of coordinates){west=Math.min(west,p[0]);south=Math.min(south,p[1]);east=Math.max(east,p[0]);north=Math.max(north,p[1]);}
  return [west,south,east,north];
}
function prepare(geometry:ZoneGeometry):PreparedBoundary {
  const cached=prepared.get(geometry);if(cached)return cached;
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  const edges:BoundaryEdge[]=[];
  for(const polygon of polygons)for(const ring of polygon)for(let i=0;i<ring.length-1;i++)edges.push({a:ring[i],b:ring[i+1],bounds:coordinatesBounds([ring[i],ring[i+1]])!});
  const result={polygons,edges,bounds:coordinatesBounds(polygons.flat(2))!};prepared.set(geometry,result);return result;
}
function withinBounds(p:LonLat,b:Bounds){return p[0]>=b[0]-EPS&&p[0]<=b[2]+EPS&&p[1]>=b[1]-EPS&&p[1]<=b[3]+EPS;}
function onSegment(p:LonLat,a:LonLat,b:LonLat){
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(length<EPS)return same(p,a);
  return Math.abs(cross(p[0]-a[0],p[1]-a[1],dx,dy))/length<EPS&&withinBounds(p,coordinatesBounds([a,b])!);
}
function inRing(point:LonLat,ring:LonLat[]):boolean {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;
}
/** Polygon boundaries count as included. This is an approximate study polygon,
 * not jurisdiction certification. Holes and every MultiPolygon component apply. */
export function pointInZone(point:LonLat,geometry:ZoneGeometry):boolean {
  const zone=prepare(geometry);if(!withinBounds(point,zone.bounds))return false;
  if(zone.edges.some(edge=>withinBounds(point,edge.bounds)&&onSegment(point,edge.a,edge.b)))return true;
  return zone.polygons.some(polygon=>inRing(point,polygon[0])&&!polygon.slice(1).some(hole=>inRing(point,hole)));
}
function overlaps(a:Bounds,b:Bounds){return a[0]<=b[2]+EPS&&a[2]>=b[0]-EPS&&a[1]<=b[3]+EPS&&a[3]>=b[1]-EPS;}
function parameterCuts(a:LonLat,b:LonLat,c:LonLat,d:LonLat):number[]{
  const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1];
  const den=cross(rx,ry,sx,sy),qx=c[0]-a[0],qy=c[1]-a[1];
  const scale=Math.max(Math.hypot(rx,ry)*Math.hypot(sx,sy),1e-30);
  if(Math.abs(den)>scale*1e-12){
    const t=cross(qx,qy,sx,sy)/den,u=cross(qx,qy,rx,ry)/den;
    return t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS?[Math.max(0,Math.min(1,t))]:[];
  }
  // Collinear boundary portions need their overlap endpoints as cuts too.
  const len2=rx*rx+ry*ry;if(len2<1e-30||Math.abs(cross(qx,qy,rx,ry))/Math.sqrt(len2)>EPS)return [];
  return [((c[0]-a[0])*rx+(c[1]-a[1])*ry)/len2,((d[0]-a[0])*rx+(d[1]-a[1])*ry)/len2].filter(t=>t>=-EPS&&t<=1+EPS).map(t=>Math.max(0,Math.min(1,t)));
}
function interpolate(a:LonLat,b:LonLat,t:number):LonLat {
  if(t<=EPS)return [...a];if(t>=1-EPS)return [...b];
  return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
}
export function appendLinePiece(lines:LonLat[][],a:LonLat,b:LonLat):void {
  if(same(a,b))return;
  const last=lines.at(-1);
  if(last&&same(last.at(-1)!,a))last.push([...b]);else lines.push([[...a],[...b]]);
}
/** Split each real source segment at ALL actual polygon-boundary intersections.
 * The midpoint is used only to classify each already-split interval, never the
 * uncut source segment. Cut points are cartographic endpoints, not graph nodes. */
export function clipLineToZone(coordinates:readonly LonLat[],geometry:ZoneGeometry):{inside:MultiLineString;outside:MultiLineString}{
  const zone=prepare(geometry),inside:LonLat[][]=[],outside:LonLat[][]=[];
  for(let i=0;i<coordinates.length-1;i++){
    const a=coordinates[i],b=coordinates[i+1];if(same(a,b))continue;
    const segmentBounds=coordinatesBounds([a,b])!,cuts=[0,1];
    for(const edge of zone.edges)if(overlaps(segmentBounds,edge.bounds))cuts.push(...parameterCuts(a,b,edge.a,edge.b));
    const sorted=cuts.sort((x,y)=>x-y).filter((t,index,array)=>!index||t-array[index-1]>EPS);
    for(let j=0;j<sorted.length-1;j++){
      const lo=sorted[j],hi=sorted[j+1];if(hi-lo<=EPS)continue;
      const target=pointInZone(interpolate(a,b,(lo+hi)/2),geometry)?inside:outside;
      appendLinePiece(target,interpolate(a,b,lo),interpolate(a,b,hi));
    }
  }
  return {inside:{type:'MultiLineString',coordinates:inside},outside:{type:'MultiLineString',coordinates:outside}};
}
export function lineLength(coordinates:readonly LonLat[]):number {
  let total=0;for(let i=1;i<coordinates.length;i++){const a=project(coordinates[i-1]),b=project(coordinates[i]);total+=Math.hypot(b.x-a.x,b.y-a.y);}return total;
}
export function geometryLength(geometry:LineString|MultiLineString):number {
  return geometry.type==='LineString'?lineLength(geometry.coordinates as LonLat[]):geometry.coordinates.reduce((sum,line)=>sum+lineLength(line as LonLat[]),0);
}
export function boundsOfGeometry(value:Geometry|FeatureCollection):Bounds|null {
  if(value.type==='FeatureCollection')return coordinatesBounds(value.features.flatMap(feature=>geometryCoordinates(feature.geometry)));
  return coordinatesBounds(geometryCoordinates(value));
}
function geometryCoordinates(geometry:Geometry|null):LonLat[]{
  if(!geometry)return [];
  switch(geometry.type){
    case 'Point':return [geometry.coordinates as LonLat];
    case 'LineString':case 'MultiPoint':return geometry.coordinates as LonLat[];
    case 'MultiLineString':case 'Polygon':return geometry.coordinates.flat() as LonLat[];
    case 'MultiPolygon':return geometry.coordinates.flat(2) as LonLat[];
    case 'GeometryCollection':return geometry.geometries.flatMap(geometryCoordinates);
  }
}
