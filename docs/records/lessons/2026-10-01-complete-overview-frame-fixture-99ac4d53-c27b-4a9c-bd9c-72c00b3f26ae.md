---
id: 99ac4d53-c27b-4a9c-bd9c-72c00b3f26ae
date: 2026-10-01
kind: mistake
status: reported
harness_area: render-fixtures
---
**Observed**: the standalone overview fixture passed runtime tests but `pnpm typecheck` rejected its `LibraryGraphFrame` assertion because required label and ink fields were missing. Giving the fixture a full `LibraryGraphFrame` annotation and complete ink values made typecheck pass.
**Cost**: one focused-check round stopped at typecheck; elapsed recovery cost unknown.
**Suspected cause**: a partial fixture cast checked only the branch under test and concealed missing interface fields until the full compiler ran.
**Proposed change**: none; annotate rendering fixtures with their full frame interface instead of asserting a partial object into it.
