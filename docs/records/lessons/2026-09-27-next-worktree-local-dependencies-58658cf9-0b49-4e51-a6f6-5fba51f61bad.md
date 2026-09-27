---
id: 58658cf9-0b49-4e51-a6f6-5fba51f61bad
date: 2026-09-27
kind: tool-efficiency
status: reported
harness_area: parallel-worktrees
---
**Observed**: In the isolated Question Desk worktree, `pnpm dev --port 4317` failed with `Symlink [project]/node_modules is invalid, it points out of the filesystem root`. Its `node_modules` linked to the main checkout. `pnpm exec next dev --webpack --port 4317` then failed to parse the existing `mcp/src/analysis-record.mts` import. A worktree-local `pnpm install --frozen-lockfile` allowed Turbopack to serve the Library route.
**Cost**: One failed dev launch and one failed webpack fallback; elapsed time unknown.
**Suspected cause**: Turbopack restricts package resolution to the isolated worktree and rejects an external root `node_modules` symlink. The webpack import failure is a separate existing tooling path.
**Proposed change**: rule | In parallel briefs for Next UI work, use a worktree-local frozen pnpm install before rendering. Do not point `node_modules` at another checkout; keep a unique server port and report the dependency setup used for proof.
