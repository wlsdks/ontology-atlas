---
uid: 2b1cc3ce-372e-4716-a549-da4186b082ca
slug: elements/cli-mcp-verify
kind: element
title: CLI connection verification
display_en: CLI connection verification
display_ko: CLI 연결 검증
domain: domains/agent-access
path: cli/src/commands/mcp-verify.mjs
created_by: "agent:claude-code"
---

Proves from the terminal that an installed server actually answers, and that the tool list it serves matches the inventory it announced when it started.

## Includes
- A live comparison of the advertised names, counts and read-or-write classification against what the server returns.

## Excludes
- Fixing a mismatch it finds.
- Verifying that the tools do what their descriptions say.

## Uncertainty
- Identified from the command file and from the repository's statement that this check independently compares the live list with the initialize announcement. It was not run in this session.