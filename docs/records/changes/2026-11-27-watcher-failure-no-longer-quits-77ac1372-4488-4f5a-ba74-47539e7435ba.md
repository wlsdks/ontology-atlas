---
id: 77ac1372-4488-4f5a-ba74-47539e7435ba
date: 2026-11-27
category: Fixed
---
The app no longer quits when watching a folder fails inside macOS's file-change service: the watcher catches the failure, keeps the rest of Atlas running, and Workshop stops adding watched rooms before the open-file limit runs out.
