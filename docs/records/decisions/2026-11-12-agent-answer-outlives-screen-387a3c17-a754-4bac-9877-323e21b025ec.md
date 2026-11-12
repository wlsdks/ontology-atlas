---
id: 387a3c17-a754-4bac-9877-323e21b025ec
date: 2026-11-12
---
## 2026-11-12 — An answer being written outlives the screen it was asked on

**Why**: owner, 2026-11-12 (in Korean): yes, keep the agent working when the person moves to another screen mid-answer; use must be seamless. Leaving a page unmounted its chat panel and the session cleanup stopped the adapter, so the answer in flight died.
**Prior**: closes the dissent of 2026-11-12 "Every agent dock reopens the folder's latest conversation" (3d193088). Keeps 2026-09-08 (resume the latest) and 2026-09-28 (a put-away conversation stops after ten idle minutes), which now also covers a kept panel once its answer ends.
**Decision**: one keeper in the locale layout renders each chat panel through a portal into a node the dock seats. A panel answering or waiting on a permission is parked hidden when its screen is left, without the callbacks that could move a screen, and seated again on return with the tool it was asked with; a panel at rest is dropped. Opening the agent elsewhere for the same folder ends a kept panel first, so two adapters never hold one conversation. Each kept panel has its own error boundary; the keeper clears its store on unmount. Kept on the map, project page, Analysis and Structure. Not kept: the Library, whose page judges the finished turn against the folder and writes `wiki/log.md`, and a gray-area investigation, whose basis lives in the page.
**Dissent**: nothing shows the agent working or waiting while away; a write receipt for a turn ending while away reaches no review surface; a kept panel waiting on a permission has no time ceiling; the Library and investigations still lose the answer. A rail mark for "working" and "waiting on you" would close the first and bound the third.
**Falsifier**: a person returns to an answer that stopped although they opened no other agent; a kept panel moves the map or route while the person is elsewhere; or two adapters run for one folder.
**Owner**: Stark
