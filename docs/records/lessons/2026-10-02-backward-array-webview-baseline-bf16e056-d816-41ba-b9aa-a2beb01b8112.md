---
id: bf16e056-d816-41ba-b9aa-a2beb01b8112
date: 2026-10-02
kind: mistake
status: reported
harness_area: runtime-compatibility
---
**Observed**: A copy-removal edit added unconditional Array.findLastIndex/findLast calls to the ACP panel. The desktop still declares macOS12.0, and the independent review found no supplied polyfill for those methods. The existing modern test runtime passed231 focused cases. A new real-panel feature-absence case then failed at AcpChatPanel.tsx with TypeError before displaying the empty panel. Plain backward loops restored that case to GREEN without changing the supported OS setting. No actual older macOS runtime was exercised.
**Cost**: One review fix round and one genuine regression RED before PR/CI creation; no wasted CI round.
**Suspected cause**: An existing conditional findLast use elsewhere was treated as compatibility evidence for a new unconditional path, while local tests used a modern runtime.
**Proposed change**: none. Check the declared deployment baseline and supplied polyfills before adding newer built-ins to unconditional render paths; prefer a bounded plain loop when support is missing, and prove the feature-absence case in the actual component.
