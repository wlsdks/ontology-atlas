---
id: af74c097-0365-4ebd-8b3e-8a77bdac71e4
date: 2026-10-21
---
## 2026-10-21 — Every rail destination wears one header bar; stages and waits centre on the window

**Why**: The owner, 2026-10-21: placement reads wrong everywhere; content clings to the top with room below, and a wait belongs at the screen's centre. At 1512x900 Agents and Automations put the title at x=348 and the other barred destinations at x=104, a 244px move per rail press; Projects and Git had no bar; empty Agents, Automations and one-project Projects ended by y=505 over a blank floor; a wait under a bar sat 30px below the fallback's centre.
**Prior**: Narrows 93e79cee (2026-10-16): its centred 960 body stands; its accepted dissent, the title jump, is overturned by moving only the bar to the page gutter, which also answers f7097b4c's (2026-10-15) ask for one title position. Keeps f7097b4c's ghost row and arrival, 419e3c34, 1fd40970, c9b54ba8, and 2026-09-06 "An empty Library folder is an empty state". Follows 110 (2026-08-24) in deleting the consumer-free `form` gutter.
**Decision**: Every rail destination but the map draws `PageHeaderBar` on the `page` gutter, Projects and Git included; Agents and Automations keep `PAGE_FRAME_FORM` beneath it. A body holding one stage (an app-only card, an empty lane, at most one project, Git setup) wears `PAGE_STAGE_FILL` and centres on the shell slot; a list starts under the bar. A page wait is `WaitStage` with `PAGE_WAIT_LIFT`, on that same centre. A stage that flips to a list in place glides on `SPRING.surface`.
**Dissent**: At 1512 the Agents and Automations title stands 244px left of its column, as a macOS settings toolbar does. The app's Agents tab stays a list even with one tool: its rows change while read, and a stage would move them under the pointer.
**Falsifier**: The owner names a title apart from its column as wrong; a stage or wait sits over 4px off the slot centre at 1512 or 1920; or saving the first schedule jumps instead of gliding.
**Owner**: Project owner, 2026-10-21 direction to check every screen and apply what it needs; applied by Claude.
