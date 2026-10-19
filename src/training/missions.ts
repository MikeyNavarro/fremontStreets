import type {RoadGraph,Route,VehicleState} from '../core';
export interface LearningMission {id:string;geoVersion:string;entryId:string;route:Route;edgeIds:string[];checkpoint?:{edgeId:string;distance:number};startedDistance:number;status:'active'|'complete'|'withdrawn';assisted:boolean;eligible:boolean;visitedEdges:string[];wrongTurns:number}
const physical=(id:string)=>id.replace(/:[fr]$/,'');
/** A nearby bridge or disconnected parallel carriageway never satisfies arrival. */
export function missionArrived(m:LearningMission,vehicle:VehicleState,graph:RoadGraph,previous?:VehicleState):boolean {
 if(vehicle.totalDistance<=m.startedDistance+2)return false;
 if(!m.checkpoint)return m.edgeIds.includes(vehicle.edgeId)||vehicle.events.some(e=>!!e.edgeId&&m.edgeIds.includes(e.edgeId));
 const checkpoint=m.checkpoint;
 const target=graph.edges.get(checkpoint.edgeId);if(!target)return false;
 const offset=(v:VehicleState)=>physical(v.edgeId)===physical(target.id)?v.edgeId===target.id?v.distance:target.length-v.distance:null;
 const at=offset(vehicle),before=previous?offset(previous):null;
 if(at!==null&&Math.abs(at-checkpoint.distance)<=25)return true;
 if(before!==null&&at!==null&&Math.min(before,at)<=checkpoint.distance&&Math.max(before,at)>=checkpoint.distance)return true;
 return vehicle.events.some(e=>e.type==='node'&&e.edgeId&&physical(e.edgeId)===physical(target.id)&&before!==null&&Math.min(before,target.length)<=checkpoint.distance&&Math.max(before,target.length)>=checkpoint.distance);
}
