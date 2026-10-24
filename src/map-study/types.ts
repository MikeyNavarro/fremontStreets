import type {Feature, FeatureCollection, LineString, MultiLineString} from 'geojson';
import type {LonLat} from '../core/types';
import type {ZoneDocument} from '../core/zones';
import type {Fact} from '../training/verification';
import type {RoadLabelProperties} from '../views/road-label-geometry';
import type {MapJunction} from './junctions';

/** The requested curriculum is explicit. Geographic membership never adds targets. */
export const ZONE1_ENTRY_IDS = ['ew14','ns07','ew12','ew11','ns05','ns17','ns03','ns08','ns02','ns01','ns15','ns06','ew10','ew09','ns04','ew06','ew13','ew15'] as const;
export type MapScope = 'zone1' | 'all';
export interface MapRoadProperties {
  wayId: string; roadId: string; name: string; ref: string; highway: string; entryIds: string[];
  bridge: string; tunnel: string; layer: string; access: string; oneway: string;
}
export interface SectionSourceSegment {wayId: string; index: number; reversed: boolean}
export interface MapRoadSection {
  id: string; entryId: string; name: string;
  sourceWayIds: string[]; sourceNodeIds: string[]; sourceSegments: SectionSourceSegment[];
  geometry: LineString;
  /** Boundary cuts are presentation coordinates, never new source nodes/junctions. */
  inside: MultiLineString; outside: MultiLineString;
  /** Only source segments with applicable independent City geometry corroboration. */
  verified: MultiLineString; verifiedInside: MultiLineString;
  lengths: {full: number; zone1: number; outside: number};
  junctionOrder: Array<{junctionId: string; distanceMetres: number}>;
}
export interface MapStudyEntry {
  id: string; originalLabel: string; label: string; group: 'ew'|'ns';
  mappedNames: string[]; names: string[]; sourceWayIds: string[];
  defaultZone1: boolean;
  requestedZone1Group: 'within-or-nearly'|'partial'|null;
  /** Describes available imported geometry, not the real-world complete corridor. */
  zone1Relationship: 'within'|'nearly-within'|'partial'|'outside';
  lengths: {full: number; zone1: number; outside: number};
  evidence: Record<'identity'|'geometry'|'topology'|'maneuvers', Fact>;
  sectionIds: string[]; junctionIds: string[]; recognitionSectionIds: string[];
  limitations: string[];
}
export interface MapStudyData {
  schema: 1; version: string; sourceHashes: Record<string,string>;
  metadata: {boundaryVersion: string; evidenceVersion: string; generatedBy: string; sourceDate: string; attribution: string; limitations: string[];sources?:Array<{id:string;url:string;version:string;retrievedAt:string;limitations:string}>};
  zone1EntryIds: string[]; zones: ZoneDocument;
  headquarters: {name: string; address: string; position: LonLat; sourceUrl: string; note: string};
  roads: FeatureCollection<LineString,MapRoadProperties>;
  labels: FeatureCollection<LineString,RoadLabelProperties>;
  entries: MapStudyEntry[]; sections: MapRoadSection[]; junctions: MapJunction[];
}
export interface SelectionProperties {entryId: string; sectionId: string; name: string; sourceWayIds: string[]; outside: boolean; clipped: boolean}
export type SelectionGeometry = FeatureCollection<LineString|MultiLineString,SelectionProperties>;
export interface GeometryOptions {fullRoad?: boolean; zone1?: boolean; verifiedOnly?: boolean; outsideOnly?: boolean;sectionId?:string}
export interface RoadSearchResult {id: string; kind:'study'|'connector'; label: string; entryId?:string; wayIds:string[]; names:string[]; defaultZone1:boolean; distinctSections:number}
export type RoadFeature = Feature<LineString,MapRoadProperties>;
