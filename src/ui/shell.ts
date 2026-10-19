import {icon} from './icons';
import {emptyStudyRecord,type StudyEntry,type StudyProgress} from '../study-network';

export type Panel='menu'|'study'|'navigation'|'zones'|'progress'|'settings'|'routes'|'help'|'information';
const titles:Record<Panel,string>={menu:'Your next drive',study:'My Street List',navigation:'Navigation challenges',zones:'Patrol zones',progress:'Learning progress',settings:'Driving & display',routes:'Practice routes',help:'Ready for the road',information:'Geography & sources'};
const escapeHTML=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** Moves existing functional controls into a presentation-only application shell.
 * No vehicle, graph, route, or persisted learning state is owned by this class. */
export class DrivingShell {
  private dialog:HTMLDialogElement;
  private opener:HTMLElement|null=null;
  private current:Panel|null=null;
  private onResize:()=>void=()=>{};
  private onPanel:()=>void=()=>{};
  private onSuspend:()=>void=()=>{};
  private toastTimer=0;
  constructor(private root:HTMLElement){
    const find=<T extends HTMLElement=HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
    const viewport=find('.viewport'),toolbar=find('.view-toolbar'),drivebar=find('.drivebar'),follow=find('#follow-car'),controls=find('.touch-controls'),status=find('#status'),departure=find('[data-testid="departure-note"]'),editor=find('#zone-editor-host');
    const zones=find('.left .panel:first-child'),routes=find('.left .panel:last-child'),progress=find('.right .panel:first-child'),settings=find('.right .panel:nth-child(2)'),info=find('.right .panel:last-child');
    const mission=find('#mission'),quiz=find('#quiz'),study=find('#study-panel');
    const modeButtons=['study','zone1-main','free','navigation','quiz'].map(id=>find<HTMLButtonElement>('#mode-'+id));
    const card=(name:string,title:string,description:string,id?:string)=>`<button ${id?`data-slot="${id}"`:`data-open-panel="${name}"`} class="menu-card">${icon(({zones:'layers',progress:'chart',routes:'route'} as Record<string,string>)[name]??name)}<span><strong>${title}</strong><small>${description}</small></span>${icon('arrow','card-arrow')}</button>`;
    root.innerHTML=`<div class="app-frame">
      <header class="app-header"><button id="open-menu" data-open-panel="menu" aria-label="Open main menu" class="brand-button"><span class="brand-symbol">${icon('compass')}</span><span><strong>FREMONT <span>STREETS</span></strong><small>THE CITY IS YOUR CLASSROOM</small></span></button><div class="session-label"><span class="live-dot"></span> FREMONT, CA <span class="header-slash">/</span><span id="session-mode">FREE DRIVE</span><span class="header-slash">/</span><span id="session-zone">ZONE 1</span></div><nav class="header-actions" aria-label="Game navigation"><button id="open-session" data-open-panel="menu" data-testid="open-training" class="header-button">${icon('route')}<span>Training</span></button><button data-open-panel="zones" data-testid="open-zones" class="header-button">${icon('layers')}<span>Zones</span></button><button data-open-panel="progress" data-testid="open-progress" class="header-button">${icon('chart')}<span>Progress</span></button><button data-open-panel="settings" data-testid="open-settings" class="icon-button" aria-label="Open settings">${icon('settings')}</button><button data-open-panel="menu" class="header-button menu-trigger">${icon('menu')}<span>Menu</span></button></nav></header>
      <main class="driving-stage" aria-label="Fremont driving experience"><div data-slot="viewport"></div></main>
      <dialog id="game-dialog" data-testid="game-dialog" aria-labelledby="dialog-title"><header class="dialog-header"><button data-open-panel="menu" class="icon-button dialog-back" aria-label="Back to main menu">${icon('back')}</button><div><span class="eyebrow">FREMONT STREETS</span><h2 id="dialog-title" tabindex="-1">Your next drive</h2></div><button data-close-panel class="icon-button" aria-label="Close panel">${icon('close')}</button></header><div class="dialog-content">
        <section data-screen="menu" class="main-menu"><div class="menu-intro"><span class="location-tag">${icon('pin')} FREMONT, CALIFORNIA</span><h2>Know your<br><em>next turn.</em></h2><p>Real streets. A route worth remembering.<br>Take the driver's seat and learn your city.</p><button data-close-panel data-testid="continue-driving" class="primary continue-button">${icon('play')}Continue Driving ${icon('arrow')}</button><div data-slot="mode-zone1-main"></div><div class="menu-reference"><span class="hq-dot"></span><span>HEADQUARTERS DEPARTURE<strong>2000 Stevenson Boulevard</strong><small>Approximate public-road starting point</small></span></div><div class="menu-footnote"><span>38 STUDY ENTRIES</span><span>2 CAMERA VIEWS</span><span>YOUR PACE</span></div></div><div class="menu-destinations"><div class="eyebrow">CHOOSE YOUR DIRECTION</div><div class="menu-cards">${card('book','My Street List — 38 Entries','Your roads. Your next milestone.','mode-study')}${card('wheel','Free Drive','Get behind the wheel. Explore.','mode-free')}${card('route','Navigation Challenges','Find your way, with or without GPS.','mode-navigation')}${card('zones','Patrol Zones','One area at a time.','')}${card('progress','Learning Progress','See what you have practiced.')}${card('settings','Settings','Make the drive your own.')}${card('routes','Practice Routes','Return to your saved drives.')}${card('help','Street-name Practice','Recognize the roads you drive.','mode-quiz')}</div><div class="menu-links"><button data-open-panel="help">${icon('help')}Controls & help</button><button data-open-panel="information">${icon('info')}Geography & sources</button></div></div></section>
        <section data-screen="study" hidden><div class="section-intro"><span class="pill teal">YOUR PERSONAL CURRICULUM</span><p>21 east–west entries. 17 north–south entries.<br>Every route is a chance to make the city familiar.</p></div><div class="departure-card">${icon('home')}<div><small>DEFAULT STARTING POINT</small><strong>Fremont Police Headquarters</strong><span>2000 Stevenson Boulevard · approximate public-road departure</span></div></div><div data-slot="study"></div></section>
        <section data-screen="navigation" hidden><div class="section-intro"><span class="pill teal">FIND YOUR OWN WAY</span><p>Reach a real mapped intersection. Follow the guidance, or trust what you have learned.</p></div><div data-slot="mission"></div><div data-slot="quiz"></div><button data-open-panel="settings" class="text-button">${icon('settings')}Adjust navigation assistance</button></section>
        <section data-screen="zones" hidden><div class="section-intro"><p>A different focus. The same connected city.<br>Patrol boundaries are approximate study areas, never driving walls.</p></div><div data-slot="zones"></div></section>
        <section data-screen="progress" hidden><div class="section-intro"><span class="pill teal">PRACTICE BUILDS FAMILIARITY</span><p>Roads encountered and locations practiced are separate achievements. Neither means a whole road has been mastered.</p></div><div id="personal-dashboard" data-testid="personal-dashboard"></div><div data-slot="progress"></div></section>
        <section data-screen="settings" hidden><div data-slot="settings"></div><section class="panel display-settings"><div class="eyebrow">YOUR VIEW</div><h3>Display & performance</h3><label class="setting-row">Map orientation<select id="map-orientation"><option value="north">North up</option><option value="heading">Heading up</option></select></label><label class="setting-row">Map zoom <span><output id="map-zoom-value">16.5</output><input id="map-zoom" aria-label="Map zoom" type="range" min="13" max="19" step="0.5" value="16.5"></span></label><label class="checkbox"><input id="map-follow" type="checkbox" checked>Follow car while driving</label><label class="checkbox"><input id="hud-visible" type="checkbox" checked>Show driving HUD</label><label class="setting-row">Graphics quality<select id="graphics-quality"><option value="low">Efficient</option><option value="balanced" selected>Balanced</option><option value="high">High resolution</option></select></label><p class="muted">Graphics quality changes rendering resolution. Your roads, vehicle behavior and learning progress stay the same.</p></section></section>
        <section data-screen="routes" hidden><div data-slot="routes"></div></section>
        <section data-screen="help" hidden><div class="section-intro"><p>Look ahead. Choose your turn early.<br>Your selection waits for a matching supported junction.</p></div><div class="help-keys"><div><kbd>W</kbd><kbd>↑</kbd><span>Accelerate</span></div><div><kbd>S</kbd><kbd>↓</kbd><span>Brake</span></div><div><kbd>A</kbd><kbd>←</kbd><span>Queue left turn</span></div><div><kbd>D</kbd><kbd>→</kbd><span>Queue right turn</span></div><div><kbd>C</kbd><span>Switch cameras</span></div><div><kbd>Space</kbd><span>Pause or resume</span></div><div><kbd>Esc</kbd><span>Dismiss a panel</span></div></div><p class="muted">Use the driving dock for straight and turn-around choices. On-screen throttle and brake buttons support pointer/touch input. Opening a menu suspends the drive and releases held keys; closing it resumes the same vehicle state.</p><button data-close-panel class="primary">${icon('wheel')}Back to driving</button></section>
        <section data-screen="information" hidden><div data-slot="info"></div><div data-slot="departure"></div></section>
      </div></dialog><div id="toast" class="toast" role="status" aria-live="polite" hidden></div><aside data-slot="editor"></aside>
    </div>`;
    const slot=(name:string,node:HTMLElement)=>find(`[data-slot="${name}"]`).replaceWith(node);
    for(const [name,node] of Object.entries({viewport,study,mission,quiz,zones,progress,settings,routes,info,departure,editor}))slot(name,node);
    const icons=['book','shield','wheel','route','help'];
    modeButtons.forEach((button,i)=>{
      const replacement=find(`[data-slot="${button.id}"]`);if(!replacement)return;
      if(button.id==='mode-zone1-main'){button.className='zone1-shortcut';button.innerHTML=`${icon('shield')}Zone 1 — Main Roads ${icon('arrow')}`;replacement.replaceWith(button);return;}
      const copy=replacement as HTMLButtonElement;button.className=copy.className;button.innerHTML=copy.innerHTML.replace(icon(button.id==='mode-study'?'book':button.id==='mode-free'?'wheel':button.id==='mode-navigation'?'route':'help'),icon(icons[i]));replacement.replaceWith(button);
    });
    viewport.id='driving-viewport';viewport.tabIndex=-1;
    viewport.append(toolbar,drivebar,follow,status,controls);
    toolbar.insertAdjacentHTML('beforeend','<details class="map-key" data-testid="map-key"><summary>Map key</summary><div><span><i class="key-study"></i>Blue / gold: study roads</span><span><i class="key-route"></i>Mint: suggested route</span><span><i class="key-road"></i>Other solid roads: also drivable</span><span><i class="key-unavailable"></i>Amber dashed: unavailable in this game</span><small>Colors do not create road connections. Turn restrictions and one-way travel still apply.</small></div></details>');
    toolbar.querySelector('.live-status')?.classList.add('intersection-caption');
    const street=viewport.querySelector('.street-card')!;street.insertAdjacentHTML('afterbegin',`<span class="hud-location-icon">${icon('pin')}</span>`);street.insertAdjacentHTML('beforeend','<span id="hud-destination" class="hud-destination">Free drive · make yourself familiar</span>');
    viewport.querySelector('.speedometer')!.insertAdjacentHTML('afterbegin','<span class="speed-arc" aria-hidden="true"></span>');viewport.querySelector('.speedometer')!.insertAdjacentHTML('beforeend','<small id="hud-profile">QUICK</small>');
    viewport.querySelector('.driving-hud')!.insertAdjacentHTML('beforeend','<span id="hud-guidance" class="guidance-state">GUIDANCE ON</span>');
    for(const name of ['left','straight','right','uturn']){const button=find('#turn-'+name);button.innerHTML=`${icon(name)}<span>${{left:'Left',straight:'Straight',right:'Right',uturn:'Turn around'}[name]}</span>`;}
    find('#throttle').textContent='Accelerate';find('#brake').textContent='Brake';
    follow.innerHTML=`${icon('compass')}<span>Recenter</span>`;follow.removeAttribute('style');follow.title='Follow car / resume driving view';
    find('#pause').textContent='Pause';find('#reset-drive').textContent='Reset at HQ';find('#camera-overhead').innerHTML=`${icon('map')}<span>Overhead</span>`;find('#camera-driver').innerHTML=`${icon('wheel')}<span>Driver</span>`;
    for(const element of root.querySelectorAll<HTMLElement>('[style]'))if(element.matches('#save-route'))element.removeAttribute('style');
    editor.className='developer-editor-host';
    this.dialog=find<HTMLDialogElement>('#game-dialog');
    root.addEventListener('click',event=>{
      const button=(event.target as HTMLElement).closest<HTMLElement>('button');if(!button)return;
      const panel=button.dataset.openPanel as Panel|undefined;if(panel){this.open(panel,button);return;}
      if(button.hasAttribute('data-close-panel')){this.close();return;}
      if(button.id==='study-preview'&&!button.hasAttribute('disabled'))this.close();
    });
    this.dialog.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const controls=[...this.dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter(element=>element.getClientRects().length>0&&!element.closest('[hidden]'));
      if(!controls.length)return;event.preventDefault();const index=controls.indexOf(document.activeElement as HTMLElement);const next=event.shiftKey?(index<=0?controls.length-1:index-1):(index+1)%controls.length;controls[next].focus();
    });
    this.dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});
    this.dialog.addEventListener('click',event=>{if(event.target===this.dialog){const rect=this.dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)this.close();}});
    this.root.dataset.uiVersion='driving-first-v1';
  }
  configure(callbacks:{resize:()=>void;panel:()=>void;suspend:()=>void}){this.onResize=callbacks.resize;this.onPanel=callbacks.panel;this.onSuspend=callbacks.suspend;}
  get isOpen(){return this.dialog.open;}
  get panel(){return this.current;}
  open(panel:Panel,opener?:HTMLElement){
    if(!this.dialog.open){this.opener=opener??document.activeElement as HTMLElement;this.onSuspend();this.dialog.showModal();}
    this.root.querySelector<HTMLElement>('#toast')!.hidden=true;
    this.current=panel;this.dialog.dataset.panel=panel;
    this.root.querySelector<HTMLElement>('#dialog-title')!.textContent=titles[panel];
    for(const screen of this.dialog.querySelectorAll<HTMLElement>('[data-screen]'))screen.hidden=screen.dataset.screen!==panel;
    this.dialog.querySelector<HTMLElement>('.dialog-back')!.hidden=panel==='menu';
    this.dialog.querySelector<HTMLElement>('.dialog-content')!.scrollTop=0;
    (panel==='menu'?this.root.querySelector<HTMLElement>('[data-testid="continue-driving"]'):this.root.querySelector<HTMLElement>('#dialog-title'))?.focus({preventScroll:true});
    this.onPanel();this.onResize();
  }
  close(){if(!this.dialog.open)return;this.dialog.close();this.current=null;const toast=this.root.querySelector<HTMLElement>('#toast')!;toast.hidden=true;this.root.querySelector('.app-frame')!.append(toast);this.onResize();const opener=this.opener;if(opener?.isConnected&&!opener.closest('dialog'))opener.focus({preventScroll:true});else this.root.querySelector<HTMLElement>('.viewport')!.focus({preventScroll:true});}
  toast(message:string){const toast=this.root.querySelector<HTMLElement>('#toast')!;toast.textContent=message;if(this.isOpen)this.dialog.append(toast);else this.root.querySelector('.app-frame')!.append(toast);toast.hidden=false;window.clearTimeout(this.toastTimer);this.toastTimer=window.setTimeout(()=>toast.hidden=true,3500);}
  updateSession(mode:string,zone:string,profile:string){const session=this.root.querySelector<HTMLElement>('#open-session')!;session.dataset.openPanel=mode==='study'?'study':mode==='navigation'||mode==='quiz'?'navigation':'menu';session.querySelector('span')!.textContent=mode==='study'?'Destinations':mode==='navigation'||mode==='quiz'?'Challenge':'Training';this.root.querySelector('#session-mode')!.textContent=mode==='study'?'MY STREET LIST':mode==='navigation'?'NAVIGATION':mode==='quiz'?'STREET PRACTICE':'FREE DRIVE';this.root.querySelector('#session-zone')!.textContent=zone==='all'?'CITYWIDE':zone.replace('zone','ZONE ');this.root.querySelector('#hud-profile')!.textContent=profile;}
  updateProgress(entries:StudyEntry[],progress:StudyProgress){
    if(this.current!=='progress')return;
    const counts={visited:0,guided:0,unguided:0,roadToRoad:0,intersections:Object.values(progress.intersections).reduce((sum,value)=>sum+value.completed,0)};
    for(const entry of entries){const value=progress.entries[entry.id]??emptyStudyRecord();counts.visited+=Number(value.visits>0);counts.guided+=Number(value.guided>0);counts.unguided+=Number(value.unguided>0);counts.roadToRoad+=value.roadToRoad;}
    this.root.querySelector('#personal-dashboard')!.innerHTML=`<div class="personal-metrics"><div><strong>${counts.visited}<small> / 38</small></strong><span>entries encountered</span></div><div><strong>${counts.guided}</strong><span>locations reached with guidance</span></div><div><strong>${counts.unguided}</strong><span>locations reached without GPS</span></div><div><strong>${counts.roadToRoad}</strong><span>road-to-road completions</span></div><div><strong>${counts.intersections}</strong><span>intersection exercises completed</span></div></div><div class="curriculum-log">${entries.map(entry=>{const value=progress.entries[entry.id]??emptyStudyRecord();const status=entry.status!=='ready'?'Needs geographic verification':value.unguided?'Reached without guidance':value.roadToRoad?'Road-to-road practiced':value.guided?'Reached with guidance':value.visits?'Encountered':'Not practiced';return `<div data-progress-entry="${entry.id}"><span class="entry-group ${entry.group}">${entry.group==='ew'?'E–W':'N–S'}</span><strong>${escapeHTML(entry.originalLabel)}</strong><span>${status}</span><small>${value.repetitions} attempts</small></div>`;}).join('')}</div>`;
  }
}
