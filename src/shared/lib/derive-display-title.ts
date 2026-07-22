/**
 * 표시용 짧은 제목 파생 — 과제 ⑩ (표시 이름 레이어).
 *
 * dogfood vault 의 일부 노드 title 은 40단어+ 짜리 부연 설명을 괄호로 달고
 * 있다 (예: `capabilities/cli-developer-entry` — "CLI Developer Entry (49
 * commands — vault + MCP verify + ...)"). 토폴로지 라벨 / INDEX 패널 행 /
 * 노드 팝오버 / 상세 헤더가 이 title 을 그대로 그리면 지저분하고 잘린다 —
 * 비개발자 가독성 핵심 이슈. 이 함수는 그 title 에서 "표시용" 짧은 이름만
 * 파생하는 순수 함수 — vault frontmatter 는 건드리지 않는다.
 *
 * 우선순위:
 *   (a) frontmatter `display:` 필드가 있으면 그대로 사용 — 사용자가 명시적
 *       으로 짧은 이름을 지정한 경우 최우선.
 *   (b) title 의 첫 " (" (공백+여는 괄호) 앞부분 — 괄호 부연 설명을 컷.
 *   (c) title 그대로 — 괄호도 display 필드도 없으면 축약할 것이 없다.
 *
 * 최대 길이 컷은 의도적으로 없다 — (b) 의 괄호 규칙이 이미 실사용 사례
 * (긴 title 은 거의 항상 "짧은 이름 (부연 설명)" 형태) 를 충분히 짧게
 * 만든다. 길이 상한이 필요한 좁은 표면(MiniDomainMap 등)은 이 함수의
 * 결과를 입력으로 받아 자체적으로 더 자를 수 있다
 * (`views/project-detail/model/short-domain-title.ts` 참고 — 같은 괄호
 * 규칙 + MAX_LENGTH ellipsis).
 *
 * **검색/매칭에는 쓰지 않는다** — 매칭(`matchOntologyNodes` 등)은 원본
 * title 전체로 계속 수행해야 한다. 이 함수는 렌더링 표면 전용.
 */
export function deriveDisplayTitle(
  frontmatter: Record<string, unknown> | null | undefined,
  title: string,
): string {
  const display =
    frontmatter && typeof frontmatter.display === "string"
      ? frontmatter.display.trim()
      : "";
  if (display) return display;

  const parenIndex = title.indexOf(" (");
  if (parenIndex > 0) return title.slice(0, parenIndex).trim();

  return title;
}
