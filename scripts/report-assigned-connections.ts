import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {MapScope,MapStudyData} from '../src/map-study/types';
import type {MapJunction,MapJunctionPair} from '../src/map-study/junctions';
import {assignedEntryJunctions,assignedPairComponents,studyEntries} from '../src/map-study/data';
import {eligibleIntersectionPair} from '../src/map-study/learning';
import {pointInZone} from '../src/map-study/geometry';

// Offline report only. This script neither rebuilds nor modifies geographic
// inputs; all coordinates, road IDs, and evidence references come from the
// retained map-study snapshot and the same filtering used by the application.
const inputURL=new URL('../public/data/map-study.json',import.meta.url);
const outputURL=new URL('../docs/data/assigned-road-connections.json',import.meta.url);
const input=readFileSync(inputURL);
const data=JSON.parse(input.toString('utf8')) as MapStudyData;
const zone=data.zones.zones.find(value=>value.id==='zone1')?.geometry;
if(data.schema!==1||!zone)throw new Error('A versioned map-study snapshot and approximate Zone 1 polygon are required.');
const sha=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
const key=(pair:MapJunctionPair)=>[...pair.roadIds].sort().join('|');
const facts=data.junctions.flatMap(junction=>junction.quizPairs.map(pair=>({junction,pair})));
const geometricComponents=(junction:MapJunction,pair:MapJunctionPair,scope:MapScope)=>junction.components.filter(component=>
  pair.nodeIds.includes(component.nodeId)&&pair.roadIds.every(id=>component.roadIds.includes(id))
  &&(scope==='all'||pointInZone(component.position,zone)));

function reportScope(scope:MapScope){
  const activeEntries=studyEntries(data,scope),active=new Set(activeEntries.map(entry=>entry.id));
  const entries=activeEntries.map(entry=>{
    const rows=assignedEntryJunctions(data,entry.id,scope);
    const connections=rows.map(row=>{
      const j=row.junction;
      return {
        displayId:j.id,sourceGroupId:j.sourceJunctionId??j.id,
        sourceNodeId:j.displayNodeId,sourceSectionId:row.sectionId,
        position:j.position,connectionType:j.connectionType,
        roadNames:j.roadNames,
        pairs:j.mappedPairs.map(pair=>({
          roadNames:[pair.roadA,pair.roadB],roadIds:pair.roadIds,
          entryIds:pair.roadIds.map(id=>j.roads.find(road=>road.id===id)!.entryIds),
          sourceNodeIds:pair.nodeIds,
          physicalEvidence:[j.evidence.topology,j.evidence.grade].some(fact=>fact.status==='Conflicted')?'Conflicted':
            j.displayQuizPairs.some(known=>key(known)===key(pair)&&known.nodeIds.includes(j.displayNodeId))?'Verified':'Unresolved',
          maneuverEvidence:j.evidence.maneuvers.status,
        })),
      };
    });
    return {id:entry.id,name:entry.label,qualifyingConnectionCount:connections.length,
      crossingIntersectionCount:connections.filter(row=>row.connectionType==='shared-node').length,
      roadNameTransitionCount:connections.filter(row=>row.connectionType==='name-change').length,connections};
  });
  const independentFacts=facts.map(({junction,pair})=>{
    const components=assignedPairComponents(data,junction,pair,scope);
    const sourceNodes=geometricComponents(junction,pair,scope);
    const roads=pair.roadIds.map(id=>junction.roads.find(road=>road.id===id)!);
    const bothAssigned=roads[0].entryIds.some(a=>active.has(a)&&roads[1].entryIds.some(b=>active.has(b)&&a!==b));
    const independent=eligibleIntersectionPair(junction,pair);
    const reasons:string[]=[];
    if(!bothAssigned)reasons.push('Both roads are not distinct entries in the active curriculum.');
    if(!sourceNodes.length)reasons.push('No applicable shared pair node is inside the selected geographic scope.');
    if(!independent)reasons.push('Independent physical-pair evidence does not meet the scoring gate.');
    if(bothAssigned&&sourceNodes.length&&!components.length)reasons.push('No eligible ordinary source-segment connection for both assigned roads.');
    return {sourceGroupId:junction.id,roadNames:[pair.roadA,pair.roadB],roadIds:pair.roadIds,
      sourceIds:pair.sourceIds,claimIds:pair.claimIds,
      inGeographicScope:sourceNodes.length>0,eligible:independent&&components.length>0,
      applicableSourceNodeIds:components.map(component=>component.nodeId),exclusionReasons:reasons};
  });
  const allRows=entries.flatMap(entry=>entry.connections);
  const transitions=allRows.filter(row=>row.connectionType==='name-change');
  return {
    activeEntryCount:entries.length,
    uniqueSourceGroups:new Set(allRows.map(row=>row.sourceGroupId)).size,
    perRoadWalkthroughRows:allRows.length,
    uniqueCrossingSourceGroups:new Set(allRows.filter(row=>row.connectionType==='shared-node').map(row=>row.sourceGroupId)).size,
    uniqueRoadNameTransitionSourceGroups:new Set(transitions.map(row=>row.sourceGroupId)).size,
    roadNameTransitionWalkthroughRows:transitions.length,
    independentFactsInGeographicScope:independentFacts.filter(fact=>fact.inGeographicScope).length,
    eligibleIndependentPairCount:independentFacts.filter(fact=>fact.eligible).length,
    excludedIndependentPairsInGeographicScope:independentFacts.filter(fact=>fact.inGeographicScope&&!fact.eligible).length,
    independentFacts,entries,
  };
}

const report={
  schema:1,datasetVersion:data.version,inputSha256:sha(input),
  sourceDataset:'public/data/map-study.json',generatedBy:'npx tsx scripts/report-assigned-connections.ts',
  originalIndependentPairCount:facts.length,
  countingNotes:[
    'Unique source groups count retained logical-site identities; per-road rows count each selected-road walkthrough separately.',
    'A logical site with distinct physical pair components may produce multiple actual-node markers without inventing all-to-all connections.',
    'Road-name transitions are listed separately from crossing intersections and never gain scored-intersection eligibility from this report.',
    'Independent facts involving noncurriculum roads remain in the source snapshot but are excluded from assigned-road questions.',
    'Exploratory source topology is not independent corroboration of every location or legal turn. Zone 1 is an approximate historical study boundary.',
  ],
  scopes:{zone1:reportScope('zone1'),all:reportScope('all')},
};
if(sha(readFileSync(inputURL))!==report.inputSha256)throw new Error('Source snapshot changed while reporting; rerun against one stable version.');
mkdirSync(new URL('../docs/data/',import.meta.url),{recursive:true});
writeFileSync(outputURL,`${JSON.stringify(report,null,2)}\n`);
for(const [scope,value]of Object.entries(report.scopes))console.log(`${scope}: ${value.activeEntryCount} entries, ${value.uniqueSourceGroups} source groups, ${value.perRoadWalkthroughRows} per-road rows, ${value.eligibleIndependentPairCount} eligible independent pairs`);
