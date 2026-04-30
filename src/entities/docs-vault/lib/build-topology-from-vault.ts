import type { Project } from '@/entities/project';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';

export interface FolderTopologyCategory {
  slug: string;
  name: string;
  tone?: 'indigo' | 'amber' | 'neutral';
}

export interface FolderTopologyStatus {
  slug: string;
  label: string;
}

export interface FolderTopologyBuild {
  projects: Project[];
  categories: FolderTopologyCategory[];
  statuses: FolderTopologyStatus[];
  /** 경고: dependencies 가 존재하지 않는 slug 를 가리키는 경우. */
  danglingRefs: Array<{ from: string; to: string }>;
}

const DEFAULT_STATUSES: FolderTopologyStatus[] = [
  { slug: 'draft', label: '초안' },
  { slug: 'active', label: '활성' },
  { slug: 'launched', label: '런칭됨' },
  { slug: 'archived', label: '보관' },
];

/**
 * 로컬 vault 에서 projects/*.md 파일들을 읽어 토폴로지용 Project[] 로 변환.
 * categories.md / statuses.md 가 있으면 메타로 사용, 없으면 auto-synth 또는
 * 기본값.
 *
 * 입력: slug → raw md 매핑 + 확장자 포함 파일명 Map (frontmatter 파싱용).
 * raw 로더는 caller 가 주입 (local 의 경우 file handle → text).
 */
export async function buildTopologyFromVault(input: {
  /** slug (확장자 없이) → .md raw 텍스트 반환. projects/... 만 들어오는 건
   *  아니고 vault 전체 slug 에서 caller 가 'projects/' prefix 로 필터해 넘긴다. */
  projectSlugs: string[];
  loadRaw: (slug: string) => Promise<string>;
  /** 선택: categories.md raw */
  categoriesRaw?: string;
  /** 선택: statuses.md raw */
  statusesRaw?: string;
}): Promise<FolderTopologyBuild> {
  const projects: Project[] = [];
  const seenCategorySlugs = new Set<string>();

  for (const slug of input.projectSlugs) {
    try {
      const raw = await input.loadRaw(slug);
      const { frontmatter, body } = parseFrontmatter(raw);
      const fileSlug = slug.replace(/^projects\//, '');
      const project = mapFrontmatterToProject(fileSlug, frontmatter, body);
      if (!project) continue;
      projects.push(project);
      if (project.category) seenCategorySlugs.add(project.category);
    } catch {
      // 파일 하나 실패해도 전체는 계속 진행
    }
  }

  const categories = parseCategories(input.categoriesRaw, seenCategorySlugs);
  const statuses = parseStatuses(input.statusesRaw);

  // dangling refs — dependencies 가 수집된 project 중 없으면 경고
  const slugSet = new Set(projects.map((p) => p.slug));
  const danglingRefs: Array<{ from: string; to: string }> = [];
  for (const p of projects) {
    for (const dep of p.dependencies) {
      if (!slugSet.has(dep)) {
        danglingRefs.push({ from: p.slug, to: dep });
      }
    }
  }

  return { projects, categories, statuses, danglingRefs };
}

function mapFrontmatterToProject(
  fileSlug: string,
  fm: Record<string, unknown>,
  body: string,
): Project | null {
  const name = (fm.name as string) || fileSlug;
  const slug = typeof fm.slug === 'string' && fm.slug ? fm.slug : fileSlug;
  const category = (fm.category as string) || 'uncategorized';
  const status = (fm.status as string) || 'active';
  const isHub = fm.isHub === true || String(fm.isHub).toLowerCase() === 'true';
  const dependencies = coerceStringArray(fm.dependencies);
  const tags = coerceStringArray(fm.tags);
  const description =
    typeof fm.description === 'string' && fm.description.trim()
      ? fm.description.trim()
      : firstParagraph(body);
  // positionX/Y split field 우선 — 드래그 저장 시 이 형태로 쓴다.
  // 없으면 inline object position 시도, 마지막으로 (0,0) fallback.
  const position =
    parseSplitPosition(fm) ?? parsePosition(fm.position);
  const updatedAt = parseDateFlexible(fm.updatedAt) ?? new Date();
  const createdAt = parseDateFlexible(fm.createdAt) ?? updatedAt;
  if (!slug) return null;
  return {
    slug,
    name,
    category,
    status,
    description,
    detail: typeof fm.detail === 'string' ? fm.detail : undefined,
    tags,
    stack: coerceStringArray(fm.stack),
    links: [],
    dependencies,
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
    return v
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function parsePosition(v: unknown): { x: number; y: number } {
  if (v && typeof v === 'object') {
    const p = v as { x?: unknown; y?: unknown };
    const x = typeof p.x === 'number' ? p.x : Number(p.x);
    const y = typeof p.y === 'number' ? p.y : Number(p.y);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  return { x: 0, y: 0 };
}

/**
 * Split 필드 positionX / positionY 지원 (우리 간단 frontmatter 파서가
 * inline object `position: { x, y }` 를 못 읽기 때문). 드래그 저장 시
 * 이 두 key 로 쓰면 다음 로드에서 정확히 복원.
 */
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

function firstParagraph(body: string): string {
  const trimmed = body
    .replace(/^#+\s.*$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .trim();
  const firstBlank = trimmed.indexOf('\n\n');
  const para = firstBlank === -1 ? trimmed : trimmed.slice(0, firstBlank);
  return para.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * categories.md / statuses.md 는 frontmatter 에 nested list 를 쓰기엔
 * 우리 간단 파서가 약해서, body 의 h2 섹션 기반 으로 파싱한다.
 *
 * 예:
 *   # Categories
 *
 *   ## platform
 *   name: 플랫폼
 *   tone: indigo
 *
 *   ## product
 *   name: 제품
 *   tone: amber
 *
 * h2 slug · 하위 key:value 라인 → 메타. 빈 섹션도 허용.
 */
function parseH2Sections(body: string): Array<{
  slug: string;
  fields: Record<string, string>;
}> {
  const lines = body.split('\n');
  const out: Array<{ slug: string; fields: Record<string, string> }> = [];
  let current: { slug: string; fields: Record<string, string> } | null = null;
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+?)\s*$/);
    if (h2) {
      if (current) out.push(current);
      current = { slug: h2[1].trim(), fields: {} };
      continue;
    }
    if (!current) continue;
    const kv = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.+?)\s*$/);
    if (kv) {
      current.fields[kv[1]] = kv[2];
    }
  }
  if (current) out.push(current);
  return out;
}

function parseCategories(
  raw: string | undefined,
  fallbackSlugs: Set<string>,
): FolderTopologyCategory[] {
  if (raw) {
    const { body } = parseFrontmatter(raw);
    const sections = parseH2Sections(body);
    if (sections.length > 0) {
      return sections.map((s) => {
        const tone = s.fields.tone;
        return {
          slug: s.slug,
          name: s.fields.name ?? s.slug,
          tone:
            tone === 'indigo' || tone === 'amber' || tone === 'neutral'
              ? tone
              : undefined,
        };
      });
    }
  }
  return [...fallbackSlugs].map((slug) => ({
    slug,
    name: slug,
    tone: 'neutral' as const,
  }));
}

function parseStatuses(raw: string | undefined): FolderTopologyStatus[] {
  if (raw) {
    const { body } = parseFrontmatter(raw);
    const sections = parseH2Sections(body);
    if (sections.length > 0) {
      return sections.map((s) => ({
        slug: s.slug,
        label: s.fields.label ?? s.slug,
      }));
    }
  }
  return DEFAULT_STATUSES;
}
