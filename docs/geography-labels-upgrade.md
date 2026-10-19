# Geographic accuracy and native map-label upgrade

## Checkpoint and release status

This extends the existing Fremont Streets application. The reviewed published baseline is **`a416cdd`**. The geographic evidence and reproducible audit are preserved in commit **`339c1c2`** (`Audit Fremont study connections with scoped City and bridge evidence`).

**This is a recoverable implementation checkpoint, not a deployment-success announcement.** Geographic audit commit `339c1c2` and native-label commit `9e2ad3c` preserve the work separately. Native labels and their visual comparison passed, followed by all 23 development and 31 production browser tests at `9e2ad3c`. A subsequent diagnostic correction promotes each immutable label-chain ID into native MapLibre features, so rendered labels resolve to their exact source records. The 118 Node tests and production build passed again after that correction. Five targeted development and five targeted production browser checks also passed after the correction. All 18 after screenshots were then regenerated with zero rendered-ID/source-provenance lookup failures and zero page errors. GitHub Actions and publication verification remain pending at this pre-deployment checkpoint. Publication must be verified before claiming that the live game contains this upgrade.

The existing website is <https://mikeynavarro.github.io/fremontStreets/>. Its existence does not establish that these changes have been deployed.

## Geographic work completed

The baseline was reproduced with `npm run data:verify`. No source geometry, road connection, curriculum mapping, patrol polygon, headquarters spawn or runtime scoring eligibility was changed. Input SHA-256 hashes confirm preservation of the existing datasets.

The new audit records nine independent dimensions: road identity, centerline geometry, intersection location, physical topology, grade separation, vehicle access, one-way restrictions, individual maneuvers and route reachability. Each has a scoped evidence status and source references. A location match cannot establish permission to turn. Existing conflicts remain conflicted when new favorable claims arrive unless an explicit resolution is supplied.

| Evidence or software check | Result | Scope |
| --- | ---: | --- |
| Curriculum entries examined | 38 | Exact original IDs, labels and 21 east–west / 17 north–south groups retained. |
| Corroborated directed study segments | 12,279 | Existing City/OSM comparison, with 15 m tolerance and samples no farther than 10 m apart. |
| Entries with all imported segments corroborated | 18 | Does not establish complete end-to-end corridor coverage. |
| Entries with partial corroboration | 20 | Uncorroborated sections remain unresolved. |
| Study junction source records audited | 219 | Individual source nodes, including divided carriageways. |
| Independently corroborated location associations | 200 | Associated with 75 distinct City named-intersection records; not 200 surveyed physical intersections. |
| Implemented protected intersections corroborated | 6 | Support named physical at-grade junction existence for 20 associated source nodes; individual movements remain unresolved. |
| Independently corroborated bridge structures | 7 | Support grade separation for 28 nonconnecting source-line crossing records. |
| Individually verified legal movements | 0 | No new scored maneuver or navigation eligibility. |
| Geographic errors corrected | 0 | Increased corroboration is not evidence that the original geography was wrong. |

Pass 1 reevaluated 32 Zone 1 headquarters departure/return paths and 76 headquarters paths to/from all representative study roads. Pass 2 reevaluated all **1,406 ordered road pairs**, including the reverse direction separately. All representative pairs are graph-reachable with incomplete independent evidence; none is asserted to be independently verified as a complete legally drivable route.

The audit also reevaluated 256 directed approach samples. **Eleven samples lack an outbound or return path in the conservative graph.** A successful route to one representative does not establish access to every section of a long corridor. Necessary connector roads remain outside the 38 learning targets: 572 source ways used by evaluated paths were audited, including 481 City identity matches and 2,729 corroborated directed connector segments.

All 68 visual study-road crossings without shared source nodes remain disconnected. Sixty-six I-880/I-680 ramp or motorway-continuation transitions were checked against source topology; none of those transitions directly joins a surface-road edge to a freeway edge without an actual ramp. This software check is distinct from independently establishing current legal access or turning permission.

The headquarters departure remains stopped on Stevenson Boulevard edge `417403358:0:f`, at `[-121.9706408, 37.5530519]`. Its distance from the retained OSM building reference is **136.83 m**, approximately 137 m. The prompt's 107 m estimate was not reproduced. The departure was preserved and remains labeled an approximate public-road start, not a verified station driveway.

## Independent evidence and provenance

The additional evidence comes from three official source families:

- City of Fremont GIS named-intersection points, with a March 28, 2023 service data-edit date. The complete cached union references all eight raw query batches, their retrieval dates and hashes. It shares City GIS lineage with the centerlines and is not a second independent City survey.
- City of Fremont transportation implemented protected-intersection records, with an October 7, 2024 service data-edit date. Planned projects do not qualify as implemented evidence. Named physical intersection existence does not establish every carriageway approach or traffic movement.
- USDOT BTS/FHWA National Bridge Inventory, with a **June 20, 2025 dataset reference date**, separately recorded from the August 11, 2025 hosted-service data-edit date. Bridge records do not establish adjacent ramp permissions or current closures.

The reproducible association policy requires actual source-road name matches and bounded location comparisons. It never creates graph connections. Raw responses and provenance are retained in `data-sources/independent-junctions/`; generated, scoped associations are in `data-sources/geographic-evidence.json`.

Detailed reports:

- [Before-and-after geographic audit](geographic-audit.md)
- [Directed 38-by-38 connectivity matrix](geographic-connectivity.md)
- [Machine-readable nine-dimension audit](data/geographic-audit.json)
- [Independent source research and limitations](junction-source-research.md)
- [Existing recognition eligibility and complete 38-entry evidence table](learning-accuracy.md)

## Map-label implementation

The baseline used periodically rebuilt HTML markers for ordinary road names. Labels were suppressed below zoom 13.5, limited globally to about 45, deduplicated to one label per name, positioned near a source-line midpoint and rotated using the entire line's first-to-last chord. This explained missing wide-view labels, sparse repetition and names detached from curved roads.

The upgrade uses a dedicated GeoJSON line-label source and native MapLibre symbol layers. Label preparation preserves the original coordinates and source segment provenance. Compatible same-identity segments can join only at shared OSM nodes. Disconnected pieces, incompatible directions, distinct carriageways, grade/access differences and ambiguous branches remain separate. Sharp one-way reversals terminate a cartographic chain without altering the road network.

Auto Mall Parkway and Durham Road retain their actual mapped names on their own geometry. Curriculum grouping labels are never substituted for physical road names. Freeway references come from source records. Compact suffix abbreviations at wide zoom are display text only; curriculum identities and matching keys are unchanged.

MapLibre handles local line alignment, upright text, curve limits, collisions and repeated anchors. Zoom-dependent typography and spacing replace the one-label-per-name and global 45-label limits. Six priority tiers favor selected/destination roads, the current road, curriculum roads, route connectors, major background roads and local roads. Geometry preparation occurs once; subsequent priority changes update relevant feature properties. Native source tiling and symbol placement still occur inside MapLibre. Each feature also carries its immutable `labelId` as a promoted native identity; this prevents string IDs being lost during vector-tile encoding and keeps rendered-label inspection, source provenance and priority updates consistent.

The prepared GeoJSON retains every original coordinate across 6,359 presentation chains and 47,812 source segments. MapLibre uses its ordinary 0.375-pixel tiling tolerance, also used by the road-rendering source. This subpixel display tessellation avoids quantized vertex zigzags suppressing otherwise valid label anchors; it does not edit source geography or the driving graph. Compact street-type suffixes and constant 11-pixel text at zooms 10–11 let more actual names fit. Full names return at zoom 12.

The existing dark interface is preserved. Local sans-serif glyph generation requires no external font service. The MapLibre worker is packaged with the static build. Point markers remain appropriate for the vehicle, headquarters and destinations.

The existing assistance policy remains explicit: hidden-answer recognition questions and the label-visibility setting hide every street-name symbol layer. No-GPS practice hides route guidance while retaining the established street-name learning behavior. It must not be confused with a hidden-answer challenge.

[The visual report](label-visual-report.md) contains the baseline diagnosis, fixed camera poses, screenshots, capture instructions and current acceptance status. Eighteen final after screenshots use the same nine poses and two resolutions as the 18 baseline screenshots. Manual inspection confirms aligned Auto Mall/Durham names, curved Stevenson labels and repeated Fremont Boulevard names. At zooms 10, 11 and 12, both sizes show 4, 14 and 22 distinct mapped names respectively, including 2, 11 and 13 surface curriculum road names. These are distinct-name counts, not repeated-anchor counts. Spatially separated native-symbol queries support five Fremont label placements at 1440 width and six at 1920 width in the zoom-17 views.

## Preserved application behavior

- Existing TypeScript, Vite, MapLibre, Three.js, Node tests, Playwright and GitHub Pages architecture.
- Exact 38-entry curriculum, confirmed Lake Arrowhead Avenue mapping, grouped Grimmer entry, all three approximate patrol zones and Zone 1 as the default focus.
- Existing real road data, legitimate connector roads, Free Drive, navigation exercises, recognition practice, saved progress and routes.
- The approximate headquarters start, QUICK acceleration and adjustable default 100 mph vehicle cap. Real-world posted limits remain separate.
- Buffered WASD/arrow controls, braking, authoritative vehicle state and both camera views.
- Manual map ownership: dragging enters Explore; only explicit Center on Vehicle restores Follow. Label updates do not own the camera.
- Existing deployment workflow and repository base path `/fremontStreets/`.

## Verification at this checkpoint

| Check | Status |
| --- | --- |
| Baseline `npm run data:verify` | Passed; reproduced 38 identities, 12,279 segments, 18 full imported / 20 partial entries. |
| `npm run data:audit` | Passed; latest audit version `geographic-audit-v1-8b2f67be0649453c`. |
| Full Node test suite | **118 passed** at the current implementation checkpoint. |
| Geographic audit focused tests | Six passed after the final provenance corrections. |
| TypeScript validation and production build | Passed for the inspected production build. |
| Static production assets | Passed: four data files match baseline hashes, all 38 entries preserved, base-path imports resolve, packaged worker present, data-cache fingerprint present. |
| External font dependency | None configured; local MapLibre CSS is bundled and native labels use local fonts. |
| Common secret-pattern scan of generated files | No matches; a bounded scan, not a guarantee covering every possible credential format. |
| Final screenshots and manual visual acceptance | Passed: 18 after captures at 1440 × 1000 and 1920 × 1080, no captured page/renderer errors, compared with 18 baseline captures. |
| Focused native-label browser suite | **5 passed in 2.2 minutes**, including widened surface-road assertions, panning, following, camera returns and answer hiding. |
| Complete development-browser suite at `9e2ad3c` | **23 passed in 9.1 minutes**, including actual navigation completion, both cameras, exploration, recognition, persistence, patrol boundaries and boundary editing. |
| Complete production-browser suite at `9e2ad3c` | **31 passed in 16.4 minutes**, including Stevenson continuity, actual road-to-road / return-to-HQ / intersection driving, no-GPS study and wrong-turn recovery. |
| Native source-ID correction | **118 Node tests and build passed again; 5 targeted development browser tests passed in 2.2 minutes and 5 targeted production tests passed in 2.1 minutes.** All 18 screenshots were recaptured with zero source-provenance lookup failures and zero page errors. |
| GitHub Actions deployment and live-site verification | **Pending. Do not claim this upgrade is published.** |

The inspected output contains 11 runtime files plus `.nojekyll`, with no source maps. Static asset checks establish packaging correctness; they do not replace browser gameplay, actual native-symbol rendering or live deployment checks. Rerun the build and relevant tests after any later implementation changes.

No 60 FPS hardware performance claim has been established. Software-rendered cloud browser measurements must not be presented as representative desktop hardware results.

## Launch and reproduce

Use a supported Node version (22.12 or newer; the cloud workspace uses Node 24):

```sh
npm ci
npm run dev -- --port 5173 --strictPort
```

On a machine with a local browser, open `http://localhost:5173/`. A cloud environment requires an actually available forwarded port or preview; do not assume that a localhost URL is publicly accessible.

To build and inspect the repository-path production output locally:

```sh
npm run build
npm run preview -- --port 4173 --strictPort
```

Open `http://localhost:4173/fremontStreets/`. GitHub Pages serves the static build without a Vite development server once the deployment has succeeded.

Reproduce geographic evidence and automated verification:

```sh
npm run data:verify
npm run data:audit
npm test
npm run test:e2e
npm run test:production
```

The two geographic commands use committed source snapshots and do not repeat downloads or modify the driving graph. Run browser suites serially on the software-rendered cloud host. Browser suites need the configured Chromium installation and use their existing server configuration.

## Remaining work and exact resumption order

1. Preserve the native source-ID correction, strengthened tests, all 18 recaptured after images and updated reports as a separate Git checkpoint. Full local browser suites passed at `9e2ad3c`; the correction then passed all 118 Node tests, the build and five targeted browser tests in each environment.
2. Push verified commits to the authorized `main` branch without overwriting unrelated work.
3. Monitor the existing complete GitHub Actions pipeline against the final artifact; do not bypass tests or silently loosen assertions.
4. After deployment succeeds, inspect the live application and compare deployed assets with the tested build. Until this succeeds, report deployment as pending or blocked.
5. Continue geographic verification with the highest-use HQ junctions: **Stevenson Boulevard / Paseo Padre Parkway** first, followed by **Fremont Boulevard / Stevenson Boulevard** and the applicable connecting approaches. City points support the first named location; the protected-intersection inventory adds physical at-grade evidence for the second. Both still require applicable individual approach, access, direction and turn evidence.

Geographic work remains blocked on independent, applicable maneuver and access evidence; 232 unsupported OSM restriction records; the 11 inaccessible sampled approaches; and incomplete corroboration/coverage on 20 curriculum entries. Current construction, closures, signals, lane configurations and every legal movement are not independently established. A conservative graph exclusion is not proof that the real-world road is physically disconnected.

Keep all unresolved entries available for study with their warnings. Do not enable scored maneuvers or claim complete geographic accuracy to finish the release. Preserve historical progress, source versions and the existing runtime evidence gates while obtaining better records.
