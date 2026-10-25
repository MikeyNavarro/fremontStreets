# Zone overview and assigned-road connections

## Camera behavior

Previously, choosing a road, comparison, section or Full Road option fitted the road bounds. These actions now update source geometry and highlighting without changing center, zoom, pitch or bearing. Search and the Down/Up shortcuts follow the same rule. Opening or closing panels preserves the camera.

The initial flat overview fits the complete historical approximate Zone 1 polygon with room for visible panels. **Zone 1 Overview** repeats that fit at the current pitch and bearing. **2D View** (0°) and **Angled View** (30°) explicitly return to a complete zone view. **Map layers → Bearing / Reset North** controls orientation; native drag, rotation, tilt and zoom remain available. The default is flat for label legibility.

**View selected road**, selecting an intersection row, **View intersection**, HQ location and starting a quiz remain explicit navigation actions. Previous/Next connection browsing only updates the marker and details; the orange road and camera stay put. A selected road can be outside the current viewport until an explicit view action is used.

The fit solver uses MapLibre's bounds camera and a detached native transform to check all original polygon vertices at the requested pitch/bearing against the usable viewport. It does not modify source coordinates. The dependency lock and browser assertions protect this MapLibre API integration.

## Geographic filtering

Both sides of a displayed connection must be different entries in the active 18- or 38-entry curriculum. Each must have an actual adjacent, ordinary road segment at the same original source node. Zone 1 additionally requires that node inside the approximate polygon, even when Full Road shows the corridor outside it.

Unrelated residential connections, unnamed service roads, freeway mainlines, ramp-mediated interchanges and nonconnecting visual crossings remain on the background map but do not populate this study list. I-680 and I-880 consequently have no ordinary direct connections in this feature; this does not claim they have no real interchanges. Comparing roads still reports sourced nonconnecting crossings separately.

Repeated carriageway nodes within a retained logical group are deduplicated per named pair. Distinct physical components keep distinct positions and scoped names/evidence: Warm Springs/Kato and Warm Springs/Scott Creek are not collapsed into an invented all-to-all junction.

Two genuine road-name transitions remain explicitly labeled for exploration: Blacow/Mowry in Zone 1 and Paseo Padre/Thornton in All Assigned Streets. They do not become scored intersection facts.

## Counts in the retained dataset

These are counts of the available imported source network, not a claim of complete current Fremont coverage. A source group can be visited from multiple roads or contain separate pair-specific markers.

| Scope | Retained source groups | Per-road walkthrough rows | Eligible scored physical pairs |
|---|---:|---:|---:|
| Zone 1 — 18 entries | 33 | 67 | 5 |
| All Assigned Streets — 38 entries | 93 | 193 | 6 |

Stevenson changes from **30 unfiltered Zone 1 junction groups to 6 assigned-road connections**: Mission, Paseo Padre, Fremont, Sundale, Blacow and Farwell. All Assigned Streets adds Albrae (7 total).

| Zone 1 entry | Previous unfiltered groups | Focused connection rows |
|---|---:|---:|
| Driscoll Road | 27 | 3 |
| Niles Boulevard | 31 | 1 |
| Sundale Drive | 33 | 3 |
| Walnut Avenue | 29 | 3 |
| Blacow Road | 23 | 5 |
| Farwell Drive | 24 | 2 |
| Fremont Boulevard | 45 | 8 |
| Grimmer Boulevard | 15 | 4 |
| Interstate 680 (I-680) | 6 | 0 |
| Interstate 880 (I-880) | 6 | 0 |
| Logan Drive | 11 | 2 |
| Mission Boulevard | 64 | 5 |
| Mowry Avenue | 63 | 10 |
| Niles Canyon Road | 2 | 1 |
| Paseo Padre Parkway | 49 | 7 |
| Peralta Boulevard | 19 | 5 |
| Stevenson Boulevard | 30 | 6 |
| Washington Boulevard | 14 | 2 |

Reproduce the versioned counts and exact source-node inventory with:

```sh
npx tsx scripts/report-assigned-connections.ts
```

See [machine-readable connections](data/assigned-road-connections.json).

## Evidence and limitations

Geographic dataset: `map-study-v1-35ec4f5b299d6e28aa5c`. Original OSM geometry, City corroboration, source IDs, zone polygons, the derived map dataset and all 38 curriculum identities remain unchanged. No new geographic downloads or independent verification claims were introduced.

All nine previously supported Zone 1 physical pairs remain retained evidence. Four involve Gallaudet, Guardino, Liberty or Eugene, which are outside the assigned curriculum. The active-list rule therefore reduces eligible Zone 1 scoring to five: Fremont/Stevenson, Paseo Padre/Walnut, Fremont/Walnut, Fremont/Grimmer and Fremont/Mowry. All Assigned Streets adds Osgood/Washington. Quiz choices also stay within the active curriculum.

Other source-mapped connections remain exploratory with explicit uncertainty. Physical connectivity, named-site location evidence and individual permitted turns are distinct claims. Legal turning movements remain unverified. The historical patrol polygon remains an approximate study boundary; full-city coverage and current jurisdictional adoption are not established. Passing software tests does not independently verify real-world geography.

## Verification

- Final unit/geography/learning suite: **105 passed**, zero failures or skips.
- Targeted production camera/filter checks: **5 passed** before the final name-transition inclusion; final full-suite result recorded below.
- TypeScript and production build passed.
- Final production suite: 17 cases passed initially; one empty-state text assertion expected the old word “intersection.” The correctly rendered zero-connection state was confirmed in the trace, the assertion was updated to the intended wording, and its targeted rerun passed. All 18 cases have passing execution evidence; no test was skipped or given a longer timeout.
- Focused development camera/filter suite: **5 passed**.
- All eight checked original geographic inputs/runtime snapshot are byte-identical to the previous release.
- Final mobile layout follow-up: **2 production cases passed**, including native street-label visibility with selected-road and street-list panels open. Screenshot review first identified a large-panel view below the label threshold; reducing mobile sheets to 32dvh restored map space while retaining scrollable controls.
- **9 final production screenshots captured and individually inspected** at 1440×1000 and 390×844. Flat and angled desktop views show readable native labels; selected/list/history mobile angled views now show 9 native labels at approximately zoom 10.65. The entire boundary fits around panels, comparison preserves the camera, and mobile export/import controls remain reachable. No capture page or console errors.

Screenshots: [flat zone](screenshots/zone-overview/01-zone1-flat.png), [angled zone](screenshots/zone-overview/02-zone1-angled.png), [Stevenson without recentering](screenshots/zone-overview/03-stevenson-overview-preserved.png), [filtered connection list](screenshots/zone-overview/04-stevenson-assigned-intersections.png), [comparison](screenshots/zone-overview/05-comparison-overview-preserved.png), and [mobile angled view](screenshots/zone-overview/07-mobile-zone1-angled-selected.png). All nine images and their read-only observations are in [the screenshot directory](screenshots/zone-overview/). Very short screens and physical touch hardware were not independently tested in this environment.

Screenshots are captured reproducibly with `scripts/capture-zone-overview.mjs` against a static production server. Published deployment is verified separately against the exact commit and public assets; a successful local build alone does not establish publication.
