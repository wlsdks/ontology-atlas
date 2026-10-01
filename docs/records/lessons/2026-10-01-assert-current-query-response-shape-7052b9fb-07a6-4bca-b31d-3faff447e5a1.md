---
id: 7052b9fb-07a6-4bca-b31d-3faff447e5a1
date: 2026-10-01
kind: process
status: reported
harness_area: performance
---
**Observed**: A scratch RPC probe logged `profile.outgoing`, which is not a field of the `node_profile` response; its undefined value disappeared from JSON output. Inspecting the current query implementation located `profile.edges.outgoing`. The corrected source and bundled probes assert one outgoing unresolved edge rather than only asserting the returned node slug.
**Cost**: One insufficient probe result and one repeated RPC validation batch; separate elapsed time was not measured.
**Suspected cause**: Assuming the response shape from a nearby internal helper instead of reading the actual public operation's DTO.
**Proposed change**: none; assert the current DTO's relevant evidence fields and treat missing logged fields as unperformed proof rather than successful parity.
