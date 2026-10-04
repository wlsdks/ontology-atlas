---
id: 9315092f-5199-469c-ba29-4979dbe07100
date: 2026-10-04
kind: process
status: reported
harness_area: memory
---
**Observed**: The static folder-release barrier reported handles1001→2002, arrays26→33 and maps24→27. An opaque history-state token and dock lifetime changes did not establish the cause. A heap snapshot plus live closure source identified cached graph-stats callback `e=>g({key:eR,...e})` retaining a vault render context. A module-bound dispatcher reduced the same barrier to handles1001→1001 and arrays26→26; maps24→25 still failed. Generalizing the partial-alias finder to full alias maps then identified a cached drawn-count wrapper retaining a renderer context containing an older navigation callback/node index. Its narrow dispatcher is under the unchanged regression barrier now.
**Cost**: Several production builds and failed static probes; total elapsed recovery cost unknown. No threshold was relaxed and no native memory proof is claimed.
**Suspected cause**: Cached closures sharing a render lexical context retain unrelated folder data. Constructor names in the heap snapshot differ for native wrappers, and the earlier parser ignored full alias maps.
**Proposed change**: none — obtain actual retaining paths and live function sources before changing owners; keep exact snapshot selectors and unchanged RED/GREEN barriers. Do not infer a cause from a hook that recently changed or from a shortest root path alone.
