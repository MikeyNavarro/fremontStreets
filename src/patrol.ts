import { buildZoneCoverage, pointZoneMembership, zoneBounds } from './core/zones';
import type { ZoneDocument, StudyZone } from './core/zones';
import { recordExploration } from './core/learning';
import type { LearningProgress } from './core/learning';
import type { LonLat, RoadGraph, VehicleState } from './core/types';
import type { BoundaryCollection } from './views/types';

/** Study-area metadata sits beside the road graph; it never edits its topology. */
export class PatrolStudy {
  readonly coverage;
  private safeNodes = new Map<string, Set<string>>();
  private preferred = new Map<string, Set<string>>();
  constructor(readonly graph: RoadGraph, readonly document: ZoneDocument) {
    this.coverage = buildZoneCoverage(graph, document);
    for (const zone of Object.values(this.coverage.zones)) {
      this.safeNodes.set(zone.id, new Set(zone.safeDestinationNodeIds));
      this.preferred.set(zone.id, new Set(zone.edgeIds));
    }
  }
  zone(id: string): StudyZone | undefined { return this.document.zones.find(zone => zone.id === id); }
  names(id: string): string[] {
    return id === 'all' ? [...new Set([...this.graph.edges.values()].map(e => e.name).filter(Boolean))].sort() : this.coverage.zones[id]?.streetNames ?? [];
  }
  contains(position: LonLat, id: string): boolean {
    if (id === 'all') return true;
    const zone = this.zone(id);
    return Boolean(zone && pointZoneMembership(position, zone, this.document.metadata.calibration?.uncertaintyMeters ?? 0) === 'inside');
  }
  safeDestination(id: string, nodeId: string): boolean { return id === 'all' || Boolean(this.safeNodes.get(id)?.has(nodeId)); }
  preferredEdges(id: string): Set<string> | undefined { return this.preferred.get(id); }
  startEdge(id: string, citywideDefault: string): string | null {
    if (id === 'all') return citywideDefault;
    const coverage = this.coverage.zones[id];
    if (!coverage?.available) return null;
    const safe = this.safeNodes.get(id)!;
    const candidates = coverage.edgeIds.map(edgeId => this.graph.edges.get(edgeId)!).filter(e => e.name && safe.has(e.from) && safe.has(e.to) && !['motorway','motorway_link','trunk','trunk_link'].includes(e.highway));
    if (!candidates.length) return coverage.edgeIds.find(edgeId => safe.has(this.graph.edges.get(edgeId)!.from)) ?? null;
    const center = coverage.safeDestinationNodeIds.reduce((sum, nodeId) => { const n = this.graph.nodes.get(nodeId)!; return {x:sum.x+n.x, y:sum.y+n.y}; }, {x:0,y:0});
    center.x /= coverage.safeDestinationNodeIds.length; center.y /= coverage.safeDestinationNodeIds.length;
    candidates.sort((a,b) => { const n=this.graph.nodes.get(a.from)!, m=this.graph.nodes.get(b.from)!;return Math.hypot(n.x-center.x,n.y-center.y)-Math.hypot(m.x-center.x,m.y-center.y); });
    return candidates[0].id;
  }
  record(progress: LearningProgress, vehicle: VehicleState): LearningProgress {
    let next = recordExploration(progress, 'all', vehicle.events);
    for (const zone of this.document.zones) {
      if (!zone.geometry) continue;
      const events = vehicle.events.filter(event => {
        const position = event.type === 'street' ? vehicle.position : this.graph.nodes.get(event.id)?.position;
        return position && this.contains(position, zone.id);
      });
      if (events.length) next = recordExploration(next, zone.id, events);
    }
    return next;
  }
  boundaries(): BoundaryCollection {
    return {type:'FeatureCollection',features:this.document.zones.flatMap(zone => zone.geometry ? [{type:'Feature' as const,properties:{id:zone.id,name:zone.name,color:zone.color},geometry:zone.geometry}] : [])};
  }
  bounds(id: string) { const zone=this.zone(id);return zone?zoneBounds(zone):null; }
}
