---
id: d5f35094-ba0a-4827-8a58-dd8fa7092ced
date: 2026-11-20
category: Fixed
---
Finishing the open of a large folder no longer stalls the map for long: the review baseline is fingerprinted once in small slices and shared by every reader, the folder health check waits until the agent chat that shows it is open, and the broken-page count is worked out just after the first paint. At 50,000 concept pages the longest stall around the moment loading ends drops from about 720 ms to about 310 ms.
