---
id: d5f35094-ba0a-4827-8a58-dd8fa7092ced
date: 2026-11-20
category: Fixed
---
Finishing the open of a large folder stalls the map for less time: the review baseline is fingerprinted once in small slices and shared by every reader, and the folder health check waits until the agent chat that shows it is open. At 50,000 concept pages the half-second pass that followed loading no longer runs as one long task.
