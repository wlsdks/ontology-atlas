---
id: 8349aedf-6713-4833-9bd9-cff52a244e35
date: 2026-09-26
category: Removed
---
The installed app no longer watches for Escape itself or hands the page a stand-in key press: the Korean input source was never keeping Escape from the app. The presses that went missing were swallowed by a screen-control tool while it ran; without it the app received every Escape on its own, and one press still closes the palette, a sheet or a dialog.
