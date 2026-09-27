import { readDisplayNames, type Project } from '@/entities/project';
import type { VaultDoc, VaultManifest } from '../model/types';
import { computeProjectSlug, isProjectVaultDoc } from './project-slug';

/** Project docs (`kind: project`, or a legacy `projects/` path) as `Project`s; synchronous. */
export function deriveProjectsFromVault(manifest: VaultManifest): Project[] {
  const projects: Project[] = [];
  for (const doc of manifest.docs) {
    if (!isProjectVaultDoc(doc)) continue;
    const project = mapVaultDocToProject(doc);
    if (project) projects.push(project);
  }
  return projects;
}

function mapVaultDocToProject(doc: VaultDoc): Project | null {
  const fm = doc.frontmatter;
  // `computeProjectSlug` is shared with the topology deeplink, so `?p=<slug>` opens the right drawer.
  const slug = computeProjectSlug(doc);
  if (!slug) return null;
  // The name falls back to the filename even when `fm.slug` differs.
  const fileSlug = doc.slug.startsWith('projects/')
    ? doc.slug.replace(/^projects\//, '')
    : doc.slug.split('/').pop() || doc.slug;
  const name = (fm.name as string) || (fm.title as string) || doc.title || fileSlug;
  // Undefined unless the frontmatter states it; no fabricated defaults.
  const category =
    typeof fm.category === 'string' && fm.category.trim()
      ? fm.category.trim()
      : undefined;
  const status =
    typeof fm.status === 'string' && fm.status.trim()
      ? fm.status.trim()
      : undefined;
  const isHub =
    fm.isHub === true || String(fm.isHub).toLowerCase() === 'true'
      ? true
      : undefined; // `false` would be fabricated too.
  const description =
    typeof fm.description === 'string' && fm.description.trim()
      ? fm.description.trim()
      : doc.excerpt;
  // Only an explicit position; layout is otherwise the placement hook's.
  const position = parseSplitPosition(fm) ?? parseInlinePositionOpt(fm.position);
  // Only explicit startedAt / launchedAt.
  const timeline = deriveTimeline(fm);
  const updatedAt = parseDateFlexible(fm.updatedAt) ?? parseDateFlexible(doc.updatedAt) ?? new Date();
  const createdAt = parseDateFlexible(fm.createdAt) ?? updatedAt;
  return {
    slug,
    name,
    displayNames: readDisplayNames(fm),
    category,
    status,
    description,
    detail: typeof fm.detail === 'string' ? fm.detail : undefined,
    tags: coerceStringArray(fm.tags),
    stack: coerceStringArray(fm.stack),
    links: [],
    dependencies: coerceStringArray(fm.dependencies),
    owner: typeof fm.owner === 'string' ? fm.owner : undefined,
    icon: typeof fm.icon === 'string' ? fm.icon : undefined,
    screenshots: [],
    timeline,
    isHub,
    position,
    createdAt,
    updatedAt,
  };
}

function coerceStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  }
  if (typeof v === 'string') {
    return v.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function parseInlinePositionOpt(
  v: unknown,
): { x: number; y: number } | undefined {
  if (v && typeof v === 'object') {
    const p = v as { x?: unknown; y?: unknown };
    const x = typeof p.x === 'number' ? p.x : Number(p.x);
    const y = typeof p.y === 'number' ? p.y : Number(p.y);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  return undefined;
}

function deriveTimeline(
  fm: Record<string, unknown>,
):
  | { startedAt?: Date; launchedAt?: Date }
  | undefined {
  const started = parseDateFlexible(fm.startedAt);
  const launched = parseDateFlexible(fm.launchedAt);
  if (started || launched) {
    return {
      ...(started ? { startedAt: started } : {}),
      ...(launched ? { launchedAt: launched } : {}),
    };
  }
  return undefined;
}

function parseSplitPosition(
  fm: Record<string, unknown>,
): { x: number; y: number } | null {
  const rx = fm.positionX;
  const ry = fm.positionY;
  if (rx === undefined || ry === undefined) return null;
  const x = typeof rx === 'number' ? rx : Number(rx);
  const y = typeof ry === 'number' ? ry : Number(ry);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function parseDateFlexible(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
