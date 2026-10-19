# Patrol study boundaries: source and accuracy

The three colored study areas use actual georeferenced **City of Fremont GIS Division** polygons. They are **approximate learning areas**, because their current adoption and the status of the proposed October 6, 2026 changes could not be independently confirmed. They are not a claim about today's legal or surveyed patrol boundaries.

The user authorized approximate study boundaries and supplied a 905×617 screenshot of the Police Department map. A usable City GIS download was found, so no screenshot coordinates were invented or manually digitized.

## Source record

- Original police reference: <https://www.fremontpolice.gov/about-us/about-fremont-police/police-zone-map>
- City GIS ArcGIS item: <https://www.arcgis.com/home/item.html?id=6e6db16bb5da46daa24e063b1507268e>
- Public source owner: `OpenData_cofgis`; credit: `City of Fremont - GIS Division`.
- Source description: “This dataset illustrates the Police Department Zones (reporting areas) in the City of Fremont.”
- Layer: <https://services2.arcgis.com/AVso4yDITKsybTJg/arcgis/rest/services/Police_Zones/FeatureServer/0>
- [Download the original WGS84 GeoJSON](https://services2.arcgis.com/AVso4yDITKsybTJg/arcgis/rest/services/Police_Zones/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson).
- Source layer data last edited: `2020-12-10T01:27:59.899Z` (December 9, 2020 in California).
- ArcGIS catalog item last modified: `2021-02-09T19:21:11Z`.
- Original fetched GeoJSON SHA-256: `ab5582a09f700f1442a4b13e45a4f77f774c7f38232738545922ad1ed1ad2410`.
- Local study version: `city-gis-2020-12-10-study-v1`; import date: October 18, 2026.

The service returned exactly three polygons with `ZONE` values 1, 2 and 3 and matching source labels. The source CRS is California State Plane NAD83 feet (EPSG:2227); the service itself exported the downloaded GeoJSON into WGS84 (EPSG:4326). No guessed transformation or arbitrary rectangular zone was used. The complete original rings, including tiny holes, are retained without simplification.

The source is publicly queryable and gives City GIS credit. Its ArcGIS item and XML metadata supply no explicit reuse license. Preserve credit and review applicable City data terms before public redistribution; the importer does not invent a license.

## Screenshot comparison and uncertainty

The supplied screenshot exists in the conversation; its original image publication date and a local image file were not exposed. A separate visual review compared a Web Mercator rendering of the downloaded polygons with the screenshot. The city silhouette, Zone 1 north apex, Zone 2 western corner, Newark recess, Zone 2/3 southwest junction, and Zone 3 southeast edge match closely. This supports using these polygons for the user's study map; it does not prove that the map represents boundaries adopted in 2026.

Coordinates come directly from the GIS service, so `digitizedAt` is null and `importedAt` records the actual import. The 75 m boundary-review band is a conservative **application classification policy**: it retains uncertain assignments near borders. It is not a measured positional accuracy, image-registration error, or guarantee of current patrol adoption. Historical version uncertainty may exceed this band.

The police webpage and municipal website returned upstream Akamai HTTP 403 during this work. The successful public ArcGIS download does not resolve the inaccessible adoption record. The proposed October 6, 2026 change remains unconfirmed.

## Coverage and graph preservation

Zone 1 is blue, Zone 2 pink, and Zone 3 orange, as in the screenshot. Each area can be selected and its boundary displayed. Road availability is computed separately from polygon availability.

The original central Fremont extract covered Zones 1 and 2 and had zero road-segment intersection with Zone 3. The user then explicitly authorized a bounded northern Irvington/Zone 3 OSM append while preserving all existing source objects. That actual import now gives all three areas partial road coverage. The application's current classification reports:

| Study area | Playable source segments | Source street names | Safe destination nodes |
| --- | ---: | ---: | ---: |
| Zone 1 — Central Fremont | 11,275 | 588 | 9,962 |
| Zone 2 — North Fremont | 1,849 | 185 | 1,682 |
| Zone 3 — South Fremont | 6,632 | 273 | 5,782 |

These are counts in the available extract, not completion percentages or complete patrol-zone inventories. The classifier also retains ambiguous border segments. Cross-zone source streets can belong to more than one learning collection. Geography outside the two bounded source extracts remains missing.

The patrol import and editor never modify `roads.json`, source node IDs, legal connectivity, or road geometry. The separate authorized road append preserved every original node, way, rule and all 18,854 original playable directed edges. The original baseline file SHA-256 `939484ce421efd32a4f9c9625bbc8b32aa921d8aecbca01856744233f6d5ba12` is retained in `roads.json` metadata with original ID lists, source metadata and canonical content hashes. Source polygons and learning filters do not make walls or change legal road connections.

## Reproduce the study import

```sh
node scripts/import-study-zones.mjs --output /tmp/reimported-study-zones.json
```

The command retrieves polygons, layer metadata and ArcGIS item metadata through HTTPS with verification intact. It checks the reviewed item ID, owner, three source zone IDs, geographic coordinate range, and closed source rings. It preserves source timestamps and hashes; it continues to label the result approximate and current adoption unverified. Full geometry validation and segment classification remain application checks. Review source changes before replacing the bundled file.

For an archived offline response:

```sh
node scripts/import-study-zones.mjs \
  --input /tmp/police-zones.geojson \
  --layer-metadata /tmp/police-layer.json \
  --item-metadata /tmp/police-item.json \
  --output /tmp/reimported-study-zones.json
```

The separate `import-zones.mjs` workflow is reserved for a future verified adopted official dataset and adoption evidence. It must not be used to promote this historical snapshot to current official status.
