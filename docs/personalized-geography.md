# Personalized geographic coverage and verification

The curriculum is exactly the user's 38 transcribed entries, with 21 east–west
and 17 north–south study categories. The photographs themselves were not
attached with this specification; original labels are preserved in
`data-sources/study-entries.json`. The user explicitly confirmed Lake Arrowhead
Avenue and both Grimmer Boulevard/South Grimmer Boulevard under one entry.
The crossed-out handwritten item is not a target. Ordinary connector roads
never become additional curriculum entries.

## Sources and bounded coverage

- Roads: OpenStreetMap, ODbL 1.0, retrieved through the public OSM API map
  endpoint. Source node IDs alone establish connections. The application
  never snaps crossings together or invents missing ramp/driveway geometry.
- Original dataset: all 5,839 ways and 19,523 nodes, with previous source
  objects and rules, preserved without modification. Digests in
  `data-sources/preserved-road-digests.json` are anchored to commit `bbf7813`.
- Zone 1: all 64 map tiles covering buffered bbox
  `[-122.013,37.516,-121.908,37.612]`. The complete historical polygon bbox is
  `[-122.00702522235,37.5214226623843,-121.914510307935,37.6066788811464]`.
  Tile retrieval therefore reaches the full intended historical study area.
- Personal targets beyond Zone 1: 85 additional tiles along City-matched
  target corridors and an approximately 300 m buffer. Their combined envelope
  is `[-122.078625,37.444,-121.88175,37.624]`, **not a claim of complete envelope
  coverage**. Whole source ways can extend beyond individual request boxes.
- Merged roads: 22,794 ways, 84,825 nodes, 166,282 playable directed edges.
  The merge recorded zero conflicting node coordinates and zero changed
  existing ways. Existing Zone 2 and Zone 3 geography remains intact.

OSM map responses do not supply a replication snapshot timestamp. Import
metadata explicitly records the latest individual source-object edit time
as such, with retrieval times, full request URLs, per-response hashes,
object edit ranges and append version history. It does not represent that
edit timestamp as a single atomic extract date. The original Overpass source
record remains unchanged. Overpass returned HTTP 406 during the expansion,
so the cached OSM API fallback was used; dense 4×4 requests exceeded the
API's 50,000-node cap, so the successful Zone 1 retrieval used 8×8 tiles.

Manifests: [Zone 1 import](data/zone1-full-bbox-import.json) and
[personal corridor import](data/personal-corridors-import.json).

## Independent City road classifications

The public [City GIS Streets layer](https://services2.arcgis.com/AVso4yDITKsybTJg/arcgis/rest/services/Streets/FeatureServer/0)
belongs to `OpenData_cofgis`, catalog item
[`bdb90b3d924d45a8b8ff2f87dd83c332`](https://www.arcgis.com/home/item.html?id=bdb90b3d924d45a8b8ff2f87dd83c332).
The service returned 13,116 features across 14 explicitly paginated requests.
Its metadata supplies data/schema edit times and a coded `ST_CLASS` domain:
ART arterial, COL collector, PWY parkway, MAJ major road, FWY freeway, RES
residential, and other access classes. These are City GIS attributes, not
OSM-to-arterial assumptions or independently reviewed legislative designations.

The complete retrieved source features, query URLs, response hashes, edit
metadata and domain are committed in `data-sources/city-streets-full.geojson`.
Credit: City of Fremont GIS Division. The supplied catalog metadata has no
explicit reuse license; no invented license grant is assigned.

[Zone 1 technical inventory](data/zone1-road-inventory.json) evaluates the
full study polygon and border-review band, every user-specified candidate,
and additional City/OSM qualifying roads. All 22 City ART/PWY/MAJ corridor
names intersecting that study/border area have matching source geometry.
Collectors are evaluated separately. This technical audit does not add
unlisted roads to the personalized curriculum. Hyphen/abbreviation matching
is explicit, including Alvarado-Niles and Terrace/Ter; City and OSM class
disagreements remain visible rather than silently changing either source.

Lengths are approximate sums of unduplicated OSM physical segments; divided
carriageways are separate source geometry. In-zone lengths use segment
midpoints and are not surveyed measurements or exact boundary clips.

## Headquarters departure

The headquarters building is [OSM way 37751672](https://www.openstreetmap.org/way/37751672),
version 8, source edit `2022-12-31T21:36:08Z`, checked October 18, 2026 in
California. Its name is Fremont Police Department and its source address
numbers include 2000 Stevenson Boulevard. The footprint and tags are saved
in `data-sources/police-headquarters.geojson`.

The building reference is the arithmetic mean of its unique footprint
vertices, not a surveyed entrance. A deterministic departure is placed on
the existing permitted direction of Stevenson Boulevard near that reference.
The reviewed westbound segment avoids a nearby conservative graph gap on
the initial straight-ahead departure. The selected edge belongs to
a substantial mutually reachable component, and the spawn leaves a 20 m
approach before the first junction. This is an **approximate public-road
departure, not an independently verified driveway**. Exact edge ID, source
building version, coordinate, offset, and separation note are recorded in
[`public/data/study-network.json`](../public/data/study-network.json).
The chosen directed edge is `417403358:0:f`, from
[OSM way 417403358](https://www.openstreetmap.org/way/417403358).

New sessions and resets begin stopped at this departure. Road-to-road,
intersection and return exercises explicitly request alternative source-road
starts. Existing saved-route playback starts at the departure and adds a
connector only if the complete directed join validates; an unsupported join
is rejected instead of teleporting onto disconnected roads.

## Connectivity and intersections

Every ready entry has a City name/reference cross-check, original OSM IDs,
source geometry, zone membership, source classes, departure and return
routes, and stratified directed approach samples. The 38×38 matrix covers
all 1,406 ordered non-self pairs. It uses reproducible directed representatives;
the separate spatial/directional samples deliberately expose other inaccessible
approaches instead of treating one successful destination as an entire-road
verification. Exact current sample counts and failures are in
[the verification summary](data/study-verification.json).

All reachable routes are labeled **reachable with uncertain restrictions**.
Supported one-way/node-via rules are enforced. The current parser conservatively
excludes prohibited via ways affected by unsupported rules, retaining their
through-road approaches. Only-turn, conditional and incomplete rules still
exclude uncertain approaches. There are 232 unsupported source records. Through-training routes also avoid source
destination/customer/delivery/permit/emergency-only access and prefer target
and through roads over residential/service shortcuts. Unlisted roads remain
in the physical graph; real alternate routes can count toward arrival.

The source-node intersection inventory records physical nodes, coordinates,
entry identities, incoming/outgoing edge and way IDs, supported selectable
movements, known restriction IDs and verification status. Logical junction
labels group nearby same-pair nodes only when actual short graph paths
connect them; physical carriageways and routing edges are never collapsed.
Unconnected visual crossings are listed separately and cannot satisfy
intersection arrival. I-880/I-680 use actual directed motorway and ramp
geometry; an overpass never becomes a surface-street turn.

## Remaining geographic limits

All 38 entries have playable sampled locations. This does not mean all road
spans, entrances, exits, posted traffic rules or lanes are verified. Some
directed approach samples are inaccessible because of conservative exclusions,
bounded coverage, or source topology; these are graph/data findings, not proof
of physical real-world disconnection. Missing rules and exact traffic controls
remain unverified. Independent on-street legal-movement confirmation and
history-dependent restriction support are the highest geographic priorities.

The three patrol polygons are unchanged historical City GIS study boundaries.
Their current adoption is unconfirmed; the 75 m border-review policy does not
claim surveyed accuracy. They remain approximate and never act as walls.
The personalized list can cross zones. The 3D view remains flat and schematic,
with approximate widths, center guides and scenery; it does not assert real
bridge elevations, roadside signs, signals or lane configurations.

## Reproducing the pipeline

Existing committed data needs no network access during gameplay or testing.
To review new sources, use cached requests, inspect manifests/conflicts, and
retain the existing append history:

```sh
python3 scripts/fetch-city-streets.py --all
python3 scripts/fetch-zone1-osm.py /tmp/fremont-zone1-osm
node scripts/merge-cached-roads.mjs /tmp/fremont-zone1-osm zone1-full-bbox
python3 scripts/plan-study-tiles.py
python3 scripts/fetch-zone1-osm.py /tmp/fremont-study-osm /tmp/fremont-study-tiles.json
node scripts/merge-cached-roads.mjs /tmp/fremont-study-osm personal-corridors
npm run data:study
npm test
npm run build
npm run test:e2e
npm run test:production
```

Raw OSM map cache files are local; request/hash manifests and normalized road
data are versioned. Repeated cached retrieval avoids re-querying public services.
Source-object changes across tiles or conflicts with preserved geometry require
review rather than automatic coordinate overwrites. Do not call the geographic
network complete solely because software tests pass.
