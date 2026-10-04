import { createArchitecturePathMatcher, type ArchitectureProfile } from '@/entities/architecture-profile';

/**
 * The blueprint's occupants are source modules from a read-only directory listing of the bound
 * source, not ontology concepts. It is a listing, never an analysis: no file is opened and no
 * import is read, so conformance stays the MCP's and CLI's job.
 */

export interface RoleSourceModule {
  /**
   * Display name. For a branched pattern (`services/*&#47;domain/**`) the branch-relative path
   * (`checkout/domain`) — the plain segment would collapse every service to the same word.
   */
  name: string;
  /** Repo-relative. */
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
 * The modules one pattern names: a concrete base's children; each concrete branch of a branched
 * base (`services/*&#47;domain/**`); or the entries matching a wildcard leaf. Only directories are
 * walked, one level per pattern segment; `**` is never followed downward.
 */
export async function listPatternModules(
  pattern: string,
  listDir: SourceDirLister,
): Promise<RoleSourceModule[]> {
  const normalized = normalizePattern(pattern);
  if (!normalized) return [];
  /*
   * Dot-prefixed entries are not modules (`.gitkeep`, `.DS_Store`, `.env.local`), and
   * `.claude/rules/local-first.md` says to skip dotfiles; filtered at the entrance so no walk
   * forgets it. `null` still means "no such directory", a different fact from an empty one.
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
  const match = createArchitecturePathMatcher();
  const byRole: Record<string, RoleSourceModule[]> = {};
  for (const role of profile.roles) {
    const seen = new Map<string, RoleSourceModule>();
    for (const pattern of role.paths) {
      for (const found of await listPatternModules(pattern, listDir)) {
        if (profile.excludePaths.some((exclude) => match(found.path, exclude))) {
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
