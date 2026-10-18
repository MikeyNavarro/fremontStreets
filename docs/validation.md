# First playable slice: validation and scope

The initial README was committed and pushed to GitHub `main` as `2076b5efb97ff3eb4a983ae2de6dca0356e6a71a`; the fetched remote tree contained `README.md`. The application work is in the working checkout and has not been committed or pushed as part of that README-only publication request.

## Executed checks

- `npm ci --no-audit --no-fund` completed using the frozen lockfile and workspace npm cache.
- `npm run build` passed strict TypeScript checks and generated the production bundle. Vite reports a size advisory for MapLibre and Three.js library chunks; this is not a build failure.
- `npm test`: **31 passed, 0 failed, 0 skipped**. Tests include acceleration, braking, caps, projection, source topology, bridge crossings, one-way/access, restrictions, buffered turns, canonical route/controller choices, camera invariance, navigation completion, progress serialization, and geographic imports.
- `npm run test:e2e`: **6 passed, 0 failed, 0 skipped** in the final complete Chromium run (2.1 minutes). Scenarios verify actual rendered roads and zone availability; keyboard driving through multiple intersections and braking; both rendered cameras and exact paused-state invariance; persisted progress and saved-route replay/cancellation; completing a real navigation challenge through driving controls; and quiz accuracy. The targeted navigation test also passed separately. No vehicle state mutation or teleportation was used to complete the challenge.
- Production browser smoke verification rendered MapLibre roads and Three.js, preserved the exact paused vehicle on camera switch, and observed no page errors or external service requests. Desktop and 390-pixel mobile layouts were inspected.
- The documented `npm run data:import -- --output /tmp/fremont-roads-roundtrip.json` completed against Overpass. Source nodes, ways and restrictions matched the bundled snapshot on repeat import.

## Required behavior and evidence

| Behavior | Evidence / scope |
| --- | --- |
| Game starts | Vite startup, served HTML and local road JSON, actual Chromium application checks |
| Real Fremont roads | Bundled timestamped OSM IDs/tags/geometry; geographic tests validate source-derived graph segments |
| Multiple real intersections | Keyboard browser drive crosses at least two; a two-minute core drive crosses 27 unique source intersections |
| QUICK acceleration | Automated unconstrained measurement reaches 30 mph at about 2.5 seconds and 45 mph at about 4.5 seconds |
| Overhead view | Actual MapLibre canvas, roads and real street labels verified |
| Driver view | Actual Three.js WebGL canvas verified; flat schematic road widths and scenery are approximate |
| Camera invariant | Exact paused vehicle, speed, heading, active route and progress equality in browser and core tests |
| Navigation challenge | Exact source-node arrival completes a real connected route; browser controls reach the target |
| Learning areas | All Fremont uses the loaded partial graph; three patrol-zone options are visibly unavailable |
| Official boundaries | No polygon, effective date or adoption record could be verified; null geometries and provenance records retained |
| Progress | Exploration, challenges, quizzes, recent streets and saved routes stored separately in local storage; independent zone records tested in core |
| Build and tests | Production build and the executed automated checks above |
| Geographic uncertainty | Interface, README, source metadata and geography documentation explicitly distinguish missing information |

## Supported coverage and limitations

The requested study extract is central Fremont, bounded by −122.004/37.534 and −121.963/37.568, with whole returned ways extending into the surrounding buffer. It includes Downtown-area roads such as Fremont Boulevard, Mowry Avenue, Walnut Avenue and Paseo Padre Parkway. It is neither full-city coverage nor a verified Zone 1 polygon.

The source snapshot (2026-10-18T23:12:16Z) contains 3,063 ways, 9,998 nodes, 537 nonempty source names, 42 supported node-via restrictions and 50 unsupported restriction records. Conservative graph handling omits 85 ways implicated by unsupported restrictions; the playable graph has 535 unique names. See `public/data/roads.json` for provenance, query, checksum and limitations. Nothing is inferred from lines simply crossing in space.

Police and municipal websites returned upstream access denial; ArcGIS discovery could not supply verified official polygons or an adoption record. The proposed October 6, 2026 boundary changes are not assumed adopted. All three patrol zones remain unavailable. The guarded zone importer prepares reviewed official data; activating boundary overlays, zone-filtered gameplay and per-zone UI requires integration and tests against those verified polygons before removing the unavailable state.

Traffic signals, detailed lanes, terrain, bridge heights and missing/complex legal restrictions are unverified. The 3D view is flat and schematic; physical movement still follows source-node connectivity and cannot jump between disconnected crossing roads. Speed limits are displayed only from supported source values. Corner assist and the absence of traffic waiting are simulation simplifications.

At forks with multiple branches in one direction, left/right selects a canonical branch. Navigation avoids alternatives that these directional controls cannot explicitly choose; the underlying physical road graph is unchanged. Explicit branch selection is a future improvement.

Browser storage is local to this origin, browser and device; there is no account synchronization. Only named streets in the playable extract can appear in questions. Routes may leave the requested box via retained source ways. There is no misleading dataset-completion percentage.

## Fixed during validation

MapLibre 6 required an explicit bundled ESM worker URL for Vite. Navigation initially allowed shape-node reversals and ambiguous same-direction forks that the controls could not select. Routing now uses the same canonical directional choices as driving, with regressions for the reported Sundale Drive/Fremont Boulevard fork. Upcoming-intersection lookahead gives advance instructions across intermediate road-shape nodes.

## Highest-priority next work

1. Obtain and review adopted official patrol polygons and effective dates, then integrate/test boundary overlays, in-zone destinations/questions, and per-zone UI before enabling the zone options.
2. Expand versioned road coverage across Fremont and implement more complex via-way/conditional restrictions without weakening conservative access rules.
3. Add destination selection, convenient route recovery and more street-learning question formats.
4. Improve the schematic driver scene with source-backed elevations and landmarks, keeping visual approximations explicit.

Reusable installation and startup instructions are saved in the environment configuration draft. Saving that draft does not publish a snapshot or verify restoration into a new task. Review/save environment settings and publish through the product when ready.
