import * as THREE from 'three';
import {PROJECTION_ORIGIN,project,showRendererFailure,type LonLat,type RoadCollection,type TurnPreview,type VehicleSnapshot} from './types';

type Quality='low'|'balanced'|'high';
/** Source centerlines only. Road widths, the flat environment, sky and vehicle
 * interior are generic visual approximations, not surveyed Fremont features. */
export class DriverView {
  private renderer:THREE.WebGLRenderer|null=null;
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(70,1,.12,1800);
  private routeMesh:THREE.Mesh|null=null;
  private turnMeshes:THREE.Mesh[]=[];
  private active=true;
  private lastSnapshot:VehicleSnapshot|null=null;
  private observer:ResizeObserver|null=null;
  private turnsKey='';
  private renderHeading:number|null=null;
  private lastFrame=0;
  private quality:Quality='balanced';
  private sky:THREE.Mesh|null=null;
  private dashboardCanvas:HTMLCanvasElement|null=null;
  private dashboardTexture:THREE.CanvasTexture|null=null;
  private asphalt:THREE.CanvasTexture|null=null;
  private lastSpeed=-1;
  private vignette:HTMLDivElement|null=null;
  private readonly reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private container:HTMLElement,roads:RoadCollection,private origin:LonLat=PROJECTION_ORIGIN){
    container.dataset.renderer='driver';
    try{
      this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
      this.renderer.outputColorSpace=THREE.SRGBColorSpace;
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25));
      this.renderer.domElement.setAttribute('aria-label','Driver’s-eye view: sourced Fremont centerlines with approximate flat road surfaces and a generic vehicle interior');
      this.renderer.domElement.dataset.renderer='driver-canvas';this.renderer.domElement.style.cssText='width:100%;height:100%;display:block;';container.append(this.renderer.domElement);
      this.scene.background=new THREE.Color('#91a6ae');this.scene.fog=new THREE.Fog('#91a6ae',170,1450);
      const hemisphere=new THREE.HemisphereLight('#c9e8f2','#233a36',2.3);this.scene.add(hemisphere);
      const sun=new THREE.DirectionalLight('#ffe2bd',2.0);sun.position.set(-300,500,-200);this.scene.add(sun);
      const ground=new THREE.Mesh(new THREE.PlaneGeometry(90000,90000),new THREE.MeshBasicMaterial({color:'#203936',depthWrite:false}));ground.rotation.x=-Math.PI/2;ground.position.y=-.07;ground.renderOrder=-1;this.scene.add(ground);
      this.addSky();this.addSourceRoads(roads);this.addInterior();
      this.vignette=document.createElement('div');this.vignette.className='driver-vignette';container.append(this.vignette);
      if(import.meta.env.DEV&&new URLSearchParams(location.search).get('graphicsDebug')==='1')Object.defineProperty(window,'__FREMONT_DRIVER_DEBUG__',{value:{scene:this.scene,camera:this.camera},configurable:true});
      this.resize();container.dataset.rendererReady='true';
      this.renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();showRendererFailure(container,'Driver’s-eye view','WebGL context lost. Use overhead view or reload.');});
      this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);
    }catch(error){showRendererFailure(container,'Driver’s-eye view',error);}
  }

  update(snapshot:VehicleSnapshot):void{
    this.lastSnapshot=snapshot;const [east,north]=project(snapshot.position,this.origin),now=performance.now();
    const dt=this.lastFrame?Math.min((now-this.lastFrame)/1000,.1):1;this.lastFrame=now;
    if(this.renderHeading===null||this.reducedMotion)this.renderHeading=snapshot.heading;
    else{const delta=Math.atan2(Math.sin(snapshot.heading-this.renderHeading),Math.cos(snapshot.heading-this.renderHeading));this.renderHeading+=delta*(1-Math.exp(-dt*18));}
    this.camera.position.set(east,1.6,-north);this.camera.lookAt(east+Math.sin(this.renderHeading)*30,1.6,-north-Math.cos(this.renderHeading)*30);
    this.sky?.position.copy(this.camera.position);
    const speed=Math.round(snapshot.speed*2.236936);if(speed!==this.lastSpeed){this.lastSpeed=speed;this.drawInstruments(speed);}
    if(this.active&&!this.container.hidden)this.renderer?.render(this.scene,this.camera);
  }
  setRoute(coordinates:LonLat[]):void{this.removeMesh(this.routeMesh);this.routeMesh=coordinates.length>1?this.ribbons([coordinates],.45,'#69dfc4',.065):null;if(this.routeMesh)this.scene.add(this.routeMesh);}
  setTurns(turns:TurnPreview[]):void{const key=JSON.stringify(turns);if(key===this.turnsKey)return;this.turnsKey=key;this.turnMeshes.forEach(mesh=>this.removeMesh(mesh));this.turnMeshes=turns.filter(turn=>turn.coordinates.length>1).map(turn=>this.ribbons([turn.coordinates],turn.selected?.65:.25,turn.selected?'#dfb581':'#7799a7',.08));this.turnMeshes.forEach(mesh=>this.scene.add(mesh));}
  setActive(active:boolean):void{this.active=active;if(active){this.renderHeading=null;this.lastFrame=0;this.resize();if(this.lastSnapshot)this.update(this.lastSnapshot);}}
  setQuality(quality:Quality):void{this.quality=quality;this.renderer?.setPixelRatio(Math.min(window.devicePixelRatio||1,quality==='low'?.65:quality==='balanced'?1.25:2));this.resize();}
  presentation(){return {quality:this.quality,width:this.container.clientWidth,height:this.container.clientHeight,aspect:this.camera.aspect,drawCalls:this.renderer?.info.render.calls,triangles:this.renderer?.info.render.triangles,pixelRatio:this.renderer?.getPixelRatio(),renderHeading:this.renderHeading};}
  resize():void{if(!this.active||this.container.hidden||!this.container.clientWidth||!this.container.clientHeight)return;const width=this.container.clientWidth,height=this.container.clientHeight;this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer?.setSize(width,height,false);if(this.lastSnapshot)this.renderer?.render(this.scene,this.camera);}
  dispose():void{this.observer?.disconnect();const materials=new Set<THREE.Material>();this.scene.traverse(object=>{if(object instanceof THREE.Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});materials.forEach(material=>material.dispose());this.asphalt?.dispose();this.dashboardTexture?.dispose();this.renderer?.dispose();this.renderer?.domElement.remove();this.vignette?.remove();this.renderer=null;}

  private addSky(){
    this.sky=new THREE.Mesh(new THREE.SphereGeometry(1500,24,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,vertexShader:'varying vec3 vDirection; void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vDirection; void main(){float height=clamp(vDirection.y,0.0,1.0);vec3 horizon=vec3(0.57,0.65,0.68);vec3 zenith=vec3(0.10,0.23,0.33);vec3 color=mix(horizon,zenith,pow(height,0.55));float sun=pow(max(dot(normalize(vDirection),normalize(vec3(-0.5,0.55,-0.4))),0.0),70.0);gl_FragColor=vec4(color+vec3(0.15,0.11,0.06)*sun,1.0);}'}));this.sky.renderOrder=-2;this.scene.add(this.sky);
  }
  private addSourceRoads(roads:RoadCollection){
    // Chunk source segments for frustum culling; do not resample their geometry
    // or create junctions where independently sourced centerlines cross.
    const chunks=new Map<string,{surface:number[];edges:number[];colors:number[];uv:number[]}>();
    for(const feature of roads.features){
      const highway=String(feature.properties?.highway??'');
      const width=/^(motorway|trunk)/.test(highway)?13:/^primary/.test(highway)?11:/^(secondary|tertiary)/.test(highway)?9:/^(service|living_street)/.test(highway)?4.5:6.5;
      const color=new THREE.Color(/^(motorway|trunk|primary)/.test(highway)?'#424d53':'#39474d');
      const lines=feature.geometry.type==='MultiLineString'?feature.geometry.coordinates:[feature.geometry.coordinates];
      for(const line of lines)for(let i=1;i<line.length;i++){
        const a=project(line[i-1] as LonLat,this.origin),b=project(line[i] as LonLat,this.origin);if(Math.hypot(b[0]-a[0],b[1]-a[1])<.001)continue;
        const key=`${Math.floor((a[0]+b[0])/600)},${Math.floor((a[1]+b[1])/600)}`;
        const chunk=chunks.get(key)??{surface:[],edges:[],colors:[],uv:[]};
        const vertices=this.quad(a,b,width,.025);chunk.surface.push(...vertices);chunk.edges.push(...this.quad(a,b,width+1.0,.006));
        for(let j=0;j<vertices.length;j+=3){chunk.colors.push(color.r,color.g,color.b);chunk.uv.push(vertices[j]/5,vertices[j+2]/5);}
        chunks.set(key,chunk);
      }
    }
    this.asphalt=this.asphaltTexture();
    const surfaceMaterial=new THREE.MeshLambertMaterial({color:'#b2c0c2',map:this.asphalt,vertexColors:true,side:THREE.DoubleSide});
    const edgeMaterial=new THREE.MeshLambertMaterial({color:'#46595e',side:THREE.DoubleSide});
    for(const chunk of chunks.values()){
      const surface=this.mesh(chunk.surface,surfaceMaterial);surface.geometry.setAttribute('color',new THREE.Float32BufferAttribute(chunk.colors,3));surface.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(chunk.uv,2));
      this.scene.add(this.mesh(chunk.edges,edgeMaterial),surface);
    }
    this.container.dataset.sourceRoadChunks=String(chunks.size);
  }
  private asphaltTexture():THREE.CanvasTexture{
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d')!;const pixels=ctx.createImageData(256,256);let seed=7249;
    for(let i=0;i<pixels.data.length;i+=4){seed=(1664525*seed+1013904223)>>>0;const shade=205+(seed%28);pixels.data[i]=shade;pixels.data[i+1]=shade;pixels.data[i+2]=shade;pixels.data[i+3]=255;}
    ctx.putImageData(pixels,0,0);const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.colorSpace=THREE.SRGBColorSpace;return texture;
  }
  private quad(a:number[],b:number[],width:number,height:number):number[]{const dx=b[0]-a[0],dz=-(b[1]-a[1]),length=Math.hypot(dx,dz);const nx=-dz/length*width/2,nz=dx/length*width/2,az=-a[1],bz=-b[1];return [a[0]+nx,height,az+nz,b[0]+nx,height,bz+nz,a[0]-nx,height,az-nz,b[0]+nx,height,bz+nz,b[0]-nx,height,bz-nz,a[0]-nx,height,az-nz];}
  private mesh(vertices:number[],material:THREE.Material):THREE.Mesh{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const normals=new Float32Array(vertices.length);for(let i=1;i<normals.length;i+=3)normals[i]=1;geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.computeBoundingSphere();return new THREE.Mesh(geometry,material);}
  private ribbons(lines:number[][][],width:number,color:string,height:number):THREE.Mesh{const vertices:number[]=[];for(const line of lines)for(let i=1;i<line.length;i++){const a=project(line[i-1] as LonLat,this.origin),b=project(line[i] as LonLat,this.origin);if(Math.hypot(b[0]-a[0],b[1]-a[1])>.001)vertices.push(...this.quad(a,b,width,height));}return this.mesh(vertices,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.86}));}
  private removeMesh(mesh:THREE.Mesh|null){if(!mesh)return;this.scene.remove(mesh);mesh.geometry.dispose();for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.dispose();}

  private addInterior(){
    // Generic camera-attached interior; no relation to mapped buildings/lanes.
    const material=new THREE.MeshStandardMaterial({color:'#111f28',roughness:.72,metalness:.15});
    const dashboard=new THREE.Mesh(new THREE.BoxGeometry(2.9,.38,.85),material);dashboard.position.set(0,-.77,-1.02);dashboard.rotation.x=.12;this.camera.add(dashboard);
    const top=new THREE.Mesh(new THREE.BoxGeometry(2.8,.045,.8),new THREE.MeshStandardMaterial({color:'#273942',roughness:.82}));top.position.set(0,-.56,-1.08);top.rotation.x=.12;this.camera.add(top);
    const bonnet=new THREE.Mesh(new THREE.BoxGeometry(1.65,.12,1.45),new THREE.MeshStandardMaterial({color:'#294650',roughness:.35,metalness:.45}));bonnet.position.set(0,-.53,-1.9);this.camera.add(bonnet);
    for(const side of [-1,1]){const pillar=new THREE.Mesh(new THREE.BoxGeometry(.035,1.7,.06),material);pillar.position.set(side*1.3,-.15,-1.04);pillar.rotation.z=side*.08;this.camera.add(pillar);}
    const wheel=new THREE.Mesh(new THREE.TorusGeometry(.16,.018,8,36),new THREE.MeshStandardMaterial({color:'#14222a',roughness:.65,metalness:.15}));wheel.position.set(-.43,-.49,-.91);wheel.rotation.x=-.2;this.camera.add(wheel);
    const hub=new THREE.Mesh(new THREE.BoxGeometry(.1,.055,.04),material);hub.position.set(-.43,-.49,-.89);this.camera.add(hub);
    this.dashboardCanvas=document.createElement('canvas');this.dashboardCanvas.width=512;this.dashboardCanvas.height=192;this.dashboardTexture=new THREE.CanvasTexture(this.dashboardCanvas);this.dashboardTexture.colorSpace=THREE.SRGBColorSpace;
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(.38,.1425),new THREE.MeshBasicMaterial({map:this.dashboardTexture,toneMapped:false}));screen.position.set(.02,-.47,-.9);this.camera.add(screen);
    // A foreground cockpit must not be hidden by the flat world pass.
    this.camera.children.forEach((part,index)=>{if(part instanceof THREE.Mesh){part.renderOrder=20+index;part.material.depthTest=false;part.material.depthWrite=false;}});this.camera.children[2].renderOrder=19;
    this.scene.add(this.camera);this.drawInstruments(0);
  }
  private drawInstruments(speed:number){const ctx=this.dashboardCanvas?.getContext('2d');if(!ctx||!this.dashboardTexture)return;ctx.fillStyle='#07151c';ctx.fillRect(0,0,512,192);ctx.fillStyle='#e7f4f5';ctx.font='500 100px system-ui';ctx.textAlign='center';ctx.fillText(String(speed),190,130);ctx.font='20px system-ui';ctx.fillStyle='#8babb9';ctx.fillText('MPH',310,126);ctx.fillStyle='#71e5c7';ctx.fillRect(65,160,382*Math.min(speed/100,1),3);ctx.font='15px system-ui';ctx.fillText('FREMONT STREETS',255,32);this.dashboardTexture.needsUpdate=true;}
}
