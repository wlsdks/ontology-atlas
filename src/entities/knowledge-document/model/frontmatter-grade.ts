import type { KnowledgeDocumentFrontmatter } from "./types";

export type FrontmatterGrade = "A" | "B" | "C";

export interface FrontmatterGradeResult {
  grade: FrontmatterGrade;
  /** 비어 있는 필수 키 (id / kind / project / title / version). */
  missingRequired: string[];
  /** 비어 있는 권장 키 (domain / status / aliases / tags). */
  missingRecommended: string[];
}

const REQUIRED_KEYS = ["id", "kind", "project", "title", "version"] as const;
const RECOMMENDED_KEYS = ["domain", "status", "aliases", "tags"] as const;

/**
 * `ontology-frontmatter-contract.md` §2 등급 평가.
 *
 *   - A (strict): 필수 5 + 권장 4 모두 채움 → 신뢰도 cap 1.0
 *   - B (lenient): 필수 5 만, 권장 일부 누락 → cap 0.84
 *   - C (freeform): 필수 누락 → cap 0.59 (자동 반영 금지)
 *
 * 페이지 폼 입력 (pageTitle / pageKind / pageProjectIds) 도 frontmatter 와 합쳐
 * 평가 — 사용자가 폼만 채워도 등급 올라가는 효과. 단 `id` / `version` 은 frontmatter
 * 에서만 (페이지에 해당 필드 없음).
 *
 * 추출 워커가 매기는 등급과 1:1 일치하도록 — UI 가 미리 보여주는 신호 = 워커 최종
 * 신호.
 */
export function computeFrontmatterGrade(input: {
  frontmatter: KnowledgeDocumentFrontmatter;
  pageTitle?: string;
  pageKind?: string;
  pageProjectIds?: string[];
}): FrontmatterGradeResult {
  const { frontmatter, pageTitle, pageKind, pageProjectIds } = input;

  const filled: Record<string, boolean> = {
    // frontmatter 만 — 페이지에 해당 필드 없음.
    id: nonEmptyString(frontmatter.id),
    version: frontmatter.version !== undefined && frontmatter.version !== null,
    // frontmatter 우선 + 페이지 fallback.
    kind: nonEmptyString(frontmatter.kind) || nonEmptyString(pageKind),
    title: nonEmptyString(frontmatter.title) || nonEmptyString(pageTitle),
    project:
      nonEmptyString(frontmatter.project)
      || (Array.isArray(frontmatter.projectIds) && frontmatter.projectIds.length > 0)
      || (Array.isArray(pageProjectIds) && pageProjectIds.length > 0),
    // 권장 — frontmatter 만.
    domain: nonEmptyString(frontmatter.domain),
    status: nonEmptyString(frontmatter.status),
    aliases: Array.isArray(frontmatter.aliases) && frontmatter.aliases.length > 0,
    tags: Array.isArray(frontmatter.tags) && frontmatter.tags.length > 0,
  };

  const missingRequired = REQUIRED_KEYS.filter((k) => !filled[k]);
  const missingRecommended = RECOMMENDED_KEYS.filter((k) => !filled[k]);

  let grade: FrontmatterGrade = "A";
  if (missingRequired.length > 0) grade = "C";
  else if (missingRecommended.length > 0) grade = "B";

  return { grade, missingRequired: [...missingRequired], missingRecommended: [...missingRecommended] };
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}
