import type { LonLat } from '../core';
export interface CameraPose { center: LonLat; zoom: number; bearing: number; pitch: number }
export interface CameraPort { stop():void; read():CameraPose; move(pose:Partial<CameraPose>,animate:boolean):void }
/** Sole owner of Follow/Explore. Vehicle and mission events cannot enable follow. */
export class CameraController {
  private following=true;
  private suspended:CameraPose|null=null;
  private interacting=false;
  constructor(private port:CameraPort,private changed:(follow:boolean)=>void=()=>{}){}
  get follow(){return this.following;}
  beginInteraction(){if(!this.interacting)this.port.stop();this.interacting=true;}
  endInteraction(){this.interacting=false;}
  explore(cancelAnimation=true){this.following=false;if(cancelAnimation)this.port.stop();this.changed(false);}
  centerOnVehicle(position:LonLat){this.port.stop();this.following=true;this.port.move({center:position},true);this.changed(true);}
  focus(pose:Partial<CameraPose>){this.explore();this.port.move(pose,true);}
  update(position:LonLat,bearing:number){if(this.following&&!this.suspended&&!this.interacting)this.port.move({center:position,bearing},true);}
  suspend(){this.port.stop();this.suspended=this.port.read();}
  resume(){if(this.suspended){this.port.move(this.suspended,false);this.suspended=null;}}
}
