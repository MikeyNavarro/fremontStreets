# Learning geographic evidence audit

Evidence version: evidence-v1-a0bc94350862be33. Reproduce with `npm run data:verify`; no downloads.

Independent cached City/OSM centerline comparison; no source geometry is altered. Status scope is explicit. No independently verified maneuvers are available. Software graph tests are separate.

City: https://services2.arcgis.com/AVso4yDITKsybTJg/arcgis/rest/services/Streets/FeatureServer/0; retrieved 2026-10-19T01:08:38.130831+00:00; data edit 2026-02-26T01:03:24.948Z. Credit City of Fremont GIS Division. No explicit reuse license supplied by catalog metadata; preserve City attribution. Centerlines are not lane, grade or turn-permission records.

OSM: source IDs and import history in roads.json and existing manifests; attribution © OpenStreetMap contributors, ODbL. Both complete source file hashes are in verification.json.

The exact 38 curriculum identities, labels, groups and existing mappings are preserved. Historic approximate patrol polygons and approximate public-road HQ spawn are unchanged. Whole-city coverage is not claimed.

| Entry | Identity | Whole imported geometry | Eligible directed segments | Topology | Maneuvers |
|---|---|---|---:|---|---|
| Lake Arrowhead | Verified | Verified | 49/49 | Unresolved | Unresolved |
| Decoto Road / Highway 84 | Verified | Unresolved | 310/326 | Unresolved | Unresolved |
| Nicolet Avenue | Verified | Verified | 125/125 | Unresolved | Unresolved |
| Alder Avenue | Verified | Verified | 90/90 | Unresolved | Unresolved |
| Thornton Avenue | Verified | Unresolved | 478/483 | Unresolved | Unresolved |
| Peralta Boulevard | Verified | Unresolved | 263/287 | Unresolved | Unresolved |
| Central Avenue | Verified | Unresolved | 542/560 | Unresolved | Unresolved |
| Eggers Drive | Verified | Verified | 140/140 | Unresolved | Unresolved |
| Niles Canyon | Verified | Unresolved | 236/450 | Unresolved | Unresolved |
| Mowry Avenue | Verified | Unresolved | 628/819 | Unresolved | Unresolved |
| Walnut Avenue | Verified | Verified | 267/267 | Unresolved | Unresolved |
| Sundale Drive | Verified | Verified | 271/271 | Unresolved | Unresolved |
| Stevenson Boulevard | Verified | Unresolved | 481/588 | Unresolved | Unresolved |
| Driscoll Road | Verified | Verified | 164/164 | Unresolved | Unresolved |
| Washington Boulevard | Verified | Verified | 255/255 | Unresolved | Unresolved |
| Delaware Drive | Verified | Verified | 49/49 | Unresolved | Unresolved |
| Auto Mall Parkway / Durham Road | Verified | Unresolved | 302/348 | Unresolved | Unresolved |
| Brown Road | Verified | Verified | 52/52 | Unresolved | Unresolved |
| Warren Avenue | Verified | Verified | 210/210 | Unresolved | Unresolved |
| Gable Drive | Verified | Unresolved | 78/82 | Unresolved | Unresolved |
| Scott Creek Road | Verified | Unresolved | 76/82 | Unresolved | Unresolved |
| Interstate 880 (I-880) | Verified | Unresolved | 304/326 | Unresolved | Unresolved |
| Interstate 680 (I-680) | Verified | Unresolved | 390/564 | Unresolved | Unresolved |
| Fremont Boulevard | Verified | Unresolved | 1323/1550 | Unresolved | Unresolved |
| Paseo Padre Parkway | Verified | Verified | 1307/1307 | Unresolved | Unresolved |
| Blacow Road | Verified | Unresolved | 302/526 | Unresolved | Unresolved |
| Mission Boulevard | Verified | Unresolved | 886/957 | Unresolved | Unresolved |
| Niles Boulevard | Verified | Verified | 235/235 | Unresolved | Unresolved |
| Grimmer Boulevard | Verified | Unresolved | 549/580 | Unresolved | Unresolved |
| Osgood Road | Verified | Unresolved | 276/278 | Unresolved | Unresolved |
| Albrae Street | Verified | Verified | 180/180 | Unresolved | Unresolved |
| Pacific Commons Boulevard | Verified | Verified | 87/87 | Unresolved | Unresolved |
| Cushing Parkway | Verified | Unresolved | 176/206 | Unresolved | Unresolved |
| Warm Springs Boulevard | Verified | Unresolved | 289/291 | Unresolved | Unresolved |
| Kato Road | Verified | Verified | 398/398 | Unresolved | Unresolved |
| Logan Drive | Verified | Verified | 146/146 | Unresolved | Unresolved |
| Cabrillo Drive | Verified | Unresolved | 138/158 | Unresolved | Unresolved |
| Farwell Drive | Verified | Verified | 227/227 | Unresolved | Unresolved |

## Eligibility and unresolved work

Recognition questions may use only individually corroborated segments, never an arbitrary section of a partially corroborated corridor. A 15 m centerline tolerance with samples at most 10 m apart is a documented comparison policy, not a survey accuracy claim. Name agreement alone cannot qualify geometry.

All 219 source junctions retain an independent four-dimension record. City endpoint proximity and OSM shared nodes are evidence for review, not proof of legal turns or grade. No scored intersection or maneuver questions qualify yet. Navigation remains available as unscored practice under supported graph rules. The full 20-task exam is unavailable until sufficient independently supported intersection and navigation tasks exist. Higher mastery levels must disclose this evidence gap.

Next evidence needed: independent junction/grade/access and relevant turn-permission records; review of unmatched segments; explicit resolution records for any confirmed conflicts. OSM/City source disagreement must not be resolved by drawing new connections. No verified movement is inferred from absence of a prohibition.
