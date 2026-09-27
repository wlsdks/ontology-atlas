/**
 * Path scopes harness files declare about themselves (nested `AGENTS.md`, rule `paths:`, hook
 * filters, check-script arguments); an agent file's location is never read as its scope.
 */

import type { AgentTool } from './agent-files';

/** The three questions the matrix asks of every area. */
export type CoverageColumn = 'told' | 'gated' | 'watched';

/** The file kind making the claim; cell wording differs per origin. */
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
  /** Repo-relative path, or `package.json#<script>`. */
  id: string;
  /** The cell text, as it appears on disk. */
  label: string;
  origin: CoverageOrigin;
  /** The declaring text quoted from the file, so a reader can judge the attribution. */
  declaration: string;
  /** Whether any path scope is declared: no `paths:` means every file, unmatched paths mean none. */
  declaresPath: boolean;
  /** Declared prefixes that resolve on disk. */
  scopes: readonly string[];
  /** For a hook: the config file that names the script. */
  namedBy?: string;
  /** Agent tools reading this file, so mirrored `.claude` and `.codex` hooks are told apart. */
  tools: readonly AgentTool[];
}

/**
 * The glob before its first wildcard segment (`src/**` → `src`). Prefix containment answers
 * whether an area is governed, which strict glob matching does not.
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

/** Either path contains the other: `src` reaches `src/features/x` and a file reaches its folder. */
export function scopeReaches(scope: string, capabilityPath: string): boolean {
  if (!scope || !capabilityPath) return false;
  if (scope === capabilityPath) return true;
  return capabilityPath.startsWith(`${scope}/`) || scope.startsWith(`${capabilityPath}/`);
}

/** A rule's `paths:` globs in order; no list means always loaded. */
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
 * Anchored filters (`^src/`) and quoted prefixes a script writes; this over-collects, so callers
 * keep only scopes that resolve on disk and show the declaration.
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

/** Paths a check command names; a repository-wide command names none. */
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

/** Trigger `paths:` filters above `jobs:`; job commands are never read as filters. */
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
