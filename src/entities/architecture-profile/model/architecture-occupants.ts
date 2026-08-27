import type { ArchitectureProfile } from './architecture-profile';

/**
 * The role-glob × vault-`path` join: which reviewed concepts live inside each role.
 *
 * ⚠️ **This is a join of two reviewed stores, not a third source of truth.** The profile's role
 * globs are reviewed intent; a concept's `path` frontmatter is reviewed placement. Nothing here
 * scans source files or imports — the standing decision's falsifier ("a profile becomes a second
 * source of observed imports") is why this module must never grow an import reader. Conformance
 * stays with MCP `inspect_architecture` and the CLI.
 *
 * ⚠️ **Pattern semantics are the MCP's, verbatim.** `matchesArchitecturePath` mirrors
 * `matchesPathPattern` in `mcp/src/architecture-profile.mjs`; the cross-surface contract test runs
 * one fixture table through both. A web-only glob dialect would make the same profile place a
 * concept differently in the app and in an agent's brief.
 */

export interface ArchitectureOccupant {
  uid: string | null;
  slug: string;
  title: string;
  kind: 'capability' | 'element';
  path: string;
}

function normalizePath(value: unknown): string {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

export function matchesArchitecturePath(path: string, pattern: string): boolean {
  const candidate = normalizePath(path);
  const normalized = normalizePath(pattern);
  if (!normalized) return false;
  let source = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index]!;
    if (char === '*' && normalized[index + 1] === '*') {
      if (normalized[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index += 1;
      }
      continue;
    }
    if (char === '*') {
      source += '[^/]*';
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    source += /[\\^$+?.()|{}[\]]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`).test(candidate);
}

interface OccupantSourceDoc {
  slug: string;
  frontmatter: Record<string, unknown>;
}

/**
 * Occupants per role id, in the profile's role order.
 *
 * - Only `capability` and `element` docs carry an implementation `path`; other kinds are meaning,
 *   not placement, and are ignored here.
 * - A path matching two roles' globs appears under both. Overlap is a fact of the profile, and
 *   hiding one side would silently resolve an ambiguity only the profile's author may resolve.
 * - Order inside a role is by path, then slug — stable across renders and locales, and it groups
 *   siblings the way the filesystem does.
 */
export function deriveRoleOccupants(
  profile: ArchitectureProfile,
  docs: ReadonlyArray<OccupantSourceDoc>,
): Record<string, ArchitectureOccupant[]> {
  const byRole: Record<string, ArchitectureOccupant[]> = {};
  for (const role of profile.roles) byRole[role.id] = [];

  for (const doc of docs) {
    const kind = doc.frontmatter.kind;
    if (kind !== 'capability' && kind !== 'element') continue;
    const rawPath = doc.frontmatter.path;
    if (typeof rawPath !== 'string' || rawPath.trim() === '') continue;
    const path = normalizePath(rawPath);
    const occupant: ArchitectureOccupant = {
      uid: typeof doc.frontmatter.uid === 'string' ? doc.frontmatter.uid : null,
      slug: doc.slug,
      title: typeof doc.frontmatter.title === 'string' && doc.frontmatter.title.trim() !== ''
        ? doc.frontmatter.title
        : doc.slug,
      kind,
      path,
    };
    for (const role of profile.roles) {
      if (role.paths.some((pattern) => matchesArchitecturePath(path, pattern))) {
        byRole[role.id]!.push(occupant);
      }
    }
  }

  for (const role of profile.roles) {
    byRole[role.id]!.sort((a, b) =>
      a.path === b.path ? (a.slug < b.slug ? -1 : 1) : a.path < b.path ? -1 : 1,
    );
  }
  return byRole;
}
