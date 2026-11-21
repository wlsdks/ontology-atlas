---
id: 4a3ac8ce-d06c-4b57-8c58-ffea83590f36
date: 2026-11-21
category: Changed
---
In the app, a Library of 50,000 wiki pages and 50,000 originals now finishes reading and checking in 144 seconds instead of 230 on first open, and in 76 seconds instead of 210 when opened again, with its highest memory at 2.16 GB instead of 2.62 GB: the Library reads each page once per version, keeps only what its screens use of it (the page check, the terms Compile searches, the claims Questions searches, the card's summary and citation count), and drops the text, and a batch of measured originals updates only the rows it changes. At 20,000 pages the reading finishes about 8 seconds sooner and memory is unchanged. The web was not measured. The Library still pauses for about a second each time a batch of originals is measured in a folder this large, because its graph is redrawn for the whole folder.
