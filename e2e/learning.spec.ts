import {test,expect,type Page} from '@playwright/test';
import {closePanel,openPanel,chooseMode} from './ui-helpers';
const state=(page:Page)=>page.evaluate(()=>{const g=(window as any).__FREMONT_GAME__;return {vehicle:g.vehicle,camera:g.camera,map:g.presentation.map,learning:g.learning,paused:g.paused};});
test.beforeEach(async({page})=>{await page.goto('/');await page.waitForFunction(()=>!!(window as any).__FREMONT_GAME__);await closePanel(page);await expect(page.getByTestId('overhead-view')).toHaveAttribute('data-renderer-ready','true');});
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
