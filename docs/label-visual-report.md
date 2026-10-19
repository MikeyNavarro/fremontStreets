# Native road-label visual verification

## Baseline and reproducibility

The published baseline examined was `a416cdd`. The screenshots below use its frozen production `dist` at `/fremontStreets/`, served without Vite. A temporary copy of the built JavaScript exposed its existing MapLibre instance solely to set reproducible camera poses; the application source, road data and rendering logic were unchanged. The temporary capture instrumentation is not a production feature.

Screenshots use real Chromium with SwiftShader at **1440 × 1000** and **1920 × 1080**, the existing dark theme, and the existing 38-entry street-list overlay. Fixed poses use longitude/latitude, north-up bearing zero and pitch zero. The authoritative vehicle remains on the existing HQ departure edge; moving the camera does not move it. The 18 native-label after screenshots use the same poses and resolutions as the 18 baseline screenshots.

| View | Camera center | Zoom | Baseline observations |
| --- | --- | --- | --- |
| Wide Fremont | −121.974, 37.545 | 10, 11, 12 | No ordinary road labels at either resolution. The highlighted study-road network is visible. |
| Central Fremont | −121.977, 37.550 | 13 | No ordinary road labels at either resolution. |
| Fremont Boulevard | −121.9867167, 37.5476736 | 15, 17 | Source-road coordinates selected for the close-up and long-corridor comparison. |
| Stevenson Boulevard | −121.9724171, 37.5495328 | 16 | Source-road coordinates near the existing HQ training area. |
| Auto Mall Parkway / Durham Road | −121.9394, 37.51475 | 17, 19 | Both names are visibly detached from their blue east–west carriageways in the zoom-17 image, reproducing the supplied screenshot. |

The zoomed-out, Fremont Boulevard and Auto Mall/Durham baseline images were manually inspected, not merely generated. At the fixed Fremont poses, the baseline creates only one Fremont Boulevard marker per view even when a long stretch of the road is visible. Some DOM markers are obscured or displaced, so their DOM count must not be treated as a count of readable on-road labels. The baseline has no page errors in the [capture observations](screenshots/labels/before-observations.json).

## Diagnosis

The original `OverheadView.refreshLabels()` rebuilt HTML markers periodically. It rejected all labels below zoom 13.5, allowed only one label per name and stopped at 45 labels. Each label used the middle coordinate of an individual source line, while its rotation came from the line's first-to-last chord. This cannot express local road curvature and prevents long roads from receiving repeated names. Many OSM road fragments are also too short for useful independent label placement.

These are presentation problems. A label floating away from its road does not itself establish a geographic error, intersection, or permitted turn. The fixed-view comparison must not alter source geometry or the driving graph to make labels fit.

## New rendering architecture

The label-only preprocessing retains exact original coordinates and source-node order. It joins compatible same-identity segments only through actual shared OSM nodes, never joins disconnected pieces or separate carriageways by proximity, and stops ambiguous branches and sharp one-way reversals above 120 degrees. Direction, grade, access and carriageway tags constrain any joining. Splitting a cartographic chain at a real turnaround changes label placement only: every original road segment remains represented, and the driving graph is unchanged. Different mapped names are not merged because a curriculum entry groups them. Auto Mall Parkway and Durham Road therefore keep their own names; freeways use their source reference where available. All 38 curriculum identities and their existing associations remain intact.

The current prepared GeoJSON contains **6,359 label chains**, preserving all **47,812 original source segments** from **11,177 named or reference-bearing source ways**. The ordinary road labels use native MapLibre line symbols; there are no ordinary HTML road-name markers. Six mutually exclusive priority tiers place selected/destination roads and the current road ahead of curriculum roads, essential route connectors, major background roads and local roads. Local sans-serif glyph generation requires no external font endpoint. Every final after capture records the current 6,359-chain preparation, replacing the earlier exploratory images.

All nine symbol layers share one label source. Its `tolerance: 0.375` is MapLibre's standard subpixel GeoJSON tiling tolerance, consistent with the ordinary road rendering source. This affects renderer tessellation; the prepared source coordinates, source identifiers and driving graph are unchanged. At zooms 10–11, native labels use compact conventional road suffixes, 11-pixel text and a 60-degree curve-angle allowance. At zoom 12 and above, they use full mapped names and the 35-degree angle allowance. This prevents small bends and short low-zoom fragments from suppressing practically every surface-road name while keeping close-up labels on their actual geometry.

MapLibre performs local line alignment, upright text, curve checks, collision placement and repeated anchors. Text size and repeat spacing vary with zoom. The application prepares the label geometry once; priority changes update affected feature properties. MapLibre still performs its own source tiling and symbol placement when those properties change. A preparation counter of one is not a claim that the map renderer does no further work.

## Reproduce the upgraded captures

Start the existing development server, then capture the fixed views in a separate terminal:

```sh
npm run dev -- --port 4182 --strictPort
node scripts/capture-labels.mjs
```

The script uses the developer-only `?labelDebug=1` API. It records each camera pose, native rendered names, source diagnostics, page errors and separated symbol-hit boxes alongside the screenshots. Use `--cases fremont-z17,automall-durham-z17` to repeat particular cases. Production exposes read-only label diagnostics for browser tests, without this developer camera-control API.

The debug API's `inspect(box?)` queries actual native symbol placement, `source(id)` returns the prepared chain and its source provenance, `project(position)` converts a sourced point for screen inspection, `stats()` reports preparation and priority diagnostics, and `ready()` checks map and tile readiness. `setView(pose)` deliberately enters Explore mode. None of these operations changes geographic data, vehicle state, progress or routing connectivity.

## Screenshot comparisons

The complete before/after set and machine-readable observations are in [`screenshots/labels`](screenshots/labels). Representative final views were manually inspected at both resolutions: broad coverage, central roads, repeated Fremont labels, curved Stevenson labels and both Auto Mall/Durham close-ups.

| Regression view | 1440-wide comparison | 1920-wide comparison |
| --- | --- | --- |
| Wide, zoom 10 | [Before](screenshots/labels/before-wide-z10-1440.png) · [After](screenshots/labels/after-wide-z10-1440.png) | [Before](screenshots/labels/before-wide-z10-1920.png) · [After](screenshots/labels/after-wide-z10-1920.png) |
| Wide, zoom 11 | [Before](screenshots/labels/before-wide-z11-1440.png) · [After](screenshots/labels/after-wide-z11-1440.png) | [Before](screenshots/labels/before-wide-z11-1920.png) · [After](screenshots/labels/after-wide-z11-1920.png) |
| Wide, zoom 12 | [Before](screenshots/labels/before-wide-z12-1440.png) · [After](screenshots/labels/after-wide-z12-1440.png) | [Before](screenshots/labels/before-wide-z12-1920.png) · [After](screenshots/labels/after-wide-z12-1920.png) |
| Central, zoom 13 | [Before](screenshots/labels/before-central-z13-1440.png) · [After](screenshots/labels/after-central-z13-1440.png) | [Before](screenshots/labels/before-central-z13-1920.png) · [After](screenshots/labels/after-central-z13-1920.png) |
| Fremont, zoom 15 | [Before](screenshots/labels/before-fremont-z15-1440.png) · [After](screenshots/labels/after-fremont-z15-1440.png) | [Before](screenshots/labels/before-fremont-z15-1920.png) · [After](screenshots/labels/after-fremont-z15-1920.png) |
| Fremont, zoom 17 | [Before](screenshots/labels/before-fremont-z17-1440.png) · [After](screenshots/labels/after-fremont-z17-1440.png) | [Before](screenshots/labels/before-fremont-z17-1920.png) · [After](screenshots/labels/after-fremont-z17-1920.png) |
| Stevenson, zoom 16 | [Before](screenshots/labels/before-stevenson-z16-1440.png) · [After](screenshots/labels/after-stevenson-z16-1440.png) | [Before](screenshots/labels/before-stevenson-z16-1920.png) · [After](screenshots/labels/after-stevenson-z16-1920.png) |
| Auto Mall / Durham, zoom 17 | [Before](screenshots/labels/before-automall-durham-z17-1440.png) · [After](screenshots/labels/after-automall-durham-z17-1440.png) | [Before](screenshots/labels/before-automall-durham-z17-1920.png) · [After](screenshots/labels/after-automall-durham-z17-1920.png) |
| Auto Mall / Durham, zoom 19 | [Before](screenshots/labels/before-automall-durham-z19-1440.png) · [After](screenshots/labels/after-automall-durham-z19-1440.png) | [Before](screenshots/labels/before-automall-durham-z19-1920.png) · [After](screenshots/labels/after-automall-durham-z19-1920.png) |

## Browser regression coverage

`e2e/labels.spec.ts` reads native `queryRenderedFeatures` diagnostics after real UI camera actions. It checks city/intermediate labeling at two viewport sizes, names appearing on separated Fremont Boulevard views, separate Auto Mall Parkway and Durham Road names, geometry preparation not repeating during panning, actual vehicle following with heading rotation, repeated Driver/Overhead returns, and symbol visibility during quizzes and label-setting changes. Broad-view assertions require at least one surface curriculum road at zoom 10 and at least three at zooms 11–13; freeway references alone cannot satisfy those checks.

`queryRenderedFeatures` can deduplicate a source feature even when multiple label anchors are placed. Its total feature count must therefore **not** be reported as the number of visible text repetitions. Repetition within one viewport additionally requires screenshot inspection or spatially separated rendered-symbol queries.

The existing No-GPS practice policy retains street names and hides route guidance. Hidden-answer recognition questions and explicit label hiding suppress all street-name symbol layers. These are distinct policies; preserving No-GPS street-name learning must not introduce an answer leak in recognition challenges.

## Verification status

All 18 final after screenshots completed without page errors. Each reports 6,359 prepared chains, one application geometry preparation, native line placement and no ordinary DOM street-label markers. Auto Mall Parkway and Durham Road now sit on their separate mapped carriageways. The I-680 crossing has no newly created junction; label presentation does not change graph connectivity. Stevenson names follow its actual curved road. At the close Fremont view, spatially separated symbol queries find five locations at 1440 pixels and six at 1920 pixels, corroborated by visible repeated on-road labels.

| Final fixed view | Distinct mapped names, 1440 / 1920 | Surface curriculum names, 1440 / 1920 |
| --- | --- | --- |
| Wide, zoom 10 | 4 / 4 | 2 / 2 |
| Wide, zoom 11 | 14 / 14 | 11 / 11 |
| Wide, zoom 12 | 22 / 22 | 13 / 13 |
| Central, zoom 13 | 22 / 25 | 16 / 17 |

These counts are source identities with native rendered symbols, not counts of every text repetition. Zoom 10 remains intentionally sparse: Fremont Boulevard and Mission Boulevard are the surface targets visible in this fixed overview. More names appear when zooming in. Native collision decisions can suppress individual labels and vary with camera position; the map does not promise every street name simultaneously at every scale.

The first exploratory zoom-12 screenshot was captured before its requested native symbol tiles were ready. The capture script and browser tests now wait for actual tile readiness instead of treating old visible symbols as proof that a new camera view has settled. Subsequent sharp-reversal chain splitting and low-zoom style adjustments fixed the separate problem of useful surface-road names being suppressed at zooms 10–11. The final images above include those corrections.

The strengthened five-test browser suite passed against the final source: **5 passed in 2.2 minutes**, including surface curriculum names at every tested overview scale, real driving, camera returns and assistance visibility. The full development and production browser suites and public deployment are pending at this checkpoint. No hardware frame-rate benchmark was performed: SwiftShader screenshots and interaction tests support rendering correctness, not a general performance guarantee. These checks validate software presentation; independent geographic evidence and unresolved legal movements remain documented separately in the geographic reports.
