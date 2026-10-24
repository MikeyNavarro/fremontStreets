# Interactive street-study map redesign

## Scope and archive

Fremont Streets is changing from the driving simulator into an interactive map for learning real road locations and geographic relationships. The existing MapLibre renderer, source-backed geography, native road labels and curriculum identities are retained. Driving controls, vehicle simulation and the Three.js driver's view are outside the new application's active experience.

The complete prior driving simulator is preserved by the annotated Git tag **`driving-simulator-archive`**, pointing to **`636dab9584233e9024be272a023a8945032830de`**. That tag was pushed before redesign work began. The historical source, tests and versioned data can be inspected with:

```sh
git show driving-simulator-archive:README.md
git show driving-simulator-archive:package.json
```

To run that historical application, use a separate ordinary clone checked out at the archive tag. Do not reset an existing checkout with unsaved work.

## Curriculum and geographic policy

The default Zone 1 list is the user's exact 18-entry selection: Driscoll Road, Niles Boulevard, Sundale Drive, Walnut Avenue, Blacow Road, Farwell Drive, Fremont Boulevard, Grimmer Boulevard, Interstate 680, Interstate 880, Logan Drive, Mission Boulevard, Mowry Avenue, Niles Canyon Road, Paseo Padre Parkway, Peralta Boulevard, Stevenson Boulevard and Washington Boulevard.

The optional All Assigned Streets mode retains all 38 original curriculum IDs, labels, aliases and source-way associations. Connector roads can be inspected without being added to either curriculum. The historical City GIS boundary remains an **approximate study boundary**, with current adoption status unverified.

Display clipping at a boundary creates cartographic line endpoints only. It must not create source nodes, intersection records, legal movements or physical graph connections. A complete displayed imported section does not establish that every real-world segment of its corridor is present.

Intersection information distinguishes source-node topology, independently supported named locations, independently corroborated physical connections, unresolved relationships and nonconnecting grade-separated crossings. Physical intersection recognition does not certify every turning movement. Unresolved relationships may be explored with warnings and must not become scored facts merely because the application can display them.

## Verification record

The release candidate passed **96 unit tests, all 12 development browser cases, and all 12 production browser cases** on 2026-10-24. Both complete browser runs finished in approximately 2.9 minutes with no skipped tests or increased timeout budgets. After a small status/footer refinement, both affected comparison/mobile cases passed again in development and production, including an actual attribution-toggle interaction. The production suite served the actual build under `/fremontStreets/`. These results establish software behavior, not independent real-world geographic correctness. Deployment remains pending until a successful GitHub Pages run and live-site checks establish otherwise.

| Check | Current result |
| --- | --- |
| Historical driving version archived | Remote annotated tag created at `636dab9` before edits. |
| Exact default 18 / optional 38 curriculum | Passed source identity checks and actual browser list/mode interactions. |
| Source-backed clipping and intersection topology | Active unit suite: 96 passed, 0 failed, 0 skipped; includes retained shared geography and new map/learning checks. |
| Map selection, orange highlight, full-road display and comparison | Passed in development and production; exact displayed source geometry, actual colors and background visibility checked. |
| Search, junction walkthrough, HQ reference and free camera | Passed actual UI interactions, source identity checks and manual-pan/no-recenter assertions. |
| Hidden-answer quizzes and conservative fact eligibility | Identification, source-click location and scoped physical-intersection questions answered correctly in browser; reload persistence, old-key preservation and storage-denial behavior passed. |
| Mobile layout and actual visual inspection | All 11 production screenshots captured and manually viewed; stale status and mobile-footer overlap were corrected and their focused browser regressions passed. |
| Production build and GitHub Pages path | TypeScript/Vite build passed; 12 production browser cases passed under `/fremontStreets/` with local assets and no vehicle/remote-service requests. |
| GitHub Actions and public-site deployment | Checked separately after this pre-publication report is committed. A successful main-branch workflow and live asset/browser checks are required; local results alone do not establish publication. |

## Visual evidence

The [capture script](../scripts/capture-map-study.mjs) exercised ordinary interface controls and read-only map diagnostics against the production build, without moving geometry or mutating application state through test hooks. All 11 captured PNGs were individually viewed. The [observations](screenshots/map-study/observations.json) record actual map state and zero page/console errors for every capture.

| Capture | Manual observation |
| --- | --- |
| [Default Zone 1 map](screenshots/map-study/01-default-zone1.png) | Map fills the viewport below the header; approximate boundary, background roads, source names and HQ landmark are visible. |
| [18-road list](screenshots/map-study/02-zone1-road-list.png) | Scrollable list leaves most of the desktop map visible; count and mode agree. |
| [Orange Stevenson](screenshots/map-study/03-stevenson-orange.png) | Highlight follows mapped curves and retains junction markers; unresolved corridor-wide geometry is disclosed. |
| [Orange Fremont](screenshots/map-study/04-fremont-orange.png) | Separate carriageways and branches remain visible rather than becoming one invented shortcut. |
| [Fremont close-up](screenshots/map-study/04b-fremont-close-labels.png) | Repeated native Fremont labels follow the rendered source lines; nearby named roads remain legible. |
| [Intersection inspection](screenshots/map-study/05-intersection-inspection.png) | Focus marker sits on the mapped Stevenson/Mission connection; named-location evidence is visibly separate from unresolved physical topology and turns. |
| [Comparison](screenshots/map-study/06-road-comparison.png) | Stevenson is orange, Fremont blue, and the panel explains the source-mapped connection without claiming verified turns. |
| [All 38 entries](screenshots/map-study/07-all-assigned-streets.png) | Mode and list count switch to 38; full imported sections and out-of-zone styling are available. |
| [Identification quiz](screenshots/map-study/08-identify-quiz.png) | Map names, search and answer-bearing side panels are hidden; only deliberate multiple-choice answers remain. |
| [Mobile map](screenshots/map-study/09-mobile-map.png) | Native zoom controls remain accessible above the information sheet; highlighted geometry and HQ remain visible. |
| [Mobile street drawer](screenshots/map-study/10-mobile-road-drawer.png) | The street list replaces the information sheet, scrolls, and has a visible close control. |

Visual review identified and corrected stale junction status after comparison and an overlapping mobile footer. The final status describes the selected comparison; the boundary notice and attribution occupy separate mobile rows. The native attribution toggle opens readable source credits without overlapping the boundary notice. Real touchscreen pinch gestures and every browser/device combination have not been tested; the narrow-screen checks used Chromium at 390 × 844 with actual pointer gestures and control clicks.

Source-geometry tests and visual interaction checks serve different purposes. Neither a successful browser test nor a screenshot independently establishes real-world geographic accuracy. Detailed source limitations remain in the geographic evidence reports and the generated map-study provenance.

## Defects found and corrected

- A CSS cascade conflict left the MapLibre container without usable height. The first run was stopped after one pass, three failures, one interrupted case and seven unrun cases. Explicit stage dimensions and stronger container specificity corrected the blank map.
- The selected-road panel covered native zoom controls. Desktop controls now move clear of panels; mobile controls remain above the bottom sheet. Actual zoom-button clicks passed at both viewport sizes.
- Visual inspection found stale junction context in the comparison status and overlapping mobile credits. Status now refreshes after junction closing and comparison changes; mobile notices and expandable attribution have separate footer space.
- Logical junctions could use a representative outside the selected section or Zone 1, and unrelated named pairs could inherit one another's evidence. Markers now use actual applicable source nodes; scoped Driscoll and intersection-question assertions passed.
- Comparison originally counted ten selected-section cases using a pair on another component of a logical junction. Applicable shared source nodes are now checked for the actual selected section and study scope, with unit regressions.
- Browser tests exposed two test-assumption defects. Correct-answer assertions now target the actual feedback instead of concatenated parent text. Source clicks wait for camera settling and use an interior point of a source primitive; a 10 m Stevenson primitive beside Mission legitimately remained ambiguous at the earlier test point. Unscored overlaps never add a failed attempt. Correct location and intersection answers were then exercised through ordinary map clicks and buttons.

Earlier failures were investigated and preserved before reruns. They were not suppressed, skipped or hidden by longer timeouts. All seven retained geographic input hashes match the archived driving version.

## How to use the map

Open the site directly into Zone 1. Use **Street list** to show the 18-road list, choose a road, or use the search field. The selected road is orange; its geometry is clipped to the approximate Zone 1 polygon until **Show Full Road** is selected. **All Assigned Streets** exposes the unchanged 38-entry curriculum and available full geometry. Full geometry means the imported extent, not a guarantee of complete real-world corridor coverage.

Drag and zoom freely after selecting a road. There is no vehicle or camera-follow loop. **Zone 1 overview** is an explicit map overview action. **Map layers** contains boundary, label and headquarters controls; **Find Police Headquarters** uses the retained building reference, not the former approximate road-departure point.

The road panel separates mapped sections, lists intersections in source-chain order and offers **Previous** / **Next**. Divided carriageways and branches remain distinct. Select a mapped junction to inspect names and evidence; physical relationships and legal turning permissions have separate status. Comparison keeps the selected road orange and the second road blue, with direct-junction and nonconnecting-crossing distinctions.

Practice offers identification, map-location and eligible physical-intersection questions. Names and answer-bearing panels are hidden during unaided questions. A hint marks an assisted attempt. Where corroboration is insufficient, the application reports that no eligible question is available instead of inventing one. Viewing a road is recorded separately from identifying it correctly; no driving mastery requirements remain active.

History is stored under a new versioned browser-local key; previous driving records are retained. Export/import controls appear inside **Your study history**. A storage warning means the current browser cannot reliably preserve changes. This map experience does not require a backend or account.

## Geographic coverage and remaining limits

The derivation reuses 22,794 original source-way features, 6,359 source-preserving native label chains, 470 study sections, 1,572 mapped junction groups and 68 explicitly nonconnecting crossing records. Ten junction groups contain scoped corroborated physical road-pair facts; nine physical question pairs have an eligible source node inside Zone 1. These figures describe the retained dataset, not a complete survey of Fremont.

The [geographic derivation report](map-study-geography.md) records all 38 entries, original source hashes, boundary uncertainty and eligibility rules. Retained OSM geometry and City corroboration are reused; this redesign does not independently re-survey streets, re-confirm current jurisdictional adoption, or certify legal traffic movements. A named City intersection location alone is insufficient evidence for all physical connections or turns. Scoped display markers must use an actual source node on the selected section, with applicable pair evidence at that node.

The generated map dataset is approximately 19.4 MB before transfer compression. Removing driving runtime work does not make this raw geographic payload smaller. The renderer uses local fonts and the versioned map dataset; repeat public map-service downloads are unnecessary during study. Startup and data-transfer performance remain dependent on the browser and network.

## Reproducible checks

```sh
npm ci
npm test
npm run build
npm run test:e2e
npm run test:production
npm run dev
```

`test:production` serves the actual build under `/fremontStreets/`, matching the GitHub Pages repository path. The active browser suite exercises the map application. Historical driving-only browser files remain in the repository and archive but are not part of the redesigned map release checks. Existing shared geographic, labeling, continuity and verification checks remain active.
