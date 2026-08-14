/**
 * 에이전트 스킬 — **볼트 노드가 아니다.**
 *
 * 이 폴더의 타입 어디에도 `uid`·`kind`·`slug` 가 없는 것은 실수가 아니라 계약이다.
 * 스킬 파일의 주인은 Claude 런타임과 마켓플레이스이고, 그 폴더는 대개 git
 * 체크아웃이라 업데이트가 우리 글씨를 덮는다. 그래서 이 화면은 **읽기만 한다** —
 * 스킬을 온톨로지로 승격시키지 않고, 볼트에 쓰지 않고, 위험 점수를 매기지 않는다.
 * (2026-08-09 결정 원장 · 선행 결함은 #1006 에서 차단)
 *
 * 규격의 정본은 우리가 아니라 Anthropic 공식 문서다: `SKILL.md` 의 frontmatter 에
 * `name` 과 `description` 둘이 필수이고, 그 **둘만 항상 로드된다**. 본문은 발동해야
 * 실리고, 딸린 파일은 본문이 가리켜야 실린다. 이 3단이 아래 `SkillInvocation` 이다.
 */

/** 한 스킬이 사는 자리 — 어느 폴더에서 왔고 런타임이 실제로 로드하는가. */
export interface SkillOrigin {
  /** 사용자가 고른 폴더 기준 상대 경로 (`plugins/cache/x/1.0.0/skills/pdf/SKILL.md`). */
  readonly relativePath: string;
  /** 사람이 읽는 출처 이름 — 플러그인 이름이나 최상위 폴더. */
  readonly source: string;
  /**
   * **내가 만든 것인가** — 설치해서 받은 것이 아니라.
   *
   * 목록에서 내 것을 맨 위로 올리고 「내 폴더」 라벨을 받는 근거다. 실측에서
   * 내가 만든 1개가 남의 42개 사이 알파벳순에 묻혀 있었다. 판정: 연 폴더 바로
   * 밑 `skills/` 에 놓인 것만 내 것이다 — 예전 판정(`plugins/` 밖 전부)은
   * 클론해 온 스킬 저장소까지 내 것으로 세어 출처 넷이 전부 「내 폴더」로
   * 뭉개졌다(2026-08-13).
   */
  readonly personal: boolean;
}

/** 발동 3단 중 한 층. */
export interface SkillInvocationStep {
  readonly stage: "always" | "onTrigger" | "onDemand";
  readonly label: string;
  /** 이 층에서 실리는 글자 수 (토큰이 아니라 글자 — 우리가 셀 수 있는 것만 센다). */
  readonly chars: number;
  /** 이 층이 여는 파일들 (있으면). */
  readonly files: readonly string[];
}

/**
 * **호출하면 무슨 일이 일어나나** — 이 화면의 존재 이유.
 *
 * 스킬 목록은 어느 편집기로도 볼 수 있다. 볼 수 없던 것은 *발동했을 때 무엇이
 * 어떤 순서로 열리고, 그중 무엇이 실행되는가* 다.
 */
export interface SkillInvocation {
  readonly steps: readonly SkillInvocationStep[];
  /**
   * 이 스킬이 **실행**하는 파일 — 읽기와 실행은 다르다.
   *
   * 스킬은 bash 로 스크립트를 돌릴 수 있다. 그러니 "이 스킬을 켜 두었다"는
   * "이 스크립트들이 내 컴퓨터에서 돌 수 있다"와 같은 말이고, 그 목록을 한 번도
   * 본 적 없는 사람이 대부분이다. **판정하지 않고 보여만 준다** — 우리는 스크립트
   * 내용을 분석하지 않고 위험도를 매기지 않는다.
   */
  readonly executables: readonly string[];
}

export interface SkillProcessSource {
  readonly path: string;
  readonly digest: string;
}

export interface SkillProcessPosition {
  /** 1-based source coordinate. */
  readonly line: number;
  /** 1-based source coordinate; `end` is exclusive. */
  readonly column: number;
}

export interface SkillProcessSourceSpan {
  readonly start: SkillProcessPosition;
  readonly end: SkillProcessPosition;
}

export type SkillProcessDiagnosticCode =
  | "scan_truncated"
  | "skill_markdown_unsupported"
  | "numbered_steps_unavailable"
  | "step_ordinals_invalid"
  | "resource_missing"
  | "resource_existence_unverified"
  | "resource_path_unsupported"
  | "semantic_ambiguous";

export interface SkillProcessDiagnostic {
  readonly code: SkillProcessDiagnosticCode;
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly sourceSpan?: SkillProcessSourceSpan;
  readonly sourceDigest?: string;
}

interface SkillProcessSemanticLabelBase {
  readonly sourceSpan: SkillProcessSourceSpan;
  readonly sourceDigest: string;
}

export interface SkillProcessBranchLabel extends SkillProcessSemanticLabelBase {
  readonly kind: "branch";
  readonly guard: string;
  readonly targetOrdinal: number;
}

export interface SkillProcessRetryLabel extends SkillProcessSemanticLabelBase {
  readonly kind: "retry";
  readonly targetOrdinal: number;
  readonly condition: string;
}

export interface SkillProcessStopLabel extends SkillProcessSemanticLabelBase {
  readonly kind: "stop";
  readonly condition: string;
}

export interface SkillProcessVerifyLabel extends SkillProcessSemanticLabelBase {
  readonly kind: "verify";
  readonly target: string;
  readonly action: string;
  readonly criterion: string;
}

export type SkillProcessSemanticLabel =
  | SkillProcessBranchLabel
  | SkillProcessRetryLabel
  | SkillProcessStopLabel
  | SkillProcessVerifyLabel;

export interface SkillProcessStep {
  /** Stable across unrelated line insertions; changes when this step's exact source changes. */
  readonly stepId: string;
  /** The number written in the source marker, not a guessed execution order. */
  readonly ordinal: number;
  /** Exact list-item text after the source's number marker. */
  readonly exactText: string;
  readonly sourceSpan: SkillProcessSourceSpan;
  /** Exact grammar labels only; these never become process edges. */
  readonly semanticLabels: readonly SkillProcessSemanticLabel[];
}

export type SkillProcessResourceKind =
  | "reference"
  | "script"
  | "asset"
  | "template"
  | "example";

export interface SkillProcessResource {
  /** Folder-root-relative path, resolved from the owning SKILL.md. */
  readonly path: string;
  readonly kind: SkillProcessResourceKind;
  /** `null` means the caller did not provide a complete path inventory. */
  readonly exists: boolean | null;
  readonly referencedByStepIds: readonly string[];
}

/**
 * Read-only, source-derived process projection. It is deliberately not an ontology node,
 * and K1.1 admits no transition relation at all.
 */
export interface SkillProcessIR {
  readonly irVersion: "skillProcessIR:v1";
  readonly source: SkillProcessSource;
  readonly scanTruncated: false;
  readonly diagnostics: readonly SkillProcessDiagnostic[];
  readonly steps: readonly SkillProcessStep[];
  readonly resources: readonly SkillProcessResource[];
  readonly edges: readonly [];
}

export type SkillProcessDerivation =
  | { readonly state: "ready"; readonly process: SkillProcessIR }
  | {
      readonly state: "unavailable";
      readonly source: SkillProcessSource;
      readonly scanTruncated: boolean;
      readonly diagnostics: readonly SkillProcessDiagnostic[];
    };

export type SkillProcessPacketDiagnosticCode =
  | SkillProcessDiagnosticCode
  | "process_unavailable"
  | "process_invalid"
  | "packet_unavailable"
  | "packet_malformed"
  | "packet_noncanonical"
  | "packet_digest_mismatch"
  | "source_digest_mismatch";

export interface SkillProcessPacketDiagnostic {
  readonly code: SkillProcessPacketDiagnosticCode;
  readonly severity: "error";
  readonly message: string;
}

export interface SerializedSkillProcessPacket {
  readonly state: "ready";
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly sourceDigest: string;
  readonly packetDigest: string;
}

export interface VerifiedSkillProcessPacket {
  readonly state: "ready";
  readonly process: SkillProcessIR;
  readonly bytes: Uint8Array;
  readonly sourceDigest: string;
  readonly packetDigest: string;
}

export interface UnavailableSkillProcessPacket {
  readonly state: "unavailable";
  readonly source: SkillProcessSource | null;
  readonly diagnostics: readonly SkillProcessPacketDiagnostic[];
}

export interface TamperedSkillProcessPacket {
  readonly state: "tampered";
  readonly source: SkillProcessSource | null;
  readonly diagnostics: readonly SkillProcessPacketDiagnostic[];
}

export type SkillProcessPacketSerialization =
  | SerializedSkillProcessPacket
  | UnavailableSkillProcessPacket;

export type SkillProcessPacketVerification =
  | VerifiedSkillProcessPacket
  | UnavailableSkillProcessPacket
  | TamperedSkillProcessPacket;

export interface AgentSkill {
  readonly name: string;
  /** 발동 조건 — 런타임이 이 문장을 읽고 부를지 정한다. */
  readonly description: string;
  readonly body: string;
  readonly origin: SkillOrigin;
  /** 설명에서 뽑은 변별 낱말 — 트리거 겹침을 재는 재료. */
  readonly terms: readonly string[];
  readonly invocation: SkillInvocation;
  /** Ephemeral numbered-process projection; never written back to the skill or vault. */
  readonly process: SkillProcessDerivation;
  /** 자기 폴더에 있다고 가리켰는데 없는 파일. 조건부 참조는 여기 안 든다. */
  readonly missingBundled: readonly string[];
}

/** 이름이 같은 스킬이 둘 이상 — 어느 쪽이 뜰지 사용자는 모른다. */
export interface SkillNameCollision {
  readonly name: string;
  readonly skills: readonly AgentSkill[];
  /** 설명까지 같으면 그냥 사본이고, 다르면 **발동 조건이 경쟁한다**. */
  readonly descriptionsDiffer: boolean;
}

/** 이름은 다른데 발동 조건이 겹치는 쌍. */
export interface SkillTriggerOverlap {
  readonly a: AgentSkill;
  readonly b: AgentSkill;
  readonly shared: readonly string[];
  /** 0~1. 공유 낱말 / 더 적은 쪽의 낱말 수. */
  readonly score: number;
}

export interface SkillInventory {
  readonly skills: readonly AgentSkill[];
  readonly collisions: readonly SkillNameCollision[];
  readonly overlaps: readonly SkillTriggerOverlap[];
  /** 자기 폴더 참조가 깨진 스킬. */
  readonly broken: readonly AgentSkill[];
  readonly totals: {
    readonly skills: number;
    readonly bundledFiles: number;
    readonly executables: number;
    /** 항상 로드되는 글자 수의 합 — 발동 안 해도 매 세션 드는 값. */
    readonly alwaysLoadedChars: number;
  };
}
