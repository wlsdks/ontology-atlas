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
 * Keeps only candidate scopes that reach a recorded capability path and exist on disk, and
 * prints each with its declaring text.
 */

export interface CoverageScanInput {
  /** Every scanned file's text by repo-relative path. */
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

/** Whether a file or directory exists at this path. */
export type PathExistsPort = (relativePath: string) => Promise<boolean>;

const RULE_PREFIX = '.claude/rules/';

function ruleLabel(path: string): string {
  return path.slice(RULE_PREFIX.length).replace(/\.md$/, '');
}

function hookLabel(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.(sh|mjs|cjs|js|py)$/, '');
}

/** Candidates before the disk is consulted; exported for tests. */
export function candidateScopeDeclarations(input: CoverageScanInput): ScopeDeclaration[] {
  const out: ScopeDeclaration[] = [];

  for (const path of input.contents.keys()) {
    if (!/^[^/]+\/AGENTS\.md$/.test(path)) continue;
    const directory = path.slice(0, path.indexOf('/'));
    out.push({
      column: 'told',
      id: path,
      label: path,
      origin: 'nested-agents',
      /* Codex merges nested AGENTS.md root-down, so its folder is its scope. */
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

  for (const group of input.hookGroups) {
    for (const hook of group.hooks) {
      /* Only hooks whose script exists; an unresolved config entry cannot gate anything. */
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
 * Probes only scopes that reach a recorded path and drops the missing ones; unprobed scopes
 * stay as written. `declaresPath` separates no `paths:` (everywhere) from paths reaching nothing.
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
