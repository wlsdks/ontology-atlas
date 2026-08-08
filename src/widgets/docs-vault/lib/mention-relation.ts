import { applyFrontmatterUpdates } from '@/entities/docs-vault/lib/frontmatter-updates';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';

/**
 * 에디터의 `@` 멘션 — **고르면 관계가 된다.**
 *
 * ## 왜 이것이 필요했나 (2026-08-08 실측)
 *
 * 종전 에디터의 유일한 보조 기능은 `[[` 위키링크 자동완성이었다. 그런데 본문
 * 위키링크는 **컴파일된 그래프를 1비트도 바꾸지 않는다** — 같은 볼트에서
 * 위키링크를 넣었다 뺐을 때 엣지 수도 그래프 해시도 동일했다(9 · `c07785b6`).
 * 그래프는 frontmatter 키만 읽기 때문이다.
 *
 * 그래서 사람은 「이었다」고 믿는데 지도에는 선이 없고, 경로 찾기·영향 분석에도
 * 안 잡힌다. 도그푸드 볼트가 그 결말을 보여 준다 — **본문 위키링크 0개**,
 * frontmatter 관계 154개. 우리 자신도 안 쓴다.
 *
 * (정확히는 `find_backlinks` 하나가 본문도 훑어 `matchedInBody` 로 **구별해서**
 * 알려 준다. 데이터 모델은 이미 「두 종류의 연결」을 알고 있었고, 에디터만
 * 그 사실을 안 말하고 있었다.)
 *
 * ## 무엇을 하나
 *
 * `@` 로 노드를 고르고 관계를 고르면:
 *
 * 1. **frontmatter 에 관계를 쓴다** — 이것이 사실이다. 지도의 선이 되고,
 *    경로·영향·에이전트 핸드오프가 본다.
 * 2. **본문에는 사람이 읽는 이름만** 평문으로 남긴다. 이건 사실이 아니라
 *    문장이다 — 나중에 관계를 지워도 문장은 남고, 그게 맞다(사람이 쓴 글이다).
 *
 * 「같은 사실을 두 곳이 말하는」 것이 아니다. 한쪽은 사실, 한쪽은 읽기 좋은 글.
 *
 * ## 왜 순수 함수인가
 *
 * 에디터는 **frontmatter 를 포함한 원문 전체**를 textarea 로 편집한다. 그러니
 * 이 기능은 저장 경로를 새로 만들 필요가 없다 — 버퍼 문자열 변환 하나다.
 * 부수효과가 없으니 관계 배열의 canonical 규칙(중복 제거 + 정렬)을 브라우저
 * 없이 시험할 수 있다.
 */

/** `@` 트리거가 잡은 것 — 커서 앞의 질의어와 그 시작 위치. */
export interface MentionTrigger {
  query: string;
  start: number;
}

/**
 * 커서 바로 앞의 `@질의어` 를 찾는다.
 *
 * 열려 있는 조건이 좁다 — **매칭이 없으면 조용히 평범한 글자로 남아야** 하기
 * 때문이다. 문서함은 로컬 볼트를 열면 `CLAUDE.md`·`AGENTS.md` 도 편집할 수
 * 있는데, 그 파일들에서 `@AGENTS.md` 는 **진짜 import 문법**이다. 거기서 메뉴가
 * 끼어들면 남의 문법을 가로채는 것이 된다.
 *
 * 그래서 셋을 요구한다: ① `@` 앞이 줄머리이거나 공백일 것(이메일·핸들
 * 중간의 `@` 를 안 잡는다) ② 질의어에 줄바꿈이 없을 것 ③ 질의어가 `/` 나
 * `.` 로 시작하지 않을 것(`@docs/…`·`@AGENTS.md` 같은 경로 표기를 비켜간다).
 */
export function detectMentionTrigger(source: string, caret: number): MentionTrigger | null {
  if (caret < 1 || caret > source.length) return null;
  const back = source.slice(Math.max(0, caret - 120), caret);
  const at = back.lastIndexOf('@');
  if (at === -1) return null;
  const before = at === 0 ? (caret - back.length === 0 ? '' : source[caret - back.length - 1]) : back[at - 1];
  if (before && !/\s/.test(before)) return null;
  const query = back.slice(at + 1);
  if (/[\n\r]/.test(query)) return null;
  /*
   * 질의어에 `/` 나 `.` 가 **들어가는 순간** 물러난다 — 시작 글자만 보면
   * `@docs/…` 를 타이핑하는 중에 `@docs` 까지는 메뉴가 떠 있다가 슬래시에서
   * 사라진다. 그 깜빡임이 「가로채려다 만 것」으로 보이고, 무엇보다 그 사이
   * Enter 를 누르면 남의 문법이 노드 이름으로 바뀐다.
   */
  if (/[/.]/.test(query)) return null;
  return { query, start: caret - (back.length - at) };
}

/**
 * 관계 방위 — 공방의 나침반과 **같은 어휘**를 쓴다.
 *
 * 두 화면이 같은 일(관계 맺기)을 하는데 다른 말을 쓰면 사용자는 둘을 다른
 * 기능으로 배운다. 여기서 쓰는 frontmatter 키도 공방이 쓰는 것 그대로다 —
 * 새 키를 만들지 않는다(스키마는 `mcp/src/schema.mjs` 하나가 소유한다).
 */
export const MENTION_RELATIONS = [
  { id: 'broader', frontmatterKey: 'broader' },
  { id: 'contains', frontmatterKey: 'contains' },
  { id: 'dependencies', frontmatterKey: 'dependencies' },
  { id: 'relates', frontmatterKey: 'relates' },
] as const;

export type MentionRelationId = (typeof MENTION_RELATIONS)[number]['id'];

/**
 * 관계 id → **공방의 라벨 키.** 문구를 여기서 새로 만들지 않는다 — 공방이
 * 이미 「상위 개념 · 필요한 항목 · 하위 항목 · 관련 항목」을 갖고 있고,
 * 두 화면이 같은 일에 다른 말을 쓰면 사용자가 두 기능으로 배운다.
 */
export const RELATION_LABEL_KEY: Record<MentionRelationId, string> = {
  broader: 'isA',
  contains: 'contains',
  dependencies: 'dependsOn',
  relates: 'relates',
};

const RELATION_KEY_BY_ID = new Map<string, string>(
  MENTION_RELATIONS.map((relation) => [relation.id, relation.frontmatterKey]),
);

/**
 * 관계 배열의 정본 모양 — **중복 제거 + `localeCompare` 정렬.**
 *
 * 이 규칙을 여기서 새로 정하지 않는다. `validate-vault-document.ts` 의
 * `non-canonical-graph-array` 가 이미 그 모양을 요구하고 있고, 그것과 다르게
 * 쓰면 우리가 방금 쓴 파일이 우리 검사에서 경고를 받는다.
 */
function canonicalRefs(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export interface MentionInsertResult {
  /** 갱신된 원문 전체(frontmatter 포함). */
  content: string;
  /** 삽입 뒤 커서가 있어야 할 위치. */
  caret: number;
  /** 이번 삽입이 실제로 관계를 **새로** 추가했나(이미 있었으면 false). */
  relationAdded: boolean;
}

/**
 * `@` 로 고른 노드를 **관계로 적고, 본문에는 이름을 남긴다.**
 *
 * `content` 는 frontmatter 를 포함한 원문 전체다. `caret` 은 그 안의 절대 위치.
 */
export function insertMentionRelation({
  content,
  trigger,
  target,
  relationId,
}: {
  content: string;
  trigger: MentionTrigger;
  target: { slug: string; title: string };
  relationId: MentionRelationId;
}): MentionInsertResult {
  const key = RELATION_KEY_BY_ID.get(relationId);
  if (!key) throw new Error(`Unknown relation: ${relationId}`);

  // ① 본문 — `@질의어` 를 사람이 읽는 이름으로 갈아 끼운다.
  const label = target.title.trim() || target.slug;
  const withLabel =
    content.slice(0, trigger.start) +
    label +
    content.slice(trigger.start + 1 + trigger.query.length);
  const caretAfterLabel = trigger.start + label.length;

  // ② frontmatter — 관계를 더한다. 이미 있으면 파일을 건드리지 않는다.
  const { frontmatter } = parseFrontmatter(withLabel);
  const existingRaw = frontmatter[key];
  const existing = Array.isArray(existingRaw)
    ? existingRaw.filter((item): item is string => typeof item === 'string')
    : [];
  if (existing.some((ref) => ref.trim() === target.slug)) {
    return { content: withLabel, caret: caretAfterLabel, relationAdded: false };
  }
  const next = canonicalRefs([...existing, target.slug]);

  /*
   * ⚠️ **본문을 먼저 바꾸고 frontmatter 를 나중에 쓴다.** 순서가 반대면
   * `applyFrontmatterUpdates` 가 돌려준 문자열에서 frontmatter 길이가 달라져
   * 본문 오프셋(`trigger.start`)이 어긋난다. 커서가 엉뚱한 데로 가는 정도가
   * 아니라 **글자를 다른 자리에서 잘라낸다.**
   */
  const withRelation = applyFrontmatterUpdates(withLabel, { [key]: next });
  const grew = withRelation.length - withLabel.length;
  return {
    content: withRelation,
    // frontmatter 가 길어진 만큼 본문의 커서도 뒤로 밀린다.
    caret: caretAfterLabel + grew,
    relationAdded: true,
  };
}
