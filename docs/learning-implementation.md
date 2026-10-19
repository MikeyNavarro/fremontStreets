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
recognition, map-location selection and current-location recall are implemented.
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
Actual practice completions are recorded separately from eligible mastery evidence.

Phase 5: mastery calculations and the exam eligibility/scoring engine are in
place. The requested 20-task composition and 85% overall / 75% per-category
thresholds are enforced. An interrupted eligible exam retains completed tasks.
The current real dataset cannot supply the required intersection/navigation
scoring evidence, so the full exam is visibly unavailable. No questions or
scores are fabricated to fill those categories. Higher mastery levels disclose
this limitation. Positive scoring tests use explicitly synthetic evidence and
are software validation, not real-world verification.

## Validation at this checkpoint

88 Node tests passed, including existing geography, real driving, acceleration,
camera and graph tests plus new evidence, mastery, review and exam-rule tests.
TypeScript and the Vite production build passed. Five focused browser cases
passed: manual exploration lifecycle; search/inspection; two unaided recognition
answers plus an assisted answer, reload and backup import/export; evidence-gap
handling with an outside-Zone-1 manual selection; and a no-GPS mission completed
using real driving controls. Full existing regressions and deployment verification
remain separate final gates.

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
