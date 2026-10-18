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

The first slice uses a bounded **central Fremont** road extract with a buffer, not full-city coverage. Its exact bounds, source date, provenance, licensing, and import limitations are recorded in [`public/data/roads.json`](public/data/roads.json) and [`docs/geography.md`](docs/geography.md).

The area menu includes All Fremont and the requested three patrol zones. All Fremont operates on the loaded partial network. Zone 1, Zone 2, and Zone 3 remain unavailable until their officially adopted boundaries and versions can be verified. No proposed boundaries or guessed study-area rectangles are presented as official. See [`public/data/zones.json`](public/data/zones.json) for the verification record.

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
npm run data:import
# Or use an existing bounded Overpass JSON export:
npm run data:import -- --input /path/to/extract.json
```

Read [`docs/geography.md`](docs/geography.md) before refreshing data or importing patrol polygons. Imports require network access only when fetching new data, preserve source metadata, and never synthesize street names or connections.

## Architecture and next improvements

- `src/core/`: pure road graph, fixed projection, vehicle physics, legal turn selection, routing, learning and persistence.
- `src/views/`: MapLibre and Three.js presentation of the same simulation state.
- `src/main.ts`: keyboard/touch controls, challenges, quizzes, progress dashboard, and saved routes.
- `scripts/`: bounded road imports and official boundary validation.

Next priorities: verify official patrol-zone polygons and adoption status, expand the versioned road extract across Fremont, add richer destination selection and rerouting, improve road-label learning, and incorporate verified traffic controls and more complex turn restrictions. See [`docs/validation.md`](docs/validation.md) for executed checks and known limitations.

Road data © OpenStreetMap contributors, available under the [Open Database License](https://www.openstreetmap.org/copyright). Application code has no license grant beyond any license the repository owner adds.
