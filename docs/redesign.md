# Driving-first visual redesign

This extends the committed 38-entry game at `e4236d0`; it does not replace the
application, geographic imports, routing or simulation. The working tree was
clean before redesign work. The visual release has its own commit boundary.

## Screens and interaction

The old permanent three-column dashboard is removed from the driving screen.
At 1920×1080 the map/driver container is 1920×1012, about **93.7%** of the browser
viewport. At 1280×800 it is 1280×732, about **91.5%**. Driving does not scroll the
page. Settings and learning panels scroll independently when needed.

The main menu includes Continue Driving, the exact 38-entry curriculum, the
Zone 1 shortcut, Free Drive, Navigation Challenges, Patrol Zones, Learning
Progress, Settings, Practice Routes and street-name practice. All are connected
to existing functionality. Continue resumes the current in-memory drive; a
fresh page load still starts stopped at the headquarters public-road departure.

Secondary controls live in a native modal dialog. A visible close button,
Escape, explicit Tab/Shift-Tab cycling and focus restoration support keyboard
use. Opening a panel suspends simulation stepping and releases held inputs;
it preserves the vehicle, queued turn, route, camera, paused flag and progress.
Closing resumes that same drive. Changing a mode or explicitly starting/resetting
an exercise retains the game's existing reset semantics.

The floating HUD shows the sourced street, selected destination, speed, known
road limit (unknown remains `?`), queued/available turns, guidance and camera.
Progress counters and source/debug details are off the driving screen. Status
messages appear briefly; panel-specific messages stay inside the active dialog.

The study drawer retains all 21 east–west and 17 north–south original entries,
source readiness/ambiguity handling, headquarters starts, route previews,
road-to-road/intersection/no-GPS/return exercises and quizzes. Preview dismisses
the drawer so the actual destination is visible on the map. Starting a driving
exercise closes the panel. The Destinations button reopens it without resetting
an active session.

The separate progress screen uses actual browser-local study records for
encountered entries, guided/unguided arrivals, road-to-road and intersection
exercises, plus the original per-zone exploration/quiz/navigation log. Counts
of practiced locations do not imply whole-road mastery or coverage completion.

## Design system and accessibility

Dark navy/charcoal surfaces, restrained teal accents, source-road category
colors, readable system typography, consistent controls, local SVG icons and
visible keyboard focus replace the municipal-dashboard presentation. No new
UI framework, remote font, icon service or account was added. Fonts use
OS-provided fallbacks; no font binaries are redistributed. Icons are authored
locally for this interface.

Selected design color pairs were checked using WCAG relative luminance:
body text 15.13:1, secondary text 7.65:1, primary-button text 9.45:1, secondary
controls 9.68:1 and map labels against the base 11.5:1. This is a palette check,
not a claim of a complete independent accessibility audit.

Reduced-motion preferences disable interface transitions and map follow/boundary
animation and use direct driver heading presentation. Native form controls keep
keyboard behavior; driving shortcuts are suspended while a dialog/input is active.
Desktop Chrome is the primary target. Existing pointer/touch throttle, brake
and turn controls remain functional, with compact layouts also checked at
1024×768, 800×700 and 390×844.

## MapLibre presentation

The map uses a locally authored dark style and the same bundled source geometry.
Motorways, arterial/through roads, minor streets, target categories and the active
route have distinct line hierarchies. Named through roads have label priority;
label collision checks avoid the vehicle and HUD. The vehicle marker, HQ
reference, destination, turn previews and approximate study-zone overlays are
restyled without changing their coordinates or connectivity.

North-up remains the default. Heading-up, map zoom and follow controls affect
presentation only. ResizeObserver and explicit panel/camera resize notifications
keep MapLibre and Three.js sized correctly. Changes to turn/route overlays now
update only their own sources instead of reuploading unchanged boundary data.

There is **no paid map provider or external style dependency**. The existing
OpenStreetMap attribution/ODbL link remains visible. No private map API key,
remote routing call or gameplay-time geographic import is required.

## Three.js presentation

The driver view shares the same vehicle snapshot and local metric projection.
It adds lit, procedural asphalt surfaces, approximate class-based widths,
subtle edge contrast, a gradient sky, fog, a generic vehicle interior and digital
instruments. Heading interpolation is presentation-only; geographic position,
speed, route and buffered turns remain authoritative in the simulation.

Road geometry is built once into spatial chunks for frustum culling. Shared
materials/textures and cached route/turn meshes avoid rebuilding the network
per frame. Efficient, Balanced and High resolution settings adjust rendering
pixel density; there are no decorative sensitivity or sound controls that do
nothing. Existing QUICK, the 10–100 mph cap, corner assist and guidance controls
remain available with their existing defaults and behavior.

The environment is a **flat schematic**. Road widths, surface appearance, sky,
vehicle interior and framing are visual approximations. Buildings, actual lane
counts/markings, signals, signs, terrain and bridge heights were not invented or
verified. Source graph separation at bridges/underpasses remains unchanged.

## Visual review and refinement

Initial main-menu, overhead, driver, study, progress and settings screenshots
were captured and inspected. Refinements included:

- Fixing a large ground plane occluding nearby road geometry by making it a
  background pass, and drawing the generic cockpit in a separate foreground
  order. Source geometry was not altered.
- Repositioning instruments/framing and moving driver guidance above the road
  so the dashboard does not obscure the navigation instruction.
- Improving major-road label priority and keeping labels away from the car.
- Increasing menu type sizes, reducing panel transparency and preventing stale
  map notifications from showing through newly opened panels.
- Fixing focus escaping at the end of a dialog's tab sequence.

Eight representative final screenshots are captured by the UI browser suite
and published in [the screenshot gallery](screenshots/README.md).

## Executed checks

- `npm test`: 73 passed after the initial renderer/shell implementation.
- `npm run build`: passed, including TypeScript and the Pages base path.
- Focused UI browser pass: six passed after correcting focus and preview-event
  assertions; later refinements are covered by the final complete suites.
- `npm run test:e2e`: **10 passed** in 4.9 minutes. The development-only
  editor passed again after its final dark form/status refinement (one targeted
  browser check).
- `npm run test:production`: **17 passed** in 8.5 minutes, covering the existing
  static/gameplay scenarios plus seven new UI checks. No failed/skipped cases.
  After simplifying the bulk rendering, **nine affected browser checks passed**
  again, including the seven UI cases, both cameras and actual no-GPS driving.

The existing tests still exercise real driving controls and challenge completion.
They were adapted to open the relevant menu/dialog instead of assuming permanent
sidebars. Geographic assertions and driving outcomes were retained. Preview
comparisons check the complete persistent vehicle state; transient per-step
`events` can naturally clear when a suspended drive resumes.

The final suite additionally exercises reduced motion and camera switching with
throttle held. Short software-rendered Chromium frame samples are attached to
that test; they are not proof of a 60 FPS result on ordinary physical hardware.
All eight exported final screenshots were inspected. The complete production
run also completed road-to-road, return-to-headquarters, intersection and no-GPS
exercises, and verified wrong-turn recovery and Zone 1 target filtering.
The initial software-renderer sample was slow: about 4.8 FPS driver / 10.7 FPS
map. Bulk road surfaces were changed to diffuse lighting, the generic ground
uses a background material, and Efficient mode now uses a 0.65 pixel-density
cap. The visible road geometry and lighting cues were retained. The affected
browser scenarios were rechecked after that performance refinement.

[Current raw samples](redesign-performance.json), at 1440×1000 using
Chromium/SwiftShader with reduced motion:

| View | Balanced | Efficient |
|---|---:|---:|
| Driver | 6.3 FPS | 8.3 FPS |
| Overhead | 10.6 FPS | 13.5 FPS |

Each observation uses a one-second warmup followed by two seconds during actual
driving. The warmed sampling check passed separately after the nine affected
checks. These are
short software-rendering samples, not a representative GPU benchmark or a
claimed 60 FPS result. [The earlier sample](redesign-performance-before.json)
is retained for context; scene positions and timing are not a controlled
benchmark. Hardware-accelerated desktop performance remains to be measured.
The software renderer remains a limitation even after the cost reduction.


The pure `src/core/` simulation/routing, all runtime geographic datasets,
38-entry source catalog, station departure and GitHub deployment workflow are
unchanged by this redesign. Existing geographic uncertainties remain documented
in [personalized-geography.md](personalized-geography.md).

## Launch and play

Open <https://mikeynavarro.github.io/fremontStreets/> after a successful deployment
of the inspected revision. Choose **Continue Driving** or **Zone 1 — Main Roads**.
For the full curriculum choose **My Street List — 38 Entries**, select a target
and exercise, then **Start Driving**. Header controls reopen destinations,
zones, progress and settings. **Escape** opens/dismisses the menu.

Controls remain W/up throttle, S/down brake, A/left and D/right queued turns,
C camera and Space pause. Use the dock for straight/turn-around or pointer/touch
driving. Menu → Geography & sources contains the approximate departure and
coverage/boundary limitations.

For local development:

```sh
npm ci
npm run dev
```

The normal Pages workflow tests both browser suites and builds the static game
under `/fremontStreets/` before deploying. Do not infer publication from a commit
or URL alone; verify the workflow and the deployed assets/game.
