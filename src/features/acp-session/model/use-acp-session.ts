'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  acpPermissionVerdict,
  isAcpBridgeAvailable,
  listenToAcpSession,
  sendAcpLine,
  startAcpSession,
  stopAcpSession,
} from '@/shared/lib/tauri-acp';

import { GATED_SESSION_MODE } from './runtime-gate';
import { isDiagnosticStderr } from './acp-trouble';
import { readSlashCommands, type AcpSlashCommand } from './slash-commands';
import { VAULT_MCP_SERVER_NAME } from './vault-mcp-server';
import {
  createAcpClient,
  type AcpClient,
  type AcpPermissionRequest,
  type AcpSessionChoices,
  type AcpSessionSummary,
  type AcpTransport,
} from './acp-client';
import { buildOntologyChangeSet } from '@/entities/knowledge-graph';
import type {
  AcpWorkDecision,
  AcpWorkReceipt,
  AcpWorkResult,
} from '@/shared/lib/acp-work-receipt';

/**
 * ACP 세션 하나의 수명 — 띄우고, 말을 걸고, 권한을 묻고, 끝낸다.
 *
 * ## 화면에 남기는 것은 **일어난 일**뿐이다
 *
 * 진행바를 지어내지 않는다. 도구 줄은 에이전트가 실제로 그 도구를 부른 뒤에
 * 생기고, 상태도 에이전트가 알려 준 대로만 바뀐다. 이 저장소가 기존 채팅에서
 * 이미 정해 둔 규율이다(`agent-loop.ts`: *"전송 전에 「읽음」으로 찍으면 화면이
 * 아직 일어나지 않은 일을 말하는 것"*).
 *
 * ## 권한은 화면이 답할 때까지 **기다린다**
 *
 * 볼트 밖 요청이 오면 카드를 띄우고 사용자가 고를 때까지 응답을 미룬다. 그동안
 * 에이전트는 멈춰 있다 — 그게 관문의 정의다. 화면이 닫히거나 세션이 끝나면
 * **거절로 답한다**: 안 물어본 것을 허용으로 세면 관문이 없는 것과 같다.
 */

export type AcpEvent =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'agent'; id: string; text: string }
  | { kind: 'thought'; id: string; text: string }
  | {
      kind: 'tool';
      id: string;
      title: string;
      toolKind: string;
      status: string;
      /**
       * 그 도구가 받은 인자 원본. **어느 노드를 만졌는지**가 여기에만 있다
       * (`tool-targets.ts`). 예전에는 버렸고, 그래서 도구 줄이 「개념을
       * 읽었어요」라고만 하고 어느 개념인지는 말하지 못했다.
       */
      rawInput?: unknown;
    }
  | { kind: 'notice'; id: string; text: string };

export type AcpSessionStatus =
  | 'idle'
  | 'starting'
  | 'ready'
  | 'thinking'
  | 'error'
  | 'exited';

export interface PendingPermission {
  request: AcpPermissionRequest;
  /** 사용자가 고른 것을 에이전트에게 전한다. `null` 이면 거절. */
  resolve: (optionId: string | null) => void;
}

export interface UseAcpSessionOptions {
  runtimeId: string;
  /** 에이전트의 작업 폴더이자 「안/밖」 판정의 기준. */
  vaultRoot: string | null;
  /** 세션에 자동으로 꽂을 MCP 서버 — 사용자가 설정 파일을 안 만져도 되게. */
  mcpServers?: unknown[];
  /** 승인 직후 확정 모션이 끝난 다음 도구를 진행할 시간. reduced motion이면 0. */
  approvalSettleMs?: number;
  /** Human ontology-write decisions, emitted as bounded local receipt snapshots. */
  onWorkReceipt?: (receipt: AcpWorkReceipt) => void;
}

const RECEIPT_REQUEST_LIMIT = 160;

function receiptRequestSummary(value: string | null): string {
  const oneLine = (value ?? '').replace(/\s+/g, ' ').trim();
  return oneLine ? oneLine.slice(0, RECEIPT_REQUEST_LIMIT) : 'Ontology write request';
}

function workReceipt({
  request,
  sessionId,
  runtimeId,
  userRequest,
  decision,
  result,
  at,
}: {
  request: AcpPermissionRequest;
  sessionId: string | null;
  runtimeId: string;
  userRequest: string | null;
  decision: AcpWorkDecision;
  result: AcpWorkResult;
  at: string;
}): AcpWorkReceipt {
  const changeSet = buildOntologyChangeSet(request.toolName ?? 'ontology-write', request.rawInput);
  const toolCallId = request.toolCallId ?? `${changeSet.toolName}:${at}`;
  return {
    v: 1,
    id: `${sessionId ?? 'session'}:${toolCallId}`,
    at,
    updatedAt: at,
    agent: runtimeId,
    request: receiptRequestSummary(userRequest),
    tool: changeSet.toolName,
    decision,
    result,
    items: changeSet.items.map((item) => ({
      target: item.target,
      operation: changeSet.operation,
      relation: item.relation
        ? { from: item.relation.from, type: item.relation.type, to: item.relation.to }
        : null,
      fields: item.fields.map((field) => field.key),
    })),
  };
}

/**
 * 세션 시작 지시에 **덧붙이는** 한 문단.
 *
 * ## 왜 필요한가 — 「왜 바꿨는지」는 저절로 안 남는다
 *
 * 이 저장소의 볼트는 관계에 이유를 적을 자리(`why`)를 갖고 있고 `depends_on`
 * 은 그것을 필수로 요구한다. 그런데 실측(2026-08-16)에서 살아있는 볼트의
 * 활동 기록 15줄 전부 `why` 가 비어 있었다.
 *
 * 대화를 앱 안으로 옮기는 것만으로는 이게 안 채워진다 — 같은 실측이 그것도
 * 보여 줬다(앱 안 채팅도 이미 `why` 를 쓸 수 있는데 볼트의 6.5%만 차 있다).
 * **채우는 것은 자리가 아니라 지시다.**
 *
 * 기본 지시를 갈아치우지 않고 덧붙이기만 한다. 그 도구를 그 도구답게 만드는
 * 것이 그 지시이고, 우리가 그걸 다시 쓸 근거가 없다.
 */
const VAULT_HANDOFF_BASE = [
  'You are working inside an Ontology Atlas vault opened in the Atlas app.',
  /*
   * **순서를 말해 준다.** 안 말하면 에이전트가 자기 순서를 만들고, 그 순서는
   * 대개 「먼저 만들고 나중에 설명하기」다 — 실측에서 그랬다.
   */
  'Work in this order: (1) orient with `connection_info` and `list_kinds`, and on a large vault do not dump every node; (2) before creating anything, look for what is already there with `query_ontology` `similar_nodes` or `find_evidence`, and if something close exists, say what you found and ask whether to extend it before making a second node for the same idea; (3) write only after the shape is settled, preferring `patch_concept` on an existing node over a new one.',
  'When the person asks you to find or show one concept, resolve its exact slug and call `get_concept`. When they ask how two concepts connect, resolve both exact slugs and call `find_path`, even if you can answer from context. Atlas uses those exact read calls to move and highlight the map; never guess a slug.',
  'Whenever you add or change a relation, put the reason in the `why` field, in the person\'s own words — what they asked for, not what the tool did. Write "고객이 결제를 되돌릴 수 있어야 한다고 해서", not "added depends_on edge".',
  /*
   * **애매하면 묻는다.** 이 한 줄이 실측에서 가장 크게 바꾼 것이다 — 없을 때는
   * 사용자가 원하는지도 모르는 노드를 만들어 놓고 「같은 것이면 합치겠습니다」
   * 라고 사후에 물었다. 노드는 만드는 것보다 지우는 것이 비싸다.
   */
  'If you are unsure whether two things are the same concept, that is a question for the person, not a judgement call for you. Ask first: an extra node is harder to remove than to add.',
  'Answer in the language the person wrote in.',
  'Keep your work inside this folder. If something genuinely needs a path outside it, say so before trying.',
];
/**
 * ⚠️ **꽂았을 때만 꽂혔다고 말한다** (2026-08-16 검수에서 적발).
 *
 * 이 문장은 무조건 붙고 있었다. 그런데 서버 목록이 비는 경우가 실재한다(번들에
 * 바이너리가 없거나 아직 준비 전) — 그러면 도구가 하나도 없는 세션에 **「이미
 * 연결돼 있다」고 우기는 지시**를 넣게 된다. 에이전트는 있지도 않은 도구를
 * 찾다가 이상한 답을 내놓고, 사용자는 왜 그러는지 알 길이 없다.
 */
const VAULT_MCP_SENTENCE =
  'The `atlas-vault` MCP server is already connected to this exact folder. Use it for everything about this graph. Do not shell out, list directories, or open the markdown files yourself to find your way around — the tools already answer those questions, and reading the files by hand is how stale and duplicated nodes get made.';

function vaultHandoffPrompt(hasVaultMcp: boolean): string {
  return (hasVaultMcp ? [VAULT_HANDOFF_BASE[0], VAULT_MCP_SENTENCE, ...VAULT_HANDOFF_BASE.slice(1)] : VAULT_HANDOFF_BASE).join(' ');
}

/** 아직 아무것도 모를 때의 값. 「없음」과 「안 내놓음」을 같은 화면으로 둔다. */
const EMPTY_CHOICES: AcpSessionChoices = {
  models: [],
  currentModelId: null,
  modes: [],
  currentModeId: null,
  unverifiedModeIds: [],
  droppedModeCount: 0,
};

let eventSeq = 0;
const nextEventId = () => `acp-evt-${(eventSeq += 1)}`;

/**
 * 모아 두는 stderr 줄의 상한. 어댑터는 설치 진행률까지 뱉으므로 전부 담으면
 * 그게 다시 소음이 된다 — 첫 몇 줄이 원인을 말한다.
 */
const STDERR_KEEP_LIMIT = 8;
const TERMINAL_TOOL_STATES = new Set(['completed', 'failed', 'cancelled']);

export function useAcpSession({
  runtimeId,
  vaultRoot,
  mcpServers,
  approvalSettleMs = 0,
  onWorkReceipt,
}: UseAcpSessionOptions) {
  const [status, setStatus] = useState<AcpSessionStatus>('idle');
  /*
   * 상태를 ref 로도 붙든다 — 어댑터가 죽는 순간(`onExit`)은 렌더 밖이라
   * 클로저에 갇힌 옛 값을 보게 된다. 그때 필요한 것은 **그 순간의** 상태다:
   * 차례가 도는 중이었나(=답하다 죽었나), 아니면 그냥 끝났나.
   */
  const statusRef = useRef<AcpSessionStatus>('idle');
  /**
   * 첫 내려받기 표시 — `null` 이면 안 받는 중이다.
   *
   * ## 왜 (2026-08-19 소유자 실기계)
   *
   * 어댑터의 첫 실행은 npx 가 수십 MB 를 받는데, 화면은 「켜는 중」 칩 하나만
   * 보였다. 사용자가 멈춘 줄 알고 앱을 끄고 — 그 중단이 반쯤 만들어진 npx
   * 캐시를 남겨 다음부터 영영 못 뜨게 만들었다(자기 치유는 Rust 쪽,
   * `acp.rs`). 그러니 이 표시는 장식이 아니라 그 사고의 방아쇠를 없애는 것이다.
   *
   * `mb` 는 캐시 디렉터리가 자란 실측 크기다(`acp://notice` 의
   * `npx-download-progress:<mb>`). 전체 크기를 모르므로 퍼센트는 **지어내지
   * 않는다** — 받은 만큼만 말한다. 아직 첫 알림만 왔으면 `mb` 는 `null`.
   */
  const [download, setDownload] = useState<{ mb: number | null } | null>(null);
  const setStatusTracked = useCallback((next: AcpSessionStatus) => {
    statusRef.current = next;
    setStatus(next);
    // 내려받기 표시는 「켜는 중」에만 산다 — 준비됐든 죽었든 그 표시는 끝이다.
    if (next !== 'starting') setDownload(null);
  }, []);
  const [events, setEvents] = useState<AcpEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  /** 에이전트가 이 폴더에서 찾은 명령들 — 볼트에 스킬을 두면 여기 뜬다. */
  const [slashCommands, setSlashCommands] = useState<AcpSlashCommand[]>([]);
  /**
   * 어댑터가 남긴 단서 — **문제가 났을 때만** 화면이 꺼내 본다.
   * 평소에 보여 주면 그건 진단이 아니라 화면을 먹는 영어 경고다(실측).
   */
  const [diagnostics, setDiagnostics] = useState<readonly string[]>([]);
  /**
   * 진단 한 줄을 모아 둔다 — **대화에는 안 싣는다.**
   *
   * 이 자리에 있던 것들이 실제로 화면에 이렇게 나왔다(2026-08-16 검수):
   * `UNPARSABLE:{"JSONRPC":"2.0","ID":7,…` · `SEND-FAILED: …` — 대문자 고정폭으로
   * 대화 한가운데에. 사람이 읽을 것이 아니고, 읽어도 할 일이 없다.
   */
  const resetDiagnostics = useCallback(() => {
    stderrRef.current = [];
    setDiagnostics([]);
  }, []);
  const keepDiagnostic = useCallback((line: string) => {
    const text = line.trim();
    if (!text) return;
    const kept = stderrRef.current;
    if (kept.length >= STDERR_KEEP_LIMIT) return;
    kept.push(text);
    setDiagnostics([...kept]);
  }, []);
  const [pending, setPending] = useState<PendingPermission | null>(null);
  /** 사람이 허용했고 해당 ACP 도구의 완료 신호를 기다리는 ontology write. */
  const [approvedOntologyWrite, setApprovedOntologyWrite] =
    useState<AcpPermissionRequest | null>(null);
  /** 이 폴더의 지난 대화들. **이 폴더 것만** 담긴다(`keepSessionsInFolder`). */
  const [sessions, setSessions] = useState<AcpSessionSummary[]>([]);
  /**
   * 이 세션이 고를 수 있는 것들. 어댑터마다 다르다 — 실측: codex 는 모델 33개,
   * claude 는 모델을 **아예 안 내놓는다**(`session/set_model` 이 「그런 메서드
   * 없음」). 그래서 화면은 개수를 짐작하지 않고 **온 것만** 그린다.
   */
  const [choices, setChoices] = useState<AcpSessionChoices>(EMPTY_CHOICES);

  const clientRef = useRef<AcpClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  /** 다음 `start()` 가 이어 받을 대화. 한 번 쓰고 비운다. */
  const resumeIdRef = useRef<string | null>(null);
  /** 지금 띄우는 중인가 — `clientRef` 는 다 끝난 뒤에야 채워져서 늦다. */
  const startingRef = useRef(false);
  /** 모아 둔 stderr — 문제가 났을 때만 화면이 꺼내 본다. */
  const stderrRef = useRef<string[]>([]);
  /**
   * 세대 번호 — `stop()` 이 부를 때마다 오른다.
   *
   * **띄우는 도중에 닫으면** `stop()` 은 아직 없는 것을 치우고 끝나고, 그 뒤에
   * `start()` 가 이어 달려 프로세스와 클라이언트를 **새로 만들어 놓는다.**
   * 닫은 화면 뒤에서 어댑터가 계속 도는 것이다(검사가 이걸 잡았다).
   *
   * 그래서 `start()` 는 기다릴 때마다 자기 세대가 아직 유효한지 확인하고,
   * 아니면 **자기가 만든 것을 자기가 치우고** 빠진다.
   */
  const generationRef = useRef(0);
  /*
   * `switchSession` 은 `start`/`stop` 둘 다 부르는데, 그 둘은 서로를 의존성으로
   * 갖지 않는다(순환). ref 로 한 단계 끊는다 — 최신 것을 부르되 의존성은 안 만든다.
   */
  const startRef = useRef<(() => Promise<void>) | null>(null);
  const stopRef = useRef<(() => Promise<void>) | null>(null);
  const acpSessionRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const disposedRef = useRef(false);
  /** 답을 기다리는 권한 요청의 해결자 — 정리할 때 거절로 닫는다. */
  const pendingResolverRef = useRef<((optionId: string | null) => void) | null>(null);
  /** 승인 확정 모션 뒤에 ACP를 이어 주는 타이머. 창이 닫히면 반드시 취소한다. */
  const permissionDecisionTimerRef = useRef<number | null>(null);
  /** `tool_call_update` 콜백이 최신 승인 대상을 읽도록 state와 함께 붙든다. */
  const approvedOntologyWriteRef = useRef<AcpPermissionRequest | null>(null);
  const approvedReceiptRef = useRef<{
    toolCallId: string | null;
    receipt: AcpWorkReceipt;
  } | null>(null);
  const latestUserRequestRef = useRef<string | null>(null);
  const onWorkReceiptRef = useRef(onWorkReceipt);

  useEffect(() => {
    onWorkReceiptRef.current = onWorkReceipt;
  }, [onWorkReceipt]);

  const emitWorkReceipt = useCallback((receipt: AcpWorkReceipt) => {
    try {
      onWorkReceiptRef.current?.(receipt);
    } catch {
      // A local audit write must never strand the ACP permission response.
    }
  }, []);

  const setApprovedOntologyWriteTracked = useCallback(
    (request: AcpPermissionRequest | null) => {
      approvedOntologyWriteRef.current = request;
      setApprovedOntologyWrite(request);
    },
    [],
  );

  const push = useCallback((event: AcpEvent) => {
    setEvents((prev) => {
      const last = prev[prev.length - 1];
      // 텍스트 조각은 줄마다 새 말풍선이 아니라 **이어 붙인다** — 한 문장이
      // 여러 조각으로 오기 때문이다.
      if (last && (event.kind === 'agent' || event.kind === 'thought') && last.kind === event.kind) {
        return [...prev.slice(0, -1), { ...last, text: last.text + event.text }];
      }
      return [...prev, event];
    });
  }, []);

  const applyUpdate = useCallback(
    (update: Record<string, unknown>) => {
      const kind = typeof update.sessionUpdate === 'string' ? update.sessionUpdate : '';
      const content = update.content as { text?: unknown } | undefined;
      const text = typeof content?.text === 'string' ? content.text : '';

      if (kind === 'available_commands_update') {
        // `/` 로 부를 수 있는 것들. **온 것만** 들고 있는다 — 아무것도 안 오면
        // 작성 칸에서 `/` 를 쳐도 아무 일도 안 일어난다(`slash-commands.ts`).
        setSlashCommands(readSlashCommands(update));
        return;
      }
      if (kind === 'agent_message_chunk' && text) {
        push({ kind: 'agent', id: nextEventId(), text });
        return;
      }
      if (kind === 'agent_thought_chunk' && text) {
        push({ kind: 'thought', id: nextEventId(), text });
        return;
      }
      if (kind === 'tool_call') {
        push({
          kind: 'tool',
          id: typeof update.toolCallId === 'string' ? update.toolCallId : nextEventId(),
          title: typeof update.title === 'string' ? update.title : '',
          toolKind: typeof update.kind === 'string' ? update.kind : 'other',
          status: typeof update.status === 'string' ? update.status : 'pending',
          rawInput: update.rawInput,
        });
        return;
      }
      if (kind === 'tool_call_update') {
        const id = typeof update.toolCallId === 'string' ? update.toolCallId : null;
        const nextStatus = typeof update.status === 'string' ? update.status : null;
        if (!id) return;
        const nextTitle = typeof update.title === 'string' ? update.title : null;
        const nextToolKind = typeof update.kind === 'string' ? update.kind : null;
        const hasRawInput = update.rawInput !== undefined;
        // claude-agent-acp는 streamed tool_use를 먼저 pending 행으로 보내고,
        // 입력이 완성되면 **status 없는** tool_call_update로 rawInput을 보낸다.
        // 상태만 합치면 화면에는 도구 이름만 남고 exact target과 지도 intent가
        // 영원히 비게 된다. update가 실제로 싣는 필드만 기존 행에 덧씌운다.
        setEvents((prev) =>
          prev.map((event) => {
            if (event.kind !== 'tool' || event.id !== id) return event;
            return {
              ...event,
              ...(nextStatus ? { status: nextStatus } : {}),
              ...(nextTitle ? { title: nextTitle } : {}),
              ...(nextToolKind ? { toolKind: nextToolKind } : {}),
              ...(hasRawInput ? { rawInput: update.rawInput } : {}),
            };
          }),
        );
        if (!nextStatus) return;
        const approvedReceipt = approvedReceiptRef.current;
        if (
          TERMINAL_TOOL_STATES.has(nextStatus) &&
          approvedOntologyWriteRef.current?.toolCallId === id
        ) {
          if (approvedReceipt?.toolCallId === id) {
            const result: AcpWorkResult =
              nextStatus === 'completed'
                ? 'completed'
                : nextStatus === 'failed'
                  ? 'failed'
                  : 'cancelled';
            emitWorkReceipt({
              ...approvedReceipt.receipt,
              updatedAt: new Date().toISOString(),
              result,
            });
            approvedReceiptRef.current = null;
          }
          setApprovedOntologyWriteTracked(null);
        }
      }
    },
    [emitWorkReceipt, push, setApprovedOntologyWriteTracked],
  );

  /** 화면이 답할 때까지 기다리는 약속을 만든다. */
  const askUser = useCallback((request: AcpPermissionRequest) => {
    return new Promise<string | null>((resolve) => {
      pendingResolverRef.current = resolve;
      setPending({
        request,
        resolve: (optionId) => {
          const selectedKind = request.options.find((option) => option.optionId === optionId)?.kind;
          const ontologyWrite = request.reviewKind === 'ontology-write' && Boolean(request.toolName);
          if (ontologyWrite) {
            const decision: AcpWorkDecision = selectedKind === 'allow_once' ? 'allowed' : 'rejected';
            const at = new Date().toISOString();
            const receipt = workReceipt({
              request,
              sessionId: sessionIdRef.current,
              runtimeId,
              userRequest: latestUserRequestRef.current,
              decision,
              result: decision === 'allowed' ? 'pending' : 'not-run',
              at,
            });
            emitWorkReceipt(receipt);
            approvedReceiptRef.current = decision === 'allowed'
              ? { toolCallId: request.toolCallId, receipt }
              : null;
          }
          const settlesBeforeWrite =
            request.reviewKind === 'ontology-write' &&
            selectedKind === 'allow_once' &&
            approvalSettleMs > 0;
          setApprovedOntologyWriteTracked(
            request.reviewKind === 'ontology-write' && selectedKind === 'allow_once'
              ? request
              : null,
          );
          setPending(null);
          if (settlesBeforeWrite) {
            permissionDecisionTimerRef.current = window.setTimeout(() => {
              permissionDecisionTimerRef.current = null;
              pendingResolverRef.current = null;
              resolve(optionId);
            }, approvalSettleMs);
            return;
          }
          pendingResolverRef.current = null;
          resolve(optionId);
        },
      });
    });
  }, [approvalSettleMs, emitWorkReceipt, runtimeId, setApprovedOntologyWriteTracked]);

  const start = useCallback(async () => {
    if (!isAcpBridgeAvailable() || !vaultRoot) return;
    /*
     * ⚠️ **잠금은 첫 `await` 앞에서 건다** (2026-08-16 실측으로 발견).
     *
     * 종전 잠금은 `clientRef.current` 하나였는데, 그 값은 프로세스를 띄우고
     * 이벤트를 붙인 **뒤에야** 채워진다. 그 사이에 `start()` 가 한 번 더
     * 불리면 둘 다 잠금을 통과해서 **어댑터가 두 개 뜬다.**
     *
     * 실제로 그랬다 — 대화창 하나에 어댑터 두 개:
     * ```
     * 83796  npm exec @agentclientprotocol/claude-agent-acp@0.68.0
     * 83797  npm exec @agentclientprotocol/claude-agent-acp@0.68.0
     * ```
     * 그러면 `sessionIdRef` 는 나중 것을 가리키는데 줄은 먼저 것으로 오가서
     * 말을 걸면 `Session not found` 로 죽는다. 게다가 먼저 뜬 프로세스는
     * 아무도 안 끄는 유령이 된다.
     *
     * 두 번 불리는 이유는 하나가 아니다 — 개발 모드의 이중 실행도 있고,
     * `mcpServers` 가 매 렌더 새 배열이라 `start` 의 정체가 바뀌는 것도 있다.
     * 그래서 **부르는 쪽을 고치는 것으로는 부족하다**: 여기서 잠근다.
     */
    if (clientRef.current || startingRef.current) return;
    startingRef.current = true;
    const generation = generationRef.current;
    /** 내가 시작한 뒤에 누가 닫았나. */
    const stale = () => generationRef.current !== generation;
    setStatusTracked('starting');
    setError(null);
    try {
      const acpSessionId = await startAcpSession(runtimeId, vaultRoot);
      if (!acpSessionId) throw new Error('bridge-unavailable');
      // 기다리는 동안 닫혔으면 **내가 띄운 것을 내가 끈다.**
      if (stale()) {
        await stopAcpSession(acpSessionId);
        return;
      }
      acpSessionRef.current = acpSessionId;

      let onLine: ((line: string) => void) | null = null;
      const transport: AcpTransport = {
        send: (line) => sendAcpLine(acpSessionId, line),
        subscribe: (cb) => {
          onLine = cb;
          return () => {
            onLine = null;
          };
        },
      };

      // 새 세션이면 진단도 새로 모은다 — 지난 세션의 단서가 섞이면 오해를 만든다.
      resetDiagnostics();
      unlistenRef.current = await listenToAcpSession(acpSessionId, {
        onMessage: (line) => onLine?.(line),
        // stderr 는 대화가 아니라 진단이다. 조용히 버리지 않되 말풍선으로도
        // 만들지 않는다 — 어댑터의 설치 로그가 대화에 섞이면 읽을 수 없다.
        onNotice: (message) => {
          /*
           * 첫 내려받기 알림 셋 (Rust `acp_start` 가 보낸다):
           * - `npx-first-run-download[…]` — 지금 받기 시작했다. 진단에도 남긴다 —
           *   받다가 죽으면 이 줄이 원인 단서다.
           * - `npx-download-progress:<mb>` — 지금까지 받은 실측 MB. **진단에
           *   안 담는다** — 매초 오는 흐름이라 8줄 상한을 이걸로 채우면 진짜
           *   단서가 밀려난다.
           * - `npx-download-done` — 받기 끝. 이후는 보통의 「켜는 중」이다.
           */
          if (message.startsWith('npx-download-progress:')) {
            // 첫 알림을 놓쳤어도 여기서 표시를 만든다 — Rust 는 구독이 붙기 전에
            // 첫 알림이 나갈 수 있다고 보고 진행 알림을 그 안전망으로 삼는다.
            // 켜는 중이 아니면 화면이 안 그리므로(렌더 조건) 뒤늦은 알림은 무해하다.
            const mb = Number(message.slice('npx-download-progress:'.length));
            setDownload({ mb: Number.isFinite(mb) ? mb : null });
            return;
          }
          if (message.startsWith('npx-download-done')) {
            setDownload(null);
            return;
          }
          if (message.startsWith('npx-first-run-download')) {
            setDownload({ mb: null });
            keepDiagnostic(message);
            return;
          }
          /*
           * ⚠️ **약속에 관한 사실은 진단이 아니다** (2026-08-16 검수).
           *
           * 대부분의 알림은 진단이라 접어 둔다. 그런데 `gate-off:` 로 시작하는
           * 것은 다르다 — 「폴더 밖은 먼저 물어본다」는 이 화면의 약속이 이
           * 세션에서 지켜지지 않는다는 뜻이다. 접어 두면 화면이 못 지킬 약속을
           * 계속 하게 된다. 자세한 사연은 진단으로 같이 남긴다.
           */
          if (message.startsWith('gate-off')) {
            push({ kind: 'notice', id: nextEventId(), text: 'gate-off' });
          }
          keepDiagnostic(message);
        },
        /*
         * ⚠️ **모아 두되 화면에 올리지 않는다** (2026-08-16, 두 번 고친 자리).
         *
         * 처음엔 아무도 안 듣고 있어서 어댑터가 남긴 마지막 말이 전부
         * 사라졌다 — 「켜는 중에서 안 넘어간다」를 설명할 수 없게 만든 원인.
         * 그래서 듣게 했더니, 이번엔 **아무 일도 안 났는데** 대화창 맨 위에
         * 영어 npm 경고 두 문단이 상주했다(소유자 화면):
         *
         *   npm warn Unknown env config "_jsr-registry" …
         *
         * 어댑터를 `npx` 로 띄우니 그건 **매번** 나온다. 진단은 문제가 났을 때
         * 단서이지, 평소에 읽을 것이 아니다. 그래서 규율 둘: 뻔한 소음은 아예
         * 안 담고(`isDiagnosticStderr`), 담은 것도 **문제가 났을 때만** 보여
         * 준다(`diagnostics` → 오류 블록의 「자세히」).
         */
        onStderr: (line) => {
          if (!isDiagnosticStderr(line)) return;
          keepDiagnostic(line);
        },
        onExit: () => {
          /*
           * 이벤트 구독을 해제해도 이미 큐에 들어간 콜백은 늦게 올 수 있다.
           * 세션을 갈아탄 뒤 예전 콜백이 현재 ref를 치우면 새 대화가 이유 없이
           * `exited`가 된다. 이 콜백은 자신이 태어난 세대와 프로세스만 소유한다.
           *
           * ⚠️ **답하다 죽은 것과 다 끝난 것은 다른 말이다** (2026-08-17).
           *
           * 종전에는 어느 쪽이든 상태만 `exited` 가 됐고, 화면은 작은 칩에
           * 「끝남」이라고만 적었다. 반쯤 답하다 죽어도 **정상 종료와 같은
           * 화면**이라, 사용자는 그게 답의 전부인 줄 안다.
           *
           * 그래서 **차례가 도는 중에** 죽었으면 그렇게 말한다. 이건 진단이
           * 아니라 「받은 것이 전부다」라는 사실이고, 접어 두면 사용자가 없는
           * 답을 기다리거나 잘린 답을 온전한 답으로 읽는다.
           */
          if (stale() || acpSessionRef.current !== acpSessionId) return;
          if (statusRef.current === 'thinking') {
            push({ kind: 'notice', id: nextEventId(), text: 'died-mid-turn' });
          }
          setStatusTracked('exited');
          // 끝난 세션에 답을 기다리는 카드가 떠 있으면 거절로 닫는다.
          if (permissionDecisionTimerRef.current !== null) {
            window.clearTimeout(permissionDecisionTimerRef.current);
            permissionDecisionTimerRef.current = null;
          }
          pendingResolverRef.current?.(null);
          pendingResolverRef.current = null;
          setPending(null);
          setApprovedOntologyWriteTracked(null);
          /*
           * ⚠️ **끝난 세션의 클라이언트를 치운다** (2026-08-16 검수에서 적발).
           * 종전에는 상태만 `exited` 로 바꾸고 클라이언트를 그대로 뒀다. 그러면
           * ① 답을 기다리던 호출이 **영원히** 안 끝나고 ② `clientRef` 가 차 있어서
           * `start()` 가 잠금에 걸려 다시 못 뜬다. 어댑터가 죽은 것은 되돌릴 수
           * 없는 사건이므로, 그 사실을 기다리는 쪽에도 전한다.
           */
          clientRef.current?.dispose();
          clientRef.current = null;
        },
      });

      if (stale()) {
        unlistenRef.current?.();
        unlistenRef.current = null;
        acpSessionRef.current = null;
        await stopAcpSession(acpSessionId);
        return;
      }

      /** 우리가 정말 볼트 서버를 꽂았나 — 자동 허용과 지시문이 둘 다 이 값을 본다. */
      const hasVaultMcp = (mcpServers?.length ?? 0) > 0;
      const client = createAcpClient(transport, {
        onUpdate: applyUpdate,
        /*
         * 우리가 꽂아 준 볼트 서버의 도구는 **경로가 없을 때** 대신 허용한다 —
         * 이 줄이 없으면 에이전트가 지도에 **아무것도 못 쓴다**(2026-08-16 실측).
         *
         * ⚠️ **정말 꽂았을 때만 이름을 넘긴다** (2026-08-16 검수에서 적발).
         * 종전에는 무조건 넘겼는데, 서버 목록이 비는 경우가 실제로 있다(웹 ·
         * 번들에 MCP 바이너리가 없는 경우 · 아직 준비 중). 그때 이름만 넘기면
         * **우리가 안 꽂은 남의 `atlas-vault` 서버**가 그 자동 허용을 물려받는다.
         * 계약 문구가 이미 그렇게 적혀 있었다: *"안 넘기면 그 자동 허용이
         * 꺼진다 — 없는 것을 있는 척하지 않는다"*.
         */
        vaultMcpServerName: hasVaultMcp ? VAULT_MCP_SERVER_NAME : undefined,
        verdict: (filePath) => acpPermissionVerdict(acpSessionId, filePath),
        askUser,
        onProtocolNotice: (message) => keepDiagnostic(message),
      });
      clientRef.current = client;

      await client.initialize();
      /*
       * 이어 받을 대화가 지정돼 있으면 그걸 먼저 시도한다. 실패하면 **새 대화로
       * 떨어진다** — 지난 대화를 못 여는 것이 대화 자체를 못 여는 이유가 되면
       * 안 된다(그 파일은 우리가 만든 것도 아니고 언제든 사라질 수 있다).
       */
      let session: { sessionId: string; choices: AcpSessionChoices } | null = null;
      if (resumeIdRef.current) {
        try {
          session = await client.loadSession({
            sessionId: resumeIdRef.current,
            cwd: vaultRoot,
            mcpServers,
            // 이어받았다고 규칙이 달라지지 않는다 — 새 대화와 같은 지시를 준다.
            appendSystemPrompt: vaultHandoffPrompt(hasVaultMcp),
          });
        } catch {
          keepDiagnostic('resume-failed');
        }
        resumeIdRef.current = null;
      }
      session ??= await client.newSession({
        cwd: vaultRoot,
        mcpServers,
        appendSystemPrompt: vaultHandoffPrompt(hasVaultMcp),
      });
      sessionIdRef.current = session.sessionId;

      /*
       * **관문을 세운다.** codex 는 설정 격리로는 안 걸리고 세션 모드로만
       * 걸린다(실측 — `runtime-gate.ts`). 재 본 실행기에만 건다.
       *
       * 실패하면 대화를 열지 않는다. 관문이 없는 채로 준비 완료를 내보내면
       * 화면의 「폴더 밖은 먼저 물어본다」는 약속이 거짓이 된다.
       */
      const gatedMode = GATED_SESSION_MODE[runtimeId];
      let choices = session.choices;
      if (gatedMode) {
        if (await client.setMode(session.sessionId, gatedMode)) {
          /*
           * ⚠️ **화면에도 반영한다.** 이걸 빠뜨렸더니 세션은 `read-only` 인데
           * 드롭다운은 `Agent` 라고 적혀 있었다(2026-08-16 실물 확인) — 화면이
           * 지금 상태를 틀리게 말하는 것이고, 하필 그 값이 「폴더 밖을 물어보나」를
           * 정하는 값이라 가장 틀리면 안 되는 자리다.
           *
           * `session/new` 가 준 값은 **모드를 걸기 전**의 것이라 그대로 두면
           * 낡는다. 우리가 건 값이 지금 값이다.
           */
          choices = { ...choices, currentModeId: gatedMode };
        } else {
          const failure = `gate-mode-failed:${gatedMode}`;
          keepDiagnostic(failure);
          throw new Error(failure);
        }
      }

      if (!disposedRef.current) {
        setChoices(choices);
        setStatusTracked('ready');
      }
      // 목록은 세션이 선 뒤에 채운다 — 화면이 뜨는 프레임을 목록이 붙잡지 않게.
      void client
        .listSessions(vaultRoot)
        .then((list) => {
          if (!disposedRef.current) setSessions(list);
        })
        .catch(() => {
          /* 지난 대화를 못 읽는 것은 지금 대화의 문제가 아니다. */
        });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatusTracked('error');
      /*
       * ⚠️ **띄우다 실패했으면 띄운 것을 끈다** (2026-08-16 검수에서 적발).
       * 종전에는 상태만 `error` 로 바꾸고 끝냈는데, 실패 지점에 따라 자식
       * 프로세스는 **이미 떠 있다**(예: 구독 걸기가 실패한 경우). 그러면
       * 다음 `start()` 가 새 프로세스를 띄우고 앞의 것은 앱이 끝날 때까지
       * 아무도 안 끄는 유령이 된다 — 「띄우던 도중에 닫으면 스스로 끈다」와
       * 같은 규율이 실패 경로에는 없었다.
       */
      const orphan = acpSessionRef.current;
      if (orphan) {
        acpSessionRef.current = null;
        unlistenRef.current?.();
        unlistenRef.current = null;
        clientRef.current?.dispose();
        clientRef.current = null;
        await stopAcpSession(orphan).catch(() => {
          /* 이미 죽었을 수 있다 — 치우는 길에서 다시 터지지 않는다. */
        });
      }
    } finally {
      startingRef.current = false;
    }
  }, [
    applyUpdate,
    askUser,
    keepDiagnostic,
    mcpServers,
    push,
    resetDiagnostics,
    runtimeId,
    setApprovedOntologyWriteTracked,
    setStatusTracked,
    vaultRoot,
  ]);

  /**
   * 대화를 갈아탄다 — 지난 것을 이어 받거나(`sessionId`), 새로 연다(`null`).
   *
   * 프로세스를 끝내고 다시 띄운다. 한 프로세스 안에서 세션만 바꿀 수도 있지만,
   * 그러면 「지금 무엇이 살아 있나」가 두 곳(프로세스·세션)에 흩어진다 — 여기서
   * 아낄 시간(수 초)보다 그 복잡도가 비싸다.
   */
  const switchSession = useCallback(
    async (sessionId: string | null) => {
      await stopRef.current?.();
      setEvents([]);
      latestUserRequestRef.current = null;
      setApprovedOntologyWriteTracked(null);
      setError(null);
      resumeIdRef.current = sessionId;
      setChoices(EMPTY_CHOICES);
      await startRef.current?.();
    },
    [setApprovedOntologyWriteTracked],
  );

  /**
   * 고른 것을 세션에 반영한다 — **화면 상태를 먼저 바꾸지 않는다.**
   * 어댑터가 거절하면(claude 의 모델처럼) 화면이 바뀐 척하게 되기 때문이다.
   */
  const chooseModel = useCallback(async (modelId: string) => {
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (!client || !sessionId) return;
    if (await client.setModel(sessionId, modelId)) {
      setChoices((prev) => ({ ...prev, currentModelId: modelId }));
    }
  }, []);

  const chooseMode = useCallback(async (modeId: string) => {
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (!client || !sessionId) return;
    if (await client.setMode(sessionId, modeId)) {
      setChoices((prev) => ({ ...prev, currentModeId: modeId }));
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      const client = clientRef.current;
      const sessionId = sessionIdRef.current;
      if (!client || !sessionId || !text.trim()) return;
      latestUserRequestRef.current = text.trim();
      push({ kind: 'user', id: nextEventId(), text });
      setStatusTracked('thinking');
      try {
        await client.prompt(sessionId, [{ type: 'text', text }]);
        if (!disposedRef.current) {
          setApprovedOntologyWriteTracked(null);
          setStatusTracked('ready');
        }
      } catch (err) {
        setApprovedOntologyWriteTracked(null);
        setError(err instanceof Error ? err.message : String(err));
        setStatusTracked('error');
      }
    },
    [push, setApprovedOntologyWriteTracked, setStatusTracked],
  );

  const cancel = useCallback(() => {
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (client && sessionId) void client.cancel(sessionId);
  }, []);

  const stop = useCallback(async () => {
    /*
     * **세대를 먼저 올린다.** 이 줄이 없으면 띄우는 도중에 닫았을 때
     * `stop()` 은 아직 없는 것을 치우고 끝나고, 뒤이어 `start()` 가 프로세스를
     * 새로 만들어 놓는다 — 닫은 화면 뒤에서 어댑터가 계속 돈다.
     */
    generationRef.current += 1;

    // 순서가 중요하다: 기다리는 권한부터 닫고, 그다음 프로세스를 끝낸다.
    // 반대로 하면 이미 죽은 상대에게 답을 보내려 한다.
    if (permissionDecisionTimerRef.current !== null) {
      window.clearTimeout(permissionDecisionTimerRef.current);
      permissionDecisionTimerRef.current = null;
    }
    pendingResolverRef.current?.(null);
    pendingResolverRef.current = null;
    setPending(null);
    const approvedReceipt = approvedReceiptRef.current;
    if (approvedReceipt) {
      emitWorkReceipt({
        ...approvedReceipt.receipt,
        updatedAt: new Date().toISOString(),
        result: 'cancelled',
      });
      approvedReceiptRef.current = null;
    }
    setApprovedOntologyWriteTracked(null);
    // 띄우는 중이었더라도 잠금을 푼다 — 안 그러면 다시 못 띄운다.
    startingRef.current = false;
    clientRef.current?.dispose();
    clientRef.current = null;
    unlistenRef.current?.();
    unlistenRef.current = null;
    const acpSessionId = acpSessionRef.current;
    acpSessionRef.current = null;
    sessionIdRef.current = null;
    if (acpSessionId) await stopAcpSession(acpSessionId);
    setStatusTracked('idle');
  }, [emitWorkReceipt, setApprovedOntologyWriteTracked, setStatusTracked]);

  /*
   * 최신 것을 ref 에 물려 둔다 — `switchSession` 이 순환 의존 없이 부르게.
   *
   * **렌더 중에 쓰지 않고 effect 로 미룬다.** 렌더 도중 ref 를 건드리면 React 가
   * 경고하고, 실제로도 렌더가 버려지는 경우(동시성)에 어긋난 값이 남는다.
   * `switchSession` 은 사용자가 누른 뒤에만 도므로 이 시점이면 늦지 않다.
   */
  useEffect(() => {
    startRef.current = start;
    stopRef.current = stop;
  }, [start, stop, setStatusTracked]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      // 화면이 사라지면 프로세스도 끝낸다. 안 그러면 닫은 대화가 계속 돈다.
      void stop();
    };
  }, [stop, setStatusTracked]);

  return {
    status,
    events,
    error,
    slashCommands,
    diagnostics,
    download,
    pending,
    approvedOntologyWrite,
    sessions,
    choices,
    chooseModel,
    chooseMode,
    start,
    send,
    cancel,
    stop,
    switchSession,
  };
}
