# Directed study-road connectivity matrix

Reproduce with `npm run data:audit`. geographic-audit-v1-8b2f67be0649453c.

G = graph-reachable, partially verified; I = independently supported; U = unreachable in current graph; M = missing geographic coverage; B = blocked by an independently supported applicable prohibition. A cell evaluates the retained directed representative only. Both directions are separate cells. See the JSON for distance, source edges, route hash, connectors, traversed study junctions and unresolved movement counts. Separate HQ approach checks prevent treating one representative as complete corridor coverage.

| From / to | ew01 | ew02 | ew03 | ew04 | ew05 | ew06 | ew07 | ew08 | ew09 | ew10 | ew11 | ew12 | ew13 | ew14 | ew15 | ew16 | ew17 | ew18 | ew19 | ew20 | ew21 | ns01 | ns02 | ns03 | ns04 | ns05 | ns06 | ns07 | ns08 | ns09 | ns10 | ns11 | ns12 | ns13 | ns14 | ns15 | ns16 | ns17 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ew01 | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew02 | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew03 | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew04 | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew05 | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew06 | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew07 | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew08 | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew09 | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew10 | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew11 | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew12 | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew13 | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew14 | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew15 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew16 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew17 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew18 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew19 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew20 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ew21 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ns01 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ns02 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ns03 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ns04 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G | G |
| ns05 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G | G |
| ns06 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G | G |
| ns07 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G | G |
| ns08 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G | G |
| ns09 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G | G |
| ns10 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G | G |
| ns11 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G | G |
| ns12 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G | G |
| ns13 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G | G |
| ns14 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G | G |
| ns15 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G | G |
| ns16 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — | G |
| ns17 | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | G | — |

- ew01: Lake Arrowhead
- ew02: Decoto Road / Highway 84
- ew03: Nicolet Avenue
- ew04: Alder Avenue
- ew05: Thornton Avenue
- ew06: Peralta Boulevard
- ew07: Central Avenue
- ew08: Eggers Drive
- ew09: Niles Canyon
- ew10: Mowry Avenue
- ew11: Walnut Avenue
- ew12: Sundale Drive
- ew13: Stevenson Boulevard
- ew14: Driscoll Road
- ew15: Washington Boulevard
- ew16: Delaware Drive
- ew17: Auto Mall Parkway / Durham Road
- ew18: Brown Road
- ew19: Warren Avenue
- ew20: Gable Drive
- ew21: Scott Creek Road
- ns01: Interstate 880 (I-880)
- ns02: Interstate 680 (I-680)
- ns03: Fremont Boulevard
- ns04: Paseo Padre Parkway
- ns05: Blacow Road
- ns06: Mission Boulevard
- ns07: Niles Boulevard
- ns08: Grimmer Boulevard
- ns09: Osgood Road
- ns10: Albrae Street
- ns11: Pacific Commons Boulevard
- ns12: Cushing Parkway
- ns13: Warm Springs Boulevard
- ns14: Kato Road
- ns15: Logan Drive
- ns16: Cabrillo Drive
- ns17: Farwell Drive

No cell claims independently verified legal drivability. [Machine-readable audit](data/geographic-audit.json).
