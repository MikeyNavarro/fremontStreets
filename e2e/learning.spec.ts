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
