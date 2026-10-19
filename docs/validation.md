> Historical patrol-release validation. Current personalized training, expanded roads and headquarters behavior are documented in [personalized geography](personalized-geography.md) and [personalized validation](personalized-validation.md). Counts and interior-zone spawns below describe the earlier release.

# Patrol-zone update: validation and scope

The playable game was preserved in commit `70223c0` before patrol development and pushed to GitHub `main`. The patrol implementation is separate from that baseline. No force-push or unrelated repository changes were used.

## Current capabilities

All Fremont and Zones 1, 2 and 3 can be selected. A zone selection starts a new practice drive on an existing safe interior source road and preserves every area's learning record. The map centers on the colored boundary; accelerating or choosing **Follow car** resumes vehicle following. Boundaries do not block driving or split the physical graph.

Navigation prefers in-zone source segments and selects safely interior destinations, but can cross boundaries when the continuous graph requires it. Questions use the selected zone's source street collection and withhold questions when the vehicle is outside it or near an uncertain border. Exploration is recorded by actual geographic location; citywide totals aggregate zone practice. Challenges, quizzes, recent streets, saved routes and independent zone progress persist in browser storage.

The developer editor works only in Vite development with `?zoneEditor=1`; gameplay pauses. It displays all boundaries, offers zone selection, draggable vertices and precision longitude/latitude controls, previews classified streets and uncertain segments, validates edits, supports undo/discard/original reversion, and imports/exports versioned approximate GeoJSON with provenance. Map handles are spaced for readability; all original vertices remain editable in the selector. Editor history has no reference to the road graph. Production builds do not enable the editor.

## Source and coverage

Actual City of Fremont GIS Division `Police_Zones` polygons match the supplied screenshot. Their source data dates to December 2020, with catalog metadata from February 2021. They are labeled **approximate study boundaries**, not verified current adopted or surveyed patrol boundaries. The proposed October 6, 2026 changes remain unconfirmed. No manual screenshot coordinates or guessed rectangles were used. Original rings and holes are retained.

The 75 m uncertain-border review band is classification policy, not a measured GIS accuracy or guarantee of current patrol adoption. Source URLs, screenshot reference, import date, source version, hashes and calibration method are in `public/data/zones.json` and `docs/patrol-sources.md`.

| Area | Playable source segments | Named streets | Coverage |
| --- | ---: | ---: | --- |
| Zone 1 — Central Fremont | 11,275 | 588 | Partial |
| Zone 2 — North Fremont | 1,849 | 185 | Partial |
| Zone 3 — South Fremont | 6,632 | 273 | Partial |

Cross-zone streets may appear in several collections. These counts are not complete inventories or completion percentages. The original central Fremont extract and authorized northern Irvington/Zone 3 append leave much of the city and each zone uncovered.

The merged OSM source has 5,839 ways, 19,523 nodes and 37,792 playable directed edges. A canonical-hash regression confirms every original node, way and restriction is unchanged, and all 18,854 original directed edges retain their exact properties. Source topology, one-way/access and supported restrictions remain authoritative; source lines are never snapped together merely because they cross.

## Executed verification

- `npm run build` passes strict TypeScript checking and generates the production bundle. MapLibre and Three.js retain a library-size advisory; this is not a build failure.
- `npm test`: **60 passed, 0 failed, 0 skipped** after the final source import.
- `npm run test:e2e`: **10 passed, 0 failed, 0 skipped** in the final complete Chromium run (3.7 minutes). This includes the original full navigation/driving/camera/storage regressions and all three actual zones plus developer editing.
- Actual browser controls verified correct source polygons/colors; all three zones’ questions, safe navigation targets, saved routes and preserved progress; normal editing disabled; and developer dragging, precise edits, invalid rejection, undo/discard/revert, GeoJSON import/export and unchanged road connectivity.
- All three zones' actual navigation routes were driven through buffered directional controls in the automated core tests, using real source geometry and exact destination-node arrival.
- Historical GIS network reimport reproduced the source geometry. The bounded road append was repeated against the original baseline with the same added geometry and rules. Repeating the same normalized append is byte-identical, with zero additions.
- Original QUICK acceleration, braking, speed caps, road following, camera invariance and storage tests remain part of the regression suite.
- A production-browser smoke check verified all three nonempty zone collections and actual selected map overlays, exact paused vehicle preservation when switching to the driver camera, zero page errors, and zero external gameplay requests. Even with `?zoneEditor=1`, the production build showed no editor and reported editing disabled.

## Remaining limitations and next priorities

Current legal patrol adoption is unverified. Road coverage is partial; terrain, bridge heights, lanes, traffic signals and missing/complex restrictions remain unverified. The driver's-seat scene is flat and schematic. Corner assist and the absence of traffic waiting are simulation simplifications, not statements of traffic law.

At forks with several branches in the same direction, left/right selects a canonical branch. Navigation uses transitions selectable through those controls. Explicit branch selection and route recovery remain improvements. Browser progress is local to the origin/device and has no account synchronization.

Next priorities are confirming current official patrol adoption, expanding bounded source coverage across all three study areas, improving destination selection and recovery, and incorporating verified traffic controls and elevations. Reusable installation/startup instructions are saved in the environment draft; publication and restoration into a new task are separate and are not claimed by these checks.
