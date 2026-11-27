---
id: f2c1868d-5b39-4327-bc4d-f624a94f36cf
date: 2026-11-27
category: Added
---
Automations can schedule a recheck: the coding agent rereads each concept whose code changed after its document, Atlas records evidence_checked in the documents still accurate and commits only those on the checked-out branch, and View results lists every concept with its reason and undoes one concept or the whole run. A concept document is now dated by the first commit that holds its present bytes, so a revert or restore makes it stale again.
