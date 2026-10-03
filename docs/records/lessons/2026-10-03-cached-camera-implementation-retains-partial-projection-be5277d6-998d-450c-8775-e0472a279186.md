---
id: be5277d6-998d-450c-8775-e0472a279186
date: 2026-10-03
kind: tool-efficiency
status: reported
harness_area: e2e
---
**Observed**: Recovery PR #2463 exposed a reproducible existing 24 to 25 large-Map retention under partial folder arrival. Removing raw arguments and isolating the verification event shifted the heap retainer to another component binding and still failed. Fresh heap proof traced a DPR MediaQueryList listener through reframeViewportRef to a memoized camera implementation minted during partial projection. An effect-event getter returned that same cached function.

**Cost**: One failed CI round and several candidate export builds; aggregate time and tokens unknown.

**Suspected cause**: A stable callback cache can outlive the render data it indirectly retains through production-inlined lexical contexts. A getter that reads a cached function does not refresh the function implementation.

**Proposed change**: none — make the actual camera bodies effect-event implementations, preserve fit/debt semantics, prove the original heap threshold with observed partial arrival and nonzero counts, and remove unsuccessful binding-only attempts. Consult fresh object retainers before changing another incidental binding. This replaces the insufficient proposed repair in fb4a18ee-22ee-4e06-8e9a-298962ace0c1.
