---
id: 79c42bd8-8688-442d-a493-2893627ec0fa
date: 2026-11-20
category: Fixed
---
The Library no longer runs out of memory on a folder with tens of thousands of sources. It used to restart reading wiki pages each time another batch of sources was checked, and its graph kept every earlier screen alive, so the web build closed after about nine minutes on 50,000 sources. Each page is now read once, and memory stays flat while sources are checked.
