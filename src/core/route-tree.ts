import { drivableOutgoing } from './graph';
import type { RoadGraph, Route } from './types';

/** Directed edge-state Dijkstra: each transition uses the same supported turn
 * rules as vehicle simulation. Reuse adjacency for the offline 38x38 audit. */
const adjacency = new WeakMap<RoadGraph, { forward: Map<string, string[]>; reverse: Map<string, string[]> }>();
function links(graph: RoadGraph) {
  let value = adjacency.get(graph);
  if (value) return value;
  const forward = new Map<string, string[]>(), reverse = new Map<string, string[]>();
  for (const edge of graph.edges.values()) {
    const next = drivableOutgoing(graph, edge).map(item => item.id);
    forward.set(edge.id, next);
    for (const id of next) { const list = reverse.get(id) ?? []; list.push(edge.id); reverse.set(id, list); }
  }
  value = { forward, reverse }; adjacency.set(graph, value); return value;
}

export function buildRouteTree(graph: RoadGraph, anchorEdge: string, reverse = false, preferred?: ReadonlySet<string>) {
  if (!graph.edges.has(anchorEdge)) throw new Error('Route-tree anchor must be an existing directed edge.');
  const neighbors = links(graph)[reverse ? 'reverse' : 'forward'];
  const cost = new Map<string, number>([[anchorEdge, 0]]), previous = new Map<string, string>();
  const heap: Array<{ id: string; cost: number }> = [];
  function push(item: { id: string; cost: number }) {
    heap.push(item); let index = heap.length - 1;
    while (index > 0) { const parent = (index - 1) >> 1; if (heap[parent].cost <= item.cost) break; heap[index] = heap[parent]; index = parent; } heap[index] = item;
  }
  function pop() {
    const top = heap[0], tail = heap.pop()!;
    if (heap.length) { let index = 0; while (index * 2 + 1 < heap.length) { let child = index * 2 + 1; if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++; if (heap[child].cost >= tail.cost) break; heap[index] = heap[child]; index = child; } heap[index] = tail; }
    return top;
  }
  push({ id: anchorEdge, cost: 0 });
  while (heap.length) {
    const item = pop(); if (cost.get(item.id) !== item.cost) continue;
    for (const id of neighbors.get(item.id) ?? []) {
      const traveled = graph.edges.get(reverse ? item.id : id)!;
      // A through-training route is not authorized to use destination-only,
      // customer/delivery, permit, or emergency access as a shortcut.
      if(preferred&&[graph.edges.get(id)!,traveled].some(edge=>['destination','customers','delivery','permit','agricultural','forestry','emergency'].includes(edge.access??'')))continue;
      const weight=!preferred?1:preferred.has(traveled.id) ? .8 :traveled.highway==='service'?5:['residential','living_street'].includes(traveled.highway)?1.7:1;
      const distance = item.cost + traveled.length * weight;
      if (distance >= (cost.get(id) ?? Infinity)) continue;
      cost.set(id, distance); previous.set(id, item.id); push({ id, cost: distance });
    }
  }
  return {
    cost,
    routeTo(edgeId: string): Route | null {
      if (!cost.has(edgeId)) return null;
      const ids = [edgeId]; let cursor = edgeId;
      while (cursor !== anchorEdge) { cursor = previous.get(cursor)!; ids.push(cursor); }
      if (!reverse) ids.reverse();
      return { edgeIds: ids, nodeIds: [graph.edges.get(ids[0])!.from, ...ids.map(id => graph.edges.get(id)!.to)], distance: ids.reduce((sum, id) => sum + graph.edges.get(id)!.length, 0) };
    },
  };
}
