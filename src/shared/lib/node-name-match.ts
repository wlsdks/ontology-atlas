/**
 * 노드 이름 매칭의 단일 규칙 — 검색 표면이 여러 개라도 "화면에 보이는 이름을
 * 그대로 입력하면 찾힌다" 는 계약은 하나여야 한다.
 *
 * 왜 필요했나: 지도·INDEX·팝오버·공방은 어권별 표시 이름(frontmatter
 * `display_ko:` / `display_en:`)을 그리는데, 전역 검색은 canonical `title` 만
 * 인덱싱했다. 그래서 한국어 화면에서 "온톨로지 코어" 를 눈으로 읽고 그대로
 * 검색하면 0건이고, 사용자가 본 적 없는 원문 "Ontology Core" 를 알아야만
 * 찾혔다. 공방 피커는 표시 이름을 봤으므로 두 검색 표면이 서로 다르게
 * 행동하기까지 했다.
 *
 * 계약(AGENTS.md): `title` 은 검색/매칭의 단일 진실원이다. 표시 이름은 그
 * 진실원을 **대체하지 않고 더한다** — 매칭 범위를 넓히기만 하므로 원문으로
 * 찾던 사용자는 그대로 찾을 수 있다. 볼트가 쓰는 로케일을 전부 넣는 이유는
 * 한국어 화면에서 영어 이름으로도, 그 반대로도 찾혀야 하기 때문이다.
 *
 * 정규화: NFC → 소문자 → 앞뒤 공백 제거 → 연속 공백 1칸. 한글은 자소
 * 분리(NFD)로 들어오는 입력이 있어 NFC 정규화가 필요하다(로컬 vault 파일명 ·
 * macOS 클립보드).
 */

/** 매칭 전 정규화 — 질의와 건초더미 양쪽에 같은 함수를 쓴다. */
export function normalizeForMatch(value: string): string {
  return value.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
}

/** 이름을 가진 노드의 최소 shape — 그래프 노드도 피커 후보도 만족한다. */
export interface NodeNameSource {
  /** frontmatter 의 canonical title — 검색/매칭의 단일 진실원. */
  title: string;
  /** 현재 로케일로 해석된 표시 이름(있으면). */
  display?: string;
  /** `display_<locale>` 원본 전체 — 화면 언어와 무관하게 모두 검색 대상. */
  displayLocales?: Readonly<Record<string, string>>;
}

/**
 * 이 노드를 가리키는 이름 전부 — canonical title + 표시 이름(현재 로케일 +
 * 모든 어권). 중복/빈 값 제거, canonical title 이 항상 첫 항목.
 */
export function nodeNameCandidates(node: NodeNameSource): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (trimmed === "") return;
    const key = normalizeForMatch(trimmed);
    if (key === "" || seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };
  push(node.title);
  push(node.display);
  for (const value of Object.values(node.displayLocales ?? {})) push(value);
  return out;
}

/** 이름 중 하나라도 질의와 정확히 같은가 (정규화된 질의를 받는다). */
export function nameEquals(node: NodeNameSource, normalizedQuery: string): boolean {
  return nodeNameCandidates(node).some((name) => normalizeForMatch(name) === normalizedQuery);
}

/** 이름 중 하나라도 질의로 시작하는가 (정규화된 질의를 받는다). */
export function nameStartsWith(node: NodeNameSource, normalizedQuery: string): boolean {
  return nodeNameCandidates(node).some((name) => normalizeForMatch(name).startsWith(normalizedQuery));
}

/** 이름 중 하나라도 질의를 포함하는가 (정규화된 질의를 받는다). */
export function nameIncludes(node: NodeNameSource, normalizedQuery: string): boolean {
  return nodeNameCandidates(node).some((name) => normalizeForMatch(name).includes(normalizedQuery));
}
