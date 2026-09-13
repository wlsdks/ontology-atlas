/**
 * **Where a harness file says it applies — and nothing beyond that.**
 *
 * The Harness tab's coverage matrix puts the repository's own areas on the rows, which means every
 * guide, gate and check has to be attached to an area. There is exactly one honest way to do that
 * and one tempting way that does not work:
 *
 * - **Does not work: an agent file's own location.** All 122 of this repository's agent files sit
 *   at the root, under `.claude/`, `.agents/`, `.codex/`, plus `AGENTS.md` and `CLAUDE.md`. Their
 *   location says which tool reads them and nothing at all about which code they govern. A matrix
 *   built that way would put every row's answer in one cell (measured on this repository,
 *   2026-09-13).
 * - **Works: the path scope the file itself declares.** A nested `AGENTS.md` governs its own
 *   subtree because Codex merges root-down along the working path. A `.claude/rules/*.md` carries a
 *   frontmatter `paths:` glob list and loads only for a matching file. A hook script names the path
 *   prefixes it guards. A `package.json` check script names the files it runs over. Each of those is
 *   a declaration written in the repository, quotable back to the reader.
 *
 * So this module reads declarations, never intentions. Every scope it returns can be shown beside
 * the claim it supports, which is the same contract the guides table's per-tool citation already
 * keeps: a reader who disagrees can open the file and see the line.
 *
 * **What is deliberately not inferred.** A hook that declares no path is not given one. A workflow
 * with no `paths:` filter is not assigned areas by reading what its jobs happen to run. Those reach
 * everything by declaration, and the matrix says so once instead of printing the same row eight
 * times.
 */

/** The three questions the matrix asks of every area. */
export type CoverageColumn = 'told' | 'gated' | 'watched';

/** What kind of file made the claim. The cell's wording differs per origin. */
type CoverageOrigin =
  | 'nested-agents'
  | 'rule'
  | 'hook'
  | 'git-hook'
  | 'script'
  | 'workflow';

/** One file, or one `package.json` script, and the path scope it declares. */
export interface ScopeDeclaration {
  column: CoverageColumn;
  /** Repo-relative path, or `package.json#<script>` for a check script. */
  id: string;
  /** What to print in a cell — short, and the same string the reader can find on disk. */
  label: string;
  origin: CoverageOrigin;
  /**
   * The exact text that declares the scope, quoted from the file. This is the citation: it is what
   * lets a reader judge an attribution instead of trusting it.
   */
  declaration: string;
  /**
   * Whether the file declares a path scope **at all**, decided before the disk was consulted.
   *
   * This is the difference between two empty scope lists that mean opposite things. A rule with no
   * `paths:` is loaded for every file in the repository; a rule whose `paths:` reach none of the
   * areas the vault records is loaded for none of them. Both end with nothing matched, and printing
   * them the same way would call an always-loaded rule absent or a narrow one universal.
   */
  declaresPath: boolean;
  /** Repo-relative path prefixes this file declares, after unresolvable ones are dropped. */
  scopes: readonly string[];
  /** For a hook: the config file that names the script. */
  namedBy?: string;
}

/**
 * The part of a glob before its first wildcard segment — `src/**` → `src`, `scripts/check-*.mjs` →
 * `scripts`, `**` + `/*.test.ts` → `` (empty: it reaches every folder).
 *
 * Everything downstream compares directory prefixes rather than running a glob matcher, and the
 * reason is a difference that matters here. A vault capability's `path` is one canonical
 * *entrypoint* — often a directory (`src/features/vault-agent`), sometimes a file. A rule scoped to
 * `src/**` + `/*.tsx` does not "match" that directory as a string, but it is loaded for every `.tsx`
 * inside it, which is what a reader asking "is this area governed" means. Prefix containment answers
 * that question; strict glob matching answers a narrower one nobody asked.
 */
export function literalPrefix(glob: string): string {
  const segments = String(glob).trim().replace(/^\.\//, '').split('/');
  const out: string[] = [];
  for (const segment of segments) {
    if (/[*?[\]{}]/.test(segment)) break;
    if (segment === '' || segment === '.') continue;
    out.push(segment);
  }
  return out.join('/');
}

/**
 * Whether a declared scope and a capability's implementation path touch each other — either
 * contains the other. Containment runs both ways on purpose: `src` reaches
 * `src/features/vault-agent`, and `cli/src/lib/architecture-results.test.mjs` reaches `cli/src`.
 */
export function scopeReaches(scope: string, capabilityPath: string): boolean {
  if (!scope || !capabilityPath) return false;
  if (scope === capabilityPath) return true;
  return capabilityPath.startsWith(`${scope}/`) || scope.startsWith(`${capabilityPath}/`);
}

// ── declarations, per source shape ─────────────────────────────────────────

/**
 * The frontmatter `paths:` list of a `.claude/rules/*.md`, in the order written.
 *
 * A rule with no list is not given an empty scope by mistake — the caller distinguishes "declares
 * no path" (always loaded, reaches everything) from "declares paths that reach nothing here".
 */
export function ruleGlobs(text: string): string[] {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(String(text ?? ''));
  if (!frontmatter) return [];
  const block = /^paths:[ \t]*\n((?:[ \t]+-[ \t]*.*\n?)+)/m.exec(frontmatter[1]);
  if (!block) return [];
  const globs: string[] = [];
  for (const line of block[1].split('\n')) {
    const item = /^[ \t]+-[ \t]*(.+?)[ \t]*$/.exec(line);
    if (!item) continue;
    globs.push(item[1].replace(/^["']|["']$/g, ''));
  }
  return globs;
}

/**
 * Path prefixes a hook or Git-hook **script** declares about itself.
 *
 * Two forms, both of them literal text in the file rather than a reading of what the script does:
 *
 * 1. **An anchored path filter** — `^src/`, `^(src|app)/`, `^docs/ontology/`. Every path-scoped
 *    lane in a `.githooks` file is written this way, because that is what `grep -E` over a list of
 *    changed files needs. The anchor is the signal: a command invocation never writes one.
 * 2. **A quoted path prefix** — `"src/entities/docs-vault/data/"`, `".claude/skills/"`. This is how
 *    a guard script lists the paths it refuses edits to.
 *
 * Both over-collect: `^em-dash/` is a regex over finding names, not a path, and a script's own
 * dependencies (`scripts/run-focused-node-test.mjs`) get picked up beside its subjects. That is why
 * the caller keeps only scopes that **resolve on disk** and prints the declaration beside the
 * claim. An extractor that tried to be clever instead would be guessing, which is the one thing
 * this screen may not do.
 */
export function scriptPathScopes(text: string): string[] {
  const body = String(text ?? '');
  const out = new Set<string>();
  const anchored = /\^\(?([A-Za-z0-9_][A-Za-z0-9_.\\-]*(?:\|[A-Za-z0-9_][A-Za-z0-9_.\\-]*)*)\)?\//g;
  let match: RegExpExecArray | null;
  while ((match = anchored.exec(body)) !== null) {
    for (const alternative of match[1].split('|')) {
      const scope = alternative.replace(/\\/g, '').trim();
      if (scope) out.add(scope);
    }
  }
  const quoted = /["']([A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_.*-]+)+\/?)["']/g;
  while ((match = quoted.exec(body)) !== null) {
    const scope = literalPrefix(match[1].replace(/\/$/, ''));
    if (scope.includes('/')) out.add(scope);
  }
  return [...out];
}

/**
 * Path prefixes a `package.json` check command names — the files it runs over.
 *
 * `pnpm exec vitest run src/views/architecture/ui/ArchitectureWorkbench.test.tsx` names one; `eslint
 * --max-warnings 0` and `vitest` name none, and a script that names none is not given one. That
 * distinction is the whole point of the Watched column: a repository-wide lane reaching an area is a
 * different fact from a check written for it.
 */
export function commandPathScopes(command: string): string[] {
  const out = new Set<string>();
  const pathish = /(?:^|[\s'"=(])((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.*{}-]*)/g;
  let match: RegExpExecArray | null;
  while ((match = pathish.exec(String(command ?? ''))) !== null) {
    const scope = literalPrefix(match[1].replace(/\/$/, ''));
    if (scope.includes('/')) out.add(scope);
  }
  return [...out];
}

/**
 * The `paths:` / `paths-ignore:` filter a GitHub workflow declares on its triggers, if any.
 *
 * Read from the trigger block only — the text above `jobs:`. What a job *runs* is not a path filter
 * and is not read as one: a workflow that declares no filter runs for every change, which the matrix
 * states once rather than crediting to each area in turn.
 */
export function workflowPathFilters(yaml: string): string[] {
  const head = String(yaml ?? '').split(/\njobs:/)[0];
  const out: string[] = [];
  const block = /^[ \t]+paths(?:-ignore)?:[ \t]*\n((?:[ \t]+-[ \t]*.*\n?)+)/gm;
  let match: RegExpExecArray | null;
  while ((match = block.exec(head)) !== null) {
    for (const line of match[1].split('\n')) {
      const item = /^[ \t]+-[ \t]*(.+?)[ \t]*$/.exec(line);
      if (!item) continue;
      out.push(item[1].replace(/^["']|["']$/g, ''));
    }
  }
  return out;
}
