import { matchesArchitecturePath, type ArchitectureProfile } from '@/entities/architecture-profile';

/**
 * The labeled meaning layer inside a band, returned by decision (2026-08-27, second record's
 * falsifier fired): the owner asked what a layer *contains* while looking at a browser, and the
 * browser's only real data is the vault. So a band's click-open detail lists the **reviewed
 * concepts** whose `path` frontmatter falls inside the role's globs — explicitly labeled as
 * concepts, never mixed into the source-module row, so the meaning layer and the source layer
 * stay two named things.
 *
 * Same glob dialect as everything else (`matchesArchitecturePath`, contract-tested against the
 * MCP). No source is read here; this is a join of two reviewed stores.
 */

export interface RoleConcept {
  slug: string;
  title: string;
  kind: 'capability' | 'element';
  path: string;
  /** Reviewed `dependencies` targets (slugs) — real vault relations, never inferred. */
  dependsOn: string[];
  /** Reviewed `relates` targets (slugs). */
  relatesTo: string[];
}

interface ConceptSourceDoc {
  slug: string;
  frontmatter: Record<string, unknown>;
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

export function deriveRoleConcepts(
  profile: ArchitectureProfile,
  docs: ReadonlyArray<ConceptSourceDoc>,
): Record<string, RoleConcept[]> {
  const byRole: Record<string, RoleConcept[]> = {};
  for (const role of profile.roles) byRole[role.id] = [];

  for (const doc of docs) {
    const kind = doc.frontmatter.kind;
    if (kind !== 'capability' && kind !== 'element') continue;
    const rawPath = doc.frontmatter.path;
    if (typeof rawPath !== 'string' || rawPath.trim() === '') continue;
    const path = normalizePath(rawPath);
    const stringList = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    const concept: RoleConcept = {
      slug: doc.slug,
      title:
        typeof doc.frontmatter.title === 'string' && doc.frontmatter.title.trim() !== ''
          ? doc.frontmatter.title
          : doc.slug,
      kind,
      path,
      dependsOn: stringList(doc.frontmatter.dependencies),
      relatesTo: stringList(doc.frontmatter.relates),
    };
    for (const role of profile.roles) {
      if (role.paths.some((pattern) => matchesArchitecturePath(path, pattern))) {
        byRole[role.id]!.push(concept);
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

