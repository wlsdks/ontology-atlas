// One place that says which Markdown under docs/ is a living document, which is
// frozen history, and which document kinds exist. `pnpm docs:move`,
// `pnpm doc:new` and `pnpm docs:meta` all read it, so the three can never
// disagree about what is exempt.

/**
 * Files and folders that are history. Nothing rewrites them, no template applies
 * to them, and the metadata check skips them.
 *
 * - `DECISIONS`, `CHANGELOG`, `PO-PILOT`: keyed by path and hash in
 *   `docs/records/legacy.json`.
 * - `BACKLOG-SNAPSHOT-*`: `scripts/backlog.mjs` refuses any diff but an add.
 * - `records/**`: immutable fragments. `records/README.md` is the one living
 *   file there.
 * - `archive`, `audits`, `benchmark`, `prototypes`: dated evidence and drafts.
 *   `benchmark/rubric.md` is fed into grader prompts, so even frontmatter would
 *   change the instrument.
 * - `ontology/**`: the dogfood vault. `mcp/src/schema.mjs` owns its schema.
 * - `.generated/**`: machine output.
 */
function isFrozenDocPath(repoPath) {
  const p = repoPath.split('\\').join('/');
  if (p === 'docs/records/README.md') return false;
  return (
    /^docs\/(DECISIONS|CHANGELOG|PO-PILOT)\.md$/.test(p) ||
    /^docs\/BACKLOG-SNAPSHOT-[^/]+\.md$/.test(p) ||
    /^docs\/(records|archive|audits|benchmark|prototypes|ontology|\.generated)\//.test(p)
  );
}

/** Paths outside docs/ that a rewrite never touches: user-vault templates and generated output. */
export function isFrozenRepoPath(repoPath) {
  const p = repoPath.split('\\').join('/');
  return (
    isFrozenDocPath(p) ||
    p.startsWith('cli/templates/') ||
    p.startsWith('src/entities/docs-vault/data/') ||
    p.startsWith('public/docs-vault/')
  );
}
