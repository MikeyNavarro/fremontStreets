# Fremont Streets

A playable driving and street-learning game for Fremont, California. Follow real road geometry, practice navigation, and switch between a MapLibre overhead map and a Three.js driver's-seat view without changing the simulation.

## Run locally

Requires Node.js 22.12+ (tested with Node 24) and a browser with WebGL enabled.

```sh
npm ci
npm run dev
```

Use the existing checkout at `/workspace/fremontStreets` in the Codex cloud environment. The bundled road data loads locally; gameplay does not repeatedly call map or routing services. Progress and saved routes are stored in this browser's local storage.

## Play

- Hold **W / ↑** to accelerate; hold **S / ↓** to brake.
- Press **A / ←** or **D / →** to queue a left or right turn. You can select a turn well before the intersection. A request waits until a matching legal branch exists.
- Use the **Straight** and **Turn around** buttons for those choices.
- **Space** pauses; **C** switches cameras. On-screen buttons also support driving.
- **QUICK** is the default acceleration profile: approximately 2.5 seconds to 30 mph and 4.5 seconds to 45 mph under unconstrained conditions. NORMAL and SPORT are available; vehicle capability is capped at 55 mph.
- **Free Drive** explores the loaded road network. **Navigation challenge** chooses a reachable real intersection and draws its route. Drive to the destination to complete it, with guidance on or off. Save routes for later practice.
- **Street-name practice** hides the current street label and overhead map labels while you answer. Exploration counts separately from quiz accuracy and navigation completions.

The vehicle cap is not a road speed limit. Limits come from source tags and show `?` when unknown. Corner assist slows sharp turns as a simulation aid. Traffic waiting is not simulated, and the game does not claim to verify real traffic controls or legal driving conditions.

## Geographic coverage and patrol zones

The game uses bounded **central Fremont and northern Irvington** road extracts with a buffer, not full-city coverage. Its exact bounds, source date, provenance, licensing, and import limitations are recorded in [`public/data/roads.json`](public/data/roads.json) and [`docs/geography.md`](docs/geography.md).

All four area choices work: **All Fremont**, **Zone 1 — Central Fremont (blue)**, **Zone 2 — North Fremont (pink)**, and **Zone 3 — South Fremont (orange)**. Selecting an area starts a fresh practice drive on a real road inside it, centers its boundary, and preserves all learning records. Accelerating or pressing **Follow car** returns the map to the driving view. Roads remain connected across zone borders.

> Patrol-zone boundaries are approximate study areas based on the Fremont Police Department's published map. They are not verified official GIS boundaries.

The geometry comes directly from the City of Fremont GIS Division's historical Police_Zones service and visually matches the user-supplied screenshot. The source layer dates to December 2020; current 2026 adoption is unverified. No screenshot coordinates were invented. Version, source URLs, calibration, screenshot reference and limitations are retained in [`public/data/zones.json`](public/data/zones.json) and [`docs/patrol-sources.md`](docs/patrol-sources.md).

| Study area | Playable source segments | Named streets |
| --- | ---: | ---: |
| Zone 1 | 11,275 | 588 |
| Zone 2 | 1,849 | 185 |
| Zone 3 | 6,632 | 273 |

**Every zone has partial road coverage.** These are learning-collection counts, not complete inventories; crossing streets can appear in multiple collections. A 75 m review band retains uncertainty near borders and does not claim measured positional accuracy. Navigation prefers in-zone road segments and safely interior destinations. Quizzes use streets in the selected zone and withhold questions outside it or near uncertain borders. Exploration is recorded by actual location, separately from demonstrated quiz/navigation results; citywide totals aggregate zone practice. Saved routes and progress remain available after switching zones.

The separately authorized Zone 3 road append preserves every original node, way, restriction and all 18,854 original directed edges. Only additional source-backed geography was added.

Both cameras share geographic centerlines and one authoritative vehicle state. The citywide local metric projection has a fixed origin at **37.5485° N, 121.9886° W**, with x east and y north. Graph connections use source node identity rather than geometric line crossings, keeping overpasses disconnected unless the source supplies a connection. Known one-way and supported turn restrictions are enforced; missing restrictions are not asserted to be verified. 3D road widths, center guides, and generic scenery are visual approximations, not measured lanes or traffic markings. The driver view is a flat schematic: terrain and bridge heights are not reconstructed, while the source road graph still preserves separate overpass connectivity.

## Validation

```sh
npm test            # simulation, routing, camera, progress, geography tests
npm run build       # strict TypeScript check and production build
npm run test:e2e    # actual Chromium browser driving and interface checks
```

Playwright uses an installed Chromium when available, or its managed browser. Install the managed browser with `npx playwright install chromium` if needed. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select a system executable.

## Geographic imports

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
- `src/main.ts`: keyboard/touch controls, challenges, quizzes, progress dashboard, and saved routes.
- `scripts/`: bounded road imports and official boundary validation.

Next priorities: verify current patrol adoption status, expand partial road coverage across all zones, improve destination selection and rerouting, and incorporate verified traffic controls and complex restrictions. See [`docs/validation.md`](docs/validation.md) for executed checks and known limitations.

Road data © OpenStreetMap contributors, available under the [Open Database License](https://www.openstreetmap.org/copyright). Application code has no license grant beyond any license the repository owner adds.
