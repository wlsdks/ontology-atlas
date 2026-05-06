import type { Project } from '@/entities/project';
import type { VaultDoc, VaultManifest } from '../model/types';
import { computeProjectSlug } from './project-slug';

/**
 * vault manifest 에서 *project 노드* 를 Project 도메인 모델로 매핑.
 *
 * 인식 기준 (mission v2 — frontmatter 가 진실원):
 *   1. `frontmatter.kind === 'project'` 인 doc (1순위, path 무관)
 *   2. 또는 path 가 `projects/` 로 시작 (legacy 호환 — frontmatter 누락 시)
 *
 * `buildTopologyFromVault` 의 sync 동등물 — 후자는 raw .md 본문을 비동기로
 * 다시 읽지만, 매니페스트 의 VaultDoc 은 이미 frontmatter / excerpt 가 파싱
 * 되어있어 React 훅에서 sync 로 바로 호출 가능.
 *
 * 사용처: `useProjects` mode-aware 훅 — local / static (dogfood) 모드 read 측.
 * 로그인 / Firebase 없이 vault 만으로 /projects · /topology 살아남음.
 */
export function deriveProjectsFromVault(manifest: VaultManifest): Project[] {
  const projects: Project[] = [];
  for (const doc of manifest.docs) {
    const isProjectKind = doc.frontmatter?.kind === 'project';
    const isLegacyPath = doc.slug.startsWith('projects/');
    if (!isProjectKind && !isLegacyPath) continue;
    const project = mapVaultDocToProject(doc);
    if (project) projects.push(project);
  }
  return projects;
}

function mapVaultDocToProject(doc: VaultDoc): Project | null {
  const fm = doc.frontmatter;
  // slug 산정은 computeProjectSlug 단일화 — buildTopologyDeeplinkForDoc
  // 과 같은 helper 를 공유해야 토폴로지 ?p=<slug> deeplink 가 drawer 를
  // 정확히 연다.
  const slug = computeProjectSlug(doc);
  if (!slug) return null;
  // name fallback 은 사람-읽기 좋은 파일명 (fm.slug 와 다른 값이어도) 을
  // 우선 — fileSlug 는 그래서 별도 계산.
  const fileSlug = doc.slug.startsWith('projects/')
    ? doc.slug.replace(/^projects\//, '')
    : doc.slug.split('/').pop() || doc.slug;
  const name = (fm.name as string) || (fm.title as string) || doc.title || fileSlug;
  // R15 (Concern 1) honest derive — frontmatter 에 명시 없으면 undefined.
  // 이전엔 'uncategorized' / 'active' / { x:0, y:0 } 등 fabricated default
  // 박았으나 vault 가 *가지지 않은 정보* 를 web 이 표시 → mission 위반.
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
      : undefined; // false 도 fabrication — frontmatter 에 명시 없으면 undefined
  const description =
    typeof fm.description === 'string' && fm.description.trim()
      ? fm.description.trim()
      : doc.excerpt;
  // position: 명시된 frontmatter 값만. 없으면 undefined (web 측이 placement
  // hook 에서 layout 결정 — vault 가 가지지 않은 좌표를 fabricate 하지 않음).
  const position = parseSplitPosition(fm) ?? parseInlinePositionOpt(fm.position);
  // timeline: 명시된 startedAt / launchedAt 만. 빈 객체 fabricate 안 함.
  const timeline = deriveTimeline(fm);
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
