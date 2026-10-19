import {test,expect,type Page} from '@playwright/test';
import {closePanel,openPanel,chooseMode} from './ui-helpers';
const state=(page:Page)=>page.evaluate(()=>{const g=(window as any).__FREMONT_GAME__;return {vehicle:g.vehicle,camera:g.camera,map:g.presentation.map,learning:g.learning,paused:g.paused};});
test.beforeEach(async({page})=>{await page.goto('./');await page.waitForFunction(()=>!!(window as any).__FREMONT_GAME__);await closePanel(page);await expect(page.getByTestId('overhead-view')).toHaveAttribute('data-renderer-ready','true');});
test('manual exploration survives driving, zoom, cameras, reset, mission and zone changes',async({page})=>{
 const canvas=page.locator('.maplibregl-canvas');const box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+box.width*.65,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.45,box.y+box.height*.62,{steps:12});await page.mouse.up();
 await expect.poll(async()=>(await state(page)).map.followVehicle).toBe(false);
 await page.waitForTimeout(350);const detached=await state(page);
 await page.keyboard.down('ArrowUp');await expect.poll(async()=>(await state(page)).vehicle.totalDistance).toBeGreaterThan(detached.vehicle.totalDistance+8);await page.keyboard.up('ArrowUp');await page.getByTestId('pause-toggle').click();
 expect((await state(page)).map.center).toEqual(detached.map.center);
 await page.mouse.move(box.x+box.width*.65,box.y+box.height*.5);await page.mouse.wheel(0,180);await page.waitForTimeout(500);const zoomed=await state(page);expect(zoomed.map.zoom).toBeLessThan(detached.map.zoom);expect(zoomed.map.followVehicle).toBe(false);
 await page.keyboard.press('c');await expect(page.getByTestId('driver-view')).toBeVisible();await page.keyboard.press('c');await expect(page.getByTestId('overhead-view')).toBeVisible();
 const back=await state(page);for(const key of ['center','zoom','bearing','pitch','followVehicle'])expect(back.map[key]).toEqual(zoomed.map[key]);expect(back.vehicle).toEqual(zoomed.vehicle);
 await page.locator('#reset-drive').click();expect((await state(page)).map.center).toEqual(zoomed.map.center);expect((await state(page)).map.followVehicle).toBe(false);
 await chooseMode(page,'navigation');await page.getByTestId('challenge-start').click();expect((await state(page)).map.center).toEqual(zoomed.map.center);expect((await state(page)).map.followVehicle).toBe(false);
 await openPanel(page,'zones');await page.getByTestId('zone-select').selectOption('zone2');await closePanel(page);expect((await state(page)).map.followVehicle).toBe(false);expect((await state(page)).map.center).toEqual(zoomed.map.center);
 await page.getByRole('button',{name:'Center on Vehicle',exact:true}).click();await expect.poll(async()=>(await state(page)).map.followVehicle).toBe(true);expect((await state(page)).map.zoom).toBeCloseTo(zoomed.map.zoom,5);
});
test('search inspects source-connected sections without moving the vehicle or reattaching follow',async({page})=>{
 await page.getByTestId('pause-toggle').click();
 const before=await state(page);await page.locator('.street-explorer summary').click();await page.getByRole('searchbox',{name:'Search loaded streets'}).fill('Stevenson');await page.locator('#street-results').getByRole('button',{name:'Stevenson Boulevard',exact:true}).click();
 const section=page.locator('#street-results [data-section]').first();if(await section.count())await section.click();
 await expect(page.locator('#street-inspection')).toContainText('Stevenson Boulevard');await expect.poll(async()=>(await state(page)).map.followVehicle).toBe(false);expect((await state(page)).vehicle).toEqual(before.vehicle);
 await page.locator('#geographic-qa').check();await expect(page.locator('#street-inspection')).toContainText('OSM');await expect(page.locator('#street-inspection')).toContainText('unresolved facts');
});

test('verified recognition hides answers, earns recognition, persists and exports a backup',async({page})=>{
 await page.getByTestId('open-learning').click();await expect(page.locator('#learning-target option')).toHaveCount(38);await expect(page.getByTestId('exam-unavailable')).toContainText('6 intersection and 4 navigation');
 await page.locator('#learning-target').selectOption('ns04');await page.locator('#learning-identify').click();
 await expect(page.locator('.street-banner')).not.toBeVisible();await expect(page.locator('.street-explorer')).not.toBeVisible();await expect(page.locator('#turn-prompt')).not.toBeVisible();await expect(page.locator('.map-street-label')).toHaveCount(0);
 const first=await state(page);await page.keyboard.down('w');await page.waitForTimeout(250);await page.keyboard.up('w');expect((await state(page)).vehicle.position).toEqual(first.vehicle.position);
 await page.locator('[data-answer-entry="ns04"]').click();await expect(page.getByTestId('learning-coach')).toContainText('Unaided answer recorded');await page.locator('#learning-next').click();
 expect((await state(page)).learning.task.id).not.toBe(first.learning.task.id);await page.locator('[data-answer-entry="ns04"]').click();await expect(page.getByTestId('learning-coach')).toContainText('Unaided answer recorded');
 await page.locator('#learning-next').click();await page.locator('#learning-hint').click();await page.locator('[data-answer-entry="ns04"]').click();await expect(page.getByTestId('learning-coach')).toContainText('Assisted attempt recorded');
 await page.locator('[data-end]').click();await expect(page.locator('[data-learning-entry="ns04"]')).toContainText('Recognized');expect((await state(page)).learning.progress.find((e:any)=>e.id==='ns04').assisted).toBe(1);
 const downloadPromise=page.waitForEvent('download');await page.locator('#learning-export').click();const download=await downloadPromise;const path=await download.path();expect(path).toBeTruthy();
 await page.reload();await page.waitForFunction(()=>!!(window as any).__FREMONT_GAME__?.learning);await closePanel(page);await page.getByTestId('open-learning').click();await expect(page.locator('[data-learning-entry="ns04"]')).toContainText('Recognized');
 const before=(await state(page)).learning.attemptCount;await page.locator('#learning-import').setInputFiles(path!);await expect(page.locator('#toast')).toContainText('Backup merged');expect((await state(page)).learning.attemptCount).toBe(before);
 await page.locator('#learning-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"schema":999}')});await expect(page.locator('#backup-result')).toContainText('different curriculum');expect((await state(page)).learning.attemptCount).toBe(before);
});

test('evidence gaps are shown without inventing scored intersection questions',async({page})=>{
 await page.getByTestId('open-learning').click();await page.locator('#learning-intersection').click();await expect(page.getByTestId('learning-coach')).toContainText('unscored');await expect(page.getByTestId('learning-coach')).toContainText('No independently verified movement evidence');expect((await state(page)).learning.attemptCount).toBe(0);
 await page.locator('[data-end]').click();await page.locator('#learning-target').selectOption('ew01');await expect(page.locator('#learning-target')).toHaveValue('ew01');await page.locator('#learning-study').click();await expect(page.getByTestId('learning-coach')).toContainText('Lake Arrowhead');expect((await state(page)).map.followVehicle).toBe(false);
});

test('a no-GPS learning mission completes through real driving and remains honestly unscored',async({page})=>{
 test.setTimeout(120_000);await page.getByTestId('open-learning').click();await page.locator('#learning-target').selectOption('ns04');await page.locator('#learning-nogps').click();await expect(page.getByTestId('learning-coach')).toContainText('No GPS');const mission=(await state(page)).learning.mission;expect(mission.eligible).toBe(false);expect(mission.geoVersion).toContain('evidence-v1');
 let decisionId='';await page.keyboard.down('ArrowUp');
 await expect.poll(async()=>{
  const s=await page.evaluate(()=>{const g=(window as any).__FREMONT_GAME__;return {mission:g.learning.mission,decision:g.decision,route:g.route};});
  if(s.mission?.status==='complete')return true;
  const d=s.decision;if(d&&d.incomingEdgeId!==decisionId){const i=s.route?.edgeIds.indexOf(d.incomingEdgeId)??-1,next=s.route?.edgeIds[i+1],choice=d.choices.find((c:any)=>c.edgeId===next);if(i>=0&&choice){decisionId=d.incomingEdgeId;if(choice.kind==='left')await page.keyboard.press('ArrowLeft');else if(choice.kind==='right')await page.keyboard.press('ArrowRight');else await page.locator(choice.kind==='uturn'?'#turn-uturn':'#turn-straight').click();}}
  return false;
 },{timeout:100_000,intervals:[100]}).toBe(true);await page.keyboard.up('ArrowUp');await expect(page.getByTestId('learning-coach')).toContainText('Destination reached');await expect(page.getByTestId('learning-coach')).toContainText('does not grant mastery');expect((await state(page)).learning.progress.find((e:any)=>e.id==='ns04').level).toBe('Unfamiliar');
});

test('direction questions compare corroborated points and map-location answers use actual clicked roads',async({page})=>{
 await page.getByTestId('open-learning').click();await page.locator('#learning-direction').click();await expect(page.getByTestId('learning-coach')).toContainText('two corroborated positions');
 const answer=await page.evaluate(()=>{const g=(window as any).__FREMONT_GAME__,parts=g.learning.task.id.split(':'),edges=g.graph.edges,nodes=new Map(g.graph.nodes.map((n:any)=>[n.id,n.position]));const a=edges.find((e:any)=>e.id===parts.slice(2,5).join(':')),b=edges.find((e:any)=>e.id===parts.slice(5).join(':'));const p=nodes.get(a.from) as number[],q=nodes.get(b.from) as number[];const dx=(p[0]-q[0])*Math.cos(37.5485*Math.PI/180),dy=p[1]-q[1];return Math.abs(dx)>Math.abs(dy)?dx>0?'East':'West':dy>0?'North':'South';});
 await page.locator(`[data-direction="${answer}"]`).click();await expect(page.getByTestId('learning-coach')).toContainText('Correct');await expect(page.getByTestId('learning-coach')).toContainText(answer);await page.locator('[data-end]').click();
 await page.locator('#learning-target').selectOption('ns04');await page.locator('#learning-locate').click();await expect(page.getByTestId('learning-coach')).toContainText('Find Paseo Padre Parkway');
 const target=await page.evaluate(async()=>{const g=(window as any).__FREMONT_GAME__,registry=await(await fetch(new URL('data/verification.json',location.href))).json(),ids=new Set(registry.entries.find((e:any)=>e.id==='ns04').segments.map((s:any)=>s.edgeId)),edge=g.graph.edges.filter((e:any)=>ids.has(e.id)).sort((a:any,b:any)=>b.length-a.length)[0],nodes=new Map(g.graph.nodes.map((n:any)=>[n.id,n.position]));const a=nodes.get(edge.from) as number[],b=nodes.get(edge.to) as number[];return [(a[0]+b[0])/2,(a[1]+b[1])/2];});
 const screen=async()=>{const s=await state(page),box=(await page.locator('.maplibregl-canvas').boundingBox())!;const world=(p:number[])=>[(p[0]+180)/360,(1-Math.log(Math.tan(p[1]*Math.PI/180)+1/Math.cos(p[1]*Math.PI/180))/Math.PI)/2];const a=world(target),b=world(s.map.center),scale=512*2**s.map.zoom;return {x:box.x+box.width/2+(a[0]-b[0])*scale,y:box.y+box.height/2+(a[1]-b[1])*scale};};
 await page.waitForTimeout(350);let point=await screen();for(let i=0;i<4&&(await state(page)).map.zoom<17;i++){await page.mouse.move(point.x,point.y);await page.mouse.wheel(0,-900);await page.waitForTimeout(600);point=await screen();}await page.mouse.click(point.x,point.y);await expect(page.getByTestId('learning-coach')).toContainText('Correct');
});

test('a two-stop patrol preserves vehicle continuity between actual driving legs',async({page})=>{
 test.setTimeout(180_000);await page.getByTestId('open-learning').click();await page.locator('#learning-target').selectOption('ns04');await page.locator('#learning-second-target').selectOption('ew13');await page.locator('#learning-multi').click();
 const drive=async()=>{let key='';await page.keyboard.down('ArrowUp');try{await expect.poll(async()=>{const s=await page.evaluate(()=>{const g=(window as any).__FREMONT_GAME__;return {mission:g.learning.mission,decision:g.decision,route:g.route};});if(s.mission?.status==='complete')return true;const d=s.decision;if(d&&d.incomingEdgeId!==key){const i=s.route.edgeIds.indexOf(d.incomingEdgeId),next=s.route.edgeIds[i+1],choice=d.choices.find((c:any)=>c.edgeId===next);if(i>=0&&choice){key=d.incomingEdgeId;await page.locator('#turn-'+choice.kind).click();}}return false;},{timeout:80000,intervals:[100]}).toBe(true);}finally{await page.keyboard.up('ArrowUp');}};
 await drive();await expect(page.locator('#patrol-next-stop')).toBeVisible();const first=(await state(page)).vehicle;await page.locator('#patrol-next-stop').click();const next=(await state(page)).vehicle;expect(next.totalDistance).toBeGreaterThanOrEqual(first.totalDistance);expect(next.totalDistance-first.totalDistance).toBeLessThan(10);expect(Math.hypot(next.position[0]-first.position[0],next.position[1]-first.position[1])).toBeLessThan(.001);
 await drive();await expect(page.getByTestId('learning-coach')).toContainText('Destination reached');expect((await state(page)).learning.attemptCount).toBe(2);expect((await state(page)).learning.remainingStops).toEqual([]);
});
