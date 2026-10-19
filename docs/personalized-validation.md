# Personalized training validation

This report covers the extension of the existing game with the exact 38-entry
curriculum, the headquarters departure, source-backed road expansion, and the
100 mph configurable vehicle capability. Historical patrol-release results
remain in [validation.md](validation.md).

## Implemented behavior

- My Street List preserves 21 east–west and 17 north–south original entries.
  Lake Arrowhead Avenue and the combined Grimmer/South Grimmer entry follow
  the user's explicit confirmations. Other roads remain connectors/background.
- Reach, random, road-to-road, source-junction, no-GPS, return-to-headquarters,
  and connection-quiz exercises use the existing road-constrained simulation.
  Wrong turns recalculate connected routes without resetting the vehicle.
- Zone 1 Main Roads restricts targets, destinations, overlays and connection
  quizzes to the sourced Zone 1 portions of the personal list. Citywide and
  all three patrol learning areas, general quizzes, saved routes and the
  development boundary editor remain available.
- Ordinary sessions, resets and area selections start stopped at the reviewed
  westbound Stevenson Boulevard public-road departure, OSM directed edge
  `417403358:0:f`. This is an approximate start near headquarters, not a
  verified driveway. Alternative exercise starts are explicit choices.
- QUICK remains the default: unconstrained 0–30 mph in approximately 2.5 s,
  0–45 mph in approximately 4.5 s. Settings accepts a 10–100 mph cap and
  defaults to 100. Source speed limits remain separate and unknown where absent.
- MapLibre and Three.js read one vehicle state. Target colors, source-junction
  dots, mapped-name labels and a destination marker support learning. Driver
  labels are UI information; physical signs, lanes and bridge heights are not
  reconstructed or verified.
- Personal progress is stored separately from exploration and records practiced
  locations, repetitions, identifications and guided/unguided achievements.
  It does not report whole-road mastery or a misleading coverage percentage.

## Geographic checks executed

`npm run data:study` regenerates the runtime catalog and machine-readable audits
from committed OSM roads, the paginated City GIS snapshot and the historical
study polygons. The human intersection and matrix tables are generated from
those same reports by `scripts/render-study-reports.py`.

- All prior 5,839 ways and 19,523 nodes retain their original content digests.
  The expansion adds source objects without changing the historical polygons.
- All 38 targets have supported directed headquarters and return routes at
  sampled playable locations. All 1,406 ordered non-self representative pairs
  have routes. Both directions were evaluated separately.
- There are 213 source-node study junctions and 68 visual crossings without a
  common source node. Crossings never create routing edges.
- The 257 stratified directed approach samples include **24 inaccessible
  approaches**. Exact IDs and reachability are recorded in the audit; these
  are available-graph gaps, not proof of physical road disconnection.
- All 22 City ART/PWY/MAJ corridor names intersecting the historical Zone 1
  study/border area have matching source geometry. This does not verify
  legislative road designations or every segment's completeness.
- Source OSM one-way and supported node-via rules are enforced. The existing
  conservative policy excludes approaches/via ways affected by **232
  unsupported restrictions**. Missing rules and traffic controls remain
  uncertain, so every successful matrix cell is labeled accordingly.
- Replaying the cached personal-corridor import was executed and made no
  changes to the dataset or its original provenance report.

The full Zone 1 buffered bounding box was retrieved in 64 tiles, plus 85
bounded tiles around the personal targets. This is not full-city or verified
end-to-end coverage. Sources, hashes, classifications, versions, licensing
and boundary uncertainty are detailed in
[personalized-geography.md](personalized-geography.md).

## Executed software checks

- `npm test`: **73 passed**, zero failed/skipped.
- `npm run build`: **passed**, including TypeScript validation and the production
  `/fremontStreets/` base path. Existing large vendor chunk advisories remain.
- `npm run test:e2e`: **10 passed** in 4.5 minutes, zero failed/skipped.
- `npm run test:production`: **10 passed** in 5.8 minutes, zero failed/skipped.

The static production browser completed road-to-road (Stevenson to Paseo Padre),
return-to-headquarters, source-junction and no-GPS exercises using keyboard and
turn controls. It also verified random target readiness, wrong-turn recovery
without a reset, camera-state preservation, quizzes, local progress restoration,
100 mph settings, and Zone 1 target/quiz filtering. The development suite
completed a general navigation challenge and exercised the boundary editor.
The production artifact audit checked every shipped runtime file by SHA-256,
its MIME type and the Pages subdirectory, and rejected external gameplay
dependencies.

The tests measure acceleration and braking, integration across short source
edges at 100 mph, queued turns, source-node connectivity, supported restrictions,
freeway ramp access, camera/state invariants, aliases, progress and malformed
storage, representative routes, boundary-spanning connectivity and preservation.
They do not establish complete real-world traffic legality.

## Problems found and corrected

- A nearest-edge departure heuristic selected a mutually reachable Stevenson
  segment whose default straight movement ended at a nearby conservative graph
  gap. The reviewed westbound source edge now has a tested continuous departure
  through multiple real intersections. No missing road was fabricated.
- Starting exactly at a branching node left no usable time to queue the first
  turn. The departure now leaves a real 20 m approach on its source edge.
- Copying the expanded graph repeatedly through browser automation caused
  boundary-invariant tests to time out. The test now compares SHA-256 digests
  of the complete graph computed inside the browser.
- Production asset comparisons now use SHA-256 rather than expensive Buffer
  mismatch formatting, preserving byte-for-byte verification. The static
  test server allows enough keep-alive time for the larger real dataset.
- Zone 1 exercises initially selected a corridor's global representative.
  They now use separately audited interior Zone 1 locations, including random
  targets and quizzes.
- Runtime JSON requests carry a build-time content fingerprint, preventing a
  new JavaScript release from reusing stale, unversioned Pages data caches.

## Run and publish

Use Node 22.12+ (validated with Node 24):

```sh
npm ci
npm run dev
```

Choose **Zone 1 — Main Roads** for focused practice, or **My Street List — 38
Entries** for all personal targets. W/up accelerates, S/down brakes, A/left
and D/right queue turns, C switches cameras, and Space pauses. Settings
controls guidance, acceleration profile, corner assist and vehicle capability.

GitHub Pages publishes only the tested static artifact. No private service,
API key or Vite server is required by the production game. The existing
workflow runs all suites before deployment. A source/production credential
pattern scan found no matching credentials; the static browser audit also
checks that gameplay makes no external service requests.

Publication requires a successful **Test and build** job, a successful
**Deploy GitHub Pages** job and a visit to the deployed game. Check the
[workflow runs](https://github.com/MikeyNavarro/fremontStreets/actions) for the
revision being inspected. The target is
<https://mikeynavarro.github.io/fremontStreets/>; the URL by itself does not prove
that a particular revision was deployed.

## Highest-priority remaining work

Investigate the 24 inaccessible sampled approaches and implement fully tested
history-dependent/conditional restrictions before expanding legal-movement
claims. Verify current patrol-boundary adoption and current on-street rules.
Extend verified end-to-end corridor coverage without replacing existing source
objects. Improve schematic driver-view readability while keeping geometry and
rendering claims separate.
