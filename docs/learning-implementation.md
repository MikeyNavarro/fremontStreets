# Street-learning implementation checkpoint

## Completed milestones

Phase 0: corrected the startup-test protocol bottleneck without increasing its
45-second timeout or deleting assertions. The corrected local test took 7.2 s;
the original took 33.5 s. GitHub retains failure traces going forward. See
startup-timeout.md; the failed historic remote job did not retain a trace, so
its exact stopped instruction cannot be reconstructed.

Cached independent City centerlines and OSM segments were compared without new
network downloads or modifying roads. All 38 entries retain their exact IDs,
labels and mappings. The registry records identity, geometry, topology and
maneuvers separately. 12,279 directed segments qualify for recognition under
the documented 15 m / 10 m sampling policy. Eighteen entries have corroboration
for all imported segments; this does not establish entire real-world corridor
coverage. See learning-accuracy.md for each entry and all limitations.

Phase 1: one authoritative Follow/Explore controller. Manual dragging cancels
follow animation. Driving arrows no longer also pan MapLibre. Only Center on
Vehicle restores Follow, preserving zoom. Reset, zone and mission changes
preserve Explore. Driver switching retains overhead pose. Search and inspection
use actual source-connected sections; no proximity-based joining. Road-aligned
labels, visibility controls and source-ID inspection are available.

Phases 2–3: a native training dashboard extends the existing shell. Zone 1
recommendations, all 38 selectable entries, sourced Study Mode, highlighted-road
recognition, map-location selection, current-location recall, and direction
comparisons between specific corroborated points are implemented.
A single assistance policy hides map labels, HUD road names, route instructions,
search, tooltips/markers and announcements while recall is active. Driving
pauses for an answer. Hints are recorded and excluded from unaided evidence.
IndexedDB records versioned attempts; legacy visits remain exploration history.
JSON export/import merges records and rejects incompatible curricula/conflicting
attempt IDs. Recognition requires two different unaided question IDs. Review
intervals are 1/3/7/14 days, shortened after demonstrated errors. Overdue dates
alone never remove earned levels.

Phase 4: HQ-start navigation and no-GPS missions accept any corroborated target
segment reachable through the supported graph. Return practice uses the same
physical HQ road segment and a 25 m tolerance. Wrong turns recalculate connected
routes without teleporting. Missions are pinned to geographic evidence versions.
Two-stop patrols preserve the actual vehicle between legs, and the first checkpoint
pauses until the player continues. Actual practice completions are recorded
separately from eligible mastery evidence.

Phase 5: mastery calculations and the exam eligibility/scoring engine are in
place. The requested 20-task composition and 85% overall / 75% per-category
thresholds are enforced. An interrupted eligible exam retains completed tasks.
The current real dataset cannot supply the required intersection/navigation
scoring evidence, so the full exam is visibly unavailable. No questions or
scores are fabricated to fill those categories. Higher mastery levels disclose
this limitation. Positive scoring tests use explicitly synthetic evidence and
are software validation, not real-world verification.

## Validation at this checkpoint

94 Node tests passed, including existing geography, real driving, acceleration,
camera and graph tests plus new evidence, mastery, review and exam-rule tests.
TypeScript and the Vite production build passed. Eight focused browser cases
passed: manual exploration lifecycle; search/inspection; two unaided recognition
answers plus an assisted answer, reload and backup import/export; evidence-gap
handling with an outside-Zone-1 manual selection; and a no-GPS mission completed
using real driving controls; a source-point direction and actual map-click task;
and a two-stop patrol driven through both legs without teleporting. Browser storage denial was also exercised: blocked localStorage keeps IndexedDB history usable, and blocking both stores preserves driving and session backup export.

The full development regression suite passed all 17 cases before the additional
storage-failure case. The full production suite and final-revision CI remain
separate release gates; their results must be checked before claiming publication.

## Operating the learning system

Open **Learn** or **Street-learning Dashboard** from the main menu. Continue
Training recommends a few Zone 1 targets; the selector permanently includes all
38 entries. Study first, then identify the highlighted road or find it by clicking
the map. Open Explore streets to search, inspect source IDs, and toggle labels.
Use Center on Vehicle whenever you wish to follow the car again.

Export progress JSON periodically. Import merges rather than replacing history.
Storage failures are visible and session data remains available for export.
No account, API key, backend or private environment service is required.

## Geographic work still required

Independent evidence of real junction grade, access, and individual permitted
movements is missing. The 219 OSM source-junction records remain unresolved for
strict scores. All routing continues enforcing supported source restrictions,
but missing rules are not deemed verified. City centerlines are not legal-turn
records. The 232 unsupported OSM restriction records, unmatched geometry, bounded
coverage, approximate historical patrol boundaries and approximate public-road
HQ access remain disclosed. The old connection quiz is an unscored source-record
inspection; its historic counters are preserved but not promoted to mastery.

## Deployment and final validation ledger

The Stevenson baseline at 59e5485 deployed through successful GitHub Actions run
39212252884. Its CI executed 77 Node, 10 development-browser and 18 production-
browser tests. Public browser verification confirmed HTTP 200, all six restored
Stevenson ways and three repaired shared-node continuations, 166,282 graph edges,
real driving, an active source route, both renderers, unchanged camera state,
QUICK/100 mph, 38 entries, and zero failed requests. That baseline is independently
published; publication of the newer learning release requires its own workflow.

During development, one broad dev-server run was interrupted by a source-edit
reload; its navigation assertion reported a destroyed execution context. It is
not counted as a passing regression run. Final suites run against frozen source
and the built Pages artifact. No assertion timeout was increased to hide this.
The job-level budget is 35 minutes because the prior complete CI took about 19
minutes and seven new learning cases now execute in both dev and production.

Additional fixes: road selection measures distance to actual rendered/source
segments instead of choosing the first hit or nearest endpoint. Overlapping roads
and uncorroborated clicks are not graded. Direction questions cannot substitute
for the two required street-identification/location successes. Scored navigation
also requires explicit evidence for every actual incoming/outgoing movement; the
absence of a restriction never supplies that evidence. Backup imports preserve
legacy exploration/routes using conservative maxima and union, without turning
old aggregates into scored attempts. Attempt IDs are immutable in transactional
storage, including cross-tab conflicts. Driving settings persist separately.

A reproducible browser-policy failure was corrected: reading the localStorage
property could throw before the existing guarded load/save functions ran. A lazy
storage adapter now moves that access inside their guards. Legacy storage failure
no longer closes a working IndexedDB connection. The browser test confirms both
independent-storage persistence and session-only export/continued driving. Its
initial harness raced the asynchronously opened startup menu; it now waits for
the visible startup dialog before closing it, with no application timeout increase.

## Release regression investigation

The first full production run executed 25 cases: 23 passed and two failed. The
learning evidence-gap case encountered the same startup-menu race described
above; the current harness waits for the actual visible menu before closing it.
The long road-to-road test exhausted its original route-based budget while
several independent software-rendered browser checks were also running. Its
trace contained 2,134 state samples and 60 segment transitions: every sampled
edge remained on the intended 2,183 m route, with 1,903 m traveled at expiration.
There was no sampled off-route edge or disconnected jump. The application caps
catch-up after long frames; concurrent software rendering can slow simulated
travel relative to wall time.

The identical route/HQ-return/source-junction test then passed in 6.7 minutes
with competing browser jobs stopped. No controls, simulation speed, assertions,
route geometry, or timeout were changed. Run these real-time browser suites
serially on software-rendered hosts. A clean full 26-case production rerun and
final GitHub Actions remain required; an isolated passing retry alone is not a
full release result. Workflow 39219293619 was deliberately canceled during this
investigation, before deployment. Check the subsequent final workflow and live
site for publication status.

Recognition question identity is based on the actual task, not incidental routing
representatives. Repeating “find this street” counts as the same question, and
forward/reverse edges of the same physical segment cannot satisfy the two-distinct-
question requirement. Existing history is interpreted with the same conservative
rule. A focused regression covers both cases; a real map-click browser check
confirms that repeating the location prompt retains its question identity. The
release workflow was paused again while this scoring correction was verified.

A second full production run then reached the road-to-road destination but hit
the combined 480-second budget during the HQ return. Its 3,297 snapshots again
contained no off-route edges. The existing renderer benchmark recorded about
6.9 overhead FPS at default resolution and 8.6 FPS with the actual Efficient
setting on this SwiftShader host. This establishes that serial execution alone
is not sufficient to stabilize real-time tests on this software renderer.
Long route regressions now select the game's existing Efficient graphics option
through Settings, alongside their existing 35 mph training cap. Routes, driving
inputs, arrival checks, simulation behavior and timeouts are unchanged. Other
browser cases still exercise default graphics and both camera views. The next
full production result is required before claiming this release passes.

The second full run finished with 24/26 passing; its other failure was the same
menu race in an older Zone 1 test. The underlying readiness contract is now
corrected: `__FREMONT_GAME__` is exposed only after asynchronous learning storage
initialization and the initial menu/editor have finished opening. Tests no longer
observe a half-initialized application before deciding which menu control to use.
The long-route helper also verifies that Efficient rendering really took effect.

Backup chronology correction: importing older unique attempts no longer moves the
most-recent practice display backwards. Histories are sorted for calculation;
original stored attempt order/records remain intact. A focused progress regression
and TypeScript checks passed. The complete final suite now contains 95 Node cases;
its final CI result remains the release authority.

The subsequent CI run 39223851654 passed all 95 Node cases, all 18 development
browser cases, and 25/26 production cases; deployment was correctly skipped.
Its remaining failure exposed an intermittent native drag cancellation. In the
installed MapLibre implementation, `easeTo` resets gesture handlers. A follow
update could therefore reset a mouse press before `dragstart`; calling `stop()`
inside `dragstart` could also cancel the newly established gesture.

The camera now suspends follow updates from the first map-canvas/marker pointer-down,
cancels the existing animation before MapLibre starts handling that press, and
keeps native drag/rotation/pitch handlers alive when entering Explore. Multiple
pointers retain the interaction lock until all are released. Wheel zoom also
suspends follow updates without changing Follow/Explore mode. Its pending first
event is protected before MapLibre finishes distinguishing wheel/trackpad input;
`isZooming()` alone was insufficient, as the expanded browser regression exposed. Cleanup handles
pointer cancellation, window blur and view disposal. The browser regression
holds the mouse down across several follow ticks and requires both Explore mode
and actual map movement, then checks driving, zoom, camera return, reset,
mission and zone changes, including a drag originating on the vehicle marker. The unit suite now contains 96 cases. Publication
still requires the final complete CI run and live verification.
