# Stevenson Boulevard continuity correction

The player reported stopping where blue highlighting ended on Stevenson Boulevard.
Source-data analysis found three false dead ends in the supported graph, including
both approaches near headquarters. The screenshot alone does not identify an OSM
node; the regression checks cover all three loaded Stevenson false stops.

Blue/gold are curriculum highlights, not permission to drive. Other solid roads
remain drivable. Mint indicates a suggested guided route. The new Map key explains
these colors. Source roads excluded from gameplay now use an amber dashed map
line; the driver scene renders supported roads only. At a supported-graph endpoint,
the HUD warns before arrival and explains an actual stop rather than saying to
keep accelerating. This does not label a data gap as a real road closure.

## Cause and correction

The previous unsupported-restriction fallback removed both the from-way and the
via-way of a no-U-turn relation. Removing the from-way cut an otherwise ordinary
straight-through Stevenson approach before the junction.

For a complete, unconditional prohibited (`no_*`) via-way record, excluding the
via way already prevents the prohibited movement. The approach can therefore
remain available without ignoring that restriction. Only-turn, conditional,
vehicle-specific only-turn and incomplete records retain their conservative
approach exclusions. This release does **not** implement full history-based via-way
routing, and the excluded connectors remain unavailable.

The correction restores six source Stevenson ways and 552 directed source edges
citywide: 165,730 becomes 166,282. Every previously supported edge remains. The
OSM road/node/restriction dataset and historical zone polygons are unchanged.
No road connection, coordinate or traffic movement was invented.

Reproduce the three-source-location audit:

```sh
node --import ./node_modules/tsx/dist/loader.mjs scripts/audit-continuity.ts
npm run data:study
```

[Machine-readable evidence](data/stevenson-continuity.json) records source way/node
IDs, positions, old/new outgoing edges and two-second constrained driving results.
The rebuilt 38-entry curriculum and all 1,406 ordered representative pairs have
routes with uncertain restrictions. Eleven of 256 stratified approaches remain
inaccessible. Compare the earlier release's 24 of 257: samples can change when
representative routes change, so this is not a fixed-cohort improvement percentage.

## Validation and remaining improvements

The unit regression checks cover the three real source breaks, prohibited
connectors, conservative conditional/only/incomplete fallbacks, source geometry,
one-way topology and preservation of the original baseline. Browser checks cover
Stevenson driving while a different study category is highlighted, the map key,
actual unavailable-road styling, existing challenge completion and wrong-turn
recovery. Executed locally: 77 unit tests passed, the production build passed,
and the focused browser runs passed actual road-to-road/HQ-return/intersection
completion, wrong-turn recovery, Zone 1 filtering, both cameras, working display
settings and the Stevenson color/availability scenario. The final task report
records the complete release-workflow result and public deployment verification.

[Inspected map-key capture](screenshots/09-stevenson-map-key.png).

Highest priorities after this correction: history-aware via-way routing to safely
open more currently excluded connectors; automatic wrong-turn recovery for the
general navigation mode (personal study already recalculates); a clearer upcoming
street/turn card with optional spoken guidance; hardware-accelerated performance
profiling. Continue auditing source restrictions and geographic gaps before
claiming full-road mastery or complete city coverage.
