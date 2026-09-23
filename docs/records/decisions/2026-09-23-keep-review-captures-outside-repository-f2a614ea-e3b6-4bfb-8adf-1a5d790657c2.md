---
id: f2a614ea-e3b6-4bfb-8adf-1a5d790657c2
date: 2026-09-23
---
## 2026-09-23 — Keep review captures outside the repository

**Why**: The owner explicitly asked that work screenshots and other captured images not be placed or committed in the project, including older captures already present.
**Prior**: Overturns the image-first README choice in `docs/DECISIONS.md` (2026-08-03, “README proves the real screen first”) and its same-day full-frame capture decision. Retains the local-first product explanation and the requirement to observe rendered work.
**Decision**: Remove tracked documentation screenshots, review captures, benchmark stills, and prototype shots; keep their written findings and check current links. Store future visual verification outside the repository and do not force-add ignored capture files. Runtime icons and brand assets remain a separate product dependency until the owner resolves their scope.
**Dissent**: Screenshots helped first-time readers recognize the installed app and gave reviewers convenient before-and-after context. Removing them weakens visual proof in the public README and historical audit pages.
**Falsifier**: Reopen the presentation if a fresh reader cannot identify Atlas's installed-app workflow from the text and live demo, or a reviewer cannot assess a rendered change from externally retained proof. Restore useful evidence by a method the owner authorizes, not by silently recommitting captures.
**Owner**: Repository owner (stark), explicit 2026-09-23 instruction.
