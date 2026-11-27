---
id: d55e2c71-7ed4-413f-81d1-187c3833116e
date: 2026-11-27
category: Fixed
---
The MCP server's git_history no longer runs a program a repository's own git configuration names for signature checking (log.showSignature with gpg.program). A repository Atlas reads could previously make a history read start that program; the installed app's own Git runner already refused it.
