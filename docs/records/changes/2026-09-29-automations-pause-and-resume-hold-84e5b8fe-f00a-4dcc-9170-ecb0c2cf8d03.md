---
id: 84e5b8fe-f00a-4dcc-9170-ecb0c2cf8d03
date: 2026-09-29
category: Fixed
---
A schedule paused while it waited behind another run no longer runs when that run ends; resuming a schedule whose time passed while it was paused waits for its next time instead of running at once as a catch-up; and an overdue document schedule waits for the folder to be read instead of spending its one catch-up on a failure.
