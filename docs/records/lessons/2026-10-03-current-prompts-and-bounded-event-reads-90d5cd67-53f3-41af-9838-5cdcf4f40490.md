---
id: 90d5cd67-53f3-41af-9838-5cdcf4f40490
date: 2026-10-03
kind: tool-efficiency
status: reported
harness_area: construction-eval
---
**Observed**: The existing acp-replay extractor stopped with "the function languageName is gone" after answer-language helpers moved. In the same audit, batching complete authority documents emitted 16,348 tokens before truncation, and a planner raw ACP-event search emitted a 35,948-token match payload.
**Cost**: Two setup attempts stopped before model work; recovery and excess-reading time were not measured.
**Suspected cause**: A text extractor assumed helper ownership, while raw event lines contain complete nested outputs that are unsuitable for broad display.
**Proposed change**: script — read current TypeScript declarations and their shared language helpers, fail closed on missing declarations, and summarize parsed event fields and counts before opening bounded source details.
