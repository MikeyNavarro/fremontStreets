import {chromium,expect} from '@playwright/test';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

// Capture actual user interactions. Read-only diagnostics report what the map
// rendered; they never set camera position, select roads or answer questions.
const argument=(name,fallback)=>{const index=process.argv.indexOf(name);return index<0?fallback:process.argv[index+1];};
const target=argument('--url','http://127.0.0.1:4182/');
const output=resolve(argument('--out','docs/screenshots/zone-overview'));
await mkdir(output,{recursive:true});
const browser=await chromium.launch({
  executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
  args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
});
const observations=[],errors=[];
let page;
const ready=async()=>{await expect.poll(()=>page.evaluate(()=>window.__FREMONT_MAP_STUDY__.ready),{timeout:15000}).toBe(true);};
const openLibrary=async()=>{if(!await page.locator('#road-drawer').isVisible())await page.locator('#toggle-library').click();};
const closeLibrary=async()=>{if(await page.locator('#road-drawer').isVisible())await page.locator('#close-library').click();};
const select=async id=>{await openLibrary();await page.locator(`[data-study-entry="${id}"]`).click();await ready();};
async function capture(name){
  await ready();
  // Preserve normal native symbol/collision fade in the recorded final image.
  await page.waitForTimeout(700);
  const snapshot=await page.evaluate(()=>{
    const g=window.__FREMONT_MAP_STUDY__,labels=g.labels;
    return {mode:g.mode,selectedId:g.selectedId,comparisonId:g.comparisonId,fullRoad:g.fullRoad,camera:g.camera,visibleEntryIds:g.visibleEntryIds,
      selectedIntersectionId:g.selectedIntersectionId,highlightFeatureCount:g.selectedGeometry?.features.length??0,
      selectionColor:g.selectionColor,comparisonColor:g.comparisonColor,renderedSelectedCount:g.renderedSelectedCount,
      displayedJunctions:g.displayedJunctions.map(j=>({id:j.id,kind:j.kind,position:j.position,roadNames:j.roadNames,nodeIds:j.nodeIds,statusLabel:j.statusLabel})),
      labelLayers:labels.layers,renderedLabels:labels.rendered.map(f=>({id:f.id,name:f.name,label:f.label,sourceWayIds:f.sourceWayIds,layer:f.layer})),
      quiz:g.quiz,drawerVisible:!document.getElementById('road-drawer').hidden,
      viewport:{width:innerWidth,height:innerHeight},usableMapViewport:g.viewport,mapRect:(()=>{const r=document.querySelector('.maplibregl-canvas').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};})(),
    };
  });
  await page.screenshot({path:resolve(output,`${name}.png`)});
  observations.push({name,...snapshot,errors:[...errors]});
  console.log(JSON.stringify({name,mode:snapshot.mode,selectedId:snapshot.selectedId,labels:snapshot.renderedLabels.length,junctions:snapshot.displayedJunctions.length,errors:errors.length}));
  if(errors.length)throw new Error(`Page errors during ${name}: ${errors.join('; ')}`);
}
try{
  page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.goto(target);await page.waitForFunction(()=>Boolean(window.__FREMONT_MAP_STUDY__));await ready();
  await closeLibrary();await page.locator('#perspective-flat').click();await ready();
  await page.locator('#map-home').click();await ready();await capture('01-zone1-flat');
  await page.locator('#perspective-angled').click();await ready();await capture('02-zone1-angled');
  await select('ew13');await page.locator('#map-home').click();await ready();
  const context=await page.evaluate(()=>window.__FREMONT_MAP_STUDY__.camera);
  await select('ns03');await select('ew13');
  expect(await page.evaluate(()=>window.__FREMONT_MAP_STUDY__.camera)).toEqual(context);
  await capture('03-stevenson-overview-preserved');
  await page.locator('.intersection-list').scrollIntoViewIfNeeded();await capture('04-stevenson-assigned-intersections');
  await page.locator('#compare-road').selectOption('ns03');await ready();
  expect(await page.evaluate(()=>window.__FREMONT_MAP_STUDY__.camera)).toEqual(context);
  await capture('05-comparison-overview-preserved');
  await page.setViewportSize({width:390,height:844});await page.reload();
  await page.waitForFunction(()=>Boolean(window.__FREMONT_MAP_STUDY__));await ready();
  await page.locator('#perspective-flat').click();await ready();await capture('06-mobile-zone1-flat');
  await select('ew13');await page.locator('#perspective-angled').click();await ready();
  await capture('07-mobile-zone1-angled-selected');
  await openLibrary();await page.locator('#map-home').click();await ready();await capture('08-mobile-zone1-angled-list');
  const mobileContext=await page.evaluate(()=>window.__FREMONT_MAP_STUDY__.camera);
  await page.locator('#road-details summary').click();await page.locator('#export-history').scrollIntoViewIfNeeded();
  await expect(page.locator('#export-history')).toBeVisible();await expect(page.locator('.backup-import')).toBeVisible();
  expect(await page.evaluate(()=>window.__FREMONT_MAP_STUDY__.camera)).toEqual(mobileContext);
  await capture('09-mobile-history-scroll');
}finally{
  await browser.close();
  await writeFile(resolve(output,'observations.json'),JSON.stringify(observations,null,2)+'\n');
}
