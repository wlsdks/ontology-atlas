/**
 * Project entity ↔ vault frontmatter 양방향 매퍼.
 *
 * - read 방향: `mapFrontmatterToProject` (build-topology-from-vault 의 private
 *   동등물을 export 형태로). vault 의 `projects/*.md` 를 Project 타입으로.
 * - write 방향: `projectToFrontmatter` — Project (또는 ProjectInput) 에서
 *   YAML-like frontmatter object 생성. 로컬 vault 의 createDoc / updateDoc
 *   에 그대로 직렬화 가능 (`apply-frontmatter-updates` 호환).
 *
 * 우리 간단 frontmatter 파서 한계 (`shared/lib/parse-frontmatter`):
 * inline object 미지원 → position 은 split 필드 (`positionX`, `positionY`).
 * 그 외 모든 필드는 string / number / boolean / string[] 만.
 */

import type { Project, ProjectInput } from '@/entities/project';
import { generateNodeUid } from './build-vault-markdown';

/**
 * Starter `display_<locale>` values shipped by the `node $ATLAS/cli/src/index.mjs init`
 * project template (`ontology-starter.ts` PROJECT_MD). C6 — these are treated
 * as "never customized": when a project is renamed while its display name still
 * equals one of these, the display key is auto-filled from the new title so the
 * map/INDEX don't keep showing "내 프로젝트" / "My project" after a rename.
 * A user who set their own display name is NOT in this set, so their choice is
 * never overwritten.
 */
export const STARTER_PROJECT_DISPLAY_VALUES: ReadonlySet<string> = new Set([
  '내 프로젝트',
  'My project',
]);

/**
 * Starter project body summary shipped by `node $ATLAS/cli/src/index.mjs init` (PROJECT_MD).
 * With no `description:` frontmatter the derived `Project.description` falls back
 * to the body excerpt — this English boilerplate. #9 — quick-edit treats it as
 * "never filled in" so it renders as a placeholder (empty value), not a real
 * value the user has to delete before writing a real one-liner.
 */
export const STARTER_PROJECT_DESCRIPTION_MARKERS: readonly string[] = [
  'Write a one- or two-line summary of your project here',
  '프로젝트를 한두 줄로 요약',
];

export function isStarterProjectDescription(
  description: string | null | undefined,
): boolean {
  if (!description) return false;
  const trimmed = description.trim();
  return STARTER_PROJECT_DESCRIPTION_MARKERS.some((marker) =>
    trimmed.startsWith(marker),
  );
}

/**
 * Given the existing frontmatter and a new project name, compute the
 * `display_<locale>` updates needed so stale STARTER display names track the
 * rename. Returns only the keys that are currently at a starter default (empty
 * object when there's nothing to sync). C6.
 */
export function buildStarterDisplaySync(
  existingFrontmatter: Record<string, unknown>,
  newName: string,
): Record<string, string> {
  const trimmed = newName.trim();
  if (!trimmed) return {};
  const updates: Record<string, string> = {};
  for (const [key, value] of Object.entries(existingFrontmatter)) {
    if (!/^display_[a-z]{2}$/.test(key)) continue;
    if (typeof value !== 'string') continue;
    if (STARTER_PROJECT_DISPLAY_VALUES.has(value.trim())) {
      updates[key] = trimmed;
    }
  }
  return updates;
}

/**
 * Project 직렬화에 사용하는 *optional* 필드 형태 — Project 와 ProjectInput
 * 양쪽이 완전 일치하지 않으므로 (예: position 이 한쪽은 required) 직렬화
 * 시점에 부분집합만 보면 충분하다.
 */
export interface ProjectFrontmatterShape {
  slug: string;
  name: string;
  // R15 (Concern 1) — Project type 이 vault-true honest 라 category 도 optional.
  // ProjectInput 은 form-local required 라 둘 다 통과되도록 optional 로 둠.
  category?: string;
  status?: string;
  description?: string;
  detail?: string;
  tags?: string[];
  stack?: string[];
  dependencies?: string[];
  owner?: string;
  icon?: string;
  isHub?: boolean;
  position?: { x: number; y: number };
}

// 컴파일 타임 sanity — \`Project\` 와 \`ProjectInput\` 이 ProjectFrontmatterShape
// 의 \`extends\` 관계에 있는지 확인. (참고: 이 check 는 FM 의 필드가 모두
// Project 에 있는지만 보장. Project 에 새 필드가 추가돼도 자동으로
// FM 에 추가되지는 않으므로 직렬화 누락 위험은 별도 점검.)
type _ProjectAssignable = Project extends ProjectFrontmatterShape ? true : false;
type _ProjectInputAssignable = ProjectInput extends ProjectFrontmatterShape ? true : false;
const _projectCheck: _ProjectAssignable = true;
const _projectInputCheck: _ProjectInputAssignable = true;
void _projectCheck;
void _projectInputCheck;

/**
 * Project → vault frontmatter object. 빈 값 / undefined 는 omit (우리
 * frontmatter 직렬화기가 null 만 delete 로 인식하므로 skip 으로 충분).
 */
export function projectToFrontmatter(
  project: ProjectFrontmatterShape,
): Record<string, string | number | boolean | string[]> {
  const out: Record<string, string | number | boolean | string[]> = {};
  // 이 매퍼의 입력은 Project/ProjectInput 으로 이미 타입이 확정된 쓰기 경로다.
  // 신규 문서와 full edit 모두 graph node 계약을 잃지 않도록 kind 를 정규화한다.
  out.kind = 'project';
  out.name = project.name;
  out.slug = project.slug;
  // R15 — category 가 optional 이라 명시 없으면 frontmatter 에서도 omit
  // (vault frontmatter 가 진실원이라 *없는 정보 fabricate 하지 않음*).
  if (project.category) out.category = project.category;
  if (project.status) out.status = project.status;
  if (project.description?.trim()) out.description = project.description;
  if (project.detail?.trim()) out.detail = project.detail;
  if (project.tags && project.tags.length > 0) out.tags = project.tags;
  if (project.stack && project.stack.length > 0) out.stack = project.stack;
  if (project.dependencies && project.dependencies.length > 0) {
    out.dependencies = project.dependencies;
  }
  if (project.owner?.trim()) out.owner = project.owner;
  if (project.icon?.trim()) out.icon = project.icon;
  if (project.isHub) out.isHub = true;
  // position 은 split 필드로 — frontmatter 파서가 inline object 못 읽음.
  if (project.position) {
    out.positionX = project.position.x;
    out.positionY = project.position.y;
  }
  return out;
}

/**
 * Project frontmatter → 본문 위 raw markdown (frontmatter block 포함).
 * createDoc 의 초기 content 로 사용.
 */
export function buildProjectMarkdown(
  project: ProjectFrontmatterShape,
  options: { body?: string; uid?: string } = {},
): string {
  const fm = projectToFrontmatter(project);
  const fmLines = Object.entries({ uid: generateNodeUid(options.uid), ...fm }).map(
    ([k, v]) => `${k}: ${serializeValue(v)}`,
  );
  const body = options.body?.trim() || `# ${project.name}\n`;
  return `---\n${fmLines.join('\n')}\n---\n\n${body}`;
}

function serializeValue(v: string | number | boolean | string[]): string {
  if (Array.isArray(v)) {
    return `[${v.map((s) => (needsQuote(s) ? `"${escapeQuoted(s)}"` : s)).join(', ')}]`;
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return needsQuote(v) ? `"${escapeQuoted(v)}"` : v;
}

/*
 * 따옴표가 필요한 값인가 — **네 곳이 같은 답을 내야 한다.**
 *
 * ## 왜 규칙이 바뀌었나 (2026-08-16 검수, 재현됨)
 *
 * 줄바꿈이 빠져 있었다. 그 한 글자가 frontmatter 블록을 통째로 부순다:
 * `note\nkind: element` 는 **노드의 종류를 바꾸고**, `note\n---\nx: 1` 은
 * frontmatter 를 거기서 끝내 나머지 키를 본문으로 떨어뜨린다. 그리고 아무
 * 경고도 안 난다.
 *
 * 따옴표만으로는 안 된다 — 줄이 이미 끊겼기 때문이다. 그래서 쓰는 쪽이
 * `\n` 으로 **이스케이프**하고 읽는 쪽이 되돌린다(`unquote`).
 *
 * 작은따옴표도 규칙에 들어왔다. `unquote` 는 짝이 안 맞는 따옴표를 양 끝에서
 * 벗기므로, `'지도'` 같은 값이 따옴표 없이 쓰이면 되읽을 때 `지도` 가 된다.
 */
function needsQuote(s: string): boolean {
  return /[:,#\[\]"'{}&|*!%@`\n\t]|^\s|\s$/.test(s);
}

/** 따옴표 안에 안전하게 담기도록 만든다 — 줄바꿈은 `\n` 으로 접는다. */
function escapeQuoted(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}
