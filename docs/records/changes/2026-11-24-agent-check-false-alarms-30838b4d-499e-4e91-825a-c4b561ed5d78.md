---
id: 30838b4d-499e-4e91-825a-c4b561ed5d78
date: 2026-11-24
category: Fixed
---
The coding agent check no longer reports false problems whose fix button could not change anything: Codex's settings and login link are judged by Codex's own files, the app's keychain copy of the Claude Code terminal login is no longer called a broken link or a stale login, and that copy is flagged only when it fails while the terminal signs in, where the fix now removes it and copies the terminal login again.
