---
id: 19a34773-2f9e-45c5-8dba-adc6be7a947d
date: 2026-10-02
kind: gate-gap
status: reported
harness_area: rendered-verification
---
**Observed**: Train #2385 failed the folder chooser scroll probe after game removal freed vertical space. Five short recent-folder names no longer overflowed, although all reachability and fixed-page checks passed. The same train exposed a new download figure surface combination already landed by #2376.

**Cost**: One failed combined CI train and automatic split; the first failing run lasted over 12 minutes. Additional repair time is unknown.

**Suspected cause**: First-run retirement changed the stress fixture conditions; the focused advisor did not include the chooser layout probe for that source delta. The diagram used a canvas fill on a bordered panel.

**Proposed change**: gate, consider routing FirstRunPage changes to folder-chooser-layout. Preserve the real overflow guard and use five valid long names under the filesystem name limit. Reuse the existing panel token for frames and retain canvas paint on the inner scene host.
