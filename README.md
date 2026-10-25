# Fremont Streets

A focused interactive map for learning Fremont, California's actual streets and intersections. The existing TypeScript, Vite and MapLibre application now centers on geographic study; the driving simulator is preserved in Git.

Website: https://mikeynavarro.github.io/fremontStreets/

The redesign is published only after the main-branch GitHub Actions build, tests and Pages deployment succeed. A local build or existing website does not prove this revision is live.

## Use the map

- Start with the **18 assigned Zone 1 entries**. Switch to **All Assigned Streets — 38 Entries** for the complete original curriculum.
- Choose a road from **Street list**, search, or click its actual mapped geometry. Your selection is **orange**. Overlapping road hits offer an explicit identity choice.
- Press **↓ Down Arrow** to highlight and frame the next street in the current list; **↑ Up Arrow** goes back. The list wraps at either end. Shortcuts pause while using search or form fields, choosing an ambiguous road, or practicing a quiz; holding a key does not skip through streets.
- Zone 1 mode highlights actual line/polygon-clipped sections. **Show Full Road** displays the complete *available imported* extent; pale dashes identify out-of-zone sections. Separate carriageways contribute separately to reported centerline length.
- Drag and zoom freely. There is no vehicle, automatic follow mode, physics loop, speedometer, driving HUD or driver's-seat renderer in the active application.
- Inspect junction markers, their source evidence and connecting streets. **Previous / Next** follows source geometry within explicit mapped sections; it is not a guaranteed complete real-world itinerary.
- Compare a second road in **blue**. The map distinguishes direct source-node connections from nonconnecting crossings; it does not invent an intersection or assert every legal turn.
- Use **Map layers → Find Police Headquarters** for the retained building reference at 2000 Stevenson Boulevard. This is a landmark, not the former approximate vehicle departure or a verified driveway.
- **Practice** offers highlighted-road identification, finding a road by clicking it, and eligible physical-intersection recognition. Hidden-name questions suppress the map labels and answer-revealing interface together. Explicit hints count as assisted.

The list collapses to leave almost the entire screen available for the map. Narrow screens use a drawer. Mouse and touch panning, native keyboard zoom and horizontal panning remain available, with visible keyboard focus and reduced-motion support. Up/down arrows select study streets outside practice.

## Accuracy and scope

All original road data, source mappings, evidence, historical zone polygons and the exact 38 curriculum identities remain intact. The default 18 entries are the user's explicit selection, not a dynamic rule that adds every tiny polygon overlap. Eggers Drive and Osgood Road have small clipped overlaps with the approximate polygon but remain optional entries.

Zone 1 uses the retained historical City GIS polygon as an **approximate study boundary**. Current jurisdictional adoption is unverified. Boundary cuts create display endpoints only; they do not create source nodes, junctions or new road connections.

Street identity, geometry corroboration, named intersection locations, physical topology, grade separation and individual legal maneuvers have distinct evidence scopes. A City intersection point is not a survey of every carriageway or proof of turning permission. Independently supported physical pairs may support a geography question while legal maneuvers remain unresolved. Other mapped relationships stay available for exploratory study with their uncertainty shown.

The imported network is bounded and incomplete. Named intersections and mapped ramps are included where source topology supports them; the inventory does not claim every unnamed driveway. A source-based comparison finding no direct connection does not prove the full real-world corridors never meet.

See the [map geography report](docs/map-study-geography.md), [geographic audit](docs/geographic-audit.md), [original recognition evidence](docs/learning-accuracy.md), and [source research](docs/junction-source-research.md). OpenStreetMap attribution and ODbL, City GIS credit and source dates are retained. No map API key or remote font service is required.

## Minimal history

New map study uses a separate versioned browser-local key. It records viewed roads, unaided identifications and question attempts without treating a visit as mastery. **Street list → Your study history** provides JSON export/import; imports merge compatible records. Old driving localStorage and IndexedDB records are left untouched. Storage failures produce a visible warning and leave the current session exportable.

## Develop and verify

Use Node 22.12 or newer; CI uses Node 24.

```sh
npm ci
npm run dev
```

On your own machine, Vite reports the local address. A cloud environment needs an actual supported preview or forwarded port; a localhost address is not a public link. The published Pages site works without Vite or a private cloud service.

```sh
npm run data:map       # deterministic, offline derivation from retained sources
npm test              # relevant geography, label and new map-study unit tests
npm run test:e2e       # map-focused Chromium interaction tests
npm run build         # derive data, type-check and build static Pages assets
npm run test:production # same map interactions against /fremontStreets/
```

Run browser suites serially on software-rendered cloud hosts. The production tests serve built files with `scripts/serve-production.mjs`, without Vite middleware or an application backend. `npm run test:legacy` retains the broader library test entry point; obsolete driving UI browser expectations are preserved in the archive and are not release requirements for the new product.

`data:map` reads existing OSM, City corroboration, zone, study and independent-evidence snapshots. It never downloads roads or edits original data. It produces `public/data/map-study.json`, with input hashes and source provenance. Runtime loads this derived map asset and the local MapLibre worker; it does not build the old vehicle graph or load Three.js. Production emits only the map's required assets, while original source files remain in the repository.

The derived data is approximately 19.4 MB raw / 2.41 MB gzip. Repeated clipped and corroborated geometry preserves traceability; it is not a smaller raw JSON download than the old source payload. Removing graph construction, vehicle simulation and 3D rendering reduces runtime work. Hardware performance must be measured rather than inferred from cloud screenshots.

Native line labels retain the prior source-preserving chain preparation, promoted source IDs, local curve alignment, repetition and collision handling. The read-only `window.__FREMONT_MAP_STUDY__` snapshot supports browser diagnostics and projected source-point inspection; it cannot mutate the application.

## Recover the driving simulator

The complete working driving version is archived remotely at **`driving-simulator-archive`**, pointing to:

`636dab9584233e9024be272a023a8945032830de`

To inspect it in an appropriate checkout after preserving any current work:

```sh
git fetch origin tag driving-simulator-archive
git switch --detach driving-simulator-archive
npm ci
npm run dev
```

The tag contains its original source, dependencies, tests and deployment configuration. The redesigned branch also retains the previous entry point as `src/driving-main.ts`; it is not imported by the active map. Recover the tag to run the complete matching historical configuration.

## Deployment

GitHub Pages retains the repository path **`/fremontStreets/`**. The existing main-branch workflow installs locked dependencies, runs relevant unit and map browser tests, builds, tests the static production subdirectory and deploys only after those checks pass. Do not force-push, bypass failed tests or claim a published update before checking the actual run and live assets.

The [redesign verification report](docs/map-redesign.md) records executed browser checks, screenshots, limitations and the archive reference.
