---
id: 156f5a7e-d71d-4ead-82ba-ce401e671b4b
date: 2026-09-30
kind: process
status: reported
harness_area: performance
---
**Observed**: The first bounded-prefix implementation selected the correct 201 paths but regressed a reverse-ordered 100,000-source fixture: approximately 32ms versus 5.4ms for full sorting. Natural and shuffled fixtures had improved. Sampling tied paths and choosing the traversal direction while preserving original indices reduced the reverse case to approximately 2.1ms. Evidence: `source-search-prefix-results.jsonl` and `source-search-prefix-final.jsonl` under `/Users/jinan/scratch/atlas-scale-100k/`.
**Cost**: One benchmark revision; elapsed investigation time was not measured separately.
**Suspected cause**: Descending inputs repeatedly replaced the bounded heap root, while the original sort benefited from existing runs.
**Proposed change**: none; benchmark natural, shuffled, reverse and collation-tied inputs before qualifying partial selection. Keep stable ties and the extra cap-detection entry in differential tests.
