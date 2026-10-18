# Geographic sources and coverage

The application must use real geographic source geometry. A bounded study extract is not a complete Fremont street inventory. Study selection never creates walls or changes the road graph. Roads connect by their source node identity, never because two lines cross on screen or lie close together.

The bundled OpenStreetMap snapshot has source timestamp **2026-10-18T23:12:16Z**, with **3,063 motor-vehicle ways, 9,998 source nodes and 537 unique nonempty source names** before conservative simulation exclusions. It includes 42 supported node-via restrictions and retains 50 unsupported restrictions for conservative exclusion. Actual returned whole-way coordinates span −122.0100608 to −121.957413 longitude and 37.5283869 to 37.5726519 latitude. This is a central Fremont slice around Downtown, Fremont Boulevard, Mowry Avenue, Walnut Avenue and Paseo Padre Parkway; it does not cover all of Fremont or establish coverage of any official patrol zone.

## Reusable OpenStreetMap import

`npm run data:import` requests a small central Fremont OpenStreetMap extract from Overpass, including a buffer around the first study area. It does not download California. The default requested WGS84 bounding box is west −122.004, south 37.534, east −121.963, north 37.568. Whole OSM ways may extend beyond it.

```sh
npm run data:import
node scripts/import-roads.mjs --input /tmp/overpass-export.json --source-url https://overpass-api.de/api/interpreter
node scripts/import-roads.mjs --bbox -122.004,37.534,-121.963,37.568 --output public/data/roads-next.json
```

The importer preserves original OSM node IDs, way IDs, complete way tags, names, one-way direction, speed-limit tags, access, layer, tunnel and bridge tags. It includes public motor-vehicle highway classes and excludes explicit `no` and `private` motor-vehicle access. Node-via restrictions are normalized; conditional and via-way restrictions remain in `unsupportedRestrictions` for conservative handling by the simulation. Do not treat an unsupported restriction as permission to turn.

Imported metadata includes the requested bounds, import time, OSM data timestamp where supplied, source SHA-256, counts, source URL, coverage description and limitations. Review a changed dataset and run the geographic tests before replacing the current version. Imports are development operations; gameplay uses the saved local dataset and does not repeatedly query public services.

The default network command was executed successfully again with `--output /tmp/fremont-roads-roundtrip.json`. Its source timestamp was 2026-10-18T23:15:20Z, and comparison confirmed identical nodes, ways and supported/unsupported restriction records to the bundled 23:12:16Z snapshot. The five geographic tests were executed successfully with `npx tsx --test tests/geography.test.ts`.

OpenStreetMap data is © OpenStreetMap contributors, under the [Open Database License (ODbL 1.0)](https://www.openstreetmap.org/copyright). Preserve attribution in the interface and redistribute derived databases under applicable ODbL terms. The bundled extract's metadata identifies its exact source and limitations.

## Coordinate system and rendering

Both cameras and the vehicle graph use the same longitude/latitude geometry. Simulation converts WGS84 coordinates to local metric equirectangular coordinates using the documented common origin (−121.9886°, 37.5485°):

`x = R × (lon − lon0) × π/180 × cos(lat0 × π/180)`

`y = R × (lat − lat0) × π/180`, with `R = 6,371,008.8 m`.

This local metric approximation is suitable for a small central Fremont study area. It is not survey-grade lane positioning. Driver-view widths, markings and scenery are generic visual approximations. Missing lanes, signs, traffic signals, speed limits and turn restrictions have not been independently verified. Unknown source speed limits must display as unknown. The vehicle's configurable 55 mph capability is not a road speed limit.

## Patrol boundaries and October 2026 proposal

Official reference: [Fremont Police zone map](https://www.fremontpolice.gov/about-us/about-fremont-police/police-zone-map).

On 2026-10-18 the initial development environment egress policy blocked the required geographic domains. After the network configuration was updated, OpenStreetMap access worked, but the official police reference and municipal website returned upstream Akamai HTTP 403 access denied. ArcGIS catalog access remained blocked by the egress proxy. No adopted polygon or official adoption record could be retrieved. A proposal considered for 2026-10-06 does not establish adoption. Consequently the three zone options are present but unavailable, and `public/data/zones.json` records `boundaryVersion: null`, `geometry: null`, the source reference, check date and the evidence gap. The zone names currently come from the project specification and have not been independently checked against current official records. No provisional boundaries have been fabricated. The central road extract must not be presented as Zone 1.

To enable zones, obtain the officially adopted police-zone polygon export and the official record confirming its effective version. Verify publication ownership and adoption independently. Reproject to WGS84 if required; preserve original polygons. The guarded importer requires source and adoption URLs and an effective date:

```sh
node scripts/import-zones.mjs --input /tmp/official-zones.geojson \
  --source-url https://www.fremont.gov/path/to/official/export \
  --adoption-source https://www.fremont.gov/path/to/adoption-record \
  --boundary-version YYYY-MM-DD --id-property zone
```

The importer validates all three IDs, polygon shape, closed rings, coordinate range and provenance fields. It cannot establish that a council action occurred; the operator must review the linked official evidence. Keep the previous dataset in version control and run zone, routing and browser tests after importing. A boundary overlay must never split physical road connectivity.
