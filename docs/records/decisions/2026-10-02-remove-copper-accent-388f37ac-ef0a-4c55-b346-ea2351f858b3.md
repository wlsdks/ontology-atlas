---
id: 388f37ac-ef0a-4c55-b346-ea2351f858b3
date: 2026-10-02
---
## 2026-10-02 — Remove the copper accent; indigo is the only app accent

**Why**: the owner decided on 2026-10-02 that the copper alternate ("ember", `#c14a24`) leaves the design. A second accent doubled the palette every token change had to cover and offered a choice the owner no longer wants to carry.
**Prior**: overturns the part of 2026-08-18 decision 79 ("Revert the app accent to indigo, not via a default constant but by swapping two palettes") that kept ember selectable in Settings; its indigo default stands. Decision 69 (ember as the accent) stays overturned.
**Decision**: delete the ember palette block, the accent picker row in Settings and its messages, the accent store in `appearance-preferences.ts`, and the accent half of the pre-paint boot script. A stored `ontology-atlas:accent:v1` value of any kind is no longer read, so a person who chose copper opens on indigo with no notice.
**Dissent**: a person who chose copper loses that choice silently; the stored key stays in their browser storage, unread.
**Falsifier**: if, within one release after this lands, a user report or the owner asks for a non-indigo accent again, reopen a second palette as a decision rather than restoring this one by revert.
**Owner**: Stark
