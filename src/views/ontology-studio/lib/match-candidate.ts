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
 * 을 함께 들고, 매칭은 둘 다(+ ref) 를 본다.
 *
 * 정규화: NFC → 소문자 → 앞뒤 공백 제거 → 연속 공백 1칸. 한글은 자소 분리(NFD)
 * 로 들어오는 입력이 있어 NFC 정규화가 필요하다(로컬 vault 파일명 · macOS 클립보드).
 */

export function normalizeForMatch(value: string): string {
  return value.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
}

/** 이 후보가 검색어와 일치하는가. 빈 검색어는 모두 통과. */
export function candidateMatches(candidate: CreateCandidate, query: string): boolean {
  const q = normalizeForMatch(query);
  if (q === "") return true;
  const haystacks = [candidate.title, candidate.canonicalTitle, candidate.ref];
  return haystacks.some((text) => text && normalizeForMatch(text).includes(q));
}
