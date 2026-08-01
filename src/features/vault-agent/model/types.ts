/**
 * 볼트 에이전트의 데이터 모양 — 화면·실행기·디스크가 공유하는 계약.
 *
 * 핵심 계약 하나: `ProposedFileChange.before/after` 가 **diff 카드와
 * 적용기의 공유 진실원**이다. 카드가 그린 문자열과 디스크에 쓰이는 문자열이
 * 같아야 "본 것과 쓰이는 것이 같다" 가 참이 된다 (전송의 미리보기===전송과
 * 같은 철학).
 */

/** 이 왕복에 실린 도구 호출 한 건의 실측 기록. */
export interface ToolCallRecord {
  /** 벤더가 준 id. Gemini 는 주지 않아 실행기가 합성한다. */
  id: string;
  /** MCP 와 동일한 이름만. 목록 밖 이름은 실행 0 + 오류 반환. */
  name: string;
  args: unknown;
  /** 화면 행 표기용 대상 (노드 slug 등). 없으면 빈 문자열. */
  target: string;
  /** 이 왕복에 실려나간 실측 글자수. 추정치를 넣지 않는다. */
  sentChars: number;
  outcome: 'ok' | 'error' | 'blocked-write' | 'unknown-tool' | 'args-invalid';
  /** 화면 행의 한 줄 요약 (평문). */
  summary: string;
}

/** 인용이 붙은 문단. `citations` 는 이 턴에 실제로 읽은 slug 만 남는다. */
export interface CitedParagraph {
  text: string;
  citations: string[];
}

export interface ProposedFileChange {
  path: string;
  kind: 'create' | 'modify';
  /** modify: 제안 시점의 파일 전문. create 는 null. */
  before: string | null;
  /** 적용 시 이 문자열을 그대로 쓴다. */
  after: string;
}

export type ProposalToolName =
  | 'add_concept'
  | 'add_concepts'
  | 'add_relation'
  | 'add_relations'
  | 'patch_concept';

export interface ProposalChange {
  id: string;
  tool: ProposalToolName;
  /** "고치기 capabilities/payment.md — 기대는 곳에 refund 추가" 같은 한 줄. */
  summary: string;
  files: ProposedFileChange[];
  selected: boolean;
  /** patch 계열 필수 — 제안 시점의 mtime. 적용 시 달라지면 쓰지 않는다. */
  expectedMtime?: number;
}

export type ProposalStatus =
  | 'pending'
  /**
   * 쓰기가 **도는 중**. 초안에는 이 값이 없어서 `await` 동안 상태가 `pending`
   * 으로 남았고, 「적용」을 두 번 누르면 **볼트 쓰기가 두 번 동시에** 들어갔다.
   * 취소도 그 사이 눌렸다. 화면에도 "적용 중" 이라는 구별이 0이었다
   * (디자인 카운슬 「상호작용」 반려 사유, 2026-07-29).
   *
   * 이 값이 있으면 재진입 가드와 버튼 잠금이 **같은 사실**을 본다 — 마무리
   * 대화상자의 `busy` 와 같은 문법이다.
   */
  | 'applying'
  | 'applied'
  | 'cancelled'
  | 'conflict'
  | 'copy-degraded';

export interface AgentProposal {
  id: string;
  status: ProposalStatus;
  changes: ProposalChange[];
  /** 볼트가 git 이면 기본 true. */
  snapshotRequested: boolean;
  appliedSnapshotSha?: string;
  /**
   * 이 턴에 실제로 읽은 노드 slug 들. 여기 없는 파일을 고치는 제안에는
   * 카드가 경고 행을 단다 — 인젝션이 동의를 세탁하는 길을 좁힌다.
   */
  readNodesThisTurn: string[];
}

/** 화면이 에이전트에게 넘긴 문맥. 사용자 말풍선에 그대로 에코된다. */
export interface ScreenContextSnapshot {
  /** 보고 있는 노드 (있을 때만). */
  focusedSlug: string | null;
  focusedTitle: string | null;
  focusedKind: string | null;
  /** 켜져 있는 렌즈 이름들 (평문). */
  lenses: string[];
  /** 프로젝트 스코프 제목. */
  projectTitle: string | null;
  /** 지도에 지금 그려진 개념 수. */
  visibleNodeCount: number;
  /**
   * 이 폴더의 **최근 적용된 변경** (git 이력의 커밋 제목, 최신 순).
   *
   * 대화를 저장하지 않고도 작업이 이어지게 하는 자리다 — 지난 세션의 쓰기는
   * frontmatter 와 git 에 남았고, 새 대화는 그것을 읽어 "지난번에 여기까지
   * 했으니 다음은" 을 스스로 구성한다. 볼트 밖 제2 진실원(대화 저장소)이
   * 필요 없는 이유가 이것이다. git 이 아니거나 이력이 없으면 비어 있고,
   * 그때는 블록 자체가 나가지 않는다.
   */
  recentChanges?: readonly string[];
}

export type NoticeCode =
  | 'network-failed'
  | 'timed-out'
  | 'rate-limited'
  | 'rejected'
  | 'round-cap'
  | 'aborted'
  | 'audit-blocked'
  | 'provider-refused'
  | 'no-key'
  | 'failed';

export type AgentEvent =
  | { kind: 'user'; text: string; screenContext: ScreenContextSnapshot }
  | { kind: 'toolLine'; call: ToolCallRecord }
  | {
      kind: 'assistant';
      paragraphs: CitedParagraph[];
      demoted: boolean;
      /**
       * 같은 응답의 마지막 줄에서 떼어낸 **다음 한 걸음**. 추가 호출로 얻은
       * 것이 아니라 이 턴이 이미 말한 것이다. 칩 하나가 되고, 칩은 프리필이지
       * 전송도 pending 카드도 아니다.
       */
      nextStep?: string | null;
    }
  | { kind: 'proposal'; proposal: AgentProposal }
  | { kind: 'notice'; code: NoticeCode; text: string };

export type AgentTurnStatus =
  | 'sending'
  | 'running'
  | 'done'
  | 'aborted'
  | 'failed';

export interface AgentTurn {
  id: string;
  events: AgentEvent[];
  /** ≤ ROUND_CAP */
  roundsUsed: number;
  /** 푸터 누계 — 실측 글자수만. */
  sentChars: number;
  /** 남긴 감사 줄 수 = 성공한 왕복 수. */
  auditCount: number;
  status: AgentTurnStatus;
}

/** 도구 왕복 상한. 자율 폭주의 구조적 상한이다. */
export const AGENT_ROUND_CAP = 6;

/**
 * 한 왕복에 실어 보낼 도구 결과의 글자수 상한. 넘으면 잘라내고 모델에게
 * "좁혀서 다시 물어보라" 고 알린다 — 사용자 비용(BYOK 요금)이 조용히
 * 커지는 길을 막는다.
 */
export const AGENT_TOOL_RESULT_CHAR_CAP = 6_000;

/** 한 턴에 실어 보낼 볼트 발췌 총량 상한. */
export const AGENT_TURN_VAULT_CHAR_CAP = 40_000;
