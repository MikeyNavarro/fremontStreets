import {loadSettings,saveSettings} from './training/settings';
import {LearningSystem} from './training/learning';
import './style.css';
import {StreetExplorer} from './training/explorer';
import {DrivingShell} from './ui/shell';
import { PatrolStudy } from './patrol';
import { chooseStudyRoute, loadPracticeZone, POLICE_STATION, practiceRouteFromStation, rememberPracticeZone, stationDeparture } from './departure';
import { StudyMode } from './study-mode';
import type { StudyNetwork } from './study-network';
import {recognitionEligible, type VerificationRegistry} from './training/verification';
import { APPROXIMATE_ZONE_NOTICE, type ZoneDocument } from './core/zones';
import { buildGraph, isValidRoute, createVehicle, stepVehicle, outgoingChoices, nextDecision, routeFromVehicle, legalOutgoing, nearestNode, createProgress, getZoneProgress, recordExploration, recordQuiz, recordChallenge, savePracticeRoute, loadProgress, persistProgress, setCamera, createGameState } from './core';
import type { RoadData, RoadGraph, VehicleState, Turn, Route, AccelerationProfile } from './core';
import { OverheadView } from './views/overhead';
import { DriverView } from './views/driver';
import { roadPresentation } from './views/roads';

declare const __FREMONT_DATA_VERSION__: string;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const mph = (mps: number) => mps * 2.236936;
const app = $('app');
app.innerHTML = '<div class="loading"><h1>FREMONT STREETS</h1><p>Loading the local road network…</p></div>';

async function boot() {
  const [roadsResponse, zonesResponse, studyResponse, verificationResponse] = await Promise.all([fetch(`${import.meta.env.BASE_URL}data/roads.json?v=${__FREMONT_DATA_VERSION__}`), fetch(`${import.meta.env.BASE_URL}data/zones.json?v=${__FREMONT_DATA_VERSION__}`), fetch(`${import.meta.env.BASE_URL}data/study-network.json?v=${__FREMONT_DATA_VERSION__}`), fetch(`${import.meta.env.BASE_URL}data/verification.json?v=${__FREMONT_DATA_VERSION__}`)]);
  if (!roadsResponse.ok) throw new Error('The real Fremont road dataset is missing. Run the documented geographic import before playing.');
  const data = await roadsResponse.json() as RoadData;
  const zones = (zonesResponse.ok ? await zonesResponse.json() : {metadata:{sourceUrl:'',boundaryVersion:null},zones:[]}) as ZoneDocument;
  if (!studyResponse.ok) throw new Error('The personalized study inventory is missing. Run npm run data:study.');
  const studyNetwork = await studyResponse.json() as StudyNetwork;
  if(!verificationResponse.ok)throw new Error('The geographic evidence registry is missing. Run npm run data:verify.');
  const verification = await verificationResponse.json() as VerificationRegistry;
  if(verification.roadsSha256!==studyNetwork.roadsSha256)throw new Error('Geographic evidence and road inventory versions do not match. Reload the complete release.');
  const graph = buildGraph(data);
  if (!graph.edges.size) throw new Error('The geographic dataset contains no usable driving roads.');
  const study = new PatrolStudy(graph,zones);
  const names = study.names('all');
  let editorActive = false;
  let editorDocument = zones;
  const departure = stationDeparture(graph);
  let game = createGameState(departure, loadPracticeZone(localStorage, study));
  let progress = loadProgress(localStorage);
  let paused = false;
  let mode: 'free' | 'navigation' | 'quiz' | 'study' = 'free';
  let training: StudyMode | null = null;
  let learning:LearningSystem|null=null;
  let answersHidden=false;
  let route: Route | null = null;
  let challenge: {destination:string;targetNode:string;status:'active'|'complete';guided:boolean;index:number} | null = null;
  const settings=loadSettings(localStorage);
  let guidance = settings.guidance;
  let profile: AccelerationProfile = settings.profile;
  let maxSpeed = settings.maxSpeed;
  let assist = settings.assist;
  let pendingTurn: Turn | undefined;
  let lastPersist = 0;
  let quizStreet = '';
  let quizChoices: string[] = [];
  let quizAnswered = false;
  let driver: DriverView | null = null;
  const keys = new Set<string>();
  const source = data.metadata ?? {};
  const partialLabel = String(source.coverage ?? 'Central Fremont bounded extract; partial city coverage');

  app.innerHTML = `
    <header class="topbar"><div class="brand"><div class="brand-icon" aria-hidden="true">⌁</div><div><h1>FREMONT STREETS</h1><div class="subtitle">LEARN THE CITY. KNOW YOUR WAY.</div></div></div><div class="header-note">Fremont, California <span style="margin:0 12px;color:#5d7968">/</span> <strong>Street-learning simulator</strong></div></header>
    <main class="layout">
      <aside class="left">
        <section class="panel"><div class="eyebrow">Your practice area</div><h2>One zone at a time</h2><select id="zone-select" data-testid="zone-select" class="zone-select" aria-label="Learning area"><option value="all">All Fremont · partial coverage</option>${zones.zones.map(zone=>`<option value="${esc(zone.id)}" ${!zone.geometry||!study.coverage.validation.valid?'disabled':''}>${esc(zone.name)} · ${study.coverage.zones[zone.id]?.available?'partial roads':'boundary only'}</option>`).join('')}</select><div id="coverage" class="coverage-pill" data-testid="coverage">${names.length} real named streets · bounded extract</div><p id="zone-coverage-description" class="muted">Partial Fremont coverage. Selecting an area starts a new practice drive on an existing road; progress is preserved. Boundaries never act as walls.</p><div class="zone-notice" data-testid="zone-notice">${APPROXIMATE_ZONE_NOTICE}</div><details class="source-details"><summary>Boundary source, version & limitations</summary><p>Historical City of Fremont GIS geometry matches the supplied police-map screenshot. Current 2026 adoption is unverified.</p><p>Version: ${esc(zones.metadata.boundaryVersion)}<br>Imported: ${esc(zones.metadata.importedAt)}<br>Screenshot: ${esc(zones.metadata.screenshotReference)}<br>Calibration: ${esc(zones.metadata.calibration?.method)}<br>Uncertain-border review band: ${esc(zones.metadata.calibration?.uncertaintyMeters)} m (study policy, not measured accuracy).</p><p><a href="https://www.fremontpolice.gov/about-us/about-fremont-police/police-zone-map" target="_blank" rel="noopener">Police map reference ↗</a></p><p>${esc(Array.isArray(zones.metadata.limitations)?zones.metadata.limitations.join(' '):zones.metadata.limitations??'Partial road coverage.')}</p></details></section>
        <section class="panel"><div class="eyebrow">A little farther each day</div><h2>Choose your drive</h2><div class="mode-grid"><button id="mode-study" data-testid="study-mode">My Street List — 38 Entries</button><button id="mode-zone1-main">Zone 1 — Main Roads</button><button id="mode-free" class="active"><span class="mode-icon">↝</span>Free Drive</button><button id="mode-navigation"><span class="mode-icon">⚑</span>Navigation challenge</button><button id="mode-quiz"><span class="mode-icon">?</span>Street-name practice</button></div><div id="mission" class="mission"></div><div id="quiz" class="quiz-box" hidden></div><div id="study-panel" hidden></div></section>
        <section class="panel"><div class="eyebrow">Your collection</div><h2>Practice routes</h2><p class="muted">Save a navigation route and come back to it. Stored in this browser.</p><button id="save-route" disabled style="font-size:11px;width:100%">+ Save current route</button><div id="saved-routes" class="saved-list"></div></section>
      </aside>
      <section class="center"><div class="view-toolbar"><div class="segmented" aria-label="Camera view"><button id="camera-overhead" class="active" aria-pressed="true">↗ Overhead map</button><button id="camera-driver" data-testid="camera-toggle" aria-pressed="false">◉ Driver’s seat</button></div><div class="live-status"><span class="dot"></span><span id="drive-view-label">Real roads. One shared simulation.</span></div></div>
        <div class="viewport" aria-label="Driving simulation"><div id="overhead-view" class="view" data-testid="overhead-view"></div><div id="driver-view" class="view" data-testid="driver-view" hidden></div><div class="street-banner"><div class="street-card"><small id="street-label">YOU ARE DRIVING ON</small><strong id="street-name">Loading…</strong></div><div class="speed-limit" title="Source road speed limit; ? means unknown"><small>LIMIT<br>MPH</small><strong id="speed-limit">?</strong></div></div><div class="driving-hud"><div class="speedometer"><strong id="speed" data-testid="speed">0</strong><span>MPH</span></div><div class="turn-prompt" id="turn-prompt">Hold ↑ or W to drive</div></div><div id="view-note" class="view-note">Real source road centerlines · road widths are approximate · no live traffic</div></div>
        <div class="drivebar"><button id="pause" data-testid="pause-toggle">Ⅱ Pause</button><button id="reset-drive">↺ Reset drive</button><span class="keyhint"><kbd class="key">W ↑</kbd> throttle &nbsp;<kbd class="key">S ↓</kbd> brake &nbsp;<kbd class="key">A ←</kbd> <kbd class="key">D →</kbd> queue turn</span></div><button id="follow-car" style="font-size:11px;margin-bottom:9px">Follow car / resume driving view</button><p class="muted" data-testid="departure-note">Headquarters departure · Stevenson Boulevard. Approximate public-road start near the station; not a verified driveway.</p><div id="zone-editor-host"></div><div id="status" class="status-line" role="status">Choose a turn early. Your selection waits until a matching legal intersection.</div><div class="touch-controls" aria-label="Driving controls"><button id="turn-left">↰ Left</button><button id="turn-straight">↑ Straight</button><button id="turn-right">↱ Right</button><button id="turn-uturn">↶ Turn around</button><button id="throttle">Hold to accelerate</button><button id="brake">Hold to brake</button></div>
      </section>
      <aside class="right"><section class="panel"><div class="eyebrow">Exploration ≠ mastery</div><h2>Your learning log</h2><div class="muted" id="progress-area">All Fremont · loaded roads only</div><div class="metrics"><div class="metric"><strong id="metric-streets">0</strong><span>named streets encountered</span></div><div class="metric"><strong id="metric-intersections">0</strong><span>intersections practiced</span></div><div class="metric"><strong id="metric-challenges">0</strong><span>navigation completions</span></div><div class="metric"><strong id="metric-accuracy">—</strong><span>street-name quiz accuracy</span></div><div class="metric"><strong id="metric-unguided">0</strong><span>routes without guidance</span></div><div class="metric"><strong id="metric-saved">0</strong><span>saved practice routes</span></div></div><div class="divider"></div><h3>Recently practiced</h3><div id="recent-streets"></div><p class="muted">No completion percentage: this extract does not cover every Fremont street.</p></section>
      <section class="panel"><div class="eyebrow">Make it your drive</div><h2>Driving settings</h2><div class="settings"><label class="setting-row">Acceleration<select id="profile" aria-label="Acceleration profile"><option>NORMAL</option><option selected>QUICK</option><option>SPORT</option></select></label><label class="setting-row">Vehicle cap (mph)<input id="max-speed" aria-label="Vehicle speed cap" type="number" min="10" max="100" value="100"></label><label class="checkbox"><input type="checkbox" id="assist" checked>Cornering assist · eases speed through turns</label><label class="checkbox"><input type="checkbox" id="guidance" checked>Route guidance</label></div><p class="muted">QUICK: 0–30 in ≈2.5 s. Vehicle capability is not a road speed limit. Unknown source limits show “?”.</p></section>
      <section class="panel source-details"><div class="eyebrow">Grounded in geography</div><h2>Know the limits</h2><p>${esc(partialLabel)}</p><p>Source: ${esc(source.attribution ?? '© OpenStreetMap contributors')}<br>Data date: ${esc(String(source.fetchedAt ?? source.importedAt ?? 'See geographic provenance').slice(0,10))}</p><details><summary>Simulation & data notes</summary><p>Movement follows connected road nodes and known one-way restrictions. Traffic signals, lanes, and incomplete turn restrictions are unverified. Generic 3D scenery and road widths are visual approximations. No traffic waiting is simulated. This is a learning aid, not driving or emergency-navigation advice.</p><p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap attribution & ODbL ↗</a></p></details></section></aside>
    </main><footer class="footer"><span>FREMONT STREETS <span style="margin:0 9px">/</span> A city learned one intersection at a time.</span><span>Local road data · local progress · no accounts required</span></footer>`;

  $('zone-select').insertAdjacentHTML('afterend','<button id="inspect-zone">Inspect selected boundary on map</button>');
  const ui=new DrivingShell(app);
  let graphicsQuality:'low'|'balanced'|'high'='balanced';
  const roadsGeo = roadPresentation(data,graph);
  const coords = Object.values(data.nodes);
  const bounds: [[number,number],[number,number]] = [[Math.min(...coords.map(c=>c[0])),Math.min(...coords.map(c=>c[1]))],[Math.max(...coords.map(c=>c[0])),Math.max(...coords.map(c=>c[1]))]];
  const overhead = new OverheadView($('overhead-view'), roadsGeo, bounds);
  overhead.setStation(POLICE_STATION.position);overhead.setQuality('balanced');
  const explorer=new StreetExplorer(graph,studyNetwork,verification,overhead,$('driving-viewport'));
  let recentMessageUntil = 0;
  function say(message:string) { $('status').textContent=message;ui.toast(message); recentMessageUntil=performance.now()+6000; }
  function persist() { if(!persistProgress(localStorage,progress)) $('progress-area').textContent='Progress storage unavailable · this session only'; renderProgress();if(training)ui.updateProgress(studyNetwork.entries,training.snapshot().progress); }
  function routeCoords(r:Route|null) { return r ? r.nodeIds.map(id=>graph.nodes.get(id)!.position) : []; }
  function protectAnswers(hidden=learning?.hiddenAnswers??false){answersHidden=hidden||mode==='quiz'&&!quizAnswered&&!!quizStreet;app.classList.toggle('answer-protected',answersHidden);overhead.setAssistanceHidden(answersHidden);explorer.setHidden(answersHidden);if(answersHidden){$('status').textContent='Recall practice · assistance hidden';$('toast').hidden=true;}showRoute();}
  function showRoute() { const c=guidance&&!answersHidden?routeCoords(route):[]; overhead.setRoute(c);driver?.setRoute(c); }
  function currentEdge() { return graph.edges.get(game.vehicle.edgeId)!; }
  function areaHasRoads() { return game.zoneId==='all'||Boolean(study.coverage.zones[game.zoneId]?.available); }
  function renderArea(focusBoundary = true) {
    const id=game.zoneId, zone=study.zone(id), coverage=study.coverage.zones[id];
    $('coverage').textContent=id==='all'?`${names.length} real named streets · bounded extract`:`${coverage?.segmentIds.length??0} playable segments · ${coverage?.streetNames.length??0} named streets`;
    $('zone-coverage-description').textContent=id==='all'?'Partial city coverage. Selecting a zone starts a new practice drive on an existing road; progress is preserved.':coverage?.available?'Partial road coverage only. The colored polygon is an approximate study area. You can drive across its boundary.':'Boundary study only: the existing road extract has no usable streets in this zone. Driving and questions require a source-backed road import; no streets have been created.';
    $('progress-area').textContent=zone?`${zone.name} · ${coverage?.available?'partial roads':'no current road coverage'}`:'All Fremont · loaded roads only';
    overhead.setBoundaries(study.boundaries(),id==='all'?undefined:id,id==='all');
    $('inspect-zone').toggleAttribute('disabled',!zone?.geometry);
    // Zone changes update the boundary without taking ownership of the camera.
    $('mode-navigation').toggleAttribute('disabled',!areaHasRoads());$('mode-quiz').toggleAttribute('disabled',!areaHasRoads());
    for(const control of ['throttle','brake','turn-left','turn-right','turn-straight','turn-uturn'])$(control).toggleAttribute('disabled',!areaHasRoads());
  }
  function selectArea(id:string) {
    if(editorActive||id!=='all'&&!study.zone(id)?.geometry)return;
    learning?.cancel();training?.leave();persist();keys.clear();pendingTurn=undefined;route=null;game.activeRoute=null;challenge=null;game.zoneId=id;rememberPracticeZone(localStorage,id);
    const edgeId=areaHasRoads()?departure.edgeId:null;
    game.vehicle=stationDeparture(graph);progress=study.record(progress,game.vehicle);
    showRoute();$('save-route').setAttribute('disabled','');mode='free';setMode('free');renderArea();renderProgress();persist();
    say(edgeId?`${study.zone(id)?.name??'All Fremont'} practice starts at police headquarters on ${currentEdge().name}. Drive to the selected area; other progress is preserved.`:`${study.zone(id)?.name??'Study area'} boundary displayed. No source-road segments are loaded here; navigation and quizzes are unavailable.`);
  }

  function setMode(next:typeof mode) {if(next!=='study')training?.leave();$('study-panel').hidden=next!=='study';$('mode-study').classList.toggle('active',next==='study');if(editorActive||next!=='free'&&!areaHasRoads())return;if(next!=='navigation'&&challenge?.status==='active'){challenge=null;route=null;game.activeRoute=null;showRoute();$('save-route').setAttribute('disabled','');}mode=next;for(const m of ['free','navigation','quiz'])$(`mode-${m}`).classList.toggle('active',m===mode);$('quiz').hidden=mode!=='quiz';$('overhead-view').classList.toggle('quiz-hidden',mode==='quiz');if(mode==='quiz')newQuiz();else protectAnswers();ui.updateSession(mode,game.zoneId,profile);renderMission();}
  function renderMission() {
    if(mode==='free')$('mission').innerHTML='<strong>Take the scenic route.</strong>Follow real Fremont streets at your own pace. Turn choices stay queued, so there’s no split-second timing.';
    if(mode==='navigation')$('mission').innerHTML=challenge?.status==='active'?`<strong>Find ${esc(challenge.destination)}</strong><span id="challenge-guide">${guidance?'Follow the highlighted road route.':'Guidance off. Use your street knowledge.'}</span><br><span id="route-remaining"></span>`:`<strong>${challenge?.status==='complete'?'Destination reached. Well driven!':'Find your way across town.'}</strong>Drive a connected route to a real street intersection.<button id="challenge-start" data-testid="challenge-start" class="primary">${challenge?.status==='complete'?'Try another challenge':'Start navigation challenge'}</button>`;
    $('challenge-start')?.addEventListener('click',()=>startChallenge());
  }
  function chooseRoute():Route|null { return chooseStudyRoute(graph, study, game.vehicle, game.zoneId); }

  function startChallenge(saved?:Route) {if(editorActive||!areaHasRoads())return;
    const station=saved?stationDeparture(graph):null;
    const r=saved?practiceRouteFromStation(graph,station!,saved,study.preferredEdges(game.zoneId)):chooseRoute();
    if(!r) {say('No valid navigation route from here in the loaded extract. Reset your drive and try again.');return;}
    if(saved){game.vehicle=station!;keys.clear();pendingTurn=undefined;progress=study.record(progress,game.vehicle);}
    route=r;game.activeRoute=r;
    const last=graph.edges.get(r.edgeIds.at(-1)!)!;
    const other=(graph.outgoing.get(last.to)??[]).map(id=>graph.edges.get(id)!.name).find(name=>name&&name!==last.name);
    challenge={destination:[last.name,other].filter(Boolean).join(' & ')||'the marked intersection',targetNode:last.to,status:'active',guided:guidance,index:0};
    mode='navigation';setMode(mode);$('save-route').removeAttribute('disabled');showRoute();ui.close();say(`Challenge started: reach ${challenge.destination}. ${guidance?'Follow the route highlight.':'Guidance is off.'}`);
  }
  function newQuiz() {
    quizStreet=currentEdge().name;
    const collection=study.names(game.zoneId);
    if(!study.contains(game.vehicle.position,game.zoneId)||!collection.includes(quizStreet)){quizStreet='';quizChoices=[];$('quiz').innerHTML='<p class="muted">You are outside this study area or near an uncertain border. Drive onto a clearly classified named street in the selected zone to practice.</p>';return;}
    if(!verification.entries.some(e=>recognitionEligible(e,game.vehicle.edgeId))){$('quiz').innerHTML='<p>This segment is not independently corroborated for scored recognition. Use the learning dashboard to study an eligible section.</p>';return;}
    if(!quizStreet){$('quiz').innerHTML='<p class="muted">Drive onto a named street to practice.</p>';return;}
    quizAnswered=false;protectAnswers();$('overhead-view').classList.add('quiz-hidden');
    quizChoices=[quizStreet,...collection.filter(n=>n!==quizStreet).sort(()=>Math.random()-.5).slice(0,3)].sort(()=>Math.random()-.5);
    $('quiz').innerHTML=`<p class="muted">Identify the street where this question started. Map labels are hidden until you answer.</p>${quizChoices.map(n=>`<button data-answer="${esc(n)}">${esc(n)}</button>`).join('')}`;
    for(const button of $('quiz').querySelectorAll<HTMLButtonElement>('button'))button.addEventListener('click',()=>{
      if(quizAnswered)return;quizAnswered=true;protectAnswers();$('overhead-view').classList.remove('quiz-hidden');const correct=button.dataset.answer===quizStreet;progress=recordQuiz(progress,game.zoneId,correct);if(game.zoneId!=='all')progress=recordQuiz(progress,'all',correct);persist();say(correct?`Correct! This is ${quizStreet}.`:`This is ${quizStreet}. Keep practicing.`);$('quiz').innerHTML=`<p class="muted">${correct?'Correct.':'Keep learning.'} You are on <strong>${esc(quizStreet)}</strong>.</p><button id="quiz-next">Next question</button>`;$('quiz-next').addEventListener('click',newQuiz);
    });
  }
  function renderProgress() {
    const p=getZoneProgress(progress,game.zoneId);
    if(!p)return;
    $('metric-streets').textContent=String(p.streetNames.length);$('metric-intersections').textContent=String(p.intersectionIds.length);$('metric-challenges').textContent=String(p.challengesCompleted);$('metric-accuracy').textContent=p.quizTotal?`${Math.round(p.quizCorrect/p.quizTotal*100)}%`:'—';$('metric-unguided').textContent=String(p.unguidedRoutesCompleted);$('metric-saved').textContent=String(p.savedRoutes.length);
    $('recent-streets').innerHTML=p.recentStreets.length?p.recentStreets.slice(0,5).map((s:string)=>`<div class="recent">${esc(s)}</div>`).join(''):'<div class="empty">Your next street is a new beginning.</div>';
    $('saved-routes').innerHTML=p.savedRoutes.length?p.savedRoutes.map((saved:any,i:number)=>`<div class="saved-item"><span>${esc(saved.name)}</span><button data-saved="${i}">Drive</button></div>`).join(''):'<span class="empty">No saved routes yet.</span>';
    for(const b of $('saved-routes').querySelectorAll<HTMLButtonElement>('button'))b.onclick=()=>{const saved=p.savedRoutes[Number(b.dataset.saved)];const edgeIds=saved.edgeIds.filter(id=>graph.edges.has(id));if(edgeIds.length!==saved.edgeIds.length||!isValidRoute(graph,edgeIds)){say('This saved route is from a different data version. Please create a new route.');return;}startChallenge({edgeIds,nodeIds:[graph.edges.get(edgeIds[0])!.from,...edgeIds.map(id=>graph.edges.get(id)!.to)],distance:edgeIds.reduce((sum,id)=>sum+graph.edges.get(id)!.length,0)});};
  }
  function queue(turn:Turn){if(editorActive||!areaHasRoads())return;pendingTurn=turn;say(`${{left:'Left',right:'Right',straight:'Straight',uturn:'Turn around'}[turn]} queued — applied at the next legal matching junction.`);}
  function switchCamera(camera:'overhead'|'driver') {
    const previous=game;
    game=setCamera(game,camera);
    try {
      if(camera==='driver'&&!driver){driver=new DriverView($('driver-view'),roadsGeo);driver.setQuality(graphicsQuality);}
    } catch(error){game=previous;say(`Driver camera could not start: ${String(error)}. Enable WebGL in your browser.`);return;}
    $('overhead-view').hidden=camera!=='overhead';$('driver-view').hidden=camera!=='driver';overhead.setActive(camera==='overhead');driver?.setActive(camera==='driver');
    for(const c of ['overhead','driver']){$(`camera-${c}`).classList.toggle('active',c===camera);$(`camera-${c}`).setAttribute('aria-pressed',String(c===camera));}
    $('view-note').textContent=camera==='driver'?'Schematic 3D · surfaces / interior approximate · bridge heights & traffic controls unverified':'Real source road centerlines · no external map calls during gameplay';
    requestAnimationFrame(()=>{overhead.resize();driver?.resize();showRoute();renderFrame();});
  }
  function reset(){if(editorActive)return;learning?.cancel();training?.cancel();keys.clear();pendingTurn=undefined;game.vehicle=stationDeparture(graph);progress=study.record(progress,game.vehicle);route=null;game.activeRoute=null;challenge=null;showRoute();$('save-route').setAttribute('disabled','');renderMission();say('Back at police headquarters. Your saved progress is preserved.');}

  $('inspect-zone').onclick=()=>{const zone=study.zone(game.zoneId);if(!editorActive&&zone?.geometry){switchCamera('overhead');overhead.focusBoundary(zone.geometry);ui.close();}};
  $('zone-select').onchange=()=>selectArea(($('zone-select') as HTMLSelectElement).value);
  $('follow-car').onclick=()=>{if(!editorActive)overhead.centerOnVehicle(game.vehicle.position);};
  $('camera-overhead').onclick=()=>switchCamera('overhead');$('camera-driver').onclick=()=>switchCamera('driver');
  $('pause').onclick=()=>{if(editorActive)return;paused=!paused;$('pause').classList.toggle('active',paused);$('pause').textContent=paused?'Resume':'Pause';keys.clear();};
  $('reset-drive').onclick=reset;
  for(const m of ['free','navigation','quiz'] as const)$(`mode-${m}`).onclick=()=>{learning?.cancel();setMode(m);if(m==='free')ui.close();else ui.open('navigation');};
  for(const t of ['left','right','straight','uturn'] as const)$(`turn-${t}`).onclick=()=>queue(t);
  const persistSettings=()=>{if(!saveSettings(localStorage,{version:1,profile,maxSpeed,assist,guidance}))say('Driving settings cannot be saved in this browser.');};
  ($('profile') as HTMLSelectElement).value=profile;($('max-speed') as HTMLInputElement).value=String(maxSpeed);($('assist') as HTMLInputElement).checked=assist;($('guidance') as HTMLInputElement).checked=guidance;
  $('profile').onchange=()=>{profile=($('profile') as HTMLSelectElement).value as AccelerationProfile;persistSettings();};
  $('max-speed').onchange=()=>{maxSpeed=Math.max(10,Math.min(100,Number(($('max-speed') as HTMLInputElement).value)||100));($('max-speed') as HTMLInputElement).value=String(maxSpeed);persistSettings();};
  $('assist').onchange=()=>{assist=($('assist') as HTMLInputElement).checked;persistSettings();};
  $('guidance').onchange=()=>{guidance=($('guidance') as HTMLInputElement).checked;if(challenge?.status==='active'&&guidance)challenge.guided=true;showRoute();renderMission();training?.guidanceChanged();persistSettings();};
  $('save-route').onclick=()=>{if(!route)return;progress=savePracticeRoute(progress,game.zoneId,{id:crypto.randomUUID(),name:challenge?.destination??'Fremont practice route',edgeIds:route.edgeIds,destinationNode:route.nodeIds.at(-1)!,savedAt:new Date().toISOString()});persist();say('Practice route saved in this browser.');};
  for(const id of ['throttle','brake']){const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(id);});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>keys.delete(id));}
  document.addEventListener('keydown',e=>{if(editorActive||ui.isOpen)return;if(e.key==='Escape'){e.preventDefault();learning?.cancel();ui.open('menu');return;}if(learning?.blocking&&e.key.toLowerCase()!=='c')return;if((e.target as HTMLElement)?.closest('input,select,textarea,[contenteditable=true]'))return;if((e.target as HTMLElement)?.closest('button,summary')&&[' ','Enter'].includes(e.key))return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();keys.add(e.key.toLowerCase());if(!e.repeat){if(['arrowleft','a'].includes(e.key.toLowerCase()))queue('left');if(['arrowright','d'].includes(e.key.toLowerCase()))queue('right');if(e.key===' ')$('pause').click();if(e.key.toLowerCase()==='c')switchCamera(game.camera==='overhead'?'driver':'overhead');}});
  document.addEventListener('focusin',e=>{if((e.target as HTMLElement)?.matches('input,select,textarea'))keys.clear();});
  document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur',()=>keys.clear());document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();persist();}});
  window.addEventListener('beforeunload',persist);
  Object.defineProperty(window,'__FREMONT_GAME__',{get:()=>({vehicle:structuredClone(game.vehicle),camera:game.camera,route:route?structuredClone(route):null,progress:structuredClone(progress),get graph(){return {nodes:[...graph.nodes.values()],edges:[...graph.edges.values()]};},paused,challenge:challenge?structuredClone(challenge):null,mode,profile,decision:nextDecision(graph,game.vehicle),zoneId:game.zoneId,get zoneDocument(){return structuredClone(editorDocument);},get zoneCoverage(){return structuredClone(study.coverage.zones);},get overlay(){return overhead.getZoneDiagnostics();},quiz:{street:quizStreet,choices:[...quizChoices]},editorActive,study:training?.snapshot()??null,maxSpeed,learning:learning?.snapshot()??null,presentation:{panel:ui.panel,map:overhead.presentation(),driver:driver?.presentation()??null},departure:{edgeId:departure.edgeId,distance:departure.distance,position:departure.position}})});
  ui.configure({resize:()=>requestAnimationFrame(()=>{overhead.resize();driver?.resize();}),suspend:()=>keys.clear(),panel:()=>{if(ui.panel==='learning')learning?.render();if(training)ui.updateProgress(studyNetwork.entries,training.snapshot().progress);}});
  $('map-orientation').onchange=()=>overhead.setHeadingUp(($('map-orientation') as HTMLSelectElement).value==='heading');
  $('map-zoom').oninput=()=>{const zoom=Number(($('map-zoom') as HTMLInputElement).value);$('map-zoom-value').textContent=zoom.toFixed(1);overhead.setZoom(zoom);};
  $('map-follow').onchange=()=>{overhead.setFollowVehicle(false);($('map-follow') as HTMLInputElement).checked=false;};
  $('hud-visible').onchange=()=>app.classList.toggle('hud-hidden',!($('hud-visible') as HTMLInputElement).checked);
  $('graphics-quality').onchange=()=>{graphicsQuality=($('graphics-quality') as HTMLSelectElement).value as typeof graphicsQuality;driver?.setQuality(graphicsQuality);overhead.setQuality(graphicsQuality);};
  progress=study.record(progress,game.vehicle);
  let last=performance.now(),accumulator=0,lastHud=0;
  function renderFrame(){const snapshot={position:game.vehicle.position,heading:game.vehicle.heading,speed:game.vehicle.speed};overhead.update(snapshot);if(game.camera==='driver')driver?.update(snapshot);}
  function frame(now:number){
    accumulator+=Math.min((now-last)/1000,.1);last=now;
    while(accumulator>=1/60){
      accumulator-=1/60;
      if(!paused&&!editorActive&&!ui.isOpen&&!learning?.blocking&&areaHasRoads()){
        game.vehicle=stepVehicle(graph,game.vehicle,{throttle:keys.has('arrowup')||keys.has('w')||keys.has('throttle'),brake:keys.has('arrowdown')||keys.has('s')||keys.has('brake'),turn:pendingTurn},1/60,{profile,maxSpeedMph:maxSpeed,cornerAssist:assist});pendingTurn=undefined;
        if(mode==='study')training?.tick(game.vehicle);
        learning?.tick(game.vehicle);
        if(game.vehicle.events.length){progress=study.record(progress,game.vehicle);if(challenge?.status==='active'){
          if(game.vehicle.events.some(e=>e.type==='node'&&e.id===challenge!.targetNode)){challenge.status='complete';progress=recordChallenge(progress,game.zoneId,challenge.guided);if(game.zoneId!=='all')progress=recordChallenge(progress,'all',challenge.guided);persist();renderMission();say('Destination reached! Navigation challenge completed.');}
        }}
      }
    }
    renderFrame();
    if(now-lastHud>120){lastHud=now;ui.updateSession(mode,game.zoneId,profile);$('hud-guidance').textContent=guidance?'GUIDANCE ON':'NO GPS · STREET NAMES ONLY';const activeMission=training?.missionState;const destination=activeMission?activeMission.goal.kind==='headquarters'?'Police Headquarters':studyNetwork.entries.find(entry=>entry.id===activeMission.targetId)?.originalLabel:challenge?.destination;$('hud-destination').textContent=destination?`DESTINATION · ${destination}`:'Free drive · make yourself familiar';const edge=currentEdge();$('speed').textContent=String(Math.round(mph(game.vehicle.speed)));$('speed-limit').textContent=edge.speedLimitMph===null?'?':String(Math.round(edge.speedLimitMph));$('street-name').textContent=answersHidden||mode==='quiz'&&!quizAnswered?'Street-name practice':edge.name||'Unnamed mapped road';
      const decision=nextDecision(graph,game.vehicle);const choices=decision?.choices??outgoingChoices(graph,game.vehicle);const next=choices.filter(c=>c.kind!=='uturn');const distance=decision?.distance??Math.max(0,edge.length-game.vehicle.distance);const plannedIndex=guidance&&route?route.edgeIds.indexOf(decision?.incomingEdgeId??''):-1;const plannedEdge=plannedIndex>=0?graph.edges.get(route!.edgeIds[plannedIndex+1]):null;const planned=choices.find(choice=>choice.edgeId===plannedEdge?.id);$('turn-prompt').textContent=game.vehicle.pendingTurn?`${game.vehicle.pendingTurn.toUpperCase()} queued · junction in ${Math.round(distance)} m`:planned&&plannedEdge?`In ${Math.round(distance)} m · ${planned.kind==='uturn'?'turn around':planned.kind==='straight'?'continue straight':`turn ${planned.kind}`} onto ${plannedEdge.name||'the mapped connecting road'}`:next.length>1?`Junction in ${Math.round(distance)} m · ${next.map(c=>`${c.kind}: ${c.name||'unnamed road'}`).join(' · ')}`:'Hold W / ↑ to drive · queue a turn with A / D';
      if(answersHidden){$('hud-destination').textContent='Recall practice';$('turn-prompt').textContent='Answer the map question to resume driving';}
      const unsupportedEnd=Boolean(decision&&!choices.length&&distance<200);$('turn-prompt').dataset.roadStatus=unsupportedEnd?'blocked':'open';if(unsupportedEnd)$('turn-prompt').textContent=distance<1?'No supported continuation here. Reset at HQ to begin another drive; progress is kept.':`Supported road coverage ends in ${Math.round(distance)} m. Choose another connected road before the gap.`;
      overhead.setTurns(next.map(c=>{const e=graph.edges.get(c.edgeId)!;return {coordinates:[graph.nodes.get(e.from)!.position,graph.nodes.get(e.to)!.position],selected:c.kind===game.vehicle.pendingTurn};}));driver?.setTurns(next.map(c=>{const e=graph.edges.get(c.edgeId)!;return {coordinates:[graph.nodes.get(e.from)!.position,graph.nodes.get(e.to)!.position],selected:c.kind===game.vehicle.pendingTurn};}));
      if(challenge?.status==='active'){
        const n=graph.nodes.get(challenge.targetNode)!;const remaining=Math.hypot(game.vehicle.metric.x-n.x,game.vehicle.metric.y-n.y);if($('route-remaining'))$('route-remaining').textContent=`${Math.round(remaining)} m straight-line distance to destination`;
        if(guidance&&route&&now>recentMessageUntil){const index=route.edgeIds.indexOf(decision?.incomingEdgeId??game.vehicle.edgeId);const nextEdge=index>=0?graph.edges.get(route.edgeIds[index+1]):null;const turn=choices.find(c=>c.edgeId===nextEdge?.id);$('status').textContent=nextEdge&&turn?`In ${Math.round(distance)} m, ${turn.kind==='straight'?'continue straight':turn.kind==='uturn'?'turn around':`turn ${turn.kind}`} onto ${nextEdge.name||'the highlighted road'}. Queue your turn anytime before the junction.`:'Follow the highlighted route to the destination. If off route, return using connected roads.';}
      }
    }
    if(mode==='study'&&training?.missionState?.status==='active'&&guidance&&route&&now>recentMessageUntil){
      const decision=nextDecision(graph,game.vehicle),choices=decision?.choices??[];const index=route.edgeIds.indexOf(decision?.incomingEdgeId??game.vehicle.edgeId);const nextEdge=index>=0?graph.edges.get(route.edgeIds[index+1]):null;const turn=choices.find(choice=>choice.edgeId===nextEdge?.id);
      $('status').textContent=nextEdge&&turn?`In ${Math.round(decision?.distance??0)} m, ${turn.kind==='straight'?'continue straight':turn.kind==='uturn'?'turn around':`turn ${turn.kind}`} onto ${nextEdge.name||'the source-backed connecting road'}.`:'Follow the highlighted source route; another supported legal approach also counts.';
    }
    if(now-lastPersist>2000){lastPersist=now;persist();}
    requestAnimationFrame(frame);
  }
  training=new StudyMode({container:$('study-panel'),network:studyNetwork,graph,overhead,storage:localStorage,getVehicle:()=>game.vehicle,getGuidance:()=>guidance,setGuidance:(enabled)=>{guidance=enabled;($('guidance') as HTMLInputElement).checked=enabled;showRoute();},onMessage:say,onStart:(vehicle,nextRoute)=>{keys.clear();pendingTurn=undefined;paused=false;$('pause').classList.remove('active');$('pause').textContent='Pause';game.vehicle=vehicle;route=nextRoute;game.activeRoute=nextRoute;challenge=null;progress=study.record(progress,game.vehicle);$('save-route').toggleAttribute('disabled',!nextRoute);showRoute();if(nextRoute)ui.close();},onRoute:(nextRoute)=>{route=nextRoute;game.activeRoute=nextRoute;showRoute();}});
  const openStudy=(zone1=false)=>{if(editorActive)return;learning?.cancel();selectArea(zone1?'zone1':'all');($('zone-select') as HTMLSelectElement).value=game.zoneId;setMode('study');training!.enter(zone1);$('mission').innerHTML='<strong>Your roads. Your navigation.</strong>Preview the listed roads, then start from headquarters. Any supported legal route can count.';};
  $('mode-study').onclick=()=>{if(mode!=='study')openStudy();ui.open('study');};$('mode-zone1-main').onclick=()=>{openStudy(true);ui.open('study');};
  learning=new LearningSystem({dashboard:$('learning-dashboard'),viewport:$('driving-viewport'),network:studyNetwork,evidence:verification,graph,overhead,explorer,getVehicle:()=>game.vehicle,getGuidance:()=>guidance,clearInputs:()=>{keys.clear();pendingTurn=undefined;},close:()=>ui.close(),open:()=>ui.open('learning'),map:()=>switchCamera('overhead'),message:say,
    reloadLegacy:()=>{progress=loadProgress(localStorage);training?.reloadProgress();renderProgress();},policy:hidden=>protectAnswers(hidden),prepare:()=>{training?.leave();mode='free';quizAnswered=true;$('quiz').hidden=true;$('overhead-view').classList.remove('quiz-hidden');challenge=null;route=null;protectAnswers(false);},
    startDrive:(vehicle,nextRoute,guided)=>{training?.leave();mode='free';game.vehicle=vehicle;route=nextRoute;game.activeRoute=nextRoute;challenge=null;guidance=guided;($('guidance') as HTMLInputElement).checked=guided;keys.clear();pendingTurn=undefined;paused=false;$('pause').textContent='Pause';showRoute();},setRoute:nextRoute=>{route=nextRoute;game.activeRoute=nextRoute;showRoute();}});
  app.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest('[data-open-panel]');if(button&&learning?.hiddenAnswers)learning.cancel();},true);
  await learning.initialize();
  ($('zone-select') as HTMLSelectElement).value=game.zoneId;
  renderMission();renderProgress();renderArea(false);
  if(import.meta.env.DEV&&new URLSearchParams(location.search).get('zoneEditor')==='1'){
    const {mountZoneEditor}=await import('./editor');
    editorActive=true;paused=true;keys.clear();switchCamera('overhead');
    $('pause').textContent='Editor active · paused';
    for(const id of ['pause','zone-select','reset-drive','camera-driver','mode-free','mode-navigation','mode-quiz','mode-study','mode-zone1-main','throttle','brake','turn-left','turn-right','turn-straight','turn-uturn','follow-car'])$(id).setAttribute('disabled','');
    mountZoneEditor({container:$('zone-editor-host'),overhead,baseline:zones,graph,onPreview:doc=>{editorDocument=doc;}});
  }
  if(!editorActive)ui.open('menu');
  requestAnimationFrame(frame);
}
boot().catch(error=>{app.innerHTML=`<div class="loading"><h1>FREMONT STREETS</h1><p>${esc(error.message)}</p><p>Check geographic import instructions in README.md.</p></div>`;console.error(error);});
