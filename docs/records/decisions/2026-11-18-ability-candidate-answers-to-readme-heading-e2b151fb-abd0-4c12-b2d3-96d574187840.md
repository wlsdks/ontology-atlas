---
id: e2b151fb-abd0-4c12-b2d3-96d574187840
date: 2026-11-18
---
## 2026-11-18 — An ability candidate also answers to a README heading

**Why**: the heading filter decided earlier today ("The build door returns what the next call needs and stops refusing without reasons") ran before the business ability candidates were derived. On the workspace-monorepo fixture of the meaning corpus, whose packages are named `web`, `realtime` and `policy`, it dropped both domains; candidate recall fell from 100% to 60% against a 0.75 gate and `pnpm test:meaning-corpus` failed on main.
**Prior**: 2026-11-18 "The build door returns what the next call needs and stops refusing without reasons" standing, with its heading rule widened by one witness.
**Decision**: `analyze_repo_structure` keeps a README heading as a domain candidate when a folder, package or separate document also names it, or when an ability candidate the prose states and the code implements belongs to it. The ability candidates are derived before the filter runs. A heading nothing answers to is still left out.
**Dissent**: an ability candidate takes its domain from a fixed clue table or a title match, so a heading can be kept by a loose title match and the first survey grows again on a repository whose README lists many sections.
**Falsifier**: a replay on an unfamiliar repository returns a first survey whose domain candidates are again README section names no code implements.
**Owner**: Stark
