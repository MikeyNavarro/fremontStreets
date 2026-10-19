# Fremont Streets

A playable driving and street-learning game for Fremont, California. Follow real road geometry, practice navigation, and switch between a MapLibre overhead map and a Three.js driver's-seat view without changing the simulation.

## GitHub Pages

The deployment target is **https://mikeynavarro.github.io/fremontStreets/**. It becomes playable only after the GitHub Pages deployment succeeds; the URL alone is not proof of publication.

The repository workflow tests the existing game, builds its static production files with the `/fremontStreets/` base path, checks the built site without Vite, and deploys the tested artifact on pushes to `main`. No game API key or private cloud service is required. See [deployment instructions](docs/deployment.md) for the exact GitHub Pages settings and run-status checks.

## Run locally

Requires Node.js 22.12+ (tested with Node 24) and a browser with WebGL enabled.

```sh
npm ci
npm run dev
```

Use the existing checkout at `/workspace/fremontStreets` in the Codex cloud environment. The bundled road data loads locally; gameplay does not repeatedly call map or routing services. Settings and legacy exploration use localStorage; detailed learning attempts and exam checkpoints use IndexedDB. Export a JSON backup from the learning dashboard to keep a portable copy.

## Street learning and free exploration

Open **Learn** or **Street-learning Dashboard**. Recommendations begin with a few
Zone 1 streets; all 38 original curriculum entries remain manually selectable.
Study corroborated street sections, identify a highlighted road, locate a street
by clicking the map, identify your current location, and compare directions
between specific sourced points. Hints are recorded as assistance. Driving pauses
while an answer is required, and answer-revealing map/HUD/search labels are hidden.

Drag the overhead map to enter **Explore**. Drive, zoom, change zones or switch
cameras while keeping that map position. **Center on Vehicle** is the sole action
that restores Follow; it keeps your zoom. **Explore streets** provides source-road
search, separate disconnected sections/carriageways, label controls and geographic
QA source IDs/nodes. Ambiguous overlaps and uncorroborated map clicks receive no
score.

Patrol practice includes HQ departures, no-GPS navigation, returns to the
approximate public-road HQ point, and two-stop patrols. Connected alternative
routes count. These drives remain **unscored for mastery** while independent
movement evidence is unresolved. Existing Free Drive, all three approximate
patrol zones, saved routes and both renderers remain available. QUICK acceleration
and the adjustable default 100 mph vehicle capability are retained.

The evidence registry separately records street identity, geometry, topology and
maneuvers. All 38 entries have corroborated recognition locations, comprising
12,279 directed segments. Eighteen entries match City centerlines across all their
imported segments under the documented 15 m comparison policy. This is not a
claim of surveyed geometry, full-city coverage, or legal-turn verification.

**The full exam and higher mastery levels are geographically blocked.** The
current evidence supplies no independently verified intersection/maneuver tasks.
The app discloses the missing categories instead of inventing a 20-task exam.
Recognized requires two different unaided identification/location questions;
visits alone never grant mastery. Historical attempts retain their geographic
version and do not automatically qualify after corrections.

See the [38-entry accuracy report](docs/learning-accuracy.md),
[implementation and verification report](docs/learning-implementation.md), and
[Stevenson startup investigation](docs/startup-timeout.md).

The [expanded geographic audit](docs/geographic-audit.md) separates nine evidence
dimensions and compares the unchanged baseline with newly retrieved City
intersection and federal bridge records. It includes a [directed 38-entry
matrix](docs/geographic-connectivity.md) and [independent-source provenance](docs/junction-source-research.md).
These records corroborate named physical sites and grade separation within their
documented scope; they do not establish individual turning permissions. Reproduce
the audit from the committed snapshots with `npm run data:verify && npm run data:audit`.

## Driving-first interface

The full-viewport dark driving screen keeps the road central. Open **Menu** for training, zones, progress, saved routes and help; **Settings** controls map orientation/zoom, following, HUD visibility and graphics resolution as well as the existing driving preferences. Panels suspend movement without resetting the vehicle, route or camera. **Escape** opens or dismisses the menu.

See the [redesign report and visual checks](docs/redesign.md) and [AFTER screenshots](docs/screenshots/README.md). The map style is local; the 3D environment and vehicle interior remain clearly labeled visual approximations. No new map provider, API key, remote font or UI dependency is required.

## Play

- Hold **W / ↑** to accelerate; hold **S / ↓** to brake.
- Press **A / ←** or **D / →** to queue a left or right turn. You can select a turn well before the intersection. A request waits until a matching legal branch exists.
- Use the **Straight** and **Turn around** buttons for those choices.
- **Space** pauses; **C** switches cameras. On-screen buttons also support driving.
- **QUICK** is the default acceleration profile: approximately 2.5 seconds to 30 mph and 4.5 seconds to 45 mph under unconstrained conditions. NORMAL and SPORT are available; the adjustable vehicle cap defaults to 100 mph and accepts 10–100 mph. Real posted limits remain separate.
- **Free Drive** explores the loaded road network. **Navigation challenge** chooses a reachable real intersection and draws its route. Drive to the destination to complete it, with guidance on or off. Save routes for later practice.
- **Street-name practice** hides the current street label and overhead map labels while you answer. Exploration counts separately from quiz accuracy and navigation completions.

The vehicle cap is not a road speed limit. Limits come from source tags and show `?` when unknown. Corner assist slows sharp turns as a simulation aid. Traffic waiting is not simulated, and the game does not claim to verify real traffic controls or legal driving conditions.

## My Street List — 38 Entries

Choose **My Street List — 38 Entries** in the main menu. The exact curriculum contains 21 east–west and 17 north–south entries. Those headings are study categories, not exact bearings. You confirmed **Lake Arrowhead Avenue**, and **Grimmer Boulevard plus South Grimmer Boulevard** remain one study entry. No unlisted road becomes an extra target.

Browse all entries or either group, preview a destination, then choose Reach a Street, Random Street, Road to Road, Intersection Challenge, No-GPS, Return to Headquarters, or Street Connection Quiz. **Zone 1 — Main Roads** focuses on the Zone 1 portions of your list. Other sourced roads remain usable connectors. Wrong turns can trigger a connected reroute; any arrival allowed by the supported graph at the marked destination counts. These historical exercises do not establish independently verified legal movements or earn new scored mastery.

New sessions begin stopped on a source-backed **Stevenson Boulevard** departure near Fremont Police Headquarters, 2000 Stevenson Boulevard. It is an approximate public-road start, **not a verified driveway or parking-space location**; it leaves a 20 m approach before the first junction. Road-to-road, intersection and return exercises explicitly choose another valid start. QUICK is the default. Both cameras read the same vehicle state.

All 38 entries have playable sampled locations with departure and return routes. All 1,406 non-self directed representative pairs were evaluated. **This does not establish that every segment or traffic movement is verified:** some sampled approaches remain inaccessible in the available graph, unsupported restrictions are excluded, and real traffic controls remain unverified. Personal progress records reached locations, repetitions and identifications, not whole-road mastery.

See [road inventory](docs/study-road-inventory.md), [coverage and source audit](docs/personalized-geography.md), [directed matrix](docs/data/study-connectivity.json), [source-node intersections](docs/data/study-intersections.json), and [verification results](docs/data/study-verification.json).

## Geographic coverage and patrol zones

The game preserves its original extracts and adds **all 64 buffered Zone 1 bounding-box tiles plus 85 bounded tiles around the exact personalized study corridors**. This is not full-city or verified end-to-end corridor coverage. Its exact bounds, source date, provenance, licensing, and import limitations are recorded in [`public/data/roads.json`](public/data/roads.json) and [`docs/geography.md`](docs/geography.md).

All four area choices work: **All Fremont**, **Zone 1 — Central Fremont (blue)**, **Zone 2 — North Fremont (pink)**, and **Zone 3 — South Fremont (orange)**. Zone 1 is the default, and the last selected patrol zone is remembered. New drives start at the headquarters departure; selecting another zone preserves the overhead camera and all learning records. Use **Inspect selected boundary on map** to view its approximate area in Explore mode. Drive over the continuous road network to reach it. Only **Center on Vehicle** restores Follow; accelerating never recenters an Explore camera. Roads remain connected across zone borders.

> Patrol-zone boundaries are approximate study areas based on the Fremont Police Department's published map. They are not verified official GIS boundaries.

The geometry comes directly from the City of Fremont GIS Division's historical Police_Zones service and visually matches the user-supplied screenshot. The source layer dates to December 2020; current 2026 adoption is unverified. No screenshot coordinates were invented. Version, source URLs, calibration, screenshot reference and limitations are retained in [`public/data/zones.json`](public/data/zones.json) and [`docs/patrol-sources.md`](docs/patrol-sources.md).

Per-zone source-segment and street counts are calculated from the current dataset in the game. The earlier patrol release counts remain in the historical validation report.

**Every zone has partial road coverage.** These are learning-collection counts, not complete inventories; crossing streets can appear in multiple collections. A 75 m review band retains uncertainty near borders and does not claim measured positional accuracy. Navigation prefers in-zone road segments and safely interior destinations. Quizzes use streets in the selected zone and withhold questions outside it or near uncertain borders. Exploration is recorded by actual location, separately from demonstrated quiz/navigation results; citywide totals aggregate zone practice. Saved routes and progress remain available after switching zones.

The personalized expansion preserves **every one of the prior 5,839 source ways and 19,523 source nodes**, plus existing restrictions. The merged dataset has 22,794 ways, 84,825 nodes and 166,282 playable directed edges. No source-node coordinate conflicts or changed existing ways were found. The merged source data records 232 unsupported restrictions, whose prohibited via-way connectors and uncertain only/conditional approaches remain conservatively excluded; traffic-rule completeness is not asserted.

Both cameras share geographic centerlines and one authoritative vehicle state. The citywide local metric projection has a fixed origin at **37.5485° N, 121.9886° W**, with x east and y north. Graph connections use source node identity rather than geometric line crossings, keeping overpasses disconnected unless the source supplies a connection. Known one-way and supported turn restrictions are enforced; missing restrictions are not asserted to be verified. 3D road widths, center guides, and generic scenery are visual approximations, not measured lanes or traffic markings. The driver view is a flat schematic: terrain and bridge heights are not reconstructed, while the source road graph still preserves separate overpass connectivity.

## Validation

```sh
npm test            # simulation, routing, camera, progress, geography tests
npm run build       # strict TypeScript check and production build
npm run test:e2e    # actual Chromium browser driving and interface checks
npm run test:production # built static game at the GitHub Pages subdirectory
```

Playwright uses an installed Chromium when available, or its managed browser. Install the managed browser with `npx playwright install chromium` if needed. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select a system executable.

## Geographic imports

Rebuild the personalized reports from the committed source data with `npm run data:study`. See [the import procedure](docs/personalized-geography.md) for the cached OSM API and paginated City GIS pipelines. Neither runs during gameplay.

```sh
# Generate a bounded source extract for review (does not replace bundled roads):
npm run data:import -- --output /tmp/fremont-extract.json
# Append a bounded Zone 3 source extract without overwriting existing roads:
node scripts/extend-roads.mjs --output /tmp/fremont-roads-next.json
# Reproduce the historical study boundaries for review:
node scripts/import-study-zones.mjs --output /tmp/fremont-study-zones.json
```

Read [`docs/geography.md`](docs/geography.md) before refreshing data or importing patrol polygons. Imports require network access only when fetching new data, preserve source metadata, and never synthesize street names or connections.

## Developer boundary editor

Run a development server locally with `npx vite --host 127.0.0.1`. Open its printed address and append **`?zoneEditor=1`**. The game pauses, all three colored boundaries appear, and editing controls become available. This local development gate is not a remote authentication system. Production builds never enable the editor.

Select a zone and drag a visible vertex, or select any original vertex in the precision controls and enter longitude/latitude. Invalid geometry is rejected. Toggle street previews to inspect assignments and dashed uncertain segments. **Undo**, **Discard edits**, and **Revert original** restore earlier states. Export a versioned approximate GeoJSON file with source and calibration metadata; reimport that file to resume editing. Edits are in memory until exported and never change road geometry or connections.

All original vertices remain in the data and precision selector; map handles are spaced at the current zoom for usability. To make an exported revision the bundled source, preserve its provenance, convert its FeatureCollection with `zoneDocumentFromGeoJSON`, validate it, and review/test the resulting zone document before replacing `public/data/zones.json`.

## Architecture and next improvements

- `src/core/`: pure road graph, fixed projection, vehicle physics, legal turn selection, routing, learning and persistence.
- `src/views/`: MapLibre and Three.js presentation of the same simulation state.
- `src/main.ts`: authoritative game wiring, keyboard/touch controls, patrol challenges and saved routes.
- `src/study-mode.ts`, `src/study-network.ts`: the exact 38-entry curriculum, exercises, source-backed arrivals and separate personal progress.
- `src/departure.ts`: verified source reference and approximate headquarters public-road departure.
- `scripts/`: bounded road imports and official boundary validation.

See [the Stevenson continuity fix](docs/stevenson-continuity.md) for the repaired false stops and map colors.

Next priorities: verify current patrol adoption status, expand partial road coverage across all zones, improve destination selection and rerouting, and incorporate verified traffic controls and complex restrictions. See [personalized validation](docs/personalized-validation.md) for executed checks and known limitations; [the earlier report](docs/validation.md) records the historical patrol release.

Road data © OpenStreetMap contributors, available under the [Open Database License](https://www.openstreetmap.org/copyright). Application code has no license grant beyond any license the repository owner adds.
