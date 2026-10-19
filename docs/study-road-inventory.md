# Personalized road verification

Exactly 21 east–west and 17 north–south user entries. Category names are study groups, not measured bearings.

| Original entry | Mapped names | City classes | Status | HQ / return | Sampled approaches |
|---|---|---|---|---|---|
| Lake Arrowhead | Lake Arrowhead Avenue | COL, RES | ready | yes / yes | 7/7 |
| Decoto Road / Highway 84 | Decoto Road | ART, MAJ, RES | ready | yes / yes | 6/7 |
| Nicolet Avenue | Nicolet Avenue | COL | ready | yes / yes | 6/6 |
| Alder Avenue | Alder Avenue | COL | ready | yes / yes | 7/7 |
| Thornton Avenue | Thornton Avenue | ART, MAJ, RES | ready | yes / yes | 6/7 |
| Peralta Boulevard | Peralta Boulevard | ART, RES | ready | yes / yes | 6/7 |
| Central Avenue | Central Avenue | ART, MAJ, RES | ready | yes / yes | 6/7 |
| Eggers Drive | Eggers Drive | COL | ready | yes / yes | 6/6 |
| Niles Canyon | Niles Canyon Road | ART | ready | yes / yes | 7/7 |
| Mowry Avenue | Mowry Avenue | ART, MAJ, RES | ready | yes / yes | 6/7 |
| Walnut Avenue | Walnut Avenue | ART | ready | yes / yes | 5/7 |
| Sundale Drive | Sundale Drive | COL | ready | yes / yes | 6/6 |
| Stevenson Boulevard | Stevenson Boulevard | ART, RES | ready | yes / yes | 7/7 |
| Driscoll Road | Driscoll Road | ART | ready | yes / yes | 7/7 |
| Washington Boulevard | Washington Boulevard | ART | ready | yes / yes | 7/7 |
| Delaware Drive | Delaware Drive | COL, RES | ready | yes / yes | 7/7 |
| Auto Mall Parkway / Durham Road | Auto Mall Parkway, Durham Road | ART | ready | yes / yes | 6/7 |
| Brown Road | Brown Road | COL, RES | ready | yes / yes | 7/7 |
| Warren Avenue | West Warren Avenue, East Warren Avenue | ART, PWY, RES | ready | yes / yes | 6/6 |
| Gable Drive | Gable Drive | COL | ready | yes / yes | 6/7 |
| Scott Creek Road | Scott Creek Road | ART, COL | ready | yes / yes | 6/6 |
| Interstate 880 (I-880) | Nimitz Freeway | FWY | ready | yes / yes | 4/7 |
| Interstate 680 (I-680) | Sinclair Freeway | FWY | ready | yes / yes | 1/7 |
| Fremont Boulevard | Fremont Boulevard | ART, RES | ready | yes / yes | 7/7 |
| Paseo Padre Parkway | Paseo Padre Parkway | PWY | ready | yes / yes | 6/7 |
| Blacow Road | Blacow Road | ART, RES | ready | yes / yes | 6/7 |
| Mission Boulevard | Mission Boulevard | ART, FWY, MAJ, RES | ready | yes / yes | 5/7 |
| Niles Boulevard | Niles Boulevard | ART, RES | ready | yes / yes | 6/6 |
| Grimmer Boulevard | Grimmer Boulevard, South Grimmer Boulevard | ART, RES | ready | yes / yes | 6/6 |
| Osgood Road | Osgood Road | ART | ready | yes / yes | 5/7 |
| Albrae Street | Albrae Street | COL, RES | ready | yes / yes | 7/7 |
| Pacific Commons Boulevard | Pacific Commons Boulevard | COL | ready | yes / yes | 7/7 |
| Cushing Parkway | Cushing Parkway | ART | ready | yes / yes | 6/6 |
| Warm Springs Boulevard | Warm Springs Boulevard | ART | ready | yes / yes | 7/7 |
| Kato Road | Kato Road | ART, COL, RES | ready | yes / yes | 6/6 |
| Logan Drive | Logan Drive | COL | ready | yes / yes | 7/7 |
| Cabrillo Drive | Cabrillo Drive | COL, RES | ready | yes / yes | 7/7 |
| Farwell Drive | Farwell Drive | COL | ready | yes / yes | 7/7 |

- All route results validate the imported directed graph and supported turn rules, not every real-world traffic movement.
- Unsupported conditional/via-way approaches are excluded conservatively; missing traffic rules remain unverified.
- Lake Arrowhead Avenue and the combined Grimmer/South Grimmer study entry follow explicit user confirmation; original labels remain unchanged.
- Bounded road imports preserve earlier objects; they do not establish complete end-to-end road or full-city coverage.
- Historical patrol polygons are approximate study boundaries; current adoption unverified.
- The 38x38 matrix uses one reproducible directed representative per target; the separate stratified approach samples expose additional inaccessible segments.

Machine-readable details: [runtime inventory](../public/data/study-network.json), [intersection inventory](data/study-intersections.json), [directed matrix](data/study-connectivity.json), [verification summary](data/study-verification.json), and [Zone 1 technical inventory](data/zone1-road-inventory.json).

City classifications are independent City GIS attributes; they are not inferred from OSM highway classes. The City source is credited and its supplied metadata has no explicit reuse license.
