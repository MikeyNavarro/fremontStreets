import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BoundaryEditorSession } from '../src/editor/session';
import { buildGraph } from '../src/core/graph';
import { validateZoneManifest, type ZoneDocument, type ZoneGeometry } from '../src/core/zones';
import type { RoadData } from '../src/core/types';

const baseline = JSON.parse(readFileSync(new URL('../public/data/zones.json', import.meta.url), 'utf8')) as ZoneDocument;
const roads = JSON.parse(readFileSync(new URL('../public/data/roads.json', import.meta.url), 'utf8')) as RoadData;

function adjustedGeometry(): ZoneGeometry {
  const geometry = structuredClone(baseline.zones.find((zone) => zone.id === 'zone1')!.geometry!);
  const ring = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates[0][0];
  // Sub-metre adjustment of a real City GIS boundary vertex, rather than a mock polygon.
  // Vertex 0 has a source-preserved neighbouring vertex only millimetres away;
  // vertex 25 is suitable for a small, topology-preserving review adjustment.
  ring[25] = [ring[25][0] + 0.000001, ring[25][1]];
  return geometry;
}

test('editing a real sourced polygon preserves the graph, original geometry, and provenance', () => {
  assert.equal(validateZoneManifest(baseline).valid, true, 'Actual shipped study boundaries validate');
  const graph = buildGraph(roads);
  const graphSnapshot = () => JSON.stringify({ nodes: [...graph.nodes], edges: [...graph.edges], outgoing: [...graph.outgoing], incoming: [...graph.incoming], restrictions: graph.restrictions });
  const beforeGraph = graphSnapshot();
  const beforeSource = JSON.stringify(baseline);
  const editor = new BoundaryEditorSession(baseline);
  const result = editor.editGeometry('zone1', adjustedGeometry());
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
  assert.equal(editor.dirty, true);
  assert.equal(editor.canUndo, true);
  assert.equal(graphSnapshot(), beforeGraph, 'Boundary editing must not change any road nodes, edges, or legal transitions');
  assert.equal(JSON.stringify(baseline), beforeSource, 'Bundled original remains unchanged');
  const edited = editor.document;
  assert.equal(edited.metadata.sourceDatasetUrl, baseline.metadata.sourceDatasetUrl);
  assert.equal(edited.metadata.sourceSha256, baseline.metadata.sourceSha256);
  assert.equal(edited.metadata.screenshotReference, baseline.metadata.screenshotReference);
  assert.deepEqual(edited.metadata.calibration, baseline.metadata.calibration);
  assert.equal(edited.metadata.accuracy, 'approximate');
  assert.notEqual(edited.metadata.boundaryVersion, baseline.metadata.boundaryVersion);
  assert.equal(edited.metadata.parentBoundaryVersion, baseline.metadata.boundaryVersion);
});

test('invalid polygon drops and uncalibrated imports leave editor state and undo history unchanged', () => {
  const editor = new BoundaryEditorSession(baseline);
  const before = editor.document;
  const openRing = adjustedGeometry();
  const ring = openRing.type === 'Polygon' ? openRing.coordinates[0] : openRing.coordinates[0][0];
  ring.pop();
  const result = editor.editGeometry('zone1', openRing);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /closed/i);
  assert.deepEqual(editor.document, before);
  assert.equal(editor.canUndo, false);
  const uncalibrated = structuredClone(baseline);
  delete uncalibrated.metadata.calibration;
  assert.equal(editor.importDocument(uncalibrated).valid, false);
  assert.deepEqual(editor.document, before);
  assert.equal(editor.canUndo, false);
});

test('undo, discard, and original reversion restore the actual sourced boundaries', () => {
  const editor = new BoundaryEditorSession(baseline);
  assert.equal(editor.editGeometry('zone1', adjustedGeometry()).valid, true);
  editor.undo();
  assert.deepEqual(editor.document, baseline);
  assert.equal(editor.dirty, false);
  assert.equal(editor.editGeometry('zone1', adjustedGeometry()).valid, true);
  editor.discard();
  assert.deepEqual(editor.document, baseline);
  const imported = structuredClone(baseline);
  imported.metadata.boundaryVersion = 'reviewed-import-test';
  assert.equal(editor.importDocument(imported).valid, true);
  assert.equal(editor.document.metadata.boundaryVersion, 'reviewed-import-test');
  assert.equal(editor.editGeometry('zone1', adjustedGeometry()).valid, true);
  editor.discard();
  assert.deepEqual(editor.document, imported, 'Discard restores the last accepted import');
  editor.revertOriginal();
  assert.deepEqual(editor.document, baseline, 'Original means the bundled baseline before imports or edits');
});

test('versioned approximate GeoJSON round trip retains source, screenshot, calibration, and geometry', () => {
  const editor = new BoundaryEditorSession(baseline);
  assert.equal(editor.editGeometry('zone1', adjustedGeometry()).valid, true);
  const output = editor.exportGeoJSON();
  assert.equal(output.type, 'FeatureCollection');
  assert.equal(output.features.length, 3);
  assert.equal(output.metadata.accuracy, 'approximate');
  assert.equal(output.metadata.sourceDatasetUrl, baseline.metadata.sourceDatasetUrl);
  assert.equal(output.metadata.screenshotReference, baseline.metadata.screenshotReference);
  assert.deepEqual(output.metadata.calibration, baseline.metadata.calibration);
  assert.equal(Number.isFinite(Date.parse(String(output.metadata.exportedAt))), true);
  const imported = new BoundaryEditorSession(baseline);
  const result = imported.importDocument(JSON.parse(JSON.stringify(output)));
  assert.equal(result.valid, true, result.errors.join(' '));
  assert.deepEqual(imported.document.zones.map((zone) => zone.geometry), editor.document.zones.map((zone) => zone.geometry));
  assert.equal(imported.document.metadata.sourceSha256, baseline.metadata.sourceSha256);
});
