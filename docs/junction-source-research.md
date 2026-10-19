# Independent intersection and bridge evidence research

Research retrieved 2026-10-19. This report describes new evidence, not new roads. No road geometry, graph links, driving restrictions, curriculum entries, patrol polygons, or headquarters departure were changed by this research.

## What the evidence supports

The previous learning audit supplied OSM topology and City street-centerline corroboration but no independent legal-movement evidence. Three source families now supply additional, deliberately narrow facts:

| Source | Cached scope | Applicable evidence | What it does not establish |
|---|---:|---|---|
| City of Fremont GIS Intersections | 1,062 named point records in curriculum/connector query results | City-published names and approximate intersection locations | Individual carriageway topology, grade, access, one-way directions, or permitted turns |
| City Transportation Engineering protected-intersection projects | 17 records: 16 implemented, 1 in design | Existence and location of implemented named protected intersections; at-grade physical-junction context | Every approach connection, current signal phasing, right-turn-on-red permission, private-road access, or a complete legal route |
| USDOT/FHWA National Bridge Inventory (NBI) | 113 bridge points in a bounded Fremont-area query; 28 study-road/freeway crossings selected for review | Stated facility carried over the stated crossed feature, with structure identifiers and source location | Exact deck footprints, nearby ramp connections, every turn at an interchange, or current construction restrictions |

**No individually permitted vehicle turning movement is independently verified by these new records.** A bridge is not an intersection. A City point near an OSM junction is not permission to create a connection. The source list, raw factual snapshots, hash manifest and scoped proposals are in `data-sources/independent-junctions/`.

`scoped-proposed-facts.json` contains 45 review records: 17 protected-intersection records (including the explicitly unresolved design-only record) and 28 bridge-crossing records. Six implemented protected intersections between two curriculum entries associate with 22 existing OSM junction nodes. That is six logical named sites, **not 22 independently surveyed intersections**. Other implemented sites involve connector roads and remain useful evidence without manufacturing new curriculum targets or forcing them into the existing 219-record study-junction inventory.

## Source provenance and independence

### City GIS intersection catalog

- Provider/credit: City of Fremont GIS Division.
- [ArcGIS item `ceded4848c094e2f98a555556c252f6a`](https://www.arcgis.com/home/item.html?id=ceded4848c094e2f98a555556c252f6a), owner `OpenData_cofgis`.
- [Official feature layer](https://services2.arcgis.com/AVso4yDITKsybTJg/arcgis/rest/services/Intersections/FeatureServer/0).
- Published data edit: **2023-03-28T18:43:43.552Z**. Retrieval is separately recorded for each response.
- Relevant fields: `OBJECTID`, `STN_KEY`, `CROSS_ST_NAMES`, `CITY`, point geometry. The service transforms the native EPSG:2227 points to requested EPSG:4326; source metadata is retained.
- Exact query URLs and raw responses are preserved in `retrieval-manifest.json`. Eight query batches use existing curriculum name variants plus Liberty Street, Civic Center Drive and BART Way; records are unioned by `OBJECTID`. Each response was below its 1,000-record requested limit. No entire-state data was downloaded.
- Independent of OSM publication, but probably shares City basemap lineage with the already-cached City street centerlines. It must **not** be counted as a second independent survey of those centerlines.
- The catalog contains ramp names, repeated named junctions, and single-road/internal nodes. Road-name agreement and measured displacement are necessary for matching; generic proximity is insufficient. Its point does not identify an exact divided-carriageway node.
- License statement: “City of Fremont Open Data.” Credit is preserved; the item does not supply a more detailed redistribution license. No survey-accuracy warranty is inferred.

### City protected-intersection implementation records

- Provider/credit: City of Fremont Public Works / Transportation Engineering Division.
- [Transportation Engineering Safety Related Projects 2024](https://storymaps.arcgis.com/stories/e523f6e5c38540d6ba631248548db3aa), item owner `EChew_cofgis`; the City's `OpenData_cofgis` catalog separately links the same story under item `9c65728e37a54ff6939e0e5c6c0a0e14`. These are links to **one source**, not independent corroborating publishers.
- [Protected-intersection feature layer](https://services2.arcgis.com/AVso4yDITKsybTJg/arcgis/rest/services/Traffic_Storymap_Project_Locations_Basemap1_2024/FeatureServer/1), service item `b5bef070482a4a5998e524cdd46c6d5f`.
- Layer data edit: **2024-10-07T19:17:44.149Z**. Story item modified **2025-07-01T19:24:19Z**; that item modification date is not an as-built date for every junction.
- Source fields include `Prj_Desc = Protected Intersection`, `Location_Gen`, `Status`, `Status2`, `GIS_JnID`, and project coordinates. The distinction between **Implemented**, **Implemented (Quick Build)** and **In Design, Fully Funded** is preserved.
- Implementation status is engineering project evidence beyond centerline proximity. The geometry may still originate in the same City GIS basemap; do not pretend each layer is a new positional survey.
- The [City's protected-intersection handout](https://www.arcgis.com/sharing/rest/content/items/04bd532104134dac8059ef4f52a53e61/data) describes pedestrian/bicycle crossings and cars turning through these intersections. It explicitly instructs motorists: **“Check to make sure right turns on red are not prohibited.”** Therefore the general handout cannot authorize a specific right turn, a red-signal turn, or any other maneuver at a named junction.
- `Mowry/State` is **in design**, not completed evidence. The passage of time does not convert its status to implemented.
- City license/credit statements and the original generic handout are cached. Generic illustrations are not site-specific plans.

### National Bridge Inventory

- Provider: U.S. Department of Transportation, Bureau of Transportation Statistics; source agency Federal Highway Administration.
- [Official item `bd1b6ee967134ea68fac351cef461b5e`](https://www.arcgis.com/home/item.html?id=bd1b6ee967134ea68fac351cef461b5e), owner `USDOT_BTS`.
- [Official feature layer](https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_National_Bridge_Inventory/FeatureServer/0).
- Dataset **as of 2025-06-20**; layer data edit **2025-08-11T22:25:05.167Z**. Neither date establishes real-time road conditions.
- Query bounded to `[-122.12, 37.44, -121.87, 37.61]`, California/Alameda County. The 113 returned records are well below the 1,000 requested limit. No statewide bridge or road download.
- Key fields: `STRUCTURE_NUMBER_008`, `FACILITY_CARRIED_007`, `FEATURES_DESC_006A`, location, source route and direction fields, raw traffic/open status codes. Bridge feature geometry is retained unchanged.
- NBI aggregates jurisdiction-submitted bridge information. A Caltrans record and its NBI republication would be related evidence, not two independent field checks.
- Official license: U.S. government work, unrestricted public use under the item's stated 17 U.S.C. §101 policy.
- The field coding guide linked from the official item could not be retrieved in this environment. Raw numeric direction/access codes therefore remain preserved rather than being promoted into new game rules. Explicit facility strings such as “MOWRY AVENUE WB” retain their stated scope to that bridge.

## Pass 1: headquarters and central Fremont

The approximate public-road HQ departure on Stevenson Boulevard is preserved. The authoritative existing manifest records about **137 m** from the OSM building reference, rather than the prompt's approximately 107 m. This source review supplies no verified driveway and does not move the spawn.

Useful City catalog references near HQ:

| Named connection | City OBJECTID | Longitude, latitude | Scope |
|---|---:|---|---|
| Stevenson / Civic Center | 4163 | -121.971636237949, 37.5521246354332 | Published named point only |
| Stevenson / Paseo Padre | 4358 | -121.972315339638, 37.5490414688976 | Published named point only |
| Stevenson / Liberty | 4359 | -121.972452018986, 37.5464437181644 | Published named point only |
| Stevenson / Fremont | 4196 | -121.973007826268, 37.5407052765924 | Named point plus implemented protected-intersection project 27 |

Priority implemented protected intersections:

| Named site | Project OBJECTID | GIS_JnID | Existing study-junction candidates |
|---|---:|---:|---:|
| Fremont / Stevenson | 27 | 40 | 4 |
| Fremont / Mowry | 28 | 41 | 4 |
| Fremont / Walnut | 34 | 48 | 4 |
| Walnut / Paseo Padre | 23 | 36 | 4 |
| Walnut / Civic Center | 24 | 37 | Connector site; no forced two-target match |
| Walnut / Liberty | 36 | 45 | Connector site; no forced two-target match |
| Civic Center / BART Way | 22 | 35 | Connector site; no forced curriculum match |

The four-node cases are divided-carriageway representations of a named site. The proposed matching requires the exact two curriculum entries and a City-point distance of at most 40 m; measured offsets and original node IDs are retained. The 40 m policy is an association threshold, not a survey accuracy statement or permission to merge nodes.

The intersection existence evidence improves the factual basis for explaining connections. A route from HQ still traverses other junctions and individual movements whose permission is unresolved. **No complete HQ route becomes independently legal merely because it crosses one newly corroborated intersection.** The accompanying geographic audit separately computes graph reachability and the evidence status of routes.

## Pass 2: other curriculum connections and freeway grade separation

Implemented protected-intersection evidence also covers Fremont/Grimmer and Washington/Osgood (respectively four and two existing study-junction node candidates), Walnut/Guardino, Walnut/Gallaudet, Fremont/Eugene, Cushing/Northport Loop East and West, and Warm Springs/Wisdom and Lopes. The City project label “Warm Springs/Lopes” is corroborated by existing City centerline records naming **Lopes Road**; some portions are private streets. Its implementation record does not establish unrestricted vehicle access to every portion.

Selected NBI bridge examples:

| Structure number | Facility carried | Crossed feature | Supported fact |
|---|---|---|---|
| 33 0591 | Stevenson Boulevard | Interstate 880 | Stevenson passes over I-880 at this structure |
| 33 0267L / 33 0267R | Mowry Avenue WB / EB | Interstate 880 | Separate directional Mowry bridge structures cross I-880 |
| 33 0268 | Auto Mall Parkway | Interstate 880 | Grade-separated crossing |
| 33 0261L / 33 0261R | Central Avenue SB / NB | Interstate 880 | Separate directional Central bridge structures |
| 33 0264 | SR 84 (Thornton) | Interstate 880 | Source-named Thornton structure crosses I-880 |
| 33 0361 | Washington Boulevard | Interstate 680 | Grade-separated crossing |
| 33 0405 | Paseo Padre Parkway | Interstate 680 | Grade-separated crossing |
| 33 0424L / 33 0424R | Interstate 680 SB / NB | Scott Creek Road | I-680 passes over Scott Creek Road |
| 33 0427L / 33 0427R | Interstate 680 SB / NB | East Warren Avenue | I-680 passes over East Warren Avenue |
| 33 0429L / 33 0429R | Interstate 680 SB / NB | Grimmer Boulevard | I-680 passes over Grimmer Boulevard |
| 33 0368 | “AUTO MALL PARKWAY” in NBI | Interstate 680 | Grade evidence; source road naming needs contextual reconciliation with current Durham Road mapping |
| 33 0665F / 33 0666F | Named SR262/I-880 connector ramps | I-880 / Warren / ramps | Named connector structures exist; complete ramp endpoints and turn permissions not established |

These records support auditing the **absence** of direct at-grade transitions at bridge crossings. They do not imply there are no lawful nearby ramps. The game must preserve real ramp topology and continue describing its uncorroborated maneuver rules honestly.

No confirmed source-geometry correction is justified by these records alone. In particular, the NBI Auto Mall naming at I-680 is retained as source wording rather than used to rename Durham Road or replace current OSM/City geometry. A distinction between historical facility naming and a genuinely wrong current road identity needs additional evidence.

## Access limits and remaining evidence gaps

Normal-TLS requests on 2026-10-19 could retrieve ArcGIS metadata, City hosted data and the official USDOT hosted data. The following paths were unavailable:

- `https://www.fremont.gov/government/departments/transportation-engineering` — HTTP403.
- `https://www.fremont.gov/home/showdocument?id=16338&t=638612255396814484` — HTTP403; the independently published ArcGIS handout item was available instead.
- `https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/State_Highway_Bridges/FeatureServer/0?f=json` — proxy tunnel403. The official USDOT NBI supplies the separate evidence described above; it is not claimed to be a retrieved Caltrans service response.
- `https://doi.org/10.21949/1519105` and `https://www.fhwa.dot.gov/bridge/mtguide.pdf` — proxy tunnel403. No guide contents were assumed to have been inspected.
- Google, Bing and DuckDuckGo public search requests also returned proxy tunnel403. ArcGIS public catalog search was available.

No intersection-specific current signal plan, complete signed lane/turn-control plan, traffic order, or equivalent movement record was retrieved. Generic teaching handouts, aerial images and a lack of OSM prohibitions cannot fill that gap. Thus individual turn permission, current signal phase restrictions, detailed ramp access, and complete independently supported legal routes remain unresolved. Existing scored-training gates must remain strict.

## Reproducibility and next work

The research uses small point/document sources, not a road-network reimport. `retrieval-manifest.json` records exact request URLs, UTC retrieval timestamps, byte counts and SHA-256 values. Raw City and NBI point properties are retained. The derived City union states its derivation explicitly. The source snapshots permit future audits without repeated public-service calls.

The integrated geographic audit should consume these sources with exact source-name matching and measured distance, report graph validation separately from source evidence, and retain unresolved maneuvers. Before enabling a scored maneuver, obtain a dated, applicable record for that particular incoming approach and outgoing movement, resolve conflicting sources, and bind the evidence to the actual source graph edge IDs. Start with HQ's Stevenson/Paseo Padre, Stevenson/Fremont and Walnut connections; then expand to the other 38-entry routes. Do not relax the standard simply to make more questions available.
