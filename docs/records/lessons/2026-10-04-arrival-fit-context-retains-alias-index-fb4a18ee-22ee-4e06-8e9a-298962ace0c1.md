---
id: fb4a18ee-22ee-4e06-8e9a-298962ace0c1
date: 2026-10-04
kind: gate-gap
status: reported
harness_area: e2e
---
**Observed**: recovery PR #2463 was ejected by `vault-switch-release.spec.ts`: large Maps increased 24 to 25 after two folder switches while file handles stayed 1001 and large arrays stayed 24. Exact base `112028bbd` reproduced twice at CPU 4x with partial arrival; recovery head `91818c485` passed once under the same forced branch. Heap retainers identified a 1026-entry slug/id alias Map from an obsolete partial projection of the current third folder, not an earlier whole folder. Canvas keyboard/fit callbacks retained an old `useTopologyLoop` argument object through lexical contexts; two escaping effects still referenced raw `args`.

**Cost**: one failed CI round and two exported control builds; total triage time unknown.

**Suspected cause**: production inlining and shared closure contexts made incidental render arguments survive with long-lived fit callbacks. The older time-gated-arrival coverage gap recurred; prior lesson `43964ed7-3c2f-4327-bd76-48c5969bc37c` describes a different retained-array signature.

**Proposed change**: script and gate — destructure the two fields used by escaping effects so those effects do not retain raw arguments. Preserve the heap census threshold; force CPU 4x and assert observed partial arrival for the initial folder and every switch before claiming release. Capture the exact retained object and root path; do not equate an obsolete current-folder projection with a retained whole previous folder or relax a count to hide it.
