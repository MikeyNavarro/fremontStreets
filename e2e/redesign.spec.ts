import {writeFile} from 'node:fs/promises';
import {expect,test,type Page} from '@playwright/test';
import {chooseMode,closePanel,openMenu,openPanel,selectZone} from './ui-helpers';
const snapshot=(page:Page)=>page.evaluate(()=>{const g=(window as any).__FREMONT_GAME__;return {vehicle:g.vehicle,camera:g.camera,route:g.route,progress:g.progress,paused:g.paused,presentation:g.presentation,profile:g.profile,maxSpeed:g.maxSpeed,study:g.study};});
async function start(page:Page){await page.goto('./');await page.waitForFunction(()=>Boolean((window as any).__FREMONT_GAME__));await expect(page.getByTestId('overhead-view')).toHaveAttribute('data-renderer-ready','true');}
async function layout(page:Page){return page.evaluate(()=>{const view=document.querySelector('.viewport')!.getBoundingClientRect();return {width:innerWidth,height:innerHeight,view:{x:view.x,y:view.y,width:view.width,height:view.height},scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight};});}

test.beforeEach(async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 page.on('response',response=>{if(response.status()>=400)errors.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`);});
 (page as any).redesignErrors=errors;
});
test.afterEach(async({page})=>{expect((page as any).redesignErrors,'Redesigned screens must load without browser errors').toEqual([]);});

test('main menu opens real screens and driving uses over 90% of the desktop viewport',async({page},info)=>{
 await page.setViewportSize({width:1920,height:1080});await start(page);await expect(page.getByTestId('game-dialog')).toHaveAttribute('data-panel','menu');
 await expect(page.getByTestId('continue-driving')).toBeFocused();await page.screenshot({path:info.outputPath('01-main-menu.png')});
 await page.getByTestId('continue-driving').click();const box=await layout(page);expect(box.view.width*box.view.height/(box.width*box.height)).toBeGreaterThan(.90);expect(box.scrollWidth).toBe(box.width);expect(box.scrollHeight).toBe(box.height);
 await expect(page.locator('.left,.right,.layout')).toHaveCount(0);await expect(page.locator('.maplibregl-canvas')).toBeVisible();await expect(page.locator('#street-name')).toHaveText('Stevenson Boulevard');await page.screenshot({path:info.outputPath('02-overhead-driving.png')});
 await openMenu(page);await page.locator('[data-screen="menu"] [data-open-panel="zones"]').click();await expect(page.getByTestId('zone-select').locator('option')).toHaveCount(4);
 await closePanel(page);await chooseMode(page,'free');expect((await snapshot(page)).presentation.panel).toBeNull();await page.keyboard.press('Escape');await expect(page.getByTestId('game-dialog')).toBeVisible();await expect(page.getByTestId('game-dialog')).toHaveAttribute('data-panel','menu');await page.keyboard.press('Escape');await expect(page.getByTestId('game-dialog')).not.toBeVisible();
});

test('dialogs contain focus and preserve paused vehicle, queued turns, route, camera and progress',async({page})=>{
 await start(page);await chooseMode(page,'navigation');await page.getByTestId('challenge-start').click();await page.locator('#turn-left').click();await expect.poll(async()=>(await snapshot(page)).vehicle.pendingTurn).toBe('left');await page.getByTestId('pause-toggle').click();const before=await snapshot(page);
 for(const panel of ['settings','zones','routes','progress','help','information'] as const){
  // Merely browsing an existing panel must never replace an active drive.
  await openPanel(page,panel);const open=await snapshot(page);expect(open.vehicle).toEqual(before.vehicle);expect(open.camera).toBe(before.camera);expect(open.route).toEqual(before.route);expect(open.progress).toEqual(before.progress);expect(open.paused).toBe(true);
  for(let i=0;i<4;i++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>Boolean(document.activeElement?.closest('#game-dialog')))).toBe(true);}
  await page.keyboard.press('Escape');await expect(page.getByTestId('game-dialog')).not.toBeVisible();expect((await snapshot(page)).vehicle).toEqual(before.vehicle);
 }
 await chooseMode(page,'study');await closePanel(page);await page.getByTestId('pause-toggle').click();const study=await snapshot(page);await openPanel(page,'study');await closePanel(page);expect((await snapshot(page)).study).toEqual(study.study);expect((await snapshot(page)).vehicle).toEqual(study.vehicle);
});

test('settings suspend a moving car, inputs cannot steer, and driving resumes without a reset',async({page})=>{
 await start(page);await closePanel(page);await page.keyboard.down('w');await expect.poll(async()=>(await snapshot(page)).vehicle.speed).toBeGreaterThan(5);await openPanel(page,'settings');await page.keyboard.up('w');const suspended=await snapshot(page);
 await page.locator('#max-speed').focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('w');await page.waitForTimeout(250);const editing=await snapshot(page);expect(editing.vehicle).toEqual(suspended.vehicle);expect(editing.route).toEqual(suspended.route);expect(editing.paused).toBe(suspended.paused);
 await page.keyboard.press('Escape');await page.keyboard.down('w');await expect.poll(async()=>(await snapshot(page)).vehicle.totalDistance).toBeGreaterThan(suspended.vehicle.totalDistance+15);await page.keyboard.up('w');expect((await snapshot(page)).vehicle.totalDistance).toBeGreaterThan(15);
});

test('map settings, HUD controls and driver quality change presentation without changing the simulation',async({page},info)=>{
 await page.setViewportSize({width:1920,height:1080});await start(page);await chooseMode(page,'study');await page.getByTestId('study-start').click();await page.getByTestId('pause-toggle').click();const initial=await snapshot(page);expect(initial.route?.edgeIds.length).toBeGreaterThan(1);
 await openPanel(page,'settings');await page.locator('#map-orientation').selectOption('heading');await page.locator('#map-zoom').fill('15.5');await page.locator('#map-zoom').dispatchEvent('input');await page.locator('#map-follow').uncheck();await page.locator('#hud-visible').uncheck();
 const changed=await snapshot(page);expect(changed.presentation.map.headingUp).toBe(true);expect(changed.presentation.map.followVehicle).toBe(false);expect(changed.presentation.map.zoom).toBeCloseTo(15.5);expect(changed.vehicle).toEqual(initial.vehicle);expect(changed.profile).toBe('QUICK');expect(changed.maxSpeed).toBe(100);await expect(page.locator('.street-banner')).not.toBeVisible();
 await page.locator('#hud-visible').check();await page.locator('#map-orientation').selectOption('north');await page.locator('#map-zoom').fill('16.5');await page.locator('#map-zoom').dispatchEvent('input');await closePanel(page);await page.keyboard.press('c');await expect(page.getByTestId('driver-view')).toHaveAttribute('data-renderer-ready','true');
 const driver=await snapshot(page);expect(driver.vehicle).toEqual(initial.vehicle);expect(driver.presentation.driver.drawCalls).toBeGreaterThan(5);expect(driver.presentation.driver.triangles).toBeGreaterThan(1000);expect(driver.route).toEqual(initial.route);await expect(page.locator('#camera-driver')).toHaveAttribute('aria-pressed','true');await page.screenshot({path:info.outputPath('03-drivers-seat.png'),animations:'disabled'});
 await openPanel(page,'settings');await page.locator('#graphics-quality').selectOption('low');await closePanel(page);const efficient=await snapshot(page);expect(efficient.presentation.driver.quality).toBe('low');expect(efficient.presentation.driver.pixelRatio).toBeLessThan(1);expect(efficient.vehicle).toEqual(initial.vehicle);
 await page.setViewportSize({width:1280,height:800});await expect.poll(async()=>(await snapshot(page)).presentation.driver.aspect).toBeCloseTo(1280/(800-68),2);await page.keyboard.press('c');expect((await snapshot(page)).vehicle).toEqual(initial.vehicle);await expect(page.getByTestId('overhead-view')).toBeVisible();await expect(page.locator('#camera-overhead')).toHaveAttribute('aria-pressed','true');
});

test('personal street selection, navigation, learning dashboard and settings provide real data',async({page},info)=>{
 await page.setViewportSize({width:1920,height:1080});await start(page);await chooseMode(page,'study');await expect(page.getByTestId('study-target').locator('option')).toHaveCount(38);await expect(page.locator('.departure-card')).toContainText('2000 Stevenson Boulevard');await page.screenshot({path:info.outputPath('04-personal-street-selection.png')});
 const {events,...before}=(await snapshot(page)).vehicle;await page.getByTestId('study-preview').click();await expect(page.getByTestId('game-dialog')).not.toBeVisible();const {events:afterEvents,...after}=(await snapshot(page)).vehicle;expect(after).toEqual(before);await expect(page.locator('.destination-map-label')).toContainText('Paseo Padre Parkway');
 await openPanel(page,'study');await page.getByTestId('study-start').click();expect((await snapshot(page)).study.mission.status).toBe('active');await expect(page.getByTestId('game-dialog')).not.toBeVisible();await expect(page.locator('#hud-destination')).toContainText('Paseo Padre Parkway');
 await chooseMode(page,'navigation');await expect(page.getByTestId('challenge-start')).toBeVisible();await page.screenshot({path:info.outputPath('05-navigation-challenge.png')});
 await openPanel(page,'progress');await expect(page.locator('[data-progress-entry]')).toHaveCount(38);await expect(page.getByTestId('personal-dashboard')).toContainText('locations reached without GPS');await page.screenshot({path:info.outputPath('06-learning-dashboard.png')});
 await openPanel(page,'settings');await expect(page.locator('#max-speed')).toHaveValue('100');await page.screenshot({path:info.outputPath('07-settings.png')});
});

test('laptop and compact screens have no page overflow or inaccessible dialogs',async({page},info)=>{
 await page.setViewportSize({width:1280,height:800});await start(page);await closePanel(page);await page.screenshot({path:info.outputPath('08-laptop-driving.png')});
 for(const size of [{width:1024,height:768},{width:800,height:700},{width:390,height:844}]){
  await page.setViewportSize(size);const box=await layout(page);expect(box.scrollWidth).toBe(size.width);expect(box.scrollHeight).toBe(size.height);expect(box.view.width).toBe(size.width);expect(box.view.height).toBeGreaterThan(size.height*.85);
  await openPanel(page,'settings');const dialog=await page.getByTestId('game-dialog').boundingBox();expect(dialog).not.toBeNull();expect(dialog!.x).toBeGreaterThanOrEqual(0);expect(dialog!.y).toBeGreaterThanOrEqual(0);expect(dialog!.x+dialog!.width).toBeLessThanOrEqual(size.width);expect(dialog!.y+dialog!.height).toBeLessThanOrEqual(size.height);
  await page.locator('#graphics-quality').selectOption('balanced');await page.keyboard.press('Escape');await expect(page.getByTestId('game-dialog')).not.toBeVisible();
 }
});

test('reduced motion is respected and C keeps held throttle active across both cameras',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'reduce'});await start(page);await closePanel(page);expect(await page.locator('#camera-driver').evaluate(element=>getComputedStyle(element).transitionDuration)).toBe('0s');
 await page.keyboard.down('w');try{
  await expect.poll(async()=>(await snapshot(page)).vehicle.speed).toBeGreaterThan(8);const moving=await snapshot(page);await page.keyboard.press('c');await expect(page.getByTestId('driver-view')).toHaveAttribute('data-renderer-ready','true');const switched=await snapshot(page);expect(switched.vehicle.totalDistance).toBeGreaterThanOrEqual(moving.vehicle.totalDistance);expect(switched.vehicle.speed).toBeGreaterThanOrEqual(moving.vehicle.speed);expect(switched.presentation.driver.renderHeading).toBeCloseTo(switched.vehicle.heading,6);
  await expect.poll(async()=>(await snapshot(page)).vehicle.speed).toBeGreaterThan(switched.vehicle.speed+1);
  const sampleFrames=()=>page.evaluate(()=>new Promise<{frames:number;seconds:number;fps:number}>(resolve=>{let first:number|null=null,start:number|null=null,count=0;const frame=(time:number)=>{first??=time;if(time-first<1000){requestAnimationFrame(frame);return;}if(start===null)start=time;count++;if(time-start>=2000)resolve({frames:count-1,seconds:(time-start)/1000,fps:(count-1)*1000/(time-start)});else requestAnimationFrame(frame);};requestAnimationFrame(frame);}));
  const driver=await sampleFrames();await page.keyboard.press('c');await expect(page.getByTestId('overhead-view')).toBeVisible();const overhead=await sampleFrames();await page.keyboard.up('w');await openPanel(page,'settings');await page.locator('#graphics-quality').selectOption('low');await closePanel(page);await page.keyboard.down('w');await page.keyboard.press('c');const efficientDriver=await sampleFrames();await page.keyboard.press('c');const efficientOverhead=await sampleFrames();const metricsPath=info.outputPath('software-rendering-frame-samples.json');await writeFile(metricsPath,JSON.stringify({driver,overhead,efficient:{driver:efficientDriver,overhead:efficientOverhead},context:{browser:'Chromium using SwiftShader',viewport:{width:1440,height:1000},reducedMotion:true,warmupSeconds:1,sampleSeconds:2},note:'Short warmed software-rendered Chromium samples, not a hardware 60 FPS claim.'},null,2));await info.attach('software-rendering-frame-samples.json',{path:metricsPath,contentType:'application/json'});
  expect((await snapshot(page)).vehicle.totalDistance).toBeGreaterThan(switched.vehicle.totalDistance);
 }finally{await page.keyboard.up('w');}
});


test('Stevenson stays drivable outside the blue study overlay and map colors explain unavailable roads',async({page},info)=>{
 await start(page);await chooseMode(page,'study');await page.getByTestId('study-group').selectOption('ns');await closePanel(page);
 const key=page.getByTestId('map-key');await key.locator('summary').click();await expect(key).toContainText('Other solid roads: also drivable');await expect(key).toContainText('Amber dashed: unavailable');
 const initial=await snapshot(page);expect(initial.presentation.map.unavailableRoads).toBeGreaterThan(0);expect(initial.presentation.map.unavailableLineDasharray).toEqual([2,2]);expect(initial.vehicle.edgeId).toBe('417403358:0:f');
 await page.screenshot({path:info.outputPath('stevenson-map-key.png'),animations:'disabled'});
 await key.locator('summary').click();await page.keyboard.down('w');try{await expect.poll(async()=>(await snapshot(page)).vehicle.totalDistance,{timeout:35000}).toBeGreaterThan(150);}finally{await page.keyboard.up('w');}
 await expect(page.locator('#street-name')).toHaveText('Stevenson Boulevard');await expect(page.locator('#turn-prompt')).toHaveAttribute('data-road-status','open');expect((await snapshot(page)).vehicle.position).not.toEqual(initial.vehicle.position);
});
