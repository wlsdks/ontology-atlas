import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { slugify } from '@/shared/lib/slugify';

/**
 * 블록 import 병합 계획 — **순수 dry-run**. 이 모듈은 vault 를 절대 만지지
 * 않는다: 입력(.md raw 들 + 기존 slug 집합)을 받아 "무엇을 어떤 slug 로 쓸
 * 것인가"를 데이터로만 반환하고, 실제 쓰기는 사용자가 다이얼로그에서 승인한
 * 뒤 UI 가 기존 vault 쓰기 경로(`createDoc`)로 수행한다. 승인 전 쓰기 0 이
 * 절대 계약이다.
 *
 * CLI `node $ATLAS/cli/src/index.mjs import` (`cli/src/commands/import.mjs`) 와의 정합:
 * - kind: frontmatter `kind:` 만 신뢰, 없으면 kindless skip (동일).
 * - slug: frontmatter `slug:` 우선, 없으면 파일 경로(.md 제거) (동일 —
 *   export 가 폴더 구조를 보존하므로 CLI 의 kind-folder auto-prefix 는 불요).
 * - 배치 내 중복 slug 도 충돌로 취급 (동일 — claimedSlugs).
 * - 충돌 회피 실패 시 `-2`/`-3` suffix (동일 — nextFreeSlug).
 * - 다른 점 하나(의도적): CLI `--rename` 은 리네임 후 위키링크를 다시 쓰지
 *   않지만, 블록은 "서로 참조하는 서브그래프 묶음"이라 사용자가 접두사
 *   해소를 골랐다면 블록 *내부* 파일들의 `[[old]]` / `(...old.md)` 참조도
 *   새 slug 를 따라간다 — 앱의 `renameDoc(rewriteBacklinks)` 와 같은 regex
 *   계약. vault 쪽 기존 문서는 건드리지 않는다(기존 slug 는 그대로 존재).
 */

export type BlockConflictResolution = 'skip' | 'prefix';

export interface BlockImportFile {
  /** 블록 폴더 루트 기준 상대 경로 (e.g. `capabilities/login.md`). */
  path: string;
  raw: string;
}

export type BlockImportEntryStatus =
  | 'new'
  | 'conflict-skipped'
  | 'conflict-renamed'
  | 'kindless';

export interface BlockImportEntry {
  originalSlug: string;
  /** null = 쓰지 않음 (skip / kindless). */
  finalSlug: string | null;
  kind: string | null;
  title: string;
  status: BlockImportEntryStatus;
}

export interface BlockImportWrite {
  slug: string;
  content: string;
}

export interface BlockImportPlan {
  entries: BlockImportEntry[];
  /** 승인 시 이대로 vault 에 기록될 파일들 — plan 단계에선 데이터일 뿐. */
  writes: BlockImportWrite[];
  newCount: number;
  conflictCount: number;
  kindlessCount: number;
}

export interface BlockImportPlanOptions {
  resolution: BlockConflictResolution;
  blockName: string;
  sourceProject: string;
}

/** `capabilities/login` + `auth-block` → `capabilities/auth-block-login`. 이미 접두사면 그대로. */
export function prefixBlockSlug(slug: string, blockPrefix: string): string {
  const idx = slug.lastIndexOf('/');
  const dir = idx === -1 ? '' : slug.slice(0, idx + 1);
  const tail = idx === -1 ? slug : slug.slice(idx + 1);
  if (blockPrefix && tail.startsWith(`${blockPrefix}-`)) return slug;
  return `${dir}${blockPrefix}-${tail}`;
}

/** 본문 끝에 provenance 인용 한 줄 — import 감사 흔적 (스펙 리터럴 계약). */
export function appendProvenance(
  raw: string,
  blockName: string,
  sourceProject: string,
): string {
  const line = `> Imported from block "${blockName}" (${sourceProject})`;
  return `${raw.replace(/\n*$/, '')}\n\n${line}\n`;
}

/** frontmatter 블록 안의 `slug:` 라인만 새 값으로 교체 (없으면 그대로 — slug 는 경로가 진실원). */
function setFrontmatterSlug(raw: string, newSlug: string): string {
  if (!raw.startsWith('---')) return raw;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return raw;
  const head = raw.slice(0, end);
  const rest = raw.slice(end);
  const nextHead = head.replace(/^slug:\s*.*$/m, `slug: ${newSlug}`);
  return nextHead + rest;
}

/** renameDoc(rewriteBacklinks) 과 같은 두 regex — [[old]] 계열 + (...old.md). */
function rewriteSlugRefs(raw: string, oldSlug: string, newSlug: string): string {
  const escaped = oldSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wikiRe = new RegExp(`(\\[\\[)(${escaped})(\\||#|\\]\\])`, 'g');
  const mdRe = new RegExp(`(\\]\\([^)]*?)(${escaped})(\\.md)`, 'g');
  return raw.replace(wikiRe, `$1${newSlug}$3`).replace(mdRe, `$1${newSlug}$3`);
}

function extractFirstH1(body: string): string | null {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) return trimmed.slice(2).trim();
  }
  return null;
}

function nextFreeSlug(base: string, taken: (slug: string) => boolean): string {
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken(candidate)) return candidate;
  }
  return base;
}

export function planBlockImport(
  files: readonly BlockImportFile[],
  existingSlugs: ReadonlySet<string>,
  opts: BlockImportPlanOptions,
): BlockImportPlan {
  const blockPrefix = slugify(opts.blockName) || 'block';
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const claimed = new Set<string>();
  const taken = (slug: string) => existingSlugs.has(slug) || claimed.has(slug);

  interface Draft {
    entry: BlockImportEntry;
    raw: string;
  }
  const drafts: Draft[] = [];
  const renames = new Map<string, string>();

  for (const f of sorted) {
    const parsed = parseFrontmatter(f.raw);
    const fm = parsed.frontmatter;
    const kind = typeof fm.kind === 'string' && fm.kind.trim() ? fm.kind.trim() : null;
    const baseSlug =
      typeof fm.slug === 'string' && fm.slug.trim()
        ? fm.slug.trim()
        : f.path.replace(/\.md$/, '');
    const title =
      typeof fm.title === 'string' && fm.title.trim()
        ? fm.title.trim()
        : extractFirstH1(parsed.body) ?? baseSlug;

    if (!kind) {
      drafts.push({
        entry: { originalSlug: baseSlug, finalSlug: null, kind: null, title, status: 'kindless' },
        raw: f.raw,
      });
      continue;
    }

    if (!taken(baseSlug)) {
      claimed.add(baseSlug);
      drafts.push({
        entry: { originalSlug: baseSlug, finalSlug: baseSlug, kind, title, status: 'new' },
        raw: f.raw,
      });
      continue;
    }

    if (opts.resolution === 'skip') {
      drafts.push({
        entry: {
          originalSlug: baseSlug,
          finalSlug: null,
          kind,
          title,
          status: 'conflict-skipped',
        },
        raw: f.raw,
      });
      continue;
    }

    // prefix 해소 — 접두사로도 막히면 CLI --rename 정합의 -2/-3.
    let renamedSlug = prefixBlockSlug(baseSlug, blockPrefix);
    if (taken(renamedSlug)) renamedSlug = nextFreeSlug(renamedSlug, taken);
    claimed.add(renamedSlug);
    renames.set(baseSlug, renamedSlug);
    drafts.push({
      entry: {
        originalSlug: baseSlug,
        finalSlug: renamedSlug,
        kind,
        title,
        status: 'conflict-renamed',
      },
      raw: f.raw,
    });
  }

  const writes: BlockImportWrite[] = [];
  for (const d of drafts) {
    if (d.entry.finalSlug === null) continue;
    let content = d.raw;
    for (const [oldSlug, newSlug] of renames) {
      content = rewriteSlugRefs(content, oldSlug, newSlug);
    }
    if (d.entry.status === 'conflict-renamed') {
      content = setFrontmatterSlug(content, d.entry.finalSlug);
    }
    content = appendProvenance(content, opts.blockName, opts.sourceProject);
    writes.push({ slug: d.entry.finalSlug, content });
  }

  const entries = drafts.map((d) => d.entry);
  return {
    entries,
    writes,
    newCount: entries.filter((e) => e.status === 'new').length,
    conflictCount: entries.filter(
      (e) => e.status === 'conflict-skipped' || e.status === 'conflict-renamed',
    ).length,
    kindlessCount: entries.filter((e) => e.status === 'kindless').length,
  };
}
