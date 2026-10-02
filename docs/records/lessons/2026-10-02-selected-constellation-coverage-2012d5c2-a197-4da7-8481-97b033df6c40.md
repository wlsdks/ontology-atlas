---
id: 2012d5c2-a197-4da7-8481-97b033df6c40
date: 2026-10-02
kind: gate-gap
status: reported
harness_area: frontend-testing
---
**Observed**: The existing SavedConstellationsControl test helper always passed selectedSlug:null, so creating a saved scope from an actual selected map concept never exercised its conditional findLast call. Feature-absence tests for normal and duplicate map IDs raised two TypeErrors from openEditor. A backward loop restored both real creation/save cases; the whole8case suite passes while preserving last-match UID and empty-selection behavior. No older installed OS was exercised.
**Cost**: Two expected regression RED cases waited for the missing editor, about30.5seconds; no CI round.
**Suspected cause**: The convenience helper fixed a meaningful input to its empty default, leaving the ordinary selected-concept path outside the test inventory.
**Proposed change**: none. Exercise nonempty selection whenever creation defaults depend on it; verify the resulting saved UID through the actual component rather than only parsing a selector expression.
