---
id: ed9a2fc0-8f76-48c9-abcf-7846c05bd3b4
date: 2026-09-26
kind: mistake
status: reported
harness_area: records
---
**Observed**: while judging the councils (2026-09-27) I read `docs/records/po-runs/*.json` in filename order and reported the last two rows (2026-09-13, 09-14) as the latest, telling the owner PO review had not run since 2026-09-14; sorting by `date` shows 23 reviews through 2026-09-26. The planner caught it before the decision record was written.
**Cost**: one wrong figure in an owner-facing verdict; corrected before any change landed.
**Suspected cause**: record fragments are named by UUID, so filename order is random, and the tail of a directory listing looks like "latest".
**Proposed change**: skill: /harness-retro and the records README already say fragments are UUID-named; add one line to the records README that any "latest" or "since" claim sorts by the `date` field, never by filename.
