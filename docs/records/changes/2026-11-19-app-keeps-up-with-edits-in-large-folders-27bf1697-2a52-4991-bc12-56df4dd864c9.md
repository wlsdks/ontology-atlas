---
id: 27bf1697-2a52-4991-bc12-56df4dd864c9
date: 2026-11-19
category: Changed
---
In the installed app, saving one file in a 50,000-file folder now updates the map in a few milliseconds instead of about half a second, because only the changed file is read again. Saves and Keychain calls no longer hold up the window, and quitting waits a moment for a save in progress to finish.
