import { compactOntologyDescription } from "@/shared/lib/ontology-description";

/** 히어로 한 줄 정의의 최대 길이 — 2줄 안에 들어오는 상한. */
const TAGLINE_MAX_CHARS = 160;

export interface ProjectTaglineSource {
  /** frontmatter `description:` — 사람이 직접 쓴 한 줄 정의. */
  description?: string | null;
  /** 본문 첫 문단 발췌 — 설명이 없을 때의 폴백. */
  excerpt?: string | null;
}

/**
 * 프로젝트 히어로에 놓을 **한 줄 정의**.
 *
 * 실측 결함(2026-07-26): 히어로가 발췌 320자를 그대로 흘려 문장이 어절
 * 한가운데에서 끊겼다 — "…이 프로젝트의 ontology 는 비즈니". 문단 길이의 글이
 * 메타 행 안으로 밀려들어 "답답하다" 는 인상의 절반을 만들었다.
 *
 * 두 가지를 지킨다:
 *
 * 1. **문장 경계에서 끝낸다.** `compactOntologyDescription` 이 첫 문장을
 *    골라내고, 문장 부호가 없으면 말줄임으로 닫는다 — 열린 채 끊기지 않는다.
 * 2. **없으면 지어내지 않는다.** 둘 다 비면 `undefined` 를 돌려주고 화면은
 *    설명 블록을 아예 그리지 않는다. 한 줄 정의는 vault 의 것이지 UI 가
 *    만들어 낼 것이 아니다 — 그래야 사용자가 `description:` 을 채울 이유가 생긴다.
 *
 * 전문·전체 발췌는 개요 탭 본문이 담당한다. 히어로는 개관, 본문은 상세
 * (Shneiderman: overview first, details on demand).
 */
export function resolveProjectTagline(
  source: ProjectTaglineSource,
): string | undefined {
  return (
    compactOntologyDescription(source.description, TAGLINE_MAX_CHARS) ??
    compactOntologyDescription(source.excerpt, TAGLINE_MAX_CHARS)
  );
}
