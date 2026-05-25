# Benchmark scale — 2026-05-04 — Codex (N=100)

Tmp vault: `/var/folders/4y/kbv6_f_s2g9fmpp7236t79rc0000gn/T/omot-scale-100-1hNgIV` (N=100 nodes, 32 reference `elements/hub`).

Single high-MCP-advantage task (`find_backlinks(elements/hub)`).

## Result

| Mode | Shell exec | MCP calls | Duration |
|---|---|---|---|
| OFF | 3 | 0 | 21.6s |
| ON | 8 | 0 | 35.0s |

## Interpretation

- Δ shell calls: 5 (negative = MCP saved exec calls)
- Δ MCP calls: 0 (positive = MCP path actually exercised)
- Compare with 23-node dogfood A3 (`docs/benchmark/results/2026-05-04-codex.md`):
  - 23-node OFF/ON: 5 shell / 1 MCP
  - 100-node OFF/ON: 3 shell / 0 MCP

Correctness/hallucinations need human grading against `2026-05-04-codex-scale-N100-{off,on}.txt`.
