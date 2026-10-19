import {closePanel,chooseMode,openPanel} from './ui-helpers';
import {expect,test,type Page} from '@playwright/test';

async function snapshot(page:Page){return page.evaluate(()=>{const game=(window as any).__FREMONT_GAME__;return {vehicle:game.vehicle,study:game.study,route:game.route,decision:game.decision,zoneId:game.zoneId,camera:game.camera,maxSpeed:game.maxSpeed,profile:game.profile,departure:game.departure};});}
async function openStudy(page:Page){await page.goto('./');await page.waitForFunction(()=>Boolean((window as any).__FREMONT_GAME__));await expect(page.getByTestId('overhead-view')).toHaveAttribute('data-renderer-ready','true');await chooseMode(page,'study');await expect(page.getByTestId('study-target')).toBeVisible();}
async function driveMission(page:Page,timeout?:number){
  // Exercise the forgiving controls at a normal street-training pace. Separate
  // simulation tests verify 100 mph integration and the default capability.
  await openPanel(page,'settings');await page.locator('#max-speed').fill('35');await page.locator('#max-speed').dispatchEvent('change');await page.locator('#max-speed').blur();await closePanel(page);
  let decisionKey='';const initial=await snapshot(page),first=initial.decision;
  // Source-backed representative routes can change length after a topology fix.
  // Budget for the actual 35 mph route plus software-rendering overhead; still
  // require real controls, continuous driving and the original arrival result.
  const budget=timeout??Math.max(150000,initial.study.mission.route.distance/(35*0.44704)*2000+30000);
  if(first){const index=initial.study.mission.route.edgeIds.indexOf(first.incomingEdgeId),next=initial.study.mission.route.edgeIds[index+1];const choice=index>=0&&next?first.choices.find((item:any)=>item.edgeId===next):null;if(choice){decisionKey=`${first.incomingEdgeId}/${next}`;await page.locator(`#turn-${choice.kind}`).click();}}
  await page.keyboard.down('ArrowUp');
  try{await expect.poll(async()=>{
    const state=await snapshot(page);if(state.study.mission?.status==='complete')return true;
    const route=state.study.mission?.route,decision=state.decision;if(!route||!decision)return false;
    const index=route.edgeIds.indexOf(decision.incomingEdgeId);const nextId=route.edgeIds[index+1];const key=`${decision.incomingEdgeId}/${nextId}`;
    if(index>=0&&nextId&&key!==decisionKey){const choice=decision.choices.find((item:any)=>item.edgeId===nextId);expect(choice,'The source route must be selectable with the actual turn controls').toBeTruthy();decisionKey=key;await page.locator(`#turn-${choice.kind}`).click();}
    return false;
  },{timeout:budget,intervals:[100]}).toBe(true);}finally{await page.keyboard.up('ArrowUp');}
  await page.keyboard.down('ArrowDown');await expect.poll(async()=>(await snapshot(page)).vehicle.speed,{timeout:15000}).toBeLessThan(.2);await page.keyboard.up('ArrowDown');
}

test('personal curriculum has the exact 38 entries, confirmed road identities, HQ starts, and category overlays',async({page})=>{
  await openStudy(page);const initial=await snapshot(page);expect(initial.zoneId).toBe('all');expect(initial.profile).toBe('QUICK');expect(initial.maxSpeed).toBe(100);expect(initial.vehicle.speed).toBe(0);expect(initial.vehicle.position).toEqual(initial.departure.position);
  await expect(page.getByTestId('study-target').locator('option')).toHaveCount(38);await expect(page.locator('[data-study-entry]')).toHaveCount(38);
  await expect.poll(async()=>Number(await page.getByTestId('overhead-view').getAttribute('data-study-target-count'))).toBeGreaterThan(100);
  await expect.poll(async()=>Number(await page.getByTestId('overhead-view').getAttribute('data-study-intersection-count'))).toBeGreaterThan(10);
  await page.getByTestId('study-group').selectOption('ew');await expect(page.getByTestId('study-target').locator('option')).toHaveCount(21);
  await page.getByTestId('study-target').selectOption('ew01');await expect(page.getByTestId('study-start')).toBeEnabled();await expect(page.locator('#study-target-note')).toContainText('User confirmed Lake Arrowhead Avenue');
  await page.getByTestId('study-group').selectOption('ns');await expect(page.getByTestId('study-target').locator('option')).toHaveCount(17);
  await page.getByTestId('study-target').selectOption('ns01');const {events,...before}=(await snapshot(page)).vehicle;await page.getByTestId('study-preview').click();const {events:afterEvents,...after}=(await snapshot(page)).vehicle;expect(after).toEqual(before);
  await openPanel(page,'study');await page.getByTestId('study-exercise').selectOption('random');await page.getByTestId('study-start').click();const random=await snapshot(page);expect(random.study.readyIds).toContain(random.study.mission.targetId);expect(random.study.readyIds).toHaveLength(38);expect(random.vehicle.position).toEqual(random.departure.position);
});

test('road-to-road, return-to-HQ, and source-junction challenges complete using real driving controls',async({page})=>{
  test.setTimeout(480000);await openStudy(page);
  await page.getByTestId('study-target').selectOption('ns04');await page.getByTestId('study-exercise').selectOption('road-to-road');await page.getByTestId('study-from').selectOption('ew13');await page.getByTestId('study-start').click();
  await driveMission(page);expect((await snapshot(page)).study.progress.entries.ns04.roadToRoad).toBe(1);await expect(page.getByTestId('study-mission')).toContainText('Challenge complete');
  await openPanel(page,'study');await page.getByTestId('study-exercise').selectOption('return');await page.getByTestId('study-start').click();await driveMission(page);expect((await snapshot(page)).study.progress.entries.ns04.returns).toBe(1);
  await openPanel(page,'study');await page.getByTestId('study-exercise').selectOption('intersection');await page.getByTestId('study-start').click();const junction=(await snapshot(page)).study.mission.goal.nodeId;await driveMission(page,60000);expect((await snapshot(page)).study.progress.intersections[`osm-node-${junction}`].completed).toBe(1);
  const saved=(await snapshot(page)).study.progress;await page.reload();await page.waitForFunction(()=>Boolean((window as any).__FREMONT_GAME__));expect((await snapshot(page)).study.progress).toEqual(saved);expect((await snapshot(page)).vehicle.position).toEqual((await snapshot(page)).departure.position);expect((await snapshot(page)).zoneId).toBe('zone1');
});

test('no-GPS study, connection quizzes, and camera switching preserve authoritative state and progress',async({page})=>{
  test.setTimeout(240000);await openStudy(page);await page.getByTestId('study-target').selectOption('ns04');await page.getByTestId('study-exercise').selectOption('no-gps');await page.getByTestId('study-start').click();await expect(page.locator('#guidance')).not.toBeChecked();await expect(page.getByTestId('study-mission')).toContainText('no GPS');
  await page.getByTestId('pause-toggle').click();const before=await snapshot(page);await page.getByTestId('camera-toggle').click();await expect(page.getByTestId('driver-view')).toHaveAttribute('data-renderer-ready','true');const driver=await snapshot(page);expect(driver.vehicle).toEqual(before.vehicle);expect(driver.study).toEqual(before.study);expect(driver.route).toEqual(before.route);await page.keyboard.press('c');expect((await snapshot(page)).vehicle).toEqual(before.vehicle);await page.getByTestId('pause-toggle').click();
  await driveMission(page);expect((await snapshot(page)).study.progress.entries.ns04.unguided).toBe(1);
  await openPanel(page,'study');await page.getByTestId('study-exercise').selectOption('quiz');await page.getByTestId('study-start').click();const quiz=(await snapshot(page)).study.quiz;expect(quiz.choices).toContain(quiz.answer);await page.locator(`[data-study-answer="${quiz.answer}"]`).click();await expect(page.getByTestId('study-quiz')).toContainText('Correct.');expect((await snapshot(page)).study.progress.intersections[quiz.junctionId].identified).toBe(1);
  await openPanel(page,'settings');await page.locator('#max-speed').fill('80');await page.locator('#max-speed').dispatchEvent('change');expect((await snapshot(page)).maxSpeed).toBe(80);await page.locator('#max-speed').fill('150');await page.locator('#max-speed').dispatchEvent('change');expect((await snapshot(page)).maxSpeed).toBe(100);
});

test('a wrong turn recalculates a connected route without a vehicle reset',async({page})=>{
  test.setTimeout(90000);await openStudy(page);await page.getByTestId('study-target').selectOption('ns04');await page.getByTestId('study-exercise').selectOption('road-to-road');await page.getByTestId('study-from').selectOption('ew13');await page.getByTestId('study-start').click();
  const initial=await snapshot(page);let wrongQueued=false;await page.keyboard.down('ArrowUp');
  try{await expect.poll(async()=>{const state=await snapshot(page),decision=state.decision,route=state.study.mission.route;
    if(!wrongQueued&&decision){const index=route.edgeIds.indexOf(decision.incomingEdgeId),wanted=route.edgeIds[index+1];const wrong=decision.choices.find((choice:any)=>choice.edgeId!==wanted&&choice.kind!=='uturn');if(index>=0&&wanted&&wrong){await page.locator(`#turn-${wrong.kind}`).click();wrongQueued=true;}}
    return wrongQueued&&state.vehicle.totalDistance>30&&route.edgeIds[0]!==initial.route.edgeIds[0];
  },{timeout:65000,intervals:[150]}).toBe(true);}finally{await page.keyboard.up('ArrowUp');}
  const recovered=await snapshot(page);expect(recovered.vehicle.totalDistance).toBeGreaterThan(30);expect(recovered.vehicle.position).not.toEqual(initial.vehicle.position);expect(recovered.study.mission.status).toBe('active');
});

test('Zone 1 Main Roads keeps its boundary, targets, random destinations and HQ start focused on Zone 1',async({page,request})=>{
  await page.goto('./');await page.waitForFunction(()=>Boolean((window as any).__FREMONT_GAME__));await chooseMode(page,'zone1-main');
  await expect(page.getByTestId('study-group')).toHaveValue('zone1');const initial=await snapshot(page);expect(initial.zoneId).toBe('zone1');expect(initial.vehicle.position).toEqual(initial.departure.position);
  const network=await (await request.get('data/study-network.json')).json();
  const expected=network.entries.filter((entry:any)=>entry.zone1Location);await expect(page.getByTestId('study-target').locator('option')).toHaveCount(expected.length);
  await openPanel(page,'study');await page.getByTestId('study-exercise').selectOption('random');await page.getByTestId('study-start').click();const started=await snapshot(page);expect(started.study.group).toBe('zone1');const target=expected.find((entry:any)=>entry.id===started.study.mission.targetId);expect(target).toBeTruthy();expect(started.route.edgeIds.at(-1)).toBe(target.zone1Location.representativeEdge);
  await openPanel(page,'study');await page.getByTestId('study-exercise').selectOption('quiz');await page.getByTestId('study-start').click();const quiz=(await snapshot(page)).study.quiz;expect(network.intersections.find((item:any)=>item.id===quiz.junctionId).inZone1Study).toBe(true);
});
