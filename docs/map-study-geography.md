# Interactive map geographic derivation

Version: `map-study-v1-35ec4f5b299d6e28aa5c`. Reproduce with `npm run data:map`. This creates a map-only dataset from committed snapshots without downloads or edits to the original geographic sources.

The default curriculum is exactly the user's 18 requested IDs; all original 38 IDs, original labels, categories, aliases and source mappings remain. Earlier broad zone membership included other roads; it does not automatically add targets. The requested four nearly-within / fourteen partial groups remain curriculum metadata. Computed overlap below concerns imported centerline geometry and can differ from those broad descriptions.

Exact clipping also retains positive overlaps for optional Eggers Drive (6.06 m) and Osgood Road (12.28 m). The historical boundary and its existing 75 m review band remain approximate; these measurements do not change the user-specified 18-entry curriculum. This is a fixed study selection, not a claim that precisely 18 roads have any mathematical polygon overlap.

## Source preservation and clipping

Every background line is an original OSM way with all source coordinates retained. The same native label preparation retains source identity, geometry and label provenance. Selected-road sections join only compatible source segments at shared OSM nodes. Original geometry stays separate from derived clips. Each source segment is split at all actual line/polygon intersections, including multiple crossings, polygon holes and MultiPolygon components. Midpoints classify the resulting intervals only. Boundary cut points never enter the source-node junction inventory.

The retained historical City polygon is an approximate study boundary, not a current jurisdiction claim. Full-road display means the complete **available mapped extent**, not the complete real-world corridor. Lengths use the existing local metric projection and sum centerlines, including separate carriageways; they are not single end-to-end corridor lengths. Separate branches, source-name changes and carriageway chains remain separate walkthrough sections.

## Generated inventory

- 38 original study identities; 18 default Zone 1 entries.
- 22794 original source-way features; 6359 source-preserving native label chains.
- 470 explicit study sections.
- 1572 mapped junction entries, grouped only with retained logical source relationships or a matching City catalog record.
- 10 junction groups contain scoped independently corroborated physical road-pair facts eligible for geographic intersection recognition. These are not legal-turn permissions.
- 9 scoped physical question pairs have an eligible source node inside the Zone 1 polygon; grouped-site membership alone cannot qualify an outside pair for Zone 1 scoring.
- 68 nonconnecting visual crossing records are kept separately and never become ordinary junction markers.
- Headquarters uses the existing OSM building reference at [-121.96914156153846,37.55273364615385], not the former road-departure point.
- Dataset size: 19,420,621 bytes before transfer compression.

## All 38 entries

| ID | Original study entry | Default Zone 1 | Imported length in Zone 1 (km) | Full imported centerlines (km) | Geometry evidence | Sections |
|---|---|---|---:|---:|---|---:|
| ew01 | Lake Arrowhead | Optional all-streets | 0.00 | 1.17 | Verified | 4 |
| ew02 | Decoto Road / Highway 84 | Optional all-streets | 0.00 | 10.26 | Unresolved | 13 |
| ew03 | Nicolet Avenue | Optional all-streets | 0.00 | 2.77 | Verified | 4 |
| ew04 | Alder Avenue | Optional all-streets | 0.00 | 1.52 | Verified | 3 |
| ew05 | Thornton Avenue | Optional all-streets | 0.00 | 14.62 | Unresolved | 24 |
| ew06 | Peralta Boulevard | Yes | 2.20 | 4.67 | Unresolved | 12 |
| ew07 | Central Avenue | Optional all-streets | 0.00 | 11.33 | Unresolved | 29 |
| ew08 | Eggers Drive | Optional all-streets | 0.01 | 3.16 | Verified | 1 |
| ew09 | Niles Canyon | Yes | 3.31 | 8.96 | Unresolved | 5 |
| ew10 | Mowry Avenue | Yes | 9.61 | 17.95 | Unresolved | 21 |
| ew11 | Walnut Avenue | Yes | 6.67 | 6.67 | Verified | 4 |
| ew12 | Sundale Drive | Yes | 3.90 | 3.90 | Verified | 4 |
| ew13 | Stevenson Boulevard | Yes | 11.98 | 17.20 | Unresolved | 11 |
| ew14 | Driscoll Road | Yes | 4.47 | 4.47 | Verified | 2 |
| ew15 | Washington Boulevard | Yes | 2.05 | 5.50 | Verified | 12 |
| ew16 | Delaware Drive | Optional all-streets | 0.00 | 1.16 | Verified | 5 |
| ew17 | Auto Mall Parkway / Durham Road | Optional all-streets | 0.00 | 12.04 | Unresolved | 23 |
| ew18 | Brown Road | Optional all-streets | 0.00 | 0.83 | Verified | 3 |
| ew19 | Warren Avenue | Optional all-streets | 0.00 | 6.19 | Verified | 17 |
| ew20 | Gable Drive | Optional all-streets | 0.00 | 0.89 | Unresolved | 1 |
| ew21 | Scott Creek Road | Optional all-streets | 0.00 | 1.81 | Unresolved | 8 |
| ns01 | Interstate 880 (I-880) | Yes | 2.99 | 51.54 | Unresolved | 30 |
| ns02 | Interstate 680 (I-680) | Yes | 3.70 | 32.92 | Unresolved | 40 |
| ns03 | Fremont Boulevard | Yes | 10.51 | 35.28 | Unresolved | 48 |
| ns04 | Paseo Padre Parkway | Yes | 11.89 | 43.18 | Verified | 19 |
| ns05 | Blacow Road | Yes | 9.31 | 20.68 | Unresolved | 13 |
| ns06 | Mission Boulevard | Yes | 18.73 | 41.04 | Unresolved | 24 |
| ns07 | Niles Boulevard | Yes | 4.83 | 4.90 | Verified | 12 |
| ns08 | Grimmer Boulevard | Yes | 4.26 | 14.58 | Unresolved | 19 |
| ns09 | Osgood Road | Optional all-streets | 0.01 | 5.43 | Unresolved | 13 |
| ns10 | Albrae Street | Optional all-streets | 0.00 | 2.44 | Verified | 1 |
| ns11 | Pacific Commons Boulevard | Optional all-streets | 0.00 | 2.01 | Verified | 3 |
| ns12 | Cushing Parkway | Optional all-streets | 0.00 | 5.99 | Unresolved | 13 |
| ns13 | Warm Springs Boulevard | Optional all-streets | 0.00 | 10.70 | Unresolved | 8 |
| ns14 | Kato Road | Optional all-streets | 0.00 | 6.37 | Verified | 10 |
| ns15 | Logan Drive | Yes | 1.32 | 2.94 | Verified | 1 |
| ns16 | Cabrillo Drive | Optional all-streets | 0.00 | 2.59 | Unresolved | 2 |
| ns17 | Farwell Drive | Yes | 2.14 | 3.76 | Verified | 8 |

## Evidence and limitations

Road recognition uses only individually corroborated source segments with verified identity and no conflicted geometry. A whole displayed road can remain partially unresolved. Junction markers use actual shared OSM node IDs. Named City intersection points corroborate locations only. Scored intersection pairs additionally require applicable implemented physical-junction and grade evidence for those exact names and a real shared source node. Grouping does not fabricate movements between every road in a group. Known conflicts remain excluded. Legal access, every turn, signals, lanes, current closures and full corridor coverage remain unresolved where their sources do not establish them. Existing grade-separated line crossings stay nonconnecting.

Logical-junction marker positions are view-scoped to an actual source node on the selected road section and inside Zone 1 when clipped. The global representative and original components remain unchanged. A physical-evidence badge applies only to a specifically corroborated pair at that selected road/node; evidence for another pair elsewhere in a group cannot promote the selected connection. Section-specific crossing notices likewise stay on the selected source line.

Section ordering follows the source chain's coordinate order; each source node retains its actual geographic location. It does not invent a global north–south order or an exhaustive sequence across gaps. Distinct same-name connector components use actual source-node connectivity for disambiguation.

## Input SHA-256 values

- `public/data/roads.json`: `047fb0260932381c7067b04e27f400b2aa377a9248f4d2f3edf3185495fb3414`
- `public/data/study-network.json`: `524180544938a5b284cd9b655e5aed5eccf41e67f0175683b9296f19c1b54c34`
- `public/data/zones.json`: `4141c862f835c251ba15b2053fa83b600e8827e78b58db6916d51d849386802f`
- `public/data/verification.json`: `9ed1c3dd07f335eaf72c40670390431c83f7a7285f8c800b0210c37ac65d58f0`
- `data-sources/geographic-evidence.json`: `354695cb324cf42d8b67c7934bbbbb7662f0044f432f0eb54dbbf00638bc377a`
- `data-sources/independent-junctions/scoped-proposed-facts.json`: `6b4dd1ef55300a311695c6df8f9df2bd67e2b74928f9d8a2feecdc422e894bd3`
- `docs/data/study-intersections.json`: `b6277851297051ccd2b165b9ae7a9c295420f6d74d7ff0aee95cbce35c8f9f86`

Original OSM/City provenance, source dates, licensing and independent evidence scope remain in the input files, [prior accuracy audit](geographic-audit.md), [learning evidence](learning-accuracy.md), and [independent source research](junction-source-research.md). Software derivation tests do not independently verify real-world geography.
