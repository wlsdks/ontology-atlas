---
id: 0c200719-2428-448f-b238-fee3c60f9dd9
date: 2026-11-15
---
## 2026-11-15 — Moru's gestures are exempt from the five-second ambient bound

**Why**: The curious tilt on dead-end screens (#3234) repeats every 7.2 s for as long as the screen is open, and the motion rule said ambient motion that starts by itself stops within 5 s or sits beside a visible pause. Told of the conflict, the owner answered that a character is not design decoration and that the rule, not the character, was wrong.
**Prior**: Narrows the ambient bound added to "Motion" in `docs/DESIGN-SYSTEM.md` on 2026-10-21 (a documentation commit, no record). `docs/records/decisions/2026-10-20-motion-allowed-broadly-smoothness-first-23161dc5-bc7d-43cd-880e-95f5359f7ea5.md` stands: smoothness, pausing hidden or offscreen, and reduced-motion equivalents still bind Moru. Consistent with `docs/records/decisions/2026-11-13-moru-decorative-play-984fb946-c788-44fd-97ad-eaf66da83091.md`, whose falsifier already names the character stopping permanently after one cycle as a defect.
**Decision**: Moru joins running-work loops as an exemption from the five-second bound. Its gestures may repeat while it is visible. It still pauses when hidden or offscreen and holds one pose under reduced motion, which is its only stop control; no screen adds a pause button for it. The bound stays for every other ambient motion.
**Dissent**: WCAG 2.2.2 asks for a way to pause, stop or hide motion that starts by itself, lasts over five seconds and sits beside other content, and it does not count an operating-system setting as that mechanism. A reader who has not turned on reduced motion and finds the tilt distracting beside recovery text has no control on the page (reviewing agent).
**Falsifier**: A person reports that Moru's repeating gesture distracts them from the text beside it, or an accessibility audit the product must pass fails on 2.2.2 for a Moru placement. Either reopens this with a per-placement repeat limit or a visible pause.
**Owner**: Stark
