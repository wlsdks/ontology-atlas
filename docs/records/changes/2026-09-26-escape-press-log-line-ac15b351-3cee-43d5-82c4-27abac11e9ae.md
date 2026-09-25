---
id: ac15b351-3cee-43d5-82c4-27abac11e9ae
date: 2026-09-26
category: Added
---
The installed app's log now gets one line for every Escape press it sees: the window it was in and what the page did with it, whether WebKit delivered the key, a Korean composition took it, or the app stood in for a key WebKit never sent. When Escape closes nothing, the log says whether the press reached the app at all; a press with no line never did.
