---
id: d3ad7753-4c5f-4d25-892d-9b7204f9ff4c
date: 2026-11-24
---
## 2026-11-24 — One press sends request after request to map the rest of the code, and each request keeps the rules of a turn the person sent

**Why**: The owner tried one press per request and rejected it. Measured repositories needed three presses to pass half and thirty or more to finish.
**Prior**: Narrows 2026-11-16 `04edab8a` ("a person's live turn" carries the folder's Auto-approve): requests two to N of a run the person started in this launch count as that turn. Upholds `15443720` and 2026-09-29 `5e2f4838`: a run is not a round, nothing scheduled or kept starts one, and nothing is persisted. Extends 2026-11-20 `475f5a7e` to the map conversation.
**Decision**: A row above the map conversation's composer starts a run. Each request goes out in a new conversation after the last one ended and the folder settled; progress is the project note's `Not mapped yet` line read from disk. The app never answers a permission request: with Auto-approve off every write waits with no clock, with it on only additive writes pass, as for any turn. A run ends on any Stop, a request that puts nothing new on the map, min(2 × estimate + 2, 100) requests, ten silent minutes, an agent error, a usage limit, a folder switch, the person's own message, or a note that no longer states what is left. The transcript shows one line per request and the full request on demand.
**Dissent**: The reviewer: requests two to N are sent with nobody present and pass additive writes under Auto-approve; a card per request, or no standing approval inside a run, is narrower. It lost because that is the press per request the owner rejected; the row says before the press which rule holds.
**Falsifier**: A request sent with no press in this launch, or after Stop, quit or a folder switch; a card answered by the app; a write that is not additive passing; more than 100 requests from one press; "finished" shown while the server still counts abilities off the map.
**Owner**: Stark
