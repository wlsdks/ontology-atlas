import { createArchitecturePathMatcher, type ArchitectureProfile } from '@/entities/architecture-profile';

/**
 * Reviewed concepts whose `path` falls inside a role's globs, kept apart from source modules so the
 * meaning layer and the source layer stay two named things. A join of two reviewed stores; no
 * source is read.
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
  const match = createArchitecturePathMatcher();
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
      if (role.paths.some((pattern) => match(path, pattern))) {
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

