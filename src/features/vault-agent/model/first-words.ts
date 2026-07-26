import {
  detectMeaningGaps,
  resolveNodeAgentTarget,
  resolveNodeDocument,
  type ConceptDocFacts,
  type KnowledgeGraphNode,
} from '@/entities/knowledge-graph';

/**
 * **첫 마디** — 빈 입력칸 앞에 선 사람에게 이 폴더의 실제 상태에서 뽑은
 * 문장을 미리 놓아 준다.
 *
 * ## 왜 필요한가
 *
 * Cursor 를 쓰는 사람은 코드가 눈앞에 있고 물을 말을 안다. 이 앱을 여는
 * 사람은 개념 설계가 처음이라 **빈 입력칸이 곧 백지 공포**다. 키를 넣고
 * 범위 시트를 지나도 첫 마디가 안 나오면 거기서 흐름이 멎는다.
 *
 * ## 계약 — 여기서 모델을 부르지 않는다
 *
 * 이 파일은 **순수 함수뿐**이다. 네트워크도, 브리지도, 프로바이더도 import
 * 하지 않는다. 칩은 사용자가 아직 동의하지 않은 순간에 그려지므로, 칩을
 * 만들려고 한 번이라도 호출이 나가면 그것이 곧 **무동의 전송이자 남의 돈
 * (BYOK 요금) 무단 사용**이다. 에이전트가 먼저 말을 거는 설계(자동 첫 턴)를
 * 기각한 이유가 그것이고, 그 기각을 성립시키는 것이 이 파일의 순수성이다.
 * `tests/contract/agent-first-words-local.contract.test.ts` 가 잠근다.
 *
 * ## 칩은 프리필이지 전송이 아니다
 *
 * 누르면 입력칸에 문장이 앉을 뿐이다. 고쳐서 보내도 되고 지워도 된다 —
 * 사용자의 말을 뺏지 않는다. 전송은 언제나 [보내기]다.
 *
 * ## 문장 생성기는 한 벌이다
 *
 * 같은 함수가 세 자리를 먹인다: ① 빈 대화의 칩 ② 키/폴더가 없는 상태의
 * **평문 목록**(완결 불가능한 버튼을 그리지 않는다) ③ 큐 행·노드 상세에서
 * 건너올 때의 프리필(S7). 두 벌을 만들면 두 입구가 다른 말을 하는 날이 온다.
 */

/** 칩이 앉는 자리 — 고정 우선순위. 화면 → 큐 → 상비. */
export type FirstWordsSlot = 'screen' | 'queue' | 'standing';

/**
 * 문장이 말하려는 것. 화면 언어와 분리해 둔 이유: 같은 의도가 ko·en 두
 * 문장이 되고, S7 이 URL 로 나를 때는 이 종류만 실려 가면 되기 때문이다.
 */
export type FirstWordsIntent =
  | { kind: 'missing-definition'; ref: string; title: string }
  | { kind: 'missing-domain'; ref: string; title: string }
  | { kind: 'missing-relations'; ref: string; title: string }
  | { kind: 'map-review' }
  | { kind: 'empty-vault' };

/** URL(S7)로 나를 수 있는 의도 이름 — 노드 하나를 가리키는 것들만. */
export type FirstWordsNodeIntentKind =
  | 'missing-definition'
  | 'missing-domain'
  | 'missing-relations';

const NODE_INTENT_KINDS: ReadonlySet<string> = new Set([
  'missing-definition',
  'missing-domain',
  'missing-relations',
]);

export function parseNodeIntentKind(raw: string | null): FirstWordsNodeIntentKind | null {
  if (!raw) return null;
  return NODE_INTENT_KINDS.has(raw) ? (raw as FirstWordsNodeIntentKind) : null;
}

export interface FirstWordsChip {
  /** React key + 테스트 식별 — 같은 상태면 같은 값. */
  id: string;
  slot: FirstWordsSlot;
  intent: FirstWordsIntent;
  /** 입력칸에 그대로 앉는 문장. */
  text: string;
}

/** 화면 언어. 문장은 앱이 짓고 모델은 짓지 않는다. */
export interface FirstWordsLabels {
  missingDefinition: (title: string) => string;
  missingDomain: (title: string) => string;
  missingRelations: (title: string) => string;
  mapReview: string;
  emptyVault: string;
}

export function sentenceForIntent(
  intent: FirstWordsIntent,
  labels: FirstWordsLabels,
): string {
  switch (intent.kind) {
    case 'missing-definition':
      return labels.missingDefinition(intent.title);
    case 'missing-domain':
      return labels.missingDomain(intent.title);
    case 'missing-relations':
      return labels.missingRelations(intent.title);
    case 'empty-vault':
      return labels.emptyVault;
    case 'map-review':
    default:
      return labels.mapReview;
  }
}

export type FirstWordsNode = Pick<
  KnowledgeGraphNode,
  'id' | 'kind' | 'title' | 'evidenceIds' | 'hasOwnDocument' | 'agentSlug' | 'ref'
> & { display?: string | null };

/**
 * **화면 슬롯의 문장 하나** — 지금 보고 있는 개념에서 가장 큰 틈.
 *
 * 빈 대화의 1번 칩과 노드 상세의 「에이전트에게 말로 시키기」가 **같은 이
 * 함수**를 지난다. 두 입구가 각자 문장을 지으면 같은 개념을 두 가지로
 * 말하게 되고, 그때부터 사용자는 어느 쪽이 진짜인지 물어야 한다.
 *
 * 문서가 없는 파생 개념은 null 이다 — 고칠 파일이 없는 개념에게 "뜻을 적어
 * 줘" 라고 시키면 남의 문서를 고치라는 말이 된다(#688 계열 사고).
 */
export function screenIntentFor(
  node: FirstWordsNode | null | undefined,
  docFacts: ReadonlyMap<string, ConceptDocFacts>,
): FirstWordsIntent | null {
  if (!node) return null;
  const { ownSlug } = resolveNodeDocument(node);
  if (!ownSlug) return null;
  const doc = docFacts.get(ownSlug);
  if (!doc) return null;
  const ref = resolveNodeAgentTarget(node).ref ?? ownSlug;
  const gaps = detectMeaningGaps(node, doc);
  return {
    kind: gaps[0] ?? 'missing-relations',
    ref,
    title: node.display ?? node.title,
  };
}

export interface BuildFirstWordsInput {
  nodes: readonly FirstWordsNode[];
  /** 문서 slug → 프론트매터 사실. `useVaultConceptFacts` 가 만든 그 map. */
  docFacts: ReadonlyMap<string, ConceptDocFacts>;
  /**
   * 지금 보고 있는 개념의 **인계 이름** — `resolveNodeAgentTarget` 이 정한
   * 값이어야 한다. 화면 문맥 주입이 쓰는 이름과 같아야 사람과 에이전트가
   * 같은 개념을 가리킨다.
   */
  focusedRef: string | null;
}

/** 칩 최대 개수 — 슬롯이 셋이므로 셋. 늘리지 않는다(백지 공포의 답은 개수가 아니라 적중이다). */
export const FIRST_WORDS_MAX_CHIPS = 3;

/**
 * 이 폴더의 상태에서 첫 마디 후보를 뽑는다. 슬롯 우선순위는 고정이고,
 * **채울 수 없는 슬롯은 만들지 않는다** — 빈 칩을 자리만 채워 그리면 누를 수
 * 없는 컨트롤이 되고, 그건 이 패널이 이미 한 번 고친 함정이다.
 */
export function buildFirstWords(
  input: BuildFirstWordsInput,
  labels: FirstWordsLabels,
): FirstWordsChip[] {
  const concepts = collectConcepts(input.nodes, input.docFacts);

  // 아직 아무것도 없는 폴더 — 셋을 억지로 채우지 않는다. 지목할 개념이
  // 없는데 개념 이야기를 하면 첫 문장부터 거짓이 된다.
  if (concepts.length === 0) {
    return [
      {
        id: 'first-words:empty-vault',
        slot: 'standing',
        intent: { kind: 'empty-vault' },
        text: labels.emptyVault,
      },
    ];
  }

  const chips: FirstWordsChip[] = [];

  // ① 화면 슬롯 — 지금 보고 있는 개념의 가장 큰 틈. 포커스가 없으면 생략한다
  //    (없는 것을 있다고 말하지 않는다).
  const focused = input.focusedRef
    ? concepts.find((concept) => concept.ref === input.focusedRef)
    : undefined;
  if (focused) {
    chips.push(chipFor('screen', intentFor(focused), labels));
  }

  // ② 큐 슬롯 — 「할 일」이 지목하는 것과 **같은 판정**으로 고른 첫 개념.
  //    화면 슬롯이 이미 집은 개념은 건너뛴다(같은 말을 두 번 하지 않는다).
  const queued = concepts.find(
    (concept) => concept.gaps.length > 0 && concept.ref !== focused?.ref,
  );
  if (queued) {
    chips.push(chipFor('queue', intentFor(queued), labels));
  }

  // ③ 상비 슬롯 — 결함이 0인 폴더에서도 첫 마디가 있게 하는 바닥.
  chips.push({
    id: 'first-words:map-review',
    slot: 'standing',
    intent: { kind: 'map-review' },
    text: labels.mapReview,
  });

  return chips.slice(0, FIRST_WORDS_MAX_CHIPS);
}

/**
 * 노드 하나를 가리키는 의도 하나 — S7 이 큐 행·노드 상세에서 건너올 때 쓴다.
 * 칩과 **같은 함수**를 지나므로 두 입구의 문장이 갈라질 자리가 없다.
 */
export function nodeIntent(
  node: FirstWordsNode | null | undefined,
  kind: FirstWordsNodeIntentKind,
): FirstWordsIntent | null {
  if (!node) return null;
  const ref = resolveNodeAgentTarget(node).ref;
  if (!ref) return null;
  return { kind, ref, title: node.display ?? node.title };
}

interface ConceptFact {
  ref: string;
  title: string;
  gaps: ReturnType<typeof detectMeaningGaps>;
}

/**
 * 칩이 지목할 수 있는 개념만 남긴다 — **자기 `.md` 가 있고**(고칠 파일이 있고)
 * 매니페스트가 그 문서의 사실을 아는 것. 판정은 `resolveNodeDocument` 하나로
 * 한다: 새로 만들면 남의 문서를 고치라고 시키는 사고가 다시 열린다.
 */
function collectConcepts(
  nodes: readonly FirstWordsNode[],
  docFacts: ReadonlyMap<string, ConceptDocFacts>,
): ConceptFact[] {
  const concepts: ConceptFact[] = [];
  for (const node of nodes) {
    const { ownSlug } = resolveNodeDocument(node);
    if (!ownSlug) continue;
    const doc = docFacts.get(ownSlug);
    if (!doc) continue;
    const ref = resolveNodeAgentTarget(node).ref ?? ownSlug;
    concepts.push({
      ref,
      title: node.display ?? node.title,
      gaps: detectMeaningGaps(node, doc),
    });
  }
  // 이름순 — 같은 폴더를 두 번 열었을 때 칩이 자리를 바꾸면 방금 읽은 문장을
  // 다시 찾게 된다.
  concepts.sort((a, b) => a.title.localeCompare(b.title));
  return concepts;
}

/**
 * 이 개념의 첫 마디. 빈칸이 있으면 그것을 말하고, 없으면 **질문**으로 남는다 —
 * "빠진 연결이 있는지 봐 줘" 는 주장하지 않으므로 멀쩡한 개념에도 거짓이 아니다.
 */
function intentFor(concept: ConceptFact): FirstWordsIntent {
  const kind = concept.gaps[0] ?? 'missing-relations';
  return { kind, ref: concept.ref, title: concept.title };
}

function chipFor(
  slot: FirstWordsSlot,
  intent: FirstWordsIntent,
  labels: FirstWordsLabels,
): FirstWordsChip {
  const target = 'ref' in intent ? intent.ref : intent.kind;
  return {
    id: `first-words:${slot}:${intent.kind}:${target}`,
    slot,
    intent,
    text: sentenceForIntent(intent, labels),
  };
}
