import type { ArchitectureProfile } from '@/entities/architecture-profile';

import type { RoleConcept } from './role-concepts';
import type { RoleSourceModule } from './source-modules';

/** What one band holds: names in display order and where they came from. */
export interface RoleMembers {
  names: string[];
  source: 'modules' | 'concepts' | 'none';
}

function normalize(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

/**
 * The module a recorded concept sits in: the path segment after the pattern's literal base, so a
 * concept at `src/views/home/ui/Map.tsx` under `src/views/**` names `home`, as the source listing
 * would. Null when the path is outside the pattern's base.
 */
export function conceptModuleName(path: string, pattern: string): string | null {
  const segments = normalize(pattern).split('/');
  const firstWildcard = segments.findIndex((segment) => /[*?]/.test(segment));
  const base = firstWildcard === -1 ? segments : segments.slice(0, firstWildcard);
  const parts = normalize(path).split('/');
  if (base.some((segment, index) => parts[index] !== segment)) return null;
  if (firstWildcard === -1) return parts[parts.length - 1] ?? null;
  /* A branched pattern (`services/*\/domain/**`) names the branch with its role folder, as the listing does. */
  const deepGlob = segments.indexOf('**');
  const branched = deepGlob > firstWildcard + 1;
  if (branched) {
    const branch = parts.slice(firstWildcard, deepGlob);
    const literalsMatch = segments
      .slice(firstWildcard, deepGlob)
      .every((segment, index) => /[*?]/.test(segment) || branch[index] === segment);
    return branch.length === deepGlob - firstWildcard && literalsMatch ? branch.join('/') : null;
  }
  return parts[base.length] ?? null;
}

/**
 * Members per role: source modules when a listing exists, else the modules recorded concepts sit
 * in, most-recorded first. O(R·(M + C·P)) for roles, modules, concepts and patterns.
 */
export function buildRoleMembers(
  profile: ArchitectureProfile,
  modules: Readonly<Record<string, RoleSourceModule[]>> | null,
  concepts: Readonly<Record<string, RoleConcept[]>>,
): Record<string, RoleMembers> {
  const out: Record<string, RoleMembers> = {};
  for (const role of profile.roles) {
    const listed = modules?.[role.id] ?? [];
    if (listed.length > 0) {
      out[role.id] = { names: listed.map((module) => module.name), source: 'modules' };
      continue;
    }
    const counts = new Map<string, number>();
    for (const concept of concepts[role.id] ?? []) {
      const name = role.paths
        .map((pattern) => conceptModuleName(concept.path, pattern))
        .find((found): found is string => found !== null);
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const names = [...counts]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([name]) => name);
    out[role.id] = { names, source: names.length > 0 ? 'concepts' : 'none' };
  }
  return out;
}

/** The pattern as a path, without its trailing glob: `src/views/**` reads `src/views`. */
export function patternPathLabel(pattern: string): string {
  return normalize(pattern).replace(/(\/\*\*)+$/, '').replace(/\/\*$/, '') || pattern;
}
