---
id: 5b677261-df2d-47d7-b5eb-31ea0c9e39da
date: 2026-09-26
lesson: cb5fbfaf-2154-4049-973f-57c57f208844
status: reported
parents: 4255f1dd-c2b1-4cdc-993d-f228667e134d
---
**Evidence**: the settle fix (#1911) did not change the numbers. Train #1914 failed the same line 3/3 with the same `Expected: 919, Received: 845` after the spec already waited for the card's animations, a still card box and a still map. A fixed sleep was not the cause; the verified mechanism (camera framing read mid-flight) was wrong.
