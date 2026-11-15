---
id: c5fa907d-18b9-49d1-9560-c565063ee074
date: 2026-11-16
---
## 2026-11-16 — The download page says what open source gives the visitor, with a dated star count from a committed file
**Why**: On 2026-11-15 the owner said the page must not forget that Atlas is open source and should promote it, and asked whether the star count could be shown. Until now open source was one chip in the hero and one licence line in the footer.
**Prior**: None on showing repository counts. 2026-10-03 "The download page drops three blocks" (36af7b02) stands: this section draws nothing that moves. 2026-08-31 "The install-count review triggers have not fired" read stars as a traffic signal only. `.claude/rules/architecture.md` "add no external build fetch" and the Layer 1 promise that nothing leaves silently stand.
**Decision**: After the three steps and before the closing download, one section: four plain facts (MIT and free to change; no account and no Atlas backend, with the sentence that a connected coding agent talks to its own provider; the record is plain Markdown in the visitor's Git; issues and pull requests are welcome) beside a repository panel with stars, forks and licence, the five top-level folders as links, and a star button. The counts live in `repo-facts.generated.ts`, written by `pnpm download:repo-facts` when a person runs it and by the release run after a release publishes, and the panel prints the day they were read. Neither the build nor the page asks GitHub anything.
**Dissent**: A committed count is stale the day after it is read, and a small number can argue against the download as easily as for it. A live count would be current, but it would make every visitor's browser call a third party before they chose to.
**Falsifier**: The printed day is more than one release old; a visitor reads the count as live; or a visitor cannot say after the section whether Atlas needs an account.
**Owner**: Project owner, 2026-11-15.
