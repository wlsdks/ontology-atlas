import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';

/**
 * project.md 의 raw 파일 전체(frontmatter 포함)에서 본문만 추출.
 *
 * 왜 필요한가 — /project/[slug] 상세의 "본문" 카드는 실제로 project.md 의
 * 마크다운 본문을 보여줘야 하는데, Project.detail 은 frontmatter 의 명시적
 * `detail:` 키(에디터 폼의 별도 필드, project-frontmatter.ts 가 그대로
 * round-trip 저장)만 읽는다. 실제 vault 문서는 대부분 `detail:` 없이 body
 * 에 내용을 쓰므로 본문 카드가 항상 비어 보였다 (본 파일이 그 gap 을 메움).
 *
 * 이 함수는 표시 전용 — 반환값을 Project.detail 에 대입하면 에디터 폼이
 * 본문 전체를 "detail" 필드로 오인해 저장 시 frontmatter 에 중복 기록하는
 * 회귀가 생긴다. 호출자는 반드시 별도 필드로 유지 (project-data-source 의
 * useProjectBody 참고).
 */
export function extractProjectBody(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const body = parseFrontmatter(raw).body.trim();
  return body.length > 0 ? body : undefined;
}
