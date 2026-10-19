# Geographic verification: headquarters and all 38 study entries

Audit geographic-audit-v1-8b2f67be0649453c; evidence evidence-v1-a0bc94350862be33; reproduced baseline a416cdd. Run `npm run data:verify && npm run data:audit` offline against the committed source snapshots. Input hashes, source retrieval/version records, exact node/way IDs, nine separate evidence dimensions and route fingerprints are in [the machine-readable audit](data/geographic-audit.json).

## Before and after

| Measure | Reproduced before | After |
|---|---:|---:|
| Study entries examined | 38 | 38 |
| Corroborated identities | 38 | 38 |
| Corroborated directed study segments | 12279 | 12279 |
| Entries with every imported segment corroborated | 18 | 18 |
| Entries with partial corroboration | 20 | 20 |
| Study-junction source records audited | 219 | 219 |
| Source-node records associated with independently corroborated named locations | 0 | 200 |
| Source-node records associated with documented physical at-grade junctions | 0 | 20 |
| Individually verified legal movements | 0 | 0 |
| Confirmed geographic errors corrected | 0 | 0 |
| Study junction records with unresolved maneuvers | 219 | 219 |
| Independently supported HQ routes | 0 | 0 |
| Independently supported road-to-road routes | 0 | 0 |
| Graph-reachable directed representative pairs | 1406 | 1406 |
| Unsupported OSM restriction records | 232 | 232 |

Increased evidence coverage is not a correction of wrong geography. **No source road, graph connection, coordinate, curriculum mapping, zone polygon, HQ spawn or runtime scoring record was changed.** All baseline source hashes match. Software route validation is reported separately from independent geographic evidence.

## Independent evidence added

The City named-intersection catalog corroborates **200 of 219 study source-node location associations at 75 distinct City named-intersection records**. These are named junction-center associations within 40 m with at least two exact normalized actual road names, not surveyed individual carriageway-node positions. Divided roads can contribute several source nodes to one named intersection; the counts deliberately distinguish them.

The City's transportation inventory identifies **6 implemented protected intersections associated with 20 study source nodes**. This independently supports the existence of those named physical at-grade intersections. It does not establish each directed approach connection, public access, one-way currency, signal rule or individual legal maneuver. Two additional proposed source-node associations were withheld because both exact actual way names did not match; curriculum grouping alone was not substituted for physical road identity.

The National Bridge Inventory independently corroborates **28 nonconnecting source-line crossing records at 7 distinct bridge structures**, using matching carried/below facilities and a 50 m association threshold. Adjacent ramps remain separate. The retained Auto Mall/Durham source naming is not changed to match a historic bridge label.

Source families and dates:

- [City of Fremont GIS Division](https://services2.arcgis.com/AVso4yDITKsybTJg/arcgis/rest/services/Intersections/FeatureServer/0): city-intersection-catalog-2023; retrieved 2026-10-19T12:42:51.057177+00:00; hosted-service data edit 2023-03-28T18:43:43.552000+00:00. Independent of OSM but related to City street-centerline lineage; do not count as a second independent City survey. Last published data modification is2023-03-28, not a guarantee of current2026conditions. Contains self-road and ramp-name records; catalog point is not individual lane or source-node proof. No grade, legal access, oneway or permitted-turn attributes.
- [City of Fremont Public Works / Transportation Engineering](https://services2.arcgis.com/AVso4yDITKsybTJg/arcgis/rest/services/Traffic_Storymap_Project_Locations_Basemap1_2024/FeatureServer/1/query?f=geojson&where=1%3D1&outFields=%2A&outSR=4326): city-implemented-protected-intersections-2024; retrieved 2026-10-19T12:42:58.246682+00:00; hosted-service data edit 2024-10-07T19:17:44.149000+00:00. Physical named-junction and at-grade design corroboration only for Status=Implemented, with no inference about every carriageway approach. One In Design/Fully Funded project is excluded from implemented evidence. Project-point geometry can share City GIS lineage; engineering implementation status provides additional independent subject evidence beyond line proximity. No intersection-specific current signal/turn-control plan or permitted movement list. Generic motorist guidance explicitly warns to check whether right turns on red are prohibited.
- [USDOT Bureau of Transportation Statistics / Federal Highway Administration, NBI](https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_National_Bridge_Inventory/FeatureServer/0/query?f=geojson&where=STATE_CODE_001%3D%2706%27+AND+COUNTY_CODE_003%3D%27001%27&geometry=-122.12%2C37.44%2C-121.87%2C37.61&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outSR=4326&outFields=OBJECTID%2CSTATE_CODE_001%2CCOUNTY_CODE_003%2CSTRUCTURE_NUMBER_008%2CRECORD_TYPE_005A%2CROUTE_PREFIX_005B%2CROUTE_NUMBER_005D%2CDIRECTION_005E%2CFEATURES_DESC_006A%2CFACILITY_CARRIED_007%2CLOCATION_009%2COPEN_CLOSED_POSTED_041%2CTRAFFIC_DIRECTION_102%2CSERVICE_ON_042A%2CSERVICE_UND_042B%2CTRAFFIC_LANES_ON_028A%2CTRAFFIC_LANES_UND_028B%2CDATE_OF_INSPECT_090%2CDATE%2CSTATUS&resultRecordCount=1000): usdot-fhwa-nbi-2025; retrieved 2026-10-19T12:43:41.997065+00:00; hosted-service data edit 2025-08-11T22:25:05.167000+00:00; dataset as of **2025-06-20** (separate from the hosted-service edit date). FHWA aggregation of jurisdiction-submitted bridge records; do not count Caltrans and NBI reproductions as two independent sources. Bridge-point location is not exact deck footprint, ramp topology or turn permission. Facility-carried and crossed-feature names may be historical, including AutoMallParkway overI680. Retain source wording. Raw direction/open status codes are retained; no whole-route driving permission is inferred. Not a real-time construction/closure source.

The City intersection source references the complete derived union and its SHA-256 hash, with all eight unchanged raw query snapshots, retrieval dates and hashes listed in `derivedFromSnapshots`. The official layer URL identifies the dataset; no single query batch is presented as the source for the whole catalog.

The City intersection catalog and City centerlines share City GIS lineage; they are independent of OSM, not two independent City surveys. Transportation implementation records add different factual content. Raw records, object IDs, publication dates, query URLs and SHA-256 checksums are preserved in [the source research report](junction-source-research.md) and the committed retrieval manifest. Reproduction checks the raw hashes and exact derived catalog union before applying any scoped claim.

## Pass 1: HQ and approximate Zone 1

The stopped departure remains 417403358:0:f, [-121.9706408,37.5530519], on Stevenson Boulevard. The existing projection measures **136.83 m**, approximately 137 m, from the retained building reference. The prompt's 107 m estimate is not reproduced. This is an approximate public-road departure, not a verified driveway.

Recomputed 32 Zone 1 departure/return evaluations and 76 citywide representative HQ routes. Zone 1 is the historical approximate study boundary, not an official current jurisdiction claim. The route-use priority counts below identify the evidence review with greatest benefit to HQ training.

| Priority named study junction | Source node | Zone 1 HQ paths using node | All HQ paths | Nine-dimension location / topology / maneuvers |
|---|---|---:|---:|---|
| Stevenson Boulevard / Paseo Padre Parkway | 1666841910 | 12 | 25 | Verified / Unresolved / Unresolved |
| Paseo Padre Parkway / Stevenson Boulevard | 53111445 | 11 | 25 | Verified / Unresolved / Unresolved |
| Paseo Padre Parkway / Stevenson Boulevard | 1666841913 | 11 | 24 | Verified / Unresolved / Unresolved |
| Stevenson Boulevard / Paseo Padre Parkway | 611603741 | 9 | 23 | Verified / Unresolved / Unresolved |
| Fremont Boulevard / Stevenson Boulevard | 1578762396 | 6 | 19 | Verified / Verified / Unresolved |
| Fremont Boulevard / Stevenson Boulevard | 1578762389 | 4 | 18 | Verified / Verified / Unresolved |
| Fremont Boulevard / Stevenson Boulevard | 660020956 | 4 | 17 | Verified / Verified / Unresolved |
| Fremont Boulevard / Stevenson Boulevard | 1675977852 | 4 | 17 | Verified / Verified / Unresolved |
| Grimmer Boulevard / Paseo Padre Parkway | 53101307 | 4 | 4 | Verified / Unresolved / Unresolved |
| Walnut Avenue / Mission Boulevard | 1666819825 | 4 | 4 | Verified / Unresolved / Unresolved |
| Niles Boulevard / Niles Canyon Road / Mission Boulevard | 846477842 | 3 | 3 | Verified / Unresolved / Unresolved |
| Niles Canyon Road / Mission Boulevard | 53068020 | 3 | 3 | Verified / Unresolved / Unresolved |
| Stevenson Boulevard / Mission Boulevard | 1666841950 | 3 | 3 | Verified / Unresolved / Unresolved |
| Blacow Road / Stevenson Boulevard | 1666841964 | 2 | 5 | Verified / Unresolved / Unresolved |
| Blacow Road / Stevenson Boulevard | 1666841937 | 2 | 4 | Verified / Unresolved / Unresolved |
| Blacow Road / Stevenson Boulevard | 53111462 | 2 | 4 | Verified / Unresolved / Unresolved |
| Stevenson Boulevard / Blacow Road | 612070498 | 2 | 4 | Verified / Unresolved / Unresolved |
| Stevenson Boulevard / Farwell Drive | 1666841907 | 2 | 4 | Verified / Unresolved / Unresolved |
| Stevenson Boulevard / Sundale Drive | 1675977823 | 2 | 4 | Verified / Unresolved / Unresolved |
| Stevenson Boulevard / Sundale Drive | 53111461 | 2 | 4 | Verified / Unresolved / Unresolved |

358 additional connector junctions on Zone 1 HQ routes are audited separately. Their shared nodes are software observations; no proximity-based shortcut is introduced.

## Pass 2: all 38 entries and connectors

Recomputed all **1406 ordered pairs**, each reverse direction separately: 1406 graph-reachable, partially verified; 0 independently supported. [Readable 38-by-38 matrix](geographic-connectivity.md). Route hashes and complete deterministic source selection make each result reproducible without duplicating the full graph.

Also rechecked **256 directed approach samples**; **11** lack an outbound or return path in the conservative graph. A reachable representative does not establish every segment or approach.

| Entry | Identity | Whole imported geometry | Corroborated segments | HQ out / return | Samples with both directions |
|---|---|---|---:|---|---:|
| Lake Arrowhead | Verified | Verified | 49/49 | G / G | 7/7 |
| Decoto Road / Highway 84 | Verified | Unresolved | 310/326 | G / G | 7/7 |
| Nicolet Avenue | Verified | Verified | 125/125 | G / G | 6/6 |
| Alder Avenue | Verified | Verified | 90/90 | G / G | 7/7 |
| Thornton Avenue | Verified | Unresolved | 478/483 | G / G | 7/7 |
| Peralta Boulevard | Verified | Unresolved | 263/287 | G / G | 6/7 |
| Central Avenue | Verified | Unresolved | 542/560 | G / G | 7/7 |
| Eggers Drive | Verified | Verified | 140/140 | G / G | 6/6 |
| Niles Canyon | Verified | Unresolved | 236/450 | G / G | 7/7 |
| Mowry Avenue | Verified | Unresolved | 628/819 | G / G | 7/7 |
| Walnut Avenue | Verified | Verified | 267/267 | G / G | 7/7 |
| Sundale Drive | Verified | Verified | 271/271 | G / G | 6/6 |
| Stevenson Boulevard | Verified | Unresolved | 481/588 | G / G | 7/7 |
| Driscoll Road | Verified | Verified | 164/164 | G / G | 7/7 |
| Washington Boulevard | Verified | Verified | 255/255 | G / G | 7/7 |
| Delaware Drive | Verified | Verified | 49/49 | G / G | 7/7 |
| Auto Mall Parkway / Durham Road | Verified | Unresolved | 302/348 | G / G | 7/7 |
| Brown Road | Verified | Verified | 52/52 | G / G | 6/6 |
| Warren Avenue | Verified | Verified | 210/210 | G / G | 6/6 |
| Gable Drive | Verified | Unresolved | 78/82 | G / G | 6/6 |
| Scott Creek Road | Verified | Unresolved | 76/82 | G / G | 6/6 |
| Interstate 880 (I-880) | Verified | Unresolved | 304/326 | G / G | 4/7 |
| Interstate 680 (I-680) | Verified | Unresolved | 390/564 | G / G | 1/7 |
| Fremont Boulevard | Verified | Unresolved | 1323/1550 | G / G | 7/7 |
| Paseo Padre Parkway | Verified | Verified | 1307/1307 | G / G | 7/7 |
| Blacow Road | Verified | Unresolved | 302/526 | G / G | 7/7 |
| Mission Boulevard | Verified | Unresolved | 886/957 | G / G | 6/7 |
| Niles Boulevard | Verified | Verified | 235/235 | G / G | 6/6 |
| Grimmer Boulevard | Verified | Unresolved | 549/580 | G / G | 6/6 |
| Osgood Road | Verified | Unresolved | 276/278 | G / G | 7/7 |
| Albrae Street | Verified | Verified | 180/180 | G / G | 7/7 |
| Pacific Commons Boulevard | Verified | Verified | 87/87 | G / G | 7/7 |
| Cushing Parkway | Verified | Unresolved | 176/206 | G / G | 6/6 |
| Warm Springs Boulevard | Verified | Unresolved | 289/291 | G / G | 7/7 |
| Kato Road | Verified | Verified | 398/398 | G / G | 7/7 |
| Logan Drive | Verified | Verified | 146/146 | G / G | 7/7 |
| Cabrillo Drive | Verified | Unresolved | 138/158 | G / G | 7/7 |
| Farwell Drive | Verified | Verified | 227/227 | G / G | 7/7 |

Audited 572 connector source ways actually used by these paths, including their source identity, direction/access tags, connected study entries and restriction IDs. 481 have matched City identities; 2729 directed connector segments also pass the same 15 m / 10 m City centerline comparison. Unnamed ramps retain source identifiers, never invented street names. A connector is not an added learning target.

## Crossings, ramps and restrictions

68 visual study-road crossings have no common source node and remain disconnected. Each records actual source bridge/tunnel/layer tags; missing tags do not prove at-grade passage. 66 I-880/I-680 entry/exit/continuation transitions were examined against original edges: 0 are surface/freeway transitions requiring further review. All ramp directions remain those of the existing graph.

352 supported source restriction records and 232 unsupported records were inventoried. 216 source ways are conservatively excluded under existing policy. An unsupported or excluded approach is not reported as independent evidence that the real-world road is disconnected or all alternate routes are prohibited.

## Evidence scopes and remaining work

Every entry, relevant junction and connector has separate identity, geometry, intersection location, topology, grade separation, vehicle access, one-way, individual-movement and route-reachability statuses. City intersection points can corroborate a named physical location without proving each OSM carriageway-node coordinate, grade, public access or turns. The independent evidence file records exact scopes and sources. No runtime quiz/navigation eligibility is promoted by this offline audit.

The supported centerline comparison does not establish surveyed lane geometry or full-city/corridor coverage. Independently supported legal movements remain 0; end-to-end legal routes remain unresolved. Obtain applicable as-built junction/grade plans, public access and current restriction records for the ranked HQ junctions and route connectors before enabling strict scored maneuvers/navigation. Preserve dated evidence and resolve any conflict before changing the source graph.
