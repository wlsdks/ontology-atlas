---
id: 4b444601-7319-4abf-9db4-51d23eeb2b19
date: 2026-09-25
category: Fixed
---
Pausing or removing an automation now ends its run at once, even while the coding agent is still starting: the "running now" line clears, the run history says the run was stopped, the pause stays a pause, and every other schedule can run again without reopening the app. A run that never gets an answer now gives up after twenty minutes instead of blocking the others. An ontology review that had no coding agent is recorded as failed with the reason, in your language, instead of an English sentence claiming it completed, and reviews already recorded that way no longer show it. Automations' run history now explains a run that had no agent or was stopped, in the same words as the Library's check history.
