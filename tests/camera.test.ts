import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CameraController,type CameraPose} from '../src/views/camera-controller';
test('manual exploration cancels animation, ignores vehicle updates, and explicit centering preserves zoom',()=>{
 let pose:CameraPose={center:[-122,37.55],zoom:15.2,bearing:45,pitch:30},stops=0;
 const camera=new CameraController({stop:()=>stops++,read:()=>structuredClone(pose),move:p=>{pose={...pose,...p};}});
 camera.update([-121.99,37.54],10);camera.explore();const detached=structuredClone(pose);
 camera.update([-121.98,37.53],90);assert.deepEqual(pose,detached);assert.equal(camera.follow,false);assert.equal(stops,1);
 camera.suspend();camera.update([-121.97,37.52],180);camera.resume();assert.deepEqual(pose,detached);assert.equal(camera.follow,false);
 camera.centerOnVehicle([-121.97,37.52]);assert.equal(camera.follow,true);assert.equal(pose.zoom,15.2);assert.equal(pose.pitch,30);
 camera.focus({center:[-122,37.6]});assert.equal(camera.follow,false);
});
test('pointer interaction blocks follow animations before dragstart and preserves click-only follow state',()=>{
 let moves=0,stops=0;const pose:CameraPose={center:[-122,37.55],zoom:16,bearing:0,pitch:0};
 const camera=new CameraController({stop:()=>stops++,read:()=>pose,move:()=>moves++});
 camera.update([-122,37.55],0);camera.beginInteraction();for(let i=0;i<10;i++)camera.update([-121.99,37.56],0);assert.equal(moves,1);assert.equal(camera.follow,true);assert.equal(stops,1);
 camera.endInteraction();camera.update([-121.99,37.56],0);assert.equal(moves,2);
 camera.beginInteraction();camera.beginInteraction();assert.equal(stops,2);camera.explore(false);assert.equal(stops,2);camera.endInteraction();camera.update([-121.98,37.57],0);assert.equal(moves,2);assert.equal(camera.follow,false);
 camera.centerOnVehicle([-121.98,37.57]);assert.equal(camera.follow,true);
});
