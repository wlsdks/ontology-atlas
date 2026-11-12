---
id: 3d193088-11c0-4581-8a3c-b4d0047c9a19
date: 2026-11-12
---
## 2026-11-12 — Every agent dock reopens the folder's latest conversation

**Why**: owner, 2026-11-12 (in Korean): talking with the agent on the map, going elsewhere and coming back, the conversation is cut off and gone. Leaving a screen unmounts its dock, the session hook stops the adapter, and the map, insights and architecture docks then opened `session/new`; only the Library and project docks asked for the latest.
**Prior**: widens 2026-09-08 "Closing the Library dock puts the conversation away; reopening resumes the latest", which scoped `resumeLatest` to the Library and left the map "measured separately". Keeps its failure rule (every failure lands on a new conversation) and that *New conversation* turns the resume off for that panel.
**Decision**: the map, insights and architecture docks pass `resumeLatest`, so one folder has one conversation that follows the person across screens, in the `updatedAt` order the history door draws. A contract refuses a dock that mounts the chat panel without it.
**Dissent**: a turn still running when the person leaves the screen is stopped with the adapter; the transcript returns, the unfinished answer does not. A conversation begun in the Library reopens on the map under the map's prompt. Keeping one session alive above the routes would close both and is a larger change.
**Falsifier**: a person returns to a screen and finds a conversation they did not expect and cannot leave with *New conversation*; or an adapter's `session/load` replays slowly enough that opening the dock feels stuck.
**Owner**: Stark
