import { matchesArchitecturePath, type ArchitectureProfile } from '@/entities/architecture-profile';

/**
 * The blueprint's occupants are **source modules, not ontology concepts** (owner correction,
 * 2026-08-27): the ontology is the meaning map, and architecture is literally about what the
 * project source contains inside each reviewed role. So a band is filled by walking the role's
 * globs over a **read-only directory listing** of the bound project source.
 *
 * ⚠️ This is a listing, never an analysis. No file is opened, no import is read — the standing
 * falsifier ("the profile must not become a second source of observed imports") stays intact, and
 * conformance remains the MCP's and CLI's job. A browser cannot list a source folder at all, which
 * the surface states as an impossibility rather than pretending emptiness.
 */

export interface RoleSourceModule {
  /**
   * Display name. For a branched pattern (`services/*&#47;domain/**`) the branch-relative path
   * (`checkout/domain`) — the plain segment would collapse every service to the same word.
   */
  name: string;
  /** Repo-relative path. */
  path: string;
  kind: 'dir' | 'file';
}

export interface SourceDirEntry {
  name: string;
  kind: 'dir' | 'file';
}

/** Lists one directory, repo-relative; `null` when the directory does not exist or is unreadable. */
export type SourceDirLister = (relativePath: string) => Promise<SourceDirEntry[] | null>;

function normalizePattern(pattern: string): string {
  return pattern.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/** One glob segment (no slashes) as a regexp: `*`/`?` never cross a separator. */
function segmentToRegExp(segment: string): RegExp {
  let source = '^';
  for (const char of segment) {
    if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += /[\\^$+?.()|{}[\]]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`);
}

/**
 * The modules one pattern names, from a directory walk:
 *
 * - `src/views/**` (a concrete base): the base's own children are the modules — the base itself
 *   would be one card repeating the glob.
 * - `services/*&#47;domain/**` (a branched base): each concrete branch (`services/checkout/domain`)
 *   is a module; its children belong to it, not beside it.
 * - A wildcard leaf (`src/shared/lib/*`): the matching entries are the modules.
 *
 * Only directories are walked; the listing never follows a `**` downward, so the walk touches at
 * most one directory level per pattern segment.
 */
export async function listPatternModules(
  pattern: string,
  listDir: SourceDirLister,
): Promise<RoleSourceModule[]> {
  const normalized = normalizePattern(pattern);
  if (!normalized) return [];
  /*
   * ⚠️ **Dot-prefixed entries are not modules**, and the filter belongs at the entrance so that
   * none of the three walks below can forget it. Found in the installed app on 2026-08-28: the
   * widgets role listed `.gitkeep` as its first module and counted it among 23, so the screen
   * stated a number that was wrong by one and led with a git placeholder.
   *
   * On somebody else's project this matters more than a placeholder. The same walk would show
   * `.DS_Store` and `.eslintrc.js` as modules of a role, and `.env.local` — which
   * `.claude/rules/local-first.md` names by name when it says to skip dotfiles while reading the
   * user's disk. A `null` still means "no such directory", which is a different fact from "a
   * directory holding nothing worth showing".
   */
  const listVisible: SourceDirLister = async (relativePath) => {
    const entries = await listDir(relativePath);
    return entries === null ? null : entries.filter((entry) => !entry.name.startsWith('.'));
  };
  const segments = normalized.split('/');
  const firstWildcard = segments.findIndex((segment) => /[*?]/.test(segment));
  const branchNameFrom = firstWildcard === -1 ? 0 : firstWildcard;
  const out: RoleSourceModule[] = [];

  const moduleName = (path: string, branched: boolean): string => {
    const parts = path.split('/');
    return branched ? parts.slice(branchNameFrom).join('/') : parts[parts.length - 1]!;
  };

  const walk = async (index: number, base: string, branched: boolean): Promise<void> => {
    const segment = segments[index];
    if (segment === undefined) {
      if (base && (await listVisible(base)) !== null) {
        out.push({ name: moduleName(base, branched), path: base, kind: 'dir' });
      }
      return;
    }
    if (segment === '**') {
      if (branched) {
        if ((await listVisible(base)) !== null) {
          out.push({ name: moduleName(base, true), path: base, kind: 'dir' });
        }
        return;
      }
      for (const entry of (await listVisible(base)) ?? []) {
        out.push({
          name: entry.name,
          path: base ? `${base}/${entry.name}` : entry.name,
          kind: entry.kind,
        });
      }
      return;
    }
    if (/[*?]/.test(segment)) {
      const matcher = segmentToRegExp(segment);
      for (const entry of (await listVisible(base)) ?? []) {
        if (!matcher.test(entry.name)) continue;
        const childPath = base ? `${base}/${entry.name}` : entry.name;
        if (index === segments.length - 1) {
          out.push({ name: moduleName(childPath, true), path: childPath, kind: entry.kind });
        } else if (entry.kind === 'dir') {
          await walk(index + 1, childPath, true);
        }
      }
      return;
    }
    const childPath = base ? `${base}/${segment}` : segment;
    if (index === segments.length - 1) {
      const entry = ((await listVisible(base)) ?? []).find((candidate) => candidate.name === segment);
      if (entry) out.push({ name: moduleName(childPath, branched), path: childPath, kind: entry.kind });
      return;
    }
    await walk(index + 1, childPath, branched);
  };

  await walk(0, '', false);
  return out;
}

/**
 * Modules per role id, in role order. Overlapping globs dedupe by path; `exclude_paths` filters
 * with the same glob dialect the MCP scans with (`matchesArchitecturePath`), so a module the
 * profile excludes never appears occupied.
 */
export async function deriveRoleSourceModules(
  profile: ArchitectureProfile,
  listDir: SourceDirLister,
): Promise<Record<string, RoleSourceModule[]>> {
  const byRole: Record<string, RoleSourceModule[]> = {};
  for (const role of profile.roles) {
    const seen = new Map<string, RoleSourceModule>();
    for (const pattern of role.paths) {
      for (const found of await listPatternModules(pattern, listDir)) {
        if (profile.excludePaths.some((exclude) => matchesArchitecturePath(found.path, exclude))) {
          continue;
        }
        if (!seen.has(found.path)) seen.set(found.path, found);
      }
    }
    byRole[role.id] = [...seen.values()].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    );
  }
  return byRole;
}
