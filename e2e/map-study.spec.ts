import {readFileSync} from 'node:fs';
import {test,expect,type Page} from '@playwright/test';
import type {MapStudyData,MapRoadSection} from '../src/map-study/types';
import {pointInZone} from '../src/map-study/geometry';

// This expected curriculum comes from the user's explicit scope, not a dynamic
// boundary classification or the implementation's exported target constant.
const zone1Ids=['ew14','ns07','ew12','ew11','ns05','ns17','ns03','ns08','ns02','ns01','ns15','ns06','ew10','ew09','ns04','ew06','ew13','ew15'];
const data=()=>JSON.parse(readFileSync(new URL('../public/data/map-study.json',import.meta.url),'utf8')) as MapStudyData;
const pageErrors=new WeakMap<Page,string[]>();
const state=(page:Page)=>page.evaluate(()=>{
  const g=(window as any).__FREMONT_MAP_STUDY__;
  return {mode:g.mode,selectedId:g.selectedId,comparisonId:g.comparisonId,fullRoad:g.fullRoad,visibleEntryIds:g.visibleEntryIds,
    selectedIntersectionId:g.selectedIntersectionId,camera:g.camera,ready:g.ready,quiz:g.quiz,
    selectionColor:g.selectionColor,comparisonColor:g.comparisonColor,renderedSelectedCount:g.renderedSelectedCount,renderedComparisonCount:g.renderedComparisonCount,boundariesVisible:g.boundariesVisible};
});
const symbols=(page:Page)=>page.evaluate(()=>{
  const labels=(window as any).__FREMONT_MAP_STUDY__.labels;
  return {visible:labels.visible,layers:labels.layers,geometryBuilds:labels.geometryBuilds,rendered:labels.rendered.map((f:any)=>({id:f.id,name:f.name,label:f.label,layer:f.layer,sourceWayIds:f.sourceWayIds}))};
});
async function settled(page:Page){await expect.poll(()=>page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.ready)).toBe(true);}
async function openLibrary(page:Page){if(!await page.locator('#road-drawer').isVisible())await page.locator('#toggle-library').click();}
async function closeLibrary(page:Page){if(await page.locator('#road-drawer').isVisible())await page.locator('#close-library').click();}
async function select(page:Page,id:string){
  await openLibrary(page);await page.locator(`[data-study-entry="${id}"]`).click();
  await expect.poll(async()=>(await state(page)).selectedId).toBe(id);await settled(page);
}
async function drag(page:Page,dx=180,dy=70){
  await closeLibrary(page);
  const origin=await page.evaluate(({dx,dy})=>{
    const canvas=document.querySelector('.maplibregl-canvas')!,box=canvas.getBoundingClientRect();
    return [[.45,.25],[.35,.3],[.5,.45]].map(([x,y])=>({x:box.x+box.width*x,y:box.y+box.height*y}))
      .find(p=>p.x+dx<box.right-20&&p.y+dy<box.bottom-20&&document.elementFromPoint(p.x,p.y)===canvas&&document.elementFromPoint(p.x+dx,p.y+dy)===canvas);
  },{dx,dy});
  expect(origin,'drag starts and ends on uncovered map canvas').toBeTruthy();
  await page.mouse.move(origin!.x,origin!.y);await page.mouse.down();
  await page.mouse.move(origin!.x+dx,origin!.y+dy,{steps:12});
  await page.waitForTimeout(200);await page.mouse.up();await settled(page);
}
function sectionPoints(sections:MapRoadSection[],verified=false):number[][]{
  const candidates:{position:number[];length:number}[]=[];
  for(const section of sections){
    const lines=verified?section.verifiedInside.coordinates:section.inside.coordinates;
    for(const line of lines)for(let i=1;i<line.length;i++)candidates.push({position:[(line[i-1][0]+line[i][0])/2,(line[i-1][1]+line[i][1])/2],length:Math.hypot((line[i][0]-line[i-1][0])*88000,(line[i][1]-line[i-1][1])*111000)});
  }
  // Interior points of long original primitives avoid testing a tiny median
  // segment immediately beside a different named road at every zoom level.
  if(verified)candidates.sort((a,b)=>b.length-a.length);
  return candidates.map(candidate=>candidate.position);
}
async function clickRoad(page:Page,id:string,verified=false){
  const model=data(),points=sectionPoints(model.sections.filter(s=>s.entryId===id),verified);
  await closeLibrary(page);await settled(page);
  const target=await page.evaluate(({points,verified})=>{
    const g=(window as any).__FREMONT_MAP_STUDY__,canvas=document.querySelector('.maplibregl-canvas')!,box=canvas.getBoundingClientRect();
    return points.map((position,index)=>{const p=g.project(position);return{x:box.x+p.x,y:box.y+p.y,position,index};})
      .filter(p=>p.x>box.x+35&&p.x<box.right-35&&p.y>box.y+65&&p.y<box.bottom-90&&document.elementFromPoint(p.x,p.y)===canvas)
      .sort((a,b)=>verified?a.index-b.index:Math.hypot(a.x-box.x-box.width/2,a.y-box.y-box.height/2)-Math.hypot(b.x-box.x-box.width/2,b.y-box.y-box.height/2))[0];
  },{points,verified});
  expect(target,`a visible sourced section of ${id} must be clickable`).toBeTruthy();
  await test.info().attach(`source-click-${id}`,{body:JSON.stringify({id,verified,...target}),contentType:'application/json'});
  await page.mouse.click(target.x,target.y);
  if(await page.locator('#disambiguation').isVisible()){
    const label=model.entries.find(e=>e.id===id)!.label;
    await page.locator('#disambiguation').getByRole('button').filter({hasText:label}).first().click();
  }
  return target;
}

test.beforeEach(async({page})=>{
  const errors:string[]=[];pageErrors.set(page,errors);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto('./');
  await page.waitForFunction(()=>Boolean((window as any).__FREMONT_MAP_STUDY__));
  await settled(page);
});
test.afterEach(async({page})=>{expect(pageErrors.get(page)??[]).toEqual([]);});

test('opens directly into the exact Zone 1 map curriculum with no active driving application',async({page})=>{
  const initial=await state(page);
  expect(initial.mode).toBe('zone1');expect([...initial.visibleEntryIds].sort()).toEqual([...zone1Ids].sort());
  await expect(page.locator('#study-mode')).toHaveValue('zone1');
  await expect(page.locator('#road-list [data-study-entry]')).toHaveCount(18);
  await expect(page.locator('#map-notice')).toContainText(/approximate/i);
  expect(await page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.renderedRoadCount)).toBeGreaterThan(0);
  expect(initial.boundariesVisible).toBe(true);
  await page.locator('#map-options summary').click();await page.locator('#boundary-toggle').uncheck();
  expect((await state(page)).boundariesVisible).toBe(false);
  await page.locator('#boundary-toggle').check();await page.locator('#map-options summary').click();
  expect((await state(page)).boundariesVisible).toBe(true);
  expect(await page.evaluate(()=>typeof(window as any).__FREMONT_GAME__)).toBe('undefined');
  await expect(page.locator('#camera-driver,#throttle,#brake,#speedometer,#max-speed,#profile')).toHaveCount(0);
  await closeLibrary(page);
  const fraction=await page.locator('.maplibregl-canvas').evaluate(element=>{const r=element.getBoundingClientRect();return r.width*r.height/(innerWidth*innerHeight);});
  expect(fraction).toBeGreaterThan(.8);
  await page.locator('#study-mode').selectOption('all');
  await expect(page.locator('#road-list [data-study-entry]')).toHaveCount(38);
  expect((await state(page)).visibleEntryIds.slice().sort()).toEqual(data().entries.map(e=>e.id).sort());
  await page.locator('#study-mode').selectOption('zone1');
  expect((await state(page)).visibleEntryIds.slice().sort()).toEqual([...zone1Ids].sort());
});

test('Stevenson selection uses orange sourced Zone 1 geometry and supports its full imported extent',async({page})=>{
  await select(page,'ew13');
  expect((await state(page)).selectionColor).toBe('#FF8C00');
  await expect.poll(async()=>(await state(page)).renderedSelectedCount).toBeGreaterThan(0);
  const limited=await page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.selectedGeometry);
  expect(limited.features.length).toBeGreaterThan(0);
  expect(limited.features.every((f:any)=>f.properties.entryId==='ew13'&&!f.properties.outside)).toBe(true);
  const allowed=new Set(data().entries.find(e=>e.id==='ew13')!.sourceWayIds);
  expect(limited.features.every((f:any)=>f.properties.sourceWayIds.every((id:string)=>allowed.has(id)))).toBe(true);
  const expectedLimited=data().sections.filter(section=>section.entryId==='ew13'&&section.inside.coordinates.length>0);
  expect(limited.features.map((f:any)=>f.properties.sectionId).sort()).toEqual(expectedLimited.map(section=>section.id).sort());
  for(const feature of limited.features)expect(feature.geometry).toEqual(expectedLimited.find(section=>section.id===feature.properties.sectionId)!.inside);
  await page.locator('#show-full-road').check();await settled(page);
  const full=await page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.selectedGeometry);
  expect((await state(page)).fullRoad).toBe(true);
  const sourceSections=data().sections.filter(section=>section.entryId==='ew13');
  expect(sourceSections.reduce((sum,section)=>sum+section.lengths.outside,0)).toBeGreaterThan(0);
  expect(full.features).toHaveLength(sourceSections.length);
  for(const feature of full.features){
    const section=sourceSections.find(section=>section.id===feature.properties.sectionId)!;
    expect(feature.geometry).toEqual(section.geometry);
    expect(feature.properties.clipped).toBe(false);
  }
  await expect(page.locator('#selection-panel')).toContainText(/available|imported/i);
  await expect(page.locator('#selection-panel')).toContainText(/outside approximate Zone 1/i);
  await select(page,'ns03');
  expect((await state(page)).selectedId).toBe('ns03');
  const replacement=await page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.selectedGeometry);
  expect(replacement.features.every((f:any)=>f.properties.entryId==='ns03')).toBe(true);
  expect(await page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.renderedRoadCount)).toBeGreaterThan(0);
});

test('arrow shortcuts highlight sourced streets in curriculum order and wrap in both study areas',async({page})=>{
  const canvas=page.locator('.maplibregl-canvas');
  async function highlighted(id:string){
    await expect.poll(async()=>(await state(page)).selectedId).toBe(id);await settled(page);
    const geometry=await page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.selectedGeometry);
    expect(geometry.features.length).toBeGreaterThan(0);
    const allowed=new Set(data().entries.find(entry=>entry.id===id)!.sourceWayIds);
    expect(geometry.features.every((feature:any)=>feature.properties.entryId===id&&feature.properties.sourceWayIds.every((way:string)=>allowed.has(way)))).toBe(true);
    await expect.poll(async()=>(await state(page)).renderedSelectedCount).toBeGreaterThan(0);
    expect((await state(page)).selectionColor).toBe('#FF8C00');
    await expect(page.locator('#selection-panel h2')).toHaveText(data().entries.find(entry=>entry.id===id)!.label);
  }
  await closeLibrary(page);await canvas.focus();
  await page.keyboard.down('ArrowDown');await highlighted(zone1Ids[0]);
  // Repeated keydown events represent holding one physical press, including
  // after selection moves focus from the map to the details panel.
  const camera=(await state(page)).camera;
  await page.keyboard.down('ArrowDown');await page.keyboard.down('ArrowDown');await page.keyboard.up('ArrowDown');
  expect((await state(page)).selectedId).toBe(zone1Ids[0]);expect((await state(page)).camera).toEqual(camera);
  await canvas.focus();await page.keyboard.press('ArrowDown');await highlighted(zone1Ids[1]);
  await page.keyboard.press('ArrowUp');await highlighted(zone1Ids[0]);
  await page.keyboard.press('ArrowUp');await highlighted(zone1Ids.at(-1)!);
  await page.keyboard.press('ArrowDown');await highlighted(zone1Ids[0]);
  await page.locator('#clear-selection').click();await canvas.focus();
  await page.keyboard.press('ArrowUp');await highlighted(zone1Ids.at(-1)!);
  await page.locator('#study-mode').selectOption('all');
  const allIds=data().entries.map(entry=>entry.id);
  await select(page,allIds.at(-1)!);await canvas.focus();
  await page.keyboard.press('ArrowDown');await highlighted(allIds[0]);
  await page.keyboard.press('ArrowUp');await highlighted(allIds.at(-1)!);
  expect((await state(page)).mode).toBe('all');
});

test('arrow shortcuts preserve form controls, search choices and protected practice answers',async({page})=>{
  await select(page,'ew13');
  const search=page.locator('#map-search');
  await search.fill('Fremont');await search.press('ArrowDown');
  const searchChoice=page.locator('#search-results button').first();
  await expect(searchChoice).toBeFocused();expect((await state(page)).selectedId).toBe('ew13');
  await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowUp');
  expect((await state(page)).selectedId).toBe('ew13');await expect(page.locator('#search-results')).toBeVisible();
  await page.keyboard.press('Escape');await search.fill('');
  // Native select arrows must retain their browser behavior, instead of
  // replacing the selected road or swallowing the control's change event.
  await page.locator('#study-mode').focus();await page.keyboard.press('ArrowDown');
  await expect(page.locator('#study-mode')).toHaveValue('all');expect((await state(page)).selectedId).toBe('ew13');
  await page.keyboard.press('ArrowUp');await expect(page.locator('#study-mode')).toHaveValue('zone1');
  expect((await state(page)).selectedId).toBe('ew13');
  await page.locator('#compare-road').focus();await page.keyboard.press('ArrowDown');
  await expect.poll(async()=>(await state(page)).comparisonId).toBe(zone1Ids[0]);
  expect((await state(page)).selectedId).toBe('ew13');await settled(page);
  await page.locator('.maplibregl-canvas').focus();await page.keyboard.press('Shift+ArrowDown');
  expect((await state(page)).selectedId).toBe('ew13');
  await page.locator('#open-practice').click();await page.keyboard.press('ArrowDown');
  await expect(page.locator('#quiz-identify')).toBeVisible();expect((await state(page)).selectedId).toBe('ew13');
  await page.locator('#quiz-identify').click();await settled(page);
  const before=(await state(page)).quiz,attempts=await page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.history.attempts);
  await page.locator('.maplibregl-canvas').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowUp');await settled(page);
  expect((await state(page)).quiz).toEqual(before);expect(before.finished).toBe(false);expect(before.assisted).toBe(false);
  expect((await state(page)).selectedId).toBe('ew13');
  expect(await page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.history.attempts)).toBe(attempts);
  await expect(page.locator('#selection-panel')).not.toBeVisible();await expect(search).not.toBeVisible();
  await expect(page.locator('#road-drawer')).not.toBeVisible();await expect(page.locator('#map-status')).toHaveText('');
  expect((await symbols(page)).layers.every((layer:any)=>layer.visibility==='none')).toBe(true);
  await expect(page.locator('#quiz-hint')).toBeEnabled();
});

test('real map clicks select source-backed road identities and manual exploration is persistent',async({page})=>{
  await select(page,'ew13');
  await page.locator('#clear-selection').click();
  expect((await state(page)).selectedId).toBeNull();
  await clickRoad(page,'ew13');
  await expect.poll(async()=>(await state(page)).selectedId).toBe('ew13');
  await settled(page);const original=(await state(page)).camera;await drag(page);
  const pose=(await state(page)).camera;
  expect(pose.center).not.toEqual(original.center);
  await page.waitForTimeout(1200);
  expect((await state(page)).camera).toEqual(pose);
  await page.locator('.maplibregl-ctrl-zoom-in').click();await settled(page);
  expect((await state(page)).camera.zoom).toBeGreaterThan(pose.zoom);
  expect((await state(page)).selectedId).toBe('ew13');
});

test('overlapping road hits offer an explicit identity choice instead of silently picking a street',async({page})=>{
  await select(page,'ew13');await page.locator('#show-intersections').uncheck();await settled(page);
  const junction=data().junctions.find(j=>j.kind==='junction'&&j.inZone1&&j.entryIds.includes('ew13')&&j.entryIds.includes('ns03'));
  expect(junction,'a sourced Fremont/Stevenson junction is required for this interaction').toBeTruthy();
  const component=junction!.components.find(c=>c.roadNames.includes('Stevenson Boulevard')&&c.roadNames.includes('Fremont Boulevard'));
  expect(component,'the click uses an actual shared source node, not a logical-junction centroid').toBeTruthy();
  await closeLibrary(page);
  const point=await page.evaluate(position=>(window as any).__FREMONT_MAP_STUDY__.project(position),component!.position);
  const box=(await page.locator('.maplibregl-canvas').boundingBox())!;
  await page.mouse.click(box.x+point.x,box.y+point.y);
  await expect(page.locator('#disambiguation')).toBeVisible();
  await expect(page.locator('#disambiguation')).toContainText('Stevenson Boulevard');
  await expect(page.locator('#disambiguation')).toContainText('Fremont Boulevard');
  await page.locator('#disambiguation').getByRole('button').filter({hasText:'Fremont Boulevard'}).click();
  await expect.poll(async()=>(await state(page)).selectedId).toBe('ns03');
});

test('source junction inspection and ordered walkthrough preserve actual component identities',async({page})=>{
  await select(page,'ew13');
  const model=data(),byId=new Map(model.junctions.map(junction=>[junction.id,junction]));
  const zone=model.zones.zones.find(zone=>zone.id==='zone1')!.geometry!;
  const scopedRows=(section:MapRoadSection)=>section.junctionOrder.filter(row=>byId.get(row.junctionId)?.components.some(component=>section.sourceNodeIds.includes(component.nodeId)&&pointInZone(component.position,zone)));
  const section=model.sections.find(section=>section.entryId==='ew13'&&section.inside.coordinates.length&&scopedRows(section).length>2)!;
  const expectedOrder=scopedRows(section).map(row=>row.junctionId);
  await page.locator('#section-select').selectOption(section.id);await settled(page);
  const junctions=await page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.displayedJunctions);
  const real=junctions.filter((j:any)=>j.kind==='junction');expect(real.length).toBeGreaterThan(1);
  expect(real.slice(0,2).map((j:any)=>j.id)).toEqual(expectedOrder.slice(0,2));
  await page.locator(`[data-junction-id="${real[0].id}"]`).first().click();await settled(page);
  expect((await state(page)).selectedIntersectionId).toBe(real[0].id);
  await expect(page.locator('#selection-panel')).toContainText(real[0].roadNames[0]);
  await expect(page.locator('#selection-panel')).toContainText(/unresolved|unverified|not verified/i);
  const sourceNodeIds=new Set(data().junctions.find(j=>j.id===real[0].id)!.nodeIds);
  expect(real[0].components.every((c:any)=>sourceNodeIds.has(c.nodeId))).toBe(true);
  await page.locator('#junction-next').click();await settled(page);
  const next=(await state(page)).selectedIntersectionId;expect(next).toBe(expectedOrder[1]);
  await page.locator('#junction-previous').click();await settled(page);
  expect((await state(page)).selectedIntersectionId).toBe(real[0].id);
  // Click the actual projected native marker after navigating to its position.
  await page.locator('#close-intersection').click();
  const point=await page.evaluate(position=>(window as any).__FREMONT_MAP_STUDY__.project(position),real[0].position);
  const box=(await page.locator('.maplibregl-canvas').boundingBox())!;
  await page.mouse.click(box.x+point.x,box.y+point.y);
  await expect.poll(async()=>(await state(page)).selectedIntersectionId).toBe(real[0].id);
  // A logical junction can span the boundary and contain different named pairs.
  // The selected Driscoll marker must use its own in-zone source node, without
  // inheriting independent evidence for the separate Osgood/Washington pair.
  await select(page,'ew14');
  const driscoll=await page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.displayedJunctions.find((j:any)=>j.id==='map-junction-1676005285'));
  expect(driscoll).toBeTruthy();expect(driscoll.displayNodeId).toBe('1676005285');
  const original=model.junctions.find(j=>j.id===driscoll.id)!;
  expect(driscoll.position).toEqual(original.components.find(component=>component.nodeId===driscoll.displayNodeId)!.position);
  expect(pointInZone(driscoll.position,model.zones.zones.find(zone=>zone.id==='zone1')!.geometry!)).toBe(true);
  expect(driscoll.evidence.topology.status).toBe('Unresolved');
  expect(driscoll.displayQuizPairs).toEqual([]);
  await page.locator(`[data-junction-id="${driscoll.id}"]`).click();await settled(page);
  await expect(page.locator('.intersection-detail')).not.toContainText(/Independent physical evidence applies to:.*(?:Osgood|Washington)/);
});

test('comparison distinguishes direct source junctions from grade-separated visual crossings',async({page})=>{
  await select(page,'ew13');
  await page.locator('[data-junction-id]').filter({hasText:'Mission Boulevard'}).first().click();await settled(page);
  await expect(page.locator('#map-status')).toContainText('Mission Boulevard');
  await page.locator('#close-intersection').click();
  await expect(page.locator('#map-status')).toContainText('Stevenson Boulevard');
  await expect(page.locator('#map-status')).not.toContainText('Mission Boulevard');
  await page.locator('#compare-road').selectOption('ns03');await settled(page);
  expect((await state(page)).comparisonId).toBe('ns03');
  expect((await state(page)).comparisonColor).toBe('#4DA6FF');
  await expect.poll(async()=>(await state(page)).renderedComparisonCount).toBeGreaterThan(0);
  await expect(page.locator('#map-status')).toContainText('Stevenson Boulevard');
  await expect(page.locator('#map-status')).toContainText('Fremont Boulevard');
  await expect(page.locator('#map-status')).not.toContainText('Mission Boulevard');
  await expect(page.locator('#selection-panel')).toContainText(/shared|direct|junction/i);
  await page.locator('#study-mode').selectOption('all');
  await select(page,'ew17');await page.locator('#compare-road').selectOption('ns02');await settled(page);
  await expect(page.locator('#selection-panel')).toContainText(/nonconnecting|grade-separated|no direct|do not directly/i);
  const crossings=data().junctions.filter(j=>j.kind==='nonconnecting-crossing'&&j.entryIds.includes('ew17')&&j.entryIds.includes('ns02'));
  expect(crossings.length).toBeGreaterThan(0);expect(crossings.every(j=>j.quizPairs.length===0)).toBe(true);
});

test('search preserves study identity and allows connector inspection without expanding the curriculum',async({page})=>{
  await page.locator('#map-search').fill('Stevenson');
  await page.locator('#search-results').getByRole('button',{name:/Stevenson Boulevard/}).click();
  await expect.poll(async()=>(await state(page)).selectedId).toBe('ew13');
  await page.locator('#map-search').fill('Liberty Street');
  await page.locator('#search-results').getByRole('button',{name:/Liberty Street/}).first().click();
  await settled(page);
  await expect(page.locator('#selection-panel')).toContainText('Liberty Street');
  expect((await state(page)).visibleEntryIds.slice().sort()).toEqual([...zone1Ids].sort());
  await page.locator('#map-home').click();await settled(page);
  await page.locator('#map-options summary').click();
  await page.locator('#find-hq').click();await settled(page);
  const center=(await state(page)).camera.center,station=data().headquarters.position;
  expect(center[0]).toBeCloseTo(station[0],5);expect(center[1]).toBeCloseTo(station[1],5);
  await expect(page.locator('body')).not.toContainText('Approximate public-road departure');
});

test('native source-name labels survive selection, panning and visibility changes',async({page})=>{
  await select(page,'ns03');await closeLibrary(page);
  await expect.poll(async()=>(await symbols(page)).rendered.map((f:any)=>f.name)).toContain('Fremont Boulevard');
  const before=await symbols(page);
  expect(before.layers.every((layer:any)=>layer.placement==='line')).toBe(true);
  expect(before.rendered.every((f:any)=>typeof f.id==='string'&&f.id.startsWith('road-label:'))).toBe(true);
  await drag(page,120,40);
  await expect.poll(async()=>(await symbols(page)).rendered.map((f:any)=>f.name)).toContain('Fremont Boulevard');
  await page.locator('#map-options summary').click();await page.locator('#labels-toggle').uncheck();
  await expect.poll(async()=>(await symbols(page)).rendered.length).toBe(0);
  expect((await symbols(page)).layers.every((layer:any)=>layer.visibility==='none')).toBe(true);
  await page.locator('#labels-toggle').check();await page.locator('#map-options summary').click();
  await expect.poll(async()=>(await symbols(page)).rendered.length).toBeGreaterThan(0);
  await page.locator('#study-mode').selectOption('all');await select(page,'ew17');await closeLibrary(page);
  await expect.poll(async()=>(await symbols(page)).rendered.map((f:any)=>f.name)).toContain('Auto Mall Parkway');
  await expect.poll(async()=>(await symbols(page)).rendered.map((f:any)=>f.name)).toContain('Durham Road');
  expect((await symbols(page)).rendered.some((f:any)=>f.label==='Auto Mall Parkway / Durham Road')).toBe(false);
});

test('identify practice hides answer surfaces, records an actual answer and preserves old storage',async({page})=>{
  const oldKey='fremont-streets-personal-study-v1',oldValue='{"version":1,"entries":{"ew13":{"visits":7}},"intersections":{}}';
  await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:oldKey,value:oldValue});
  await select(page,'ew13');await page.locator('#open-practice').click();await page.locator('#quiz-identify').click();
  const quiz=(await state(page)).quiz;expect(quiz.kind).toBe('identify');expect(zone1Ids).toContain(quiz.entryId);
  await expect(page.locator('#road-drawer')).not.toBeVisible();await expect(page.locator('#selection-panel')).not.toBeVisible();
  await expect(page.locator('#map-search')).not.toBeVisible();
  await expect.poll(async()=>(await symbols(page)).rendered.length).toBe(0);
  expect((await symbols(page)).layers.every((layer:any)=>layer.visibility==='none')).toBe(true);
  await page.locator(`[data-quiz-answer="${quiz.entryId}"]`).click();
  await expect(page.locator('#quiz-panel .quiz-feedback')).toHaveText(/^Correct —/);
  await page.locator('#quiz-end').click();await settled(page);
  expect(await page.evaluate(key=>localStorage.getItem(key),oldKey)).toBe(oldValue);
  await page.reload();await page.waitForFunction(()=>Boolean((window as any).__FREMONT_MAP_STUDY__));await settled(page);
  await expect(page.locator(`[data-study-entry="${quiz.entryId}"]`)).toContainText(/identified/i);
  expect(await page.evaluate(key=>localStorage.getItem(key),oldKey)).toBe(oldValue);
});

test('find-the-road scores actual source-identity clicks and intersection practice uses eligible physical facts',async({page})=>{
  await select(page,'ew13');await page.locator('#open-practice').click();await page.locator('#quiz-find').click();
  let quiz=(await state(page)).quiz;expect(quiz.kind).toBe('find');
  const attemptsBefore=await page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.history.attempts);
  await clickRoad(page,quiz.entryId,true);
  // Citywide views can place nearby real roads inside the same hit tolerance.
  // Recover exactly as a learner would: keep the attempt unscored and zoom
  // with an ordinary wheel gesture before clicking the sourced section again.
  for(let retry=0;retry<3&&!((await state(page)).quiz.finished);retry++){
    await expect(page.locator('#quiz-panel .quiz-feedback')).toContainText(/Several roads overlap.*No result was scored/);
    expect(await page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.history.attempts)).toBe(attemptsBefore);
    const beforeZoom=(await state(page)).camera.zoom;
    await page.mouse.wheel(0,-650);
    await expect.poll(async()=>(await state(page)).camera.zoom).toBeGreaterThan(beforeZoom+.1);await settled(page);
    await clickRoad(page,quiz.entryId,true);
  }
  await expect(page.locator('#quiz-panel .quiz-feedback')).toHaveText(/^Correct —/);
  expect(await page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.history.attempts)).toBe(attemptsBefore+1);
  await page.locator('#quiz-end').click();
  await select(page,'ew13');await page.locator('#open-practice').click();await page.locator('#quiz-intersection').click();
  quiz=(await state(page)).quiz;
  expect(quiz).toBeTruthy();expect(quiz.kind).toBe('intersection');
  const junction=data().junctions.find(j=>j.id===quiz.junctionId)!;
  expect(junction.kind).toBe('junction');expect(junction.quizPairs.length).toBeGreaterThan(0);
  expect(junction.evidence.topology.status).not.toBe('Conflicted');
  const component=junction.components.find(component=>component.nodeId===quiz.nodeId);
  expect(component,'the question marker identifies an actual source component').toBeTruthy();
  expect(quiz.position).toEqual(component!.position);
  expect(pointInZone(quiz.position,data().zones.zones.find(zone=>zone.id==='zone1')!.geometry!)).toBe(true);
  expect(junction.quizPairs.some(pair=>pair.nodeIds.includes(quiz.nodeId))).toBe(true);
  const before=await page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.history.correctIntersectionQuestions);
  await expect.poll(async()=>(await symbols(page)).rendered.length).toBe(0);
  await expect(page.locator('#quiz-panel')).not.toContainText(/all turns.*legal|legal turn.*verified/i);
  const contextIds=new Set(junction.roads.filter(road=>road.entryIds.includes(quiz.entryId)).map(road=>road.id));
  const pair=junction.quizPairs.find(pair=>pair.nodeIds.includes(quiz.nodeId)&&pair.roadIds.some(id=>contextIds.has(id)))!;
  const answerId=pair.roadIds.find(id=>!contextIds.has(id))!;
  await page.locator(`[data-quiz-answer="${answerId}"]`).click();
  await expect(page.locator('#quiz-panel .quiz-feedback')).toHaveText(/^Correct —/);
  expect(await page.evaluate(()=>(window as any).__FREMONT_MAP_STUDY__.history.correctIntersectionQuestions)).toBe(before+1);
});

test('narrow layout keeps the map usable and storage denial produces a warning without breaking selection',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.reload();
  await page.waitForFunction(()=>Boolean((window as any).__FREMONT_MAP_STUDY__));await settled(page);
  await expect(page.locator('#road-drawer')).not.toBeVisible();
  await select(page,'ew13');await closeLibrary(page);await drag(page,45,35);
  expect((await state(page)).selectedId).toBe('ew13');
  const mobileZoom=(await state(page)).camera.zoom;
  await page.locator('.maplibregl-ctrl-zoom-in').click();await settled(page);
  expect((await state(page)).camera.zoom).toBeGreaterThan(mobileZoom);
  const credits=page.locator('.maplibregl-ctrl-attrib-inner'),info=page.locator('.maplibregl-ctrl-attrib-button');
  await info.click();if(!await credits.isVisible())await info.click();
  await expect(credits).toBeVisible();await expect(credits).toContainText('OpenStreetMap');
  const notice=(await page.locator('#map-notice').boundingBox())!,attribution=(await page.locator('.maplibregl-ctrl-attrib').boundingBox())!;
  expect(notice.y+notice.height<=attribution.y||attribution.y+attribution.height<=notice.y||notice.x+notice.width<=attribution.x||attribution.x+attribution.width<=notice.x,'boundary notice and attribution must not overlap').toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const context=await page.context().browser()!.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Storage unavailable','QuotaExceededError');};});
  const isolated=await context.newPage();await isolated.goto(page.url());
  await isolated.waitForFunction(()=>Boolean((window as any).__FREMONT_MAP_STUDY__));await settled(isolated);
  await select(isolated,'ew13');await expect(isolated.locator('#storage-warning')).toBeVisible();
  expect((await state(isolated)).selectedId).toBe('ew13');await context.close();
});

test('runtime loads the versioned map dataset and local native renderer without vehicle or remote services',async({page})=>{
  const responses:string[]=[];page.on('response',response=>responses.push(response.url()));
  await page.reload();await page.waitForFunction(()=>Boolean((window as any).__FREMONT_MAP_STUDY__));await settled(page);
  expect(responses.some(url=>new URL(url).pathname.endsWith('/data/map-study.json')&&new URL(url).searchParams.has('v'))).toBe(true);
  expect(responses.filter(url=>/\/data\/(roads|study-network|verification)\.json/.test(url))).toEqual([]);
  expect(responses.filter(url=>/\/three[-./]|\/simulation\.[jt]s|\/driver\.[jt]s/.test(url))).toEqual([]);
  expect(responses.filter(url=>/^https?:/.test(url)&&new URL(url).origin!==new URL(page.url()).origin)).toEqual([]);
});
