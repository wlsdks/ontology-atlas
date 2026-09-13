import {
  commandPathScopes,
  literalPrefix,
  ruleGlobs,
  scopeReaches,
  scriptPathScopes,
  workflowPathFilters,
  type ScopeDeclaration,
} from './coverage-scopes';
import { agentToolsForPath } from './agent-files';
import type { HookConfigFacts } from './hook-wiring';

/**
 * **Turning one repository's files into scope declarations, and refusing to keep the ones that do
 * not resolve.**
 *
 * The extractors in `coverage-scopes.ts` deliberately over-collect: a shell script's `^em-dash/` is
 * a regex over finding names, not a directory, and a check command names the runner it uses beside
 * the files it runs over. Two filters keep that from becoming a false claim on screen.
 *
 * 1. **It has to reach something the vault records.** A candidate that touches no capability path is
 *    dropped before anything is asked of the disk, which also keeps the probe below — one round trip
 *    per surviving candidate — down to a handful of calls.
 * 2. **It has to exist.** Whatever survives is asked of the filesystem. `^eslint/` inside
 *    `/^eslint/.test(finding)` names no path in this repository and disappears; `mcp/src/` inside
 *    the same script is a real prefix and stays.
 *
 * What is left is printed with the text that declared it, so a reader who thinks an attribution is
 * wrong can open the file and check rather than take the screen's word for it.
 */

/** What `collectScopeDeclarations` needs from the scan that produced it. */
export interface CoverageScanInput {
  /** Every file the harness scan read, keyed by repo-relative path. */
  contents: ReadonlyMap<string, string>;
  /** Hook configs and the scripts they name, from `collectHookFacts`. */
  hookGroups: readonly HookConfigFacts[];
  /** `.githooks/<name>` → file text. */
  gitHooks: ReadonlyMap<string, string>;
  /** `package.json` lint / typecheck / test scripts → their command. */
  checkScripts: ReadonlyMap<string, string>;
  /** `.github/workflows/<name>` → file text. */
  workflows: ReadonlyMap<string, string>;
}

/** Asked once per surviving candidate scope: is there a file or directory at this path? */
export type PathExistsPort = (relativePath: string) => Promise<boolean>;

const RULE_PREFIX = '.claude/rules/';

function ruleLabel(path: string): string {
  return path.slice(RULE_PREFIX.length).replace(/\.md$/, '');
}

function hookLabel(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.(sh|mjs|cjs|js|py)$/, '');
}

/**
 * Candidate declarations, before the disk is consulted. Exported for the unit tests, which assert
 * the extraction rules without needing a filesystem.
 */
export function candidateScopeDeclarations(input: CoverageScanInput): ScopeDeclaration[] {
  const out: ScopeDeclaration[] = [];

  // ── Told ────────────────────────────────────────────────────────────────
  for (const path of input.contents.keys()) {
    if (!/^[^/]+\/AGENTS\.md$/.test(path)) continue;
    const directory = path.slice(0, path.indexOf('/'));
    out.push({
      column: 'told',
      id: path,
      label: path,
      origin: 'nested-agents',
      /* Its own folder is the declaration: Codex merges nested AGENTS.md root-down along the
         working path, so this file is instructions for everything beneath it and for nothing
         beside it. Claude Code never auto-loads it at all, which the guides table already says. */
      declaration: `${directory}/`,
      declaresPath: true,
      scopes: [directory],
      tools: agentToolsForPath(path),
    });
  }
  for (const [path, text] of input.contents) {
    if (!path.startsWith(RULE_PREFIX) || !path.endsWith('.md')) continue;
    const globs = ruleGlobs(text);
    out.push({
      column: 'told',
      id: path,
      label: ruleLabel(path),
      origin: 'rule',
      declaration: globs.length > 0 ? `paths: ${globs.join(' · ')}` : '',
      declaresPath: globs.length > 0,
      scopes: globs.map(literalPrefix).filter(Boolean),
      tools: agentToolsForPath(path),
    });
  }

  // ── Gated ───────────────────────────────────────────────────────────────
  for (const group of input.hookGroups) {
    for (const hook of group.hooks) {
      /* Only a hook whose script the disk actually has. A config entry naming a path that does not
         resolve produces no block and no error — the guides table's hook section already prints
         that as its own failure, and a guard that is not there cannot gate an area. */
      if (hook.status !== 'wired' || !hook.ref.path) continue;
      const body = input.contents.get(hook.ref.path) ?? '';
      const scopes = scriptPathScopes(body);
      out.push({
        column: 'gated',
        id: hook.ref.path,
        label: hookLabel(hook.ref.path),
        origin: 'hook',
        declaration: scopes.join(' · '),
        declaresPath: scopes.length > 0,
        scopes,
        namedBy: group.configPath,
        tools: agentToolsForPath(hook.ref.path),
      });
    }
  }
  for (const [name, body] of input.gitHooks) {
    const scopes = scriptPathScopes(body);
    out.push({
      column: 'gated',
      id: `.githooks/${name}`,
      label: name,
      origin: 'git-hook',
      declaration: scopes.join(' · '),
      declaresPath: scopes.length > 0,
      scopes,
      tools: [],
    });
  }

  // ── Watched ─────────────────────────────────────────────────────────────
  for (const [name, command] of input.checkScripts) {
    const scopes = commandPathScopes(command);
    out.push({
      column: 'watched',
      id: `package.json#${name}`,
      label: name,
      origin: 'script',
      declaration: command,
      declaresPath: scopes.length > 0,
      scopes,
      tools: [],
    });
  }
  for (const [path, text] of input.workflows) {
    const filters = workflowPathFilters(text);
    out.push({
      column: 'watched',
      id: path,
      label: path.split('/').pop() ?? path,
      origin: 'workflow',
      declaration: filters.length > 0 ? `paths: ${filters.join(' · ')}` : '',
      declaresPath: filters.length > 0,
      scopes: filters.map(literalPrefix).filter(Boolean),
      tools: [],
    });
  }

  return out;
}

/**
 * Candidates → declarations whose scopes were checked against the disk.
 *
 * Only a scope that was **worth probing** is probed: one that reaches an implementation path the
 * vault records. That keeps the round trips to a handful, and it is also the only set whose
 * resolution can change an answer. A probed scope that is not there is dropped, because it cannot be
 * the reason anything is governed; a scope nobody probed is kept as written, because it is still
 * what the file says even though it reaches nothing here.
 *
 * `declaresPath` is what separates the two silences. A rule with no `paths:` and a rule whose
 * `paths:` reach nothing both end with no matching scope, and they mean opposite things: the first
 * is loaded for every file in the repository, the second is loaded for none of the areas the vault
 * records. Collapsing them would print an always-loaded rule as absent, or a narrowly scoped one as
 * universal.
 */
export async function resolveScopeDeclarations(
  candidates: readonly ScopeDeclaration[],
  capabilityPaths: readonly string[],
  pathExists: PathExistsPort,
): Promise<ScopeDeclaration[]> {
  const probe = new Set<string>();
  for (const candidate of candidates) {
    for (const scope of candidate.scopes) {
      if (capabilityPaths.some((path) => scopeReaches(scope, path))) probe.add(scope);
    }
  }
  const missing = new Set<string>();
  await Promise.all(
    [...probe].map(async (scope) => {
      if (!(await pathExists(scope))) missing.add(scope);
    }),
  );
  return candidates.map((candidate) => ({
    ...candidate,
    scopes: candidate.scopes.filter((scope) => !missing.has(scope)),
  }));
}
