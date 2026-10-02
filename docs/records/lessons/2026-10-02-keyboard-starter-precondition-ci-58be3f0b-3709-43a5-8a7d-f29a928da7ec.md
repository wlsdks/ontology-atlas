---
id: 58be3f0b-3709-43a5-8a7d-f29a928da7ec
date: 2026-10-02
kind: mistake
status: reported
harness_area: frontend-testing
---
**Observed**: Retry train2258 ejected PR2256 when keyboard-path.spec.ts failed3 attempts before trusted keyboard input: INDEX rows were absent or detached. All CI failure snapshots showed FirstRunStarter. Read-only diagnosis reproduced the row detaching because a one-shot dismiss.isVisible check ran before restoration settled, then the exclusive starter mounted. Seeding the existing session dismissal key before navigation and removing that visibility race passed3 scratch Enter/Escape repetitions with the same assertions. Runtime keyboard/starter behavior and timeouts are unchanged.
**Cost**: A second failed CI train; one exact RED reproduction and3 corrected scratch repetitions. No native proof or broad suite ran during diagnosis.
**Suspected cause**: The keyboard scenario required an already-dismissed starter but encoded that precondition as a race against asynchronous restoration. guides=off covers the tour, not the starter.
**Proposed change**: none. Establish a returning-user storage precondition before navigation when testing unrelated keyboard behavior; keep the starter's own appearance/dismissal coverage separate. Do not skip trusted-input assertions or increase their timeout to mask a missing surface.
