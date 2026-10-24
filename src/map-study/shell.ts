import {icon} from '../ui/icons';

/** Map-study chrome only. Geographic contents and interaction state belong to
 * the application controller; this shell never moves or changes the map. */
export function mountStudyShell(container: HTMLElement): void {
  const compact = window.matchMedia('(max-width: 760px)').matches;
  container.classList.add('map-study-app');
  container.innerHTML = `
    <a class="skip-link" href="#map">Skip to interactive map</a>
    <header class="study-topbar">
      <div class="study-brand" aria-label="Fremont Streets — Interactive street learning">
        <span class="brand-mark">${icon('compass')}</span>
        <span><strong>FREMONT <span>STREETS</span></strong><small>THE CITY IS YOUR CLASSROOM</small></span>
      </div>
      <label class="study-mode-field" for="study-mode"><span class="sr-only">Study curriculum</span>
        <select id="study-mode" data-testid="study-mode">
          <option value="zone1">Zone 1 — 18 Streets</option>
          <option value="all">All Assigned Streets — 38 Entries</option>
        </select>
      </label>
      <div class="study-search" role="search" aria-label="Find a Fremont street">
        <svg class="icon search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>
        <label class="sr-only" for="map-search">Search streets</label>
        <input id="map-search" data-testid="map-search" type="search" autocomplete="off" spellcheck="false" placeholder="Search a street…" aria-controls="search-results" />
        <div id="search-results" class="search-results" data-testid="search-results" aria-label="Street search results" hidden></div>
      </div>
      <nav class="study-topbar-actions" aria-label="Study controls">
        <button id="toggle-library" class="subtle-button" type="button" aria-label="Show street list" aria-controls="road-drawer" aria-expanded="${!compact}">${icon('map')}<span class="action-label">Street list</span></button>
        <button id="open-practice" class="practice-button" type="button" aria-label="Open study practice" aria-controls="quiz-panel">${icon('book')}<span class="action-label">Practice</span></button>
      </nav>
    </header>
    <main class="study-stage" aria-label="Interactive Fremont street map">
      <div id="map" tabindex="-1" data-testid="study-map" class="study-map" aria-label="Fremont map. Drag to pan and use map controls to zoom."></div>

      <aside id="road-drawer" data-testid="road-drawer" class="road-drawer" aria-labelledby="library-heading" ${compact?'hidden':''}>
        <div class="drawer-heading">
          <div><span class="eyebrow">YOUR STUDY AREA</span><h1 id="library-heading">One street at a time.</h1></div>
          <button id="close-library" class="icon-button" type="button" aria-label="Close street list">${icon('close')}</button>
        </div>
        <div class="drawer-intro"><p>Select a street to follow its shape and explore the roads it meets.</p><div id="study-count" data-testid="study-count" class="study-count">18 assigned streets · Zone 1</div></div>
        <div id="road-list" data-testid="road-list" class="road-list" role="group" aria-label="Assigned study streets" tabindex="-1"></div>
        <div id="road-details" data-testid="road-details" class="road-details"></div>
        <div class="drawer-footer"><span class="legend-line orange" aria-hidden="true"></span><span>Orange marks your selected street.</span></div>
      </aside>

      <div class="map-tools" aria-label="Map display controls">
        <button id="map-home" type="button" class="map-tool" aria-label="Show Zone 1 overview">${icon('compass')}<span>Zone 1 overview</span></button>
        <details id="map-options" class="map-options">
          <summary aria-label="Map layers and reference controls">${icon('layers')}<span>Map layers</span></summary>
          <div class="map-options-content">
            <span class="eyebrow">DISPLAY</span>
            <label class="toggle-row"><input id="labels-toggle" type="checkbox" checked/><span>Street names</span></label>
            <label class="toggle-row"><input id="boundary-toggle" type="checkbox" checked/><span>Approximate Zone 1 boundary</span></label>
            <label class="toggle-row"><input id="hq-toggle" type="checkbox" checked/><span>Police Headquarters landmark</span></label>
            <button id="find-hq" type="button">${icon('pin')}Find Police Headquarters</button>
            <div class="map-legend" aria-label="Map legend"><span><i class="legend-line orange"></i>Selected road</span><span><i class="legend-line blue"></i>Comparison road</span><span><i class="legend-dot"></i>Source-mapped junction</span><span><i class="legend-dot verified"></i>Corroborated named connection</span><span><i class="legend-dot crossing"></i>Nonconnecting crossing notice</span></div>
            <p class="source-note">Markers describe geographic evidence. They do not establish permission for every turn.</p>
          </div>
        </details>
      </div>

      <section id="selection-panel" data-testid="selection-panel" class="selection-panel floating-panel" aria-label="Selected street and intersection details" hidden></section>
      <section id="quiz-panel" data-testid="quiz-panel" class="quiz-panel floating-panel" aria-label="Street practice" hidden></section>
      <section id="disambiguation" data-testid="disambiguation" class="disambiguation floating-panel" aria-label="Choose a road at this location" hidden></section>

      <div id="storage-warning" data-testid="storage-warning" class="storage-warning" role="status" hidden></div>
      <div id="map-status" data-testid="map-status" class="map-status" role="status" aria-live="polite" aria-atomic="true">Explore freely · Drag to pan · Scroll to zoom</div>
      <p id="map-notice" class="map-notice">Historical Zone 1 boundary · Approximate study area · Imported road coverage is partial</p>
    </main>`;
}
