# Stevenson deployment timeout investigation

The failed build was GitHub Actions run 39206755017, job 117911163765. Nine
browser tests passed; the initial startup test exceeded its unchanged 45-second
budget. No trace artifact was retained by that workflow, so the exact remote
instruction cannot be reconstructed. This is a documented diagnostic limit.

Reproducing the same test locally passed in 33.5 seconds. Instrumenting the
same browser path measured DOM load at 540 ms, game readiness at 3,850 ms,
menu closed at 5,268 ms, and map readiness by 28,831 ms. Returning the full
84,825-node / 166,282-edge graph transferred 41,264,154 serialized bytes and
consumed approximately 23 seconds through the Playwright protocol. The graph
counts are the only graph facts the startup test needs.

The correction evaluates those same counts inside the browser and transfers
only two numbers. All location, zone, controls, canvas and renderer-readiness
assertions remain; neither the timeout nor expected behavior changed. The
corrected test passed in 7.2 seconds. Failure traces and screenshots are now
uploaded by CI, so future failures retain actionable evidence. Full CI and
public deployment verification are separate gates; this local result alone
does not establish that the Stevenson fix is published.
