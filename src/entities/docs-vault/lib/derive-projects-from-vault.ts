import type { Project } from '@/entities/project';
import type { VaultDoc, VaultManifest } from '../model/types';

/**
 * vault manifest 의 `projects/*.md` 문서를 Project 도메인 모델로 매핑.
 *
 * `buildTopologyFromVault` 의 sync 동등물 — 후자는 raw .md 본문을 비동기로
 * 다시 읽지만, 매니페스트 의 VaultDoc 은 이미 frontmatter / excerpt 가 파싱
 * 되어있어 React 훅에서 sync 로 바로 호출 가능.
 *
 * 사용처: `useProjects` mode-aware 훅 — local 모드 read 측. 로그인 / Firebase
 * 없이 vault 만으로 /projects · / 토폴로지 가 살아남음 (mission inconsistency
 * T7 해결).
 */
export function deriveProjectsFromVault(manifest: VaultManifest): Project[] {
  const projects: Project[] = [];
  for (const doc of manifest.docs) {
    if (!doc.slug.startsWith('projects/')) continue;
    const project = mapVaultDocToProject(doc);
    if (project) projects.push(project);
  }
  return projects;
}

function mapVaultDocToProject(doc: VaultDoc): Project | null {
  const fm = doc.frontmatter;
  const fileSlug = doc.slug.replace(/^projects\//, '');
  if (!fileSlug) return null;
  const slug = typeof fm.slug === 'string' && fm.slug ? fm.slug : fileSlug;
  const name = (fm.name as string) || doc.title || fileSlug;
  const category = (fm.category as string) || 'uncategorized';
  const status = (fm.status as string) || 'active';
  const isHub =
    fm.isHub === true || String(fm.isHub).toLowerCase() === 'true';
  const description =
    typeof fm.description === 'string' && fm.description.trim()
      ? fm.description.trim()
      : doc.excerpt;
  const position = parseSplitPosition(fm) ?? parseInlinePosition(fm.position);
  const updatedAt = parseDateFlexible(fm.updatedAt) ?? parseDateFlexible(doc.updatedAt) ?? new Date();
  const createdAt = parseDateFlexible(fm.createdAt) ?? updatedAt;
  return {
    slug,
    name,
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
    timeline: {},
    isHub,
    hubSlugs: coerceStringArray(fm.hubSlugs),
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

function parseInlinePosition(v: unknown): { x: number; y: number } {
  if (v && typeof v === 'object') {
    const p = v as { x?: unknown; y?: unknown };
    const x = typeof p.x === 'number' ? p.x : Number(p.x);
    const y = typeof p.y === 'number' ? p.y : Number(p.y);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  return { x: 0, y: 0 };
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
