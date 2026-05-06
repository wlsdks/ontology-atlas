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
  options: { body?: string } = {},
): string {
  const fm = projectToFrontmatter(project);
  const fmLines = Object.entries(fm).map(([k, v]) => `${k}: ${serializeValue(v)}`);
  const body = options.body?.trim() || `# ${project.name}\n`;
  return `---\n${fmLines.join('\n')}\n---\n\n${body}`;
}

function serializeValue(v: string | number | boolean | string[]): string {
  if (Array.isArray(v)) {
    return `[${v.map((s) => (needsQuote(s) ? `"${s.replace(/"/g, '\\"')}"` : s)).join(', ')}]`;
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return needsQuote(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

function needsQuote(s: string): boolean {
  return /[:,\[\]"]|^\s|\s$/.test(s);
}
