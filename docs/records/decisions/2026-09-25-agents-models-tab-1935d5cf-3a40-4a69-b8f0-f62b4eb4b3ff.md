---
id: 1935d5cf-3a40-4a69-b8f0-f62b4eb4b3ff
date: 2026-09-25
---
## 2026-09-25 — Model connections become Agents → Models; Jev lands there as an experimental check

**Why**: Owner: add a Models tab (Agents | Models | MCP), move Settings → API Key into it, and port Jev from stale PR #1804 without its web storefront examples.
**Prior**: Overturns 2026-08-16's frozen `ai` path and (90)'s keeping `ai` in settings. Extends 2026-09-19 body tabs to three. Narrows 2026-09-23 Jev desktop check (887a85c9): a row of the models tab, not its own tab; its web examples are not ported. (52) log-before-send stands.
**Decision**: `?tab=models` holds local runners by address, Keychain API keys (add, check, replace, two-press remove, last four only), Jev labelled experimental, and the sent-log count. Settings keeps one pointer row; the dock's no-key door opens the tab. Jev sends only the on-screen request after one press, reserves an audit line first, and returns advice. Web shows the desktop-only card.
**Dissent**: Settings was where keys were learned. Evidence still wants real-candidate proof for Jev. TypeSafe's written OSS-distribution confirmation is pending.
**Falsifier**: A settings key search needing more than one press; a transfer without an audit line; a sent Jev request differing from its preview; TypeSafe refusing keyed OSS use, which removes Jev. 887a85c9's falsifiers (misplaced trust, advice read as acceptance) still apply.
**Owner**: jinan
