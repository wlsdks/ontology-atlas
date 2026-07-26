import { nameIncludes, normalizeForMatch } from "@/shared/lib/node-name-match";
import type { CreateCandidate } from "./build-create-node";

/**
 * 공방 소켓 피커의 후보 매칭 (#66).
 *
 * 결함: `candidateFromNode` 가 `title: node.display ?? node.title` 로 **canonical
 * title 을 버렸고**, 피커 필터는 그 display 와 `ref` 만 봤다. 그래서
 * `display_ko: 예시 구성요소` 가 달린 노드는 원문 `Example element` 로 검색해도
 * 나오지 않았다 — ref 슬러그(`elements/example-element`)에는 공백이 없어 부분
 * 일치도 실패한다 (opus5 검수 2026-07-25 · codex 감사 P2).
 *
 * AGENTS.md 계약: "title 은 검색/매칭의 단일 진실원". 표시 이름은 화면용 레이어일
 * 뿐 매칭 범위를 **줄여서는 안 된다**. 그래서 후보는 표시 이름과 canonical title
 * 을 함께 들고, 매칭은 둘 다(+ 다른 어권 이름 + ref) 를 본다.
 *
 * 이름 규칙 자체는 `shared/lib/node-name-match` 가 단일 출처다 — 전역 검색과
 * 이 피커가 같은 규칙을 쓰지 않으면 "피커에선 나오는데 검색에선 안 나온다" 는
 * 표면 간 불일치가 생긴다(흐름 점검 2026-07-26). 여기서 더하는 것은 `ref`
 * 하나뿐이다(피커는 frontmatter 에 쓸 슬러그를 직접 아는 사용자도 상대한다).
 */

export { normalizeForMatch };

/** 이 후보가 검색어와 일치하는가. 빈 검색어는 모두 통과. */
export function candidateMatches(candidate: CreateCandidate, query: string): boolean {
  const q = normalizeForMatch(query);
  if (q === "") return true;
  const nameMatch = nameIncludes(
    {
      // 후보의 `title` 은 현재 로케일의 표시 이름, `canonicalTitle` 이 원문.
      title: candidate.canonicalTitle ?? candidate.title,
      display: candidate.title,
      displayLocales: candidate.displayLocales,
    },
    q,
  );
  return nameMatch || normalizeForMatch(candidate.ref).includes(q);
}
