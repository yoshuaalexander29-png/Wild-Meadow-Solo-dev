# WILD MEADOW — Visual QA Status

## Evidence status

This document is a QA status record, not a claim that the current course has passed visual review.

The repository does **not** currently contain the PNG captures previously described as being under `evidence/`. The claimed contact sheet and individual screenshots could not be located on this branch. Therefore, there is no verifiable screenshot evidence in this checkout to support a claim that the current rendered course has been visually inspected.

## What is known

- The TypeScript/Vite production build was reported as successful by the prior AI Studio session.
- The reported course test run had 7 failures out of 12 tests before the latest repairs.
- The test and course source contain browser-canvas dependencies; those can be exercised with headless canvas mocks for logic/lifecycle tests, but that does not verify actual pixels.
- No verified frame-time measurements, mobile device results, or complete playthrough recording are available in the current repository evidence.

## Required visual QA before sign-off

Capture the actual running WebGL game and review these moments at gameplay distance:

1. Start gate and run-up.
2. Fork with both route choices visible.
3. Ramp silhouette and takeoff.
4. Airborne trajectory and landing pad.
5. Safe lower route and recovery after a missed jump.
6. Banked turn and merge seam.
7. Elevated underpass with the player visible and on the correct surface.
8. Scenic reveal and finish.
9. Neutral-white dust over both dark grass and pale ground.

Record browser, operating system, viewport, graphics context and any console errors with the captures. Inspect both desktop and supported touch layouts. Measure performance separately; screenshots cannot prove frame rate or memory stability.

## Sign-off

**Visual quality: not yet verified.** Do not describe the course as visually complete or studio-grade until the captures and gameplay checks above exist and have been reviewed.