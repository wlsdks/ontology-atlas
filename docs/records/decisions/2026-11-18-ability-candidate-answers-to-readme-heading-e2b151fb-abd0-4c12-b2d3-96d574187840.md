---
id: e2b151fb-abd0-4c12-b2d3-96d574187840
date: 2026-11-18
---
## 2026-11-18 — An ability candidate also answers to a README heading

**Why**: the heading filter decided earlier today ("The build door returns what the next call needs and stops refusing without reasons") ran before the business ability candidates were derived. On the workspace-monorepo fixture of the meaning corpus, whose packages are named `web`, `realtime` and `policy`, it dropped both domains; candidate recall fell from 100% to 60% against a 0.75 gate and `pnpm test:meaning-corpus` failed on main.
**Prior**: 2026-11-18 "The build door returns what the next call needs and stops refusing without reasons" standing, with its heading rule widened by one witness.
**Decision**: `analyze_repo_structure` keeps a README heading as a domain candidate when a folder, package or separate document also names it, or when an ability candidate the prose states and the code implements declares that heading as its domain in the clue table. An ability tied to a heading only by a shared word in the title is not an answer: "Pull Requests" next to a request client stays out. The ability candidates are derived once to find those answers and again from the headings that survived, so a dropped heading cannot tie or win a title match. A heading nothing answers to is still left out.
**Dissent**: only domains the fixed clue table declares can be kept this way, so a repository whose README names its domains in words the table does not hold still loses them unless a folder, package or separate document names them too.
**Falsifier**: a replay on an unfamiliar repository returns a first survey whose domain candidates are again README section names no code implements, or drops a domain its README states and its code implements under technical package names.
**Owner**: Stark
