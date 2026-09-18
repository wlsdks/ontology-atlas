---
id: c3f355f0-c1ed-47b0-9714-cdfb16576399
date: 2026-09-18
category: Changed
---
The Library's source list and wiki shelf keep only the rows in view in the DOM. On a 3,000-file folder the index cost 33,000 nodes and a 450 ms task on the rail press, and scrolling hit a 400 ms stall; it is now about forty rows, the scroller keeps the whole list's height, and scrolling stays under a frame.
