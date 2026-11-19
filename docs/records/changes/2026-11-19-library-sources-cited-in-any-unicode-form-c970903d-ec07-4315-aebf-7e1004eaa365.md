---
id: c970903d-ec07-4315-aebf-7e1004eaa365
date: 2026-11-19
category: Fixed
---
The Library now matches a wiki page's citation to its source whatever Unicode form the page wrote the path in, so a page that cites a Korean file name in decomposed form (as macOS can write it) counts that source as having a wiki page instead of leaving it with none. A cited file the app cannot open now reads "can't read" instead of staying on "checking" forever; it stays in the total and is never counted as having a page. A large folder is hashed 256 files per call, and the checking count moves while it runs.
