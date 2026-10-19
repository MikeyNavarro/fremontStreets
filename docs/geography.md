> Current personalized expansion: see [the coverage audit](personalized-geography.md) and [38-entry inventory](study-road-inventory.md). The original extract described below is preserved as a versioned base.

# Geographic sources and coverage

The application must use real geographic source geometry. A bounded study extract is not a complete Fremont street inventory. Study selection never creates walls or changes the road graph. Roads connect by their source node identity, never because two lines cross on screen or lie close together.

The original central Fremont OpenStreetMap snapshot has source timestamp **2026-10-18T23:12:16Z**, with **3,063 motor-vehicle ways, 9,998 source nodes and 537 unique nonempty source names** before conservative simulation exclusions. A separately authorized northern Irvington/Zone 3 append uses a bounded source snapshot from **2026-10-18T23:47:00Z**. The merged dataset has **5,839 ways, 19,523 nodes, 1,052 source names, 86 node-via restrictions and 88 retained unsupported restrictions**. It provides partial road coverage in all three study areas, not complete zone or city coverage. Every original node, way, rule and all 18,854 original playable directed edges were verified unchanged; the merged graph has 37,792 directed edges.

## Reusable OpenStreetMap import

The raw importer requests a small central Fremont OpenStreetMap extract from Overpass, including a buffer around the first study area. It does not download California. The default requested WGS84 bounding box is west −122.004, south 37.534, east −121.963, north 37.568. Whole OSM ways may extend beyond it. Generate standalone extracts outside the bundled game dataset, then use the append workflow below to preserve all existing game roads.

```sh
npm run data:import -- --output /tmp/central-roads.json
node scripts/import-roads.mjs --input /tmp/overpass-export.json --source-url https://overpass-api.de/api/interpreter --output /tmp/central-roads.json
node scripts/import-roads.mjs --bbox -122.004,37.534,-121.963,37.568 --output /tmp/roads-next.json
```

The importer preserves original OSM node IDs, way IDs, complete way tags, names, one-way direction, speed-limit tags, access, layer, tunnel and bridge tags. It includes public motor-vehicle highway classes and excludes explicit `no` and `private` motor-vehicle access. Node-via restrictions are normalized; conditional and via-way restrictions remain in `unsupportedRestrictions` for conservative handling by the simulation. Do not treat an unsupported restriction as permission to turn.

Imported metadata includes the requested bounds, import time, OSM data timestamp where supplied, source SHA-256, counts, source URL, coverage description and limitations. Review a changed dataset and run the geographic tests before replacing the current version. Imports are development operations; gameplay uses the saved local dataset and does not repeatedly query public services.

The default network command was executed successfully again with `--output /tmp/fremont-roads-roundtrip.json`. Its source timestamp was 2026-10-18T23:15:20Z, and comparison confirmed identical nodes, ways and supported/unsupported restriction records to the bundled 23:12:16Z snapshot. The five geographic tests were executed successfully with `npx tsx --test tests/geography.test.ts`.

## Bounded Zone 3 append

The user separately authorized adding a small real-road extract so Zone 3 can be driven while preserving all existing road objects. `scripts/extend-roads.mjs` fetches a bounded box west −121.99, south 37.505, east −121.94, north 37.542, around northern Irvington, with overlap for existing road connections. It appends only new source IDs and never overwrites old node coordinates or way records.

```sh
node scripts/extend-roads.mjs --output /tmp/extended-roads.json
node scripts/extend-roads.mjs --input /tmp/normalized-zone3-roads.json --output /tmp/extended-roads.json
```

The executed append added 9,525 nodes, 2,776 ways, 44 node-via rules and 38 unsupported rules, with no coordinate conflicts or skipped ways. Original metadata, source IDs, canonical object hashes and original file SHA-256 remain in `metadata.baseSnapshot`; new source bounds, query, timestamp, response checksum and added IDs remain in `metadata.extensions`. Existing approaches never receive new turn rules, and unsupported new restrictions cannot remove an old road. Conflicting additions are conservatively omitted and reported. Reimporting the same normalized extract is a byte-preserving no-op.

OpenStreetMap data is © OpenStreetMap contributors, under the [Open Database License (ODbL 1.0)](https://www.openstreetmap.org/copyright). Preserve attribution in the interface and redistribute derived databases under applicable ODbL terms. The bundled extract's metadata identifies its exact source and limitations.

## Coordinate system and rendering

Both cameras and the vehicle graph use the same longitude/latitude geometry. Simulation converts WGS84 coordinates to local metric equirectangular coordinates using the documented common origin (−121.9886°, 37.5485°):

`x = R × (lon − lon0) × π/180 × cos(lat0 × π/180)`

`y = R × (lat − lat0) × π/180`, with `R = 6,371,008.8 m`.

This local metric approximation is suitable for a small central Fremont study area. It is not survey-grade lane positioning. Driver-view widths, markings and scenery are generic visual approximations. Missing lanes, signs, traffic signals, speed limits and turn restrictions have not been independently verified. Unknown source speed limits must display as unknown. The vehicle's configurable 100 mph capability is not a road speed limit.

## Patrol boundaries and October 2026 proposal

Official reference: [Fremont Police zone map](https://www.fremontpolice.gov/about-us/about-fremont-police/police-zone-map).

The user authorized approximate study areas and supplied a police-map screenshot. Subsequent public ArcGIS research found the City GIS Division's georeferenced `Police_Zones` dataset. Its three exact source polygons are now imported, and an independent visual review found their footprint matches the screenshot. No coordinates were invented. The source layer was last edited `2020-12-10T01:27:59.899Z`; current adoption and the status of the October 6, 2026 proposal remain unverified. These historical-source polygons are therefore labeled approximate study boundaries, with explicit provenance and a 75 m boundary-review policy. See [Patrol sources](patrol-sources.md) for the source URLs, dates, hash, calibration method, coverage gap, and reusable historical study importer.

To replace approximate study status with verified current official status, obtain the officially adopted police-zone polygon export and an official record confirming its effective version. Verify publication ownership and adoption independently. Reproject to WGS84 if required; preserve original polygons. The separate guarded official importer requires source and adoption URLs and an effective date:

```sh
node scripts/import-zones.mjs --input /tmp/official-zones.geojson \
  --source-url https://www.fremont.gov/path/to/official/export \
  --adoption-source https://www.fremont.gov/path/to/adoption-record \
  --boundary-version YYYY-MM-DD --id-property zone
```

The importer validates all three IDs, polygon shape, closed rings, coordinate range and provenance fields. It cannot establish that a council action occurred; the operator must review the linked official evidence. Keep the previous dataset in version control and run zone, routing and browser tests after importing. A boundary overlay must never split physical road connectivity.
