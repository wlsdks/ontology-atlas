---
id: 47a35a9e-e10e-49e6-9c20-a763e627a0e8
date: 2026-11-24
category: Fixed
---
Atlas's MCP server no longer lets a repository's own Git settings run a command when it reads that repository: its Git reads never fetch, and a settings file that never finishes reading is refused instead of hanging the server.
