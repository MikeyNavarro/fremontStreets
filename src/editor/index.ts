import type { FeatureCollection, LineString } from 'geojson';
import { buildZoneCoverage, type ZoneDocument } from '../core/zones';
import type { RoadGraph } from '../core/types';
import { OverheadView } from '../views/overhead';
import type { BoundaryCollection } from '../views/types';
import { BoundaryEditorSession } from './session';
import './style.css';

export { BoundaryEditorSession } from './session';

export interface ZoneEditorOptions {
  container: HTMLElement;
  overhead: OverheadView;
  baseline: ZoneDocument;
  graph: RoadGraph;
  onPreview?: (document: ZoneDocument) => void;
}

/** This is a local-development tool, not an authentication or remote authorization system. */
export function zoneEditorEnabled(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).get('zoneEditor') === '1';
}

export function mountZoneEditor(options: ZoneEditorOptions): { dispose(): void } | null {
  if (!zoneEditorEnabled()) return null;
  const { container, overhead, graph } = options;
  const session = new BoundaryEditorSession(options.baseline);
  let selected = 'zone1';
  let stopVertices: (() => void) | null = null;
  let previewStreets = true;
  let disposed = false;
  let selectedVertex = '0:0:0';
  const root = document.createElement('section');
  root.className = 'zone-editor';
  root.dataset.testid = 'zone-editor';
  root.innerHTML = `
    <div class="zone-editor-title"><strong>Developer boundary editor</strong><span>LOCAL DEV · GAME PAUSED</span></div>
    <p>This tool is enabled only in Vite development with <code>?zoneEditor=1</code>. It provides no remote authorization. Normal gameplay never enables editing.</p>
    <p class="zone-editor-notice">Patrol-zone boundaries are approximate study areas based on the Fremont Police Department's published map. They are not verified official GIS boundaries.</p>
    <div class="zone-editor-choices"><button type="button" data-zone="zone1">Zone 1 · Blue</button><button type="button" data-zone="zone2">Zone 2 · Pink</button><button type="button" data-zone="zone3">Zone 3 · Orange</button></div>
    <label class="zone-editor-preview"><input type="checkbox" data-action="preview" checked> Preview street assignments · dashed dark segments are uncertain</label>
    <p data-field="summary"></p>
    <fieldset class="zone-editor-precision" data-field="vertex-controls"><legend>Precise existing-vertex adjustment</legend><label>Vertex<select data-action="vertex" aria-label="Boundary vertex"></select></label><label>Longitude<input data-action="longitude" data-testid="zone-editor-longitude" type="number" step="0.000001" min="-180" max="180" aria-label="Boundary vertex longitude"></label><label>Latitude<input data-action="latitude" data-testid="zone-editor-latitude" type="number" step="0.000001" min="-90" max="90" aria-label="Boundary vertex latitude"></label><button type="button" data-action="apply-vertex" data-testid="zone-editor-apply-vertex">Validate & apply vertex</button></fieldset>
    <div class="zone-editor-actions"><label class="zone-editor-import">Import sourced / calibrated GeoJSON<input type="file" data-action="import" accept=".json,.geojson,application/json,application/geo+json"></label><button type="button" data-action="undo">Undo</button><button type="button" data-action="discard">Discard edits</button><button type="button" data-action="revert">Revert original</button><button type="button" data-action="export">Export approximate GeoJSON</button></div>
    <details><summary>Source, version, calibration, and limitations</summary><pre data-field="metadata"></pre></details>
    <p class="zone-editor-status" data-field="status" role="status">Select a zone, then drag a vertex. Edits are validated before preview and do not change road connectivity.</p>
  `;
  container.append(root);
  overhead.setFollowVehicle(false);

  const field = (name: string) => root.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
  function report(message: string, invalid = false): void {
    field('status').textContent = message;
    field('status').dataset.invalid = String(invalid);
  }

  function render(focus = false): void {
    if (disposed) return;
    stopVertices?.();
    const document = session.document;
    const collection: BoundaryCollection = {
      type: 'FeatureCollection',
      features: document.zones.flatMap((zone) => zone.geometry ? [{ type: 'Feature' as const, properties: { id: zone.id, name: zone.name, color: zone.color }, geometry: zone.geometry }] : []),
    };
    overhead.setBoundaries(collection, selected, true);
    const zone = document.zones.find((item) => item.id === selected);
    const vertexControls = root.querySelector<HTMLFieldSetElement>('[data-field="vertex-controls"]')!;
    vertexControls.disabled = !zone?.geometry;
    const vertexSelect = root.querySelector<HTMLSelectElement>('[data-action="vertex"]')!;
    vertexSelect.replaceChildren();
    if (zone?.geometry) {
      const polygons = zone.geometry.type === 'Polygon' ? [zone.geometry.coordinates] : zone.geometry.coordinates;
      polygons.forEach((polygon, polygonIndex) => polygon.forEach((ring, ringIndex) => ring.slice(0, -1).forEach((_, vertexIndex) => {
        const option = window.document.createElement('option');
        option.value = `${polygonIndex}:${ringIndex}:${vertexIndex}`;
        option.textContent = `Polygon ${polygonIndex + 1} · ring ${ringIndex + 1} · vertex ${vertexIndex + 1}`;
        vertexSelect.append(option);
      })));
      if (![...vertexSelect.options].some((option) => option.value === selectedVertex)) selectedVertex = vertexSelect.options[0]?.value ?? '0:0:0';
      vertexSelect.value = selectedVertex;
      syncVertexFields();
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-zone]')) {
      button.classList.toggle('active', button.dataset.zone === selected);
      button.setAttribute('aria-pressed', String(button.dataset.zone === selected));
    }
    root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled = !session.canUndo;
    root.querySelector<HTMLButtonElement>('[data-action="discard"]')!.disabled = !session.dirty;
    root.querySelector<HTMLButtonElement>('[data-action="export"]')!.disabled = !collection.features.length;
    field('metadata').textContent = JSON.stringify(document.metadata, null, 2);
    let assignmentText = '';
    if (previewStreets && collection.features.length) {
      const coverage = buildZoneCoverage(graph, document);
      const features: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] };
      const seen = new Set<string>();
      for (const [edgeId, assignment] of coverage.byEdge) {
        const edge = graph.edges.get(edgeId)!;
        const identity = [edge.from, edge.to].sort().join(':');
        if (seen.has(identity)) continue;
        seen.add(identity);
        const uncertain = assignment.uncertainZoneIds.includes(selected);
        if (!assignment.zoneIds.includes(selected) && !uncertain) continue;
        features.features.push({ type: 'Feature', properties: { zoneId: selected, color: zone?.color, uncertain, name: edge.name }, geometry: { type: 'LineString', coordinates: [graph.nodes.get(edge.from)!.position, graph.nodes.get(edge.to)!.position] } });
      }
      overhead.setClassifiedRoads(features);
      const stats = coverage.zones[selected];
      assignmentText = stats ? ` ${stats.segmentIds.length} mapped street segments; ${stats.ambiguousSegmentIds.length} ambiguous near the boundary.` : '';
    } else overhead.setClassifiedRoads({ type: 'FeatureCollection', features: [] });
    if (zone?.geometry) {
      field('summary').textContent = `${zone.name}. Drag visible round handles, or select any original vertex below. Overlapping handles are spaced for clarity; zoom in to reveal more. Source geometry is unchanged.${assignmentText}`;
      if (focus) overhead.focusBoundary(zone.geometry);
      stopVertices = overhead.beginBoundaryEdit(zone.geometry, (candidate) => {
        const result = session.editGeometry(selected, candidate);
        if (!result.valid) { report(`Edit rejected: ${result.errors.join(' ')}`, true); return false; }
        render();
        report('Valid edit previewed. Review uncertain street assignments, then export for source control.');
        return true;
      }, selected);
    } else {
      stopVertices = null;
      field('summary').textContent = 'No sourced boundary geometry is loaded for this zone. Import GeoJSON with source URL, boundary version, digitization date, limitations, and geographic calibration. A screenshot-derived file must include the screenshot reference and at least three geographic control points. No polygons are invented by this tool.';
    }
    options.onPreview?.(document);
  }

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-zone]')) button.addEventListener('click', () => {
    selected = button.dataset.zone!;
    selectedVertex = '0:0:0';
    render(true);
  });
  function syncVertexFields(): void {
    const geometry = session.document.zones.find((zone) => zone.id === selected)?.geometry;
    if (!geometry) return;
    const [polygonIndex, ringIndex, vertexIndex] = selectedVertex.split(':').map(Number);
    const polygon = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates[polygonIndex];
    const coordinate = polygon?.[ringIndex]?.[vertexIndex];
    if (!coordinate) return;
    root.querySelector<HTMLInputElement>('[data-action="longitude"]')!.value = String(coordinate[0]);
    root.querySelector<HTMLInputElement>('[data-action="latitude"]')!.value = String(coordinate[1]);
  }
  root.querySelector<HTMLSelectElement>('[data-action="vertex"]')!.addEventListener('change', (event) => {
    selectedVertex = (event.target as HTMLSelectElement).value;
    syncVertexFields();
  });
  root.querySelector<HTMLButtonElement>('[data-action="apply-vertex"]')!.addEventListener('click', () => {
    const longitude = root.querySelector<HTMLInputElement>('[data-action="longitude"]')!.valueAsNumber;
    const latitude = root.querySelector<HTMLInputElement>('[data-action="latitude"]')!.valueAsNumber;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) { report('Edit rejected: enter finite longitude and latitude coordinates.', true); return; }
    const geometry = session.document.zones.find((zone) => zone.id === selected)?.geometry;
    if (!geometry) return;
    const [polygonIndex, ringIndex, vertexIndex] = selectedVertex.split(':').map(Number);
    const polygon = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates[polygonIndex];
    polygon[ringIndex][vertexIndex] = [longitude, latitude];
    if (vertexIndex === 0) polygon[ringIndex][polygon[ringIndex].length - 1] = [longitude, latitude];
    const result = session.editGeometry(selected, geometry);
    if (!result.valid) { report(`Edit rejected: ${result.errors.join(' ')}`, true); return; }
    render();
    report('Valid vertex adjustment previewed. Original source and calibration are retained.');
  });
  root.querySelector<HTMLInputElement>('[data-action="preview"]')!.addEventListener('change', (event) => {
    previewStreets = (event.target as HTMLInputElement).checked;
    render();
  });
  root.querySelector<HTMLInputElement>('[data-action="import"]')!.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('Boundary imports must be smaller than 5 MB.');
      const result = session.importDocument(JSON.parse(await file.text()));
      if (!result.valid) { report(`Import rejected: ${result.errors.join(' ')}`, true); return; }
      render(true);
      report('Sourced boundary file imported. Original source and calibration metadata are retained.');
    } catch (error) { report(`Import rejected: ${String(error)}`, true); }
    finally { input.value = ''; }
  });
  for (const action of ['undo', 'discard', 'revert'] as const) root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.addEventListener('click', () => {
    if (action === 'undo') session.undo();
    if (action === 'discard') session.discard();
    if (action === 'revert') session.revertOriginal();
    render();
    report(action === 'undo' ? 'Previous boundary state restored.' : action === 'discard' ? 'Edits discarded; last imported or original boundary state restored.' : 'Original bundled boundary state restored.');
  });
  root.querySelector<HTMLButtonElement>('[data-action="export"]')!.addEventListener('click', () => {
    try {
      const output = session.exportGeoJSON();
      const blob = new Blob([JSON.stringify(output, null, 2) + '\n'], { type: 'application/geo+json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fremont-study-zones-${String(output.metadata.boundaryVersion ?? 'unversioned').replace(/[^a-zA-Z0-9_-]/g, '-')}.geojson`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      report('Versioned approximate GeoJSON exported. Source, screenshot reference, calibration, and edit provenance are included.');
    } catch (error) { report(`Export rejected: ${String(error)}`, true); }
  });

  render(true);
  return {
    dispose(): void {
      disposed = true;
      stopVertices?.();
      overhead.setClassifiedRoads({ type: 'FeatureCollection', features: [] });
      overhead.setFollowVehicle(true);
      root.remove();
    },
  };
}
