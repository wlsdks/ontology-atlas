---
id: 16b8b9c9-4fd1-4e36-9943-f44b0a8550be
date: 2026-10-02
kind: gate-gap
status: reported
harness_area: provider
---
**Observed**: Existing provider fixtures passed while parseResponse('null') threw in OpenAI, Anthropic and Gemini, and Anthropic content:[null] threw while reading block.type. The local adapter delegates to OpenAI. Added boundary/loop cases produced 36 failures with 47 existing passes; after structural validation, all 83 passed and the real-loop hook test preserved the diagnosis and accepted the next send.
**Cost**: One targeted RED/GREEN cycle and a bounded response-shape probe; elapsed investigation cost unknown. No live model requests were sent.
**Suspected cause**: JSON.parse proves syntax only. TypeScript casts described nested provider fields without validating nulls, arrays or block members. The outer hook's generic catch masked the missing normalized-error path.
**Proposed change**: gate. Keep malformed root/block tables beside valid provider fixtures, including an executable prefix followed by invalid content. Require a bounded diagnostic, no raw-body echo and no tool execution for the rejected response; preserve valid raw assistant blocks and the subsequent-send path.
