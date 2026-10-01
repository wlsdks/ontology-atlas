---
id: 96d720ff-0a89-4547-a997-a0115a8eb16e
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: performance
---
**Observed**: Initial batch-warning scoping resolved each UID before the row read and then resolved it again, both over the full document array. The 100,000-document/50-UID Node probe regressed from 3,853.1 to 4,371.2 ms. Building request-local matching-document lists for the requested UIDs, while retaining the existing resolver, removed repeated full-inventory scans. A later pair measured 3,671.0 versus 3,139.7 ms; outputs were deeply equal. The operation-count regression covers 50 ordered UID rows, and lineage cases cover self/duplicate merged claims and primary precedence.
**Cost**: One discarded resolution strategy and additional physical-fixture comparisons; separate engineering time unmeasured.
**Suspected cause**: Planning narrowed diagnostic output but duplicated a linear identity lookup per requested row.
**Proposed change**: none; measure planning plus execution together, preserve the original UID resolver's ambiguity contract, and keep request-local indexes separate from persistent source caches.
