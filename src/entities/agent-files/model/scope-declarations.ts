/**
 * The text a rule, Git hook, check script or workflow writes about where it applies, quoted so a
 * reader can judge it; an agent file's location is never read as its scope.
 */

/** One file, or one `package.json` script, and the text that declares where it applies. */
export interface ScopeDeclaration {
  /** Repo-relative path, or `package.json#<script>`. */
  id: string;
  origin: 'rule' | 'git-hook' | 'script' | 'workflow';
  /** Quoted from the file; empty for a rule with no `paths:`, which loads every session. */
  declaration: string;
}

export interface ScopeDeclarationInput {
  /** Every scanned file's text by repo-relative path. */
  contents: ReadonlyMap<string, string>;
  /** `.githooks/<name>` → file text. */
  gitHooks: ReadonlyMap<string, string>;
  /** `package.json` lint / typecheck / test scripts → their command. */
  checkScripts: ReadonlyMap<string, string>;
  /** `.github/workflows/<name>` → file text. */
  workflows: ReadonlyMap<string, string>;
}

const RULE_PREFIX = '.claude/rules/';

/** The glob before its first wildcard segment (`src/**` → `src`). */
function literalPrefix(glob: string): string {
  const segments = String(glob).trim().replace(/^\.\//, '').split('/');
  const out: string[] = [];
  for (const segment of segments) {
    if (/[*?[\]{}]/.test(segment)) break;
    if (segment === '' || segment === '.') continue;
    out.push(segment);
  }
  return out.join('/');
}

/** A rule's `paths:` globs in order; no list means always loaded. */
export function ruleGlobs(text: string): string[] {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(String(text ?? ''));
  if (!frontmatter) return [];
  const unquote = (glob: string) => glob.trim().replace(/^["']|["']$/g, '');
  const block = /^paths:[ \t]*\n((?:[ \t]+-[ \t]*.*\n?)+)/m.exec(frontmatter[1]);
  if (block) {
    const globs: string[] = [];
    for (const line of block[1].split('\n')) {
      const item = /^[ \t]+-[ \t]*(.+?)[ \t]*$/.exec(line);
      if (item) globs.push(unquote(item[1]));
    }
    return globs;
  }
  /* The inline forms: `paths: src/**`, `paths: "a/**, b/**"` and `paths: [a/**, b/**]`. */
  const inline = /^paths:[ \t]*(\S.*?)[ \t]*$/m.exec(frontmatter[1]);
  if (!inline) return [];
  return unquote(inline[1].replace(/^\[|\]$/g, ''))
    .split(',')
    .map(unquote)
    .filter((glob) => glob.length > 0);
}

/** Anchored filters (`^src/`) and quoted prefixes a script writes; this over-collects. */
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

/** Trigger `paths:` filters above `jobs:`; job commands are never read as filters. */
export function workflowPathFilters(yaml: string): string[] {
  const head = String(yaml ?? '').split(/\njobs:/)[0];
  const out: string[] = [];
  const block = /^[ \t]+paths:[ \t]*\n((?:[ \t]+-[ \t]*.*\n?)+)/gm;
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

/** Text only: nothing here touches the disk. */
export function scopeDeclarations(input: ScopeDeclarationInput): ScopeDeclaration[] {
  const out: ScopeDeclaration[] = [];
  for (const [path, text] of input.contents) {
    if (!path.startsWith(RULE_PREFIX) || !path.endsWith('.md')) continue;
    const globs = ruleGlobs(text);
    out.push({ id: path, origin: 'rule', declaration: globs.length > 0 ? `paths: ${globs.join(' · ')}` : '' });
  }
  for (const [name, body] of input.gitHooks) {
    out.push({ id: `.githooks/${name}`, origin: 'git-hook', declaration: scriptPathScopes(body).join(' · ') });
  }
  for (const [name, command] of input.checkScripts) {
    out.push({ id: `package.json#${name}`, origin: 'script', declaration: command });
  }
  for (const [path, text] of input.workflows) {
    const filters = workflowPathFilters(text);
    out.push({ id: path, origin: 'workflow', declaration: filters.length > 0 ? `paths: ${filters.join(' · ')}` : '' });
  }
  return out;
}
