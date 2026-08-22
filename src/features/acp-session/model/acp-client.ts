/**
 * ACP 클라이언트 — 줄 단위 JSON-RPC 를 대화로 바꾸는 층.
 *
 * 전송(프로세스 stdio)은 주입받는다. 그래서 이 파일의 검사는 진짜 프로세스 없이
 * 돌고, 반대로 프로세스 층의 검사는 프로토콜을 몰라도 된다.
 *
 * ## 이 파일이 지키는 계약 넷
 *
 * 1. **필수 구현은 둘뿐이다** — `session/request_permission` 과 `session/update`.
 *    파일 읽기/쓰기·터미널·elicitation 은 전부 선택이고, 우리는 **선언하지
 *    않는다.** 선언하지 않은 메서드가 오면 「그런 것 없다」고 답한다.
 *    ⚠️ 다만 이것만으로는 관문이 아니다 — 능력 미선언은 ACP 통로만 닫고,
 *    어댑터가 감싼 진짜 CLI 의 자체 도구는 이 선언을 안 본다. 실제 관문은
 *    앱이 격리한 설정이 만든다(`src-tauri/src/acp.rs`).
 * 2. **`optionId` 를 하드코딩하지 않는다.** 선택지는 `kind` 로 찾는다
 *    (`allow_once` · `reject_once` …). 실측에서 그 값들은 `allow` · `reject`
 *    처럼 짧은 문자열이었는데, 그건 어댑터가 정하는 것이라 언제든 바뀐다.
 * 3. **`allow_always` 를 앱이 대신 고르지 않는다.** 그 선택지에는 「이 디렉터리
 *    전체를 세션 내내 허용」하는 규칙이 딸려 온다(실측). 경계를 넓히는 결정은
 *    사용자만 한다.
 * 4. **판정은 Rust 에 물어본다.** 볼트 안/밖 판정을 여기서 다시 구현하면 두
 *    벌이 되고, 심볼릭 링크와 아직 없는 경로를 브라우저 쪽에서 정확히 풀 수도
 *    없다.
 */

import { partitionModes } from './mode-safety';
import { atlasToolMode } from './atlas-tool-policy';

/** 줄을 주고받는 통로. 프로세스든 가짜든 이것만 만족하면 된다. */
export interface AcpTransport {
  send(line: string): void | Promise<void>;
  /** 줄이 올 때마다 부른다. 돌려주는 함수를 부르면 끊는다. */
  subscribe(onLine: (line: string) => void): () => void;
}

/** 고를 수 있는 것 하나 — 모델이든 모드든 화면에는 같은 모양으로 그린다. */
export interface AcpChoice {
  id: string;
  name: string;
  description: string | null;
}

/**
 * 답을 기다리는 상한. 대화 한 턴은 이보다 오래 걸릴 수 있으므로
 * **악수와 조회에만** 건다(`prompt` 는 시간을 안 준다 — 아래 `prompt` 구현).
 */
const CALL_TIMEOUT_MS = 45_000;

/**
 * ⚠️ **판정을 여기서 다시 쓰지 않는다** (2026-08-17).
 *
 * 종전에는 이 함수가 거부목록 한 줄이었다 — 이름을 적어 둔 것만 숨기니,
 * 어댑터가 새 모드를 더하면 **우리가 모르는 채로** 사용자에게 보이고 고를 수
 * 있었다. 안전 장치가 모르는 것을 안전한 것처럼 다루면 그건 장치가 아니다.
 *
 * 판정은 `mode-safety.ts` 하나가 갖는다: 재 봐서 위험한 것은 숨기고, 재 봐서
 * 괜찮은 것은 그냥 내놓고, **안 재 본 것은 내놓되 모른다고 표시한다.**
 */
export function keepGateSafeModes(modes: AcpChoice[]): AcpChoice[] {
  return partitionModes(modes).offered;
}

interface ParsedChoices {
  choices: AcpChoice[];
  dropped: number;
}

/** `{availableModels|availableModes, current…Id}` 를 화면이 쓰는 모양으로. */
function toChoices(raw: unknown, listKey: string): ParsedChoices {
  const block = asRecord(raw);
  const list = block && Array.isArray(block[listKey]) ? (block[listKey] as unknown[]) : [];
  const out: AcpChoice[] = [];
  let dropped = 0;
  for (const item of list) {
    const row = asRecord(item);
    const id =
      typeof row?.modelId === 'string'
        ? row.modelId
        : typeof row?.id === 'string'
          ? row.id
          : null;
    if (!id) {
      dropped += 1;
      continue;
    }
    out.push({
      id,
      name: typeof row.name === 'string' && row.name.trim() ? row.name : id,
      description: typeof row.description === 'string' ? row.description : null,
    });
  }
  return { choices: out, dropped };
}

function currentId(raw: unknown, key: string): string | null {
  const block = asRecord(raw);
  const value = block?.[key];
  return typeof value === 'string' ? value : null;
}

/** 세션 하나가 내놓는 고를 거리들. 어댑터가 안 내놓으면 빈 배열이다. */
export interface AcpSessionChoices {
  models: AcpChoice[];
  currentModelId: string | null;
  modes: AcpChoice[];
  currentModeId: string | null;
  /** 목록에는 남았지만 폴더 밖 작업 관문을 아직 재 보지 않은 모드들. */
  unverifiedModeIds: string[];
  /** 어댑터 응답 모양이 깨져 읽지 못한 모드 수. */
  droppedModeCount: number;
}

export function readSessionChoices(result: Record<string, unknown>): AcpSessionChoices {
  const modelChoices = toChoices(result.models, 'availableModels');
  const modeChoices = toChoices(result.modes, 'availableModes');
  const modePartition = partitionModes(modeChoices.choices);
  return {
    models: modelChoices.choices,
    currentModelId: currentId(result.models, 'currentModelId'),
    // 위험한 것은 거르고, 모르는 것은 상태와 함께 내보낸다.
    modes: modePartition.offered,
    currentModeId: currentId(result.modes, 'currentModeId'),
    unverifiedModeIds: modePartition.unverified,
    droppedModeCount: modeChoices.dropped + modePartition.dropped,
  };
}

/** 지난 대화 한 줄 — 목록에 그릴 만큼만. */
export interface AcpSessionSummary {
  sessionId: string;
  /** 그 대화가 열렸던 폴더의 절대 경로. **거르는 기준이 이것이다.** */
  cwd: string;
  /** 어댑터가 지어 준 제목. 없으면 null — 화면이 대신 지어내지 않는다. */
  title: string | null;
  /** ISO 문자열. 없으면 null. */
  updatedAt: string | null;
}

/**
 * 목록을 **우리가 거른다** (2026-08-16 실측).
 *
 * `session/list` 에 `cwd` 를 줘도 어댑터는 **그 폴더로 걸러 주지 않는다** —
 * 실측에서 열지도 않은 다른 저장소들의 대화가 제목까지 그대로 돌아왔다
 * (`/Users/…/side-project/…` 의 「디자인 시스템 수준 파악」 등).
 *
 * 그걸 그대로 그리면 Atlas 가 **사용자가 이 앱에서 연 적 없는 폴더의 작업
 * 제목**을 화면에 띄우게 된다. 신뢰 헌장 ②(사용자 모르게 수집하는 것 0)와
 * 로컬 우선 규칙(볼트 밖을 훑지 않는다)이 정면으로 막는 일이다.
 *
 * 그래서 이 함수가 유일한 통로이고, 여기서 반드시 거른다. 어댑터가 나중에
 * 제대로 걸러 주게 되어도 이 검사는 남는다 — 남의 동작에 우리 약속을 걸지
 * 않는다. 게이트: `tests/contract/acp-session-scope.contract.test.ts`.
 */
export function keepSessionsInFolder(
  sessions: AcpSessionSummary[],
  cwd: string,
): AcpSessionSummary[] {
  const root = normalizeFolder(cwd);
  if (!root) return [];
  return sessions.filter((s) => normalizeFolder(s.cwd) === root);
}

/** 끝의 `/` 만 정리한다. 그 이상은 Rust 가 할 일이다(심볼릭 링크·상대 경로). */
function normalizeFolder(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.length > 0 ? trimmed : null;
}

/** 권한 요청 하나 — 화면이 사용자에게 보여 줄 만큼만 추린 모양. */
export interface AcpPermissionRequest {
  /** 사람이 읽는 한 줄. 어댑터가 준 그대로. */
  title: string | null;
  /** 같은 도구의 진행·완료 갱신과 이 결정을 잇는 ACP 식별자. */
  toolCallId: string | null;
  /**
   * 부른 도구의 **식별자**(`mcp__atlas-vault__add_concept` 같은). 정책이 이걸
   * 본다 — MCP 도구 호출에는 파일 경로가 없기 때문이다.
   */
  toolName: string | null;
  /** `edit` · `execute` · `read` … 화면이 아이콘/색을 고르는 타입 있는 사실. */
  toolKind: string | null;
  /** 있으면 절대 경로. 정책 판정의 근거이자 화면이 보여 줄 대상. */
  filePath: string | null;
  /** 도구가 실제로 요청한 인자. 의미 쓰기는 이 값으로 typed change를 만든다. */
  rawInput: Record<string, unknown>;
  /** 일반 파일 권한인지, 사람의 의미 결정권이 필요한 ontology write인지. */
  reviewKind: 'permission' | 'ontology-write';
  /** 고를 수 있는 것들 — `kind` 로만 다룬다. */
  options: Array<{ optionId: string; kind: string; name: string | null }>;
}

export interface AcpClientHandlers {
  /** 스트리밍 갱신 — 텍스트 청크·툴콜·계획 등. */
  onUpdate?: (update: Record<string, unknown>) => void;
  /**
   * 우리가 세션에 꽂아 준 볼트 MCP 서버의 이름. 그 서버의 read 도구만 자동
   * 허용하고 write 도구는 사람의 변경안 확인을 거친다. 안 넘기면 이 분류를
   * 끈다 — 없는 것을 있는 척하지 않는다.
   */
  vaultMcpServerName?: string;
  /** 이 경로가 볼트 안인가. Rust 판정으로 간다. */
  verdict: (filePath: string | null) => Promise<'allow-inside-vault' | 'ask'>;
  /**
   * 사용자에게 묻는다. 고른 `optionId` 를 돌려주거나, 거절이면 null.
   *
   * 화면이 없거나 사용자가 답하지 않으면 **거절이 기본값**이어야 한다 —
   * 안 물어본 것을 허용으로 세면 관문이 없는 것과 같다.
   */
  askUser: (request: AcpPermissionRequest) => Promise<string | null>;
  /** 진단용. 프로토콜을 벗어난 줄이 오면 부른다. */
  onProtocolNotice?: (message: string) => void;
}

interface PendingCall {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
}

/** 우리가 선언하지 않은 메서드에 답할 JSON-RPC 오류 코드. */
const METHOD_NOT_FOUND = -32601;

export interface AcpClient {
  initialize(): Promise<Record<string, unknown>>;
  newSession(params: {
    cwd: string;
    mcpServers?: unknown[];
    /** 세션 시작 지시에 덧붙일 한 문단. 기본 지시를 **대체하지 않는다**. */
    appendSystemPrompt?: string;
  }): Promise<{ sessionId: string; choices: AcpSessionChoices }>;
  prompt(sessionId: string, blocks: unknown[]): Promise<{ stopReason?: string }>;
  cancel(sessionId: string): Promise<void>;
  /**
   * 이 폴더의 지난 대화들. **`cwd` 로 걸러서** 돌려준다 — 아래 주석 참고.
   * 어댑터가 이 기능을 안 내놓으면 빈 배열이다(없는 것을 있는 척하지 않는다).
   */
  listSessions(cwd: string): Promise<AcpSessionSummary[]>;
  /** 지난 대화를 이어 받는다. 실패하면 던진다 — 부르는 쪽이 새 대화로 떨어진다. */
  loadSession(params: {
    sessionId: string;
    cwd: string;
    mcpServers?: unknown[];
    /** 새 대화와 **같은 지시**를 준다 — 이어받았다고 규칙이 달라지지 않게. */
    appendSystemPrompt?: string;
  }): Promise<{ sessionId: string; choices: AcpSessionChoices }>;
  /**
   * 모델을 바꾼다. **안 내놓는 어댑터가 있다** — claude 는 `session/set_model`
   * 자체가 「그런 메서드 없음」이다(실측). 그래서 실패를 삼키고 `false` 를
   * 돌려준다: 화면은 되는 것만 그리고, 안 되는 것은 조용히 없는 채로 둔다.
   */
  setModel(sessionId: string, modelId: string): Promise<boolean>;
  /** 모드를 바꾼다. 둘 다 지원한다(실측). */
  setMode(sessionId: string, modeId: string): Promise<boolean>;
  /** 전송에서 온 줄 하나를 먹인다. 구독을 직접 걸었을 때만 쓴다. */
  ingest(line: string): void;
  dispose(): void;
}

export function createAcpClient(
  transport: AcpTransport,
  handlers: AcpClientHandlers,
): AcpClient {
  let nextId = 1;
  const pending = new Map<number, PendingCall>();
  let disposed = false;

  /**
   * 줄 하나를 내보낸다.
   *
   * ⚠️ **실패를 삼키되 조용히는 아니다** (2026-08-16 검수). 종전에는
   * `void transport.send(...)` 였는데 `void` 는 실패를 **안 잡는다** — 어댑터가
   * 방금 죽은 뒤 권한 카드에 답하거나 「그만」을 누르면 그 전송이 거절되고,
   * 아무도 안 받은 거절이 콘솔로 튄다.
   */
  const send = (payload: unknown): Promise<void> => {
    try {
      // 동기 transport는 같은 tick에 줄을 기록한다 — 테스트뿐 아니라 로컬
      // 브리지의 요청/응답 순서도 이 성질에 기대고 있다.
      return Promise.resolve(transport.send(JSON.stringify(payload)));
    } catch (error) {
      return Promise.reject(error);
    }
  };

  /** 답을 기다리지 않는 알림/응답 전송. 실패는 진단으로만 남긴다. */
  const write = (payload: unknown) => {
    void send(payload).catch((error: unknown) => {
      // 이미 끝난 세션에 쓰는 것은 정상적인 경합이다 — 진단으로만 남긴다.
      handlers.onProtocolNotice?.(`send-failed: ${String(error)}`);
    });
  };

  /**
   * 요청 하나. **답이 안 오면 영원히 안 끝난다** — 그래서 시간을 준다.
   *
   * 2026-08-16 검수: 어댑터가 떴는데 답을 안 하는 상태(잘못된 바이너리 · npx 가
   * 무언가를 기다리는 중)에서 상태가 「켜는 중」에 붙박이고, 그 상태에서는
   * 「새 대화」 버튼도 잠겨 있어서 **패널을 닫는 것 말고 나갈 길이 없었다.**
   * 시간이 지나면 거절로 끝내고, 그 사실을 화면이 말한다.
   */
  const call = (
    method: string,
    params: unknown,
    timeoutMs = CALL_TIMEOUT_MS,
  ): Promise<Record<string, unknown>> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer =
        timeoutMs > 0
          ? setTimeout(() => {
              if (!pending.has(id)) return;
              pending.delete(id);
              reject(new Error(`acp-timeout: ${method}`));
            }, timeoutMs)
          : null;
      const clear = () => {
        if (timer !== null) clearTimeout(timer);
      };
      pending.set(id, {
        resolve: (value) => {
          clear();
          resolve(value);
        },
        reject: (error) => {
          clear();
          reject(error);
        },
      });
      void send({ jsonrpc: '2.0', id, method, params }).catch((error: unknown) => {
        handlers.onProtocolNotice?.(`send-failed: ${String(error)}`);
        const waiting = pending.get(id);
        if (!waiting) return;
        pending.delete(id);
        waiting.reject(new Error(`acp-send-failed: ${method}: ${String(error)}`));
      });
    });
  };

  const answerPermission = async (id: unknown, params: Record<string, unknown>) => {
    const request = toPermissionRequest(params);
    const allowOnce = request.options.find((o) => o.kind === 'allow_once');
    const rejectOnce = request.options.find((o) => o.kind === 'reject_once');

    /*
     * 우리가 꽂은 Atlas read는 대화를 막지 않는다. write는 같은 서버·같은
     * 볼트여도 사람이 typed change를 본 뒤에만 이어간다. 경로 안전과 의미
     * 승인은 다른 질문이다: 앞엣것이 참이라고 뒤엣것까지 대신 답할 수 없다.
     */
    const atlasMode = atlasToolMode(
      request.toolName,
      handlers.vaultMcpServerName ?? '',
    );
    const ontologyWrite = atlasMode === 'write';
    /*
     * ⚠️ **판정이 실패해도 답은 한다** (2026-08-16 검수에서 적발).
     * 종전에는 `await handlers.verdict(...)` 가 감싸이지 않아서, 그 IPC 가
     * 거절되면(창이 내려가는 중 · 브리지 오류) 이 요청에 **아무 답도 안 나갔다**.
     * 상대는 영원히 기다리고, 사용자는 카드도 오류도 못 본다.
     *
     * 못 정하면 **묻는 쪽**으로 떨어진다 — 안전한 쪽이다.
     */
    let verdict: 'allow-inside-vault' | 'ask' = 'ask';
    try {
      verdict = await handlers.verdict(request.filePath);
    } catch (error) {
      handlers.onProtocolNotice?.(`verdict-failed: ${String(error)}`);
    }
    /* read는 경로가 없거나 볼트 안일 때만 자동 허용한다. 밖을 읽는 read도
       일반 권한 카드로 내려간다. */
    if (
      atlasMode === 'read' &&
      allowOnce &&
      (request.filePath === null || verdict === 'allow-inside-vault')
    ) {
      write({ jsonrpc: '2.0', id, result: selected(allowOnce.optionId) });
      return;
    }
    if (!ontologyWrite && verdict === 'allow-inside-vault' && allowOnce) {
      write({ jsonrpc: '2.0', id, result: selected(allowOnce.optionId) });
      return;
    }

    // Atlas write, 볼트 밖 접근, 또는 경로를 모르는 일반 도구는 사람에게 묻는다.
    let chosen: string | null = null;
    try {
      chosen = await handlers.askUser(
        ontologyWrite ? { ...request, reviewKind: 'ontology-write' } : request,
      );
    } catch {
      chosen = null; // 물어보다 실패하면 거절이다.
    }

    // 사용자가 고른 것이 정말 그 요청의 선택지인지 확인한다. 화면이 낡은
    // 요청의 값을 돌려주면 엉뚱한 것을 허용하게 된다.
    const valid = chosen && request.options.some((o) => o.optionId === chosen);
    if (valid) {
      write({ jsonrpc: '2.0', id, result: selected(chosen as string) });
      return;
    }
    if (rejectOnce) {
      write({ jsonrpc: '2.0', id, result: selected(rejectOnce.optionId) });
      return;
    }
    // 거절 선택지조차 없으면 취소로 답한다 — 답을 안 하면 상대가 영원히 기다린다.
    write({ jsonrpc: '2.0', id, result: { outcome: { outcome: 'cancelled' } } });
  };

  const handle = (message: Record<string, unknown>) => {
    const method = typeof message.method === 'string' ? message.method : null;
    const hasId = message.id !== undefined && message.id !== null;

    // 에이전트 → 우리 **요청**: 반드시 답해야 한다.
    if (method && hasId) {
      if (method === 'session/request_permission') {
        void answerPermission(message.id, asRecord(message.params));
        return;
      }
      // 선언하지 않은 능력이다. 침묵하면 상대가 멈춘 채로 남는다.
      handlers.onProtocolNotice?.(`declined:${method}`);
      write({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: METHOD_NOT_FOUND, message: `capability not declared: ${method}` },
      });
      return;
    }

    // 알림: 답하지 않는다.
    if (method) {
      if (method === 'session/update') {
        const params = asRecord(message.params);
        handlers.onUpdate?.(asRecord(params.update));
      }
      return;
    }

    // 우리 요청에 대한 답.
    const id = typeof message.id === 'number' ? message.id : null;
    if (id === null) return;
    const waiting = pending.get(id);
    if (!waiting) return;
    pending.delete(id);
    if (message.error) {
      waiting.reject(new Error(JSON.stringify(message.error)));
      return;
    }
    waiting.resolve(asRecord(message.result));
  };

  const ingest = (line: string) => {
    if (disposed) return;
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // 프로토콜이 아닌 줄(어댑터의 배너 등)은 버리되 조용히 버리지 않는다.
      handlers.onProtocolNotice?.(`unparsable:${trimmed.slice(0, 120)}`);
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;
    handle(parsed as Record<string, unknown>);
  };

  const unsubscribe = transport.subscribe(ingest);

  return {
    initialize: () =>
      call('initialize', {
        protocolVersion: 1,
        // ⚠️ 파일·터미널 능력을 선언하지 않는다. 선언하지 않은 것은
        // 「지원하지 않음」으로 다뤄진다(ACP 초기화 규약).
        clientCapabilities: {},
      }),
    newSession: async (params) => {
      const result = await call('session/new', {
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
        // 어댑터는 `_meta.systemPrompt` 로 **덧붙이기**를 받는다(그 값은
        // `type`/`preset` 이 고정된 채 `append` 만 흘러 들어간다). 기본 지시를
        // 통째로 갈아치우지 않는 이유: 그 지시가 그 도구를 그 도구답게 만드는
        // 것이고, 우리가 그것을 다시 쓸 근거가 없다.
        ...(params.appendSystemPrompt
          ? { _meta: { systemPrompt: { append: params.appendSystemPrompt } } }
          : {}),
      });
      const sessionId = typeof result.sessionId === 'string' ? result.sessionId : null;
      if (!sessionId) throw new Error('session/new response missing sessionId');
      return { sessionId, choices: readSessionChoices(result) };
    },
    prompt: async (sessionId, blocks) => {
      /*
       * 대화 한 턴에는 **시간을 주지 않는다.** 에이전트가 코드베이스를 훑는
       * 일은 몇 분이 걸릴 수 있고, 그 사이 화면은 「생각 중」과 도구 줄로
       * 무슨 일이 일어나는지 계속 말한다 — 기다림이 설명되는 상태다.
       * 반면 악수와 조회는 답이 곧 와야 하므로 위 상한이 걸린다.
       */
      const result = await call('session/prompt', { sessionId, prompt: blocks }, 0);
      return { stopReason: typeof result.stopReason === 'string' ? result.stopReason : undefined };
    },
    cancel: async (sessionId) => {
      // 취소는 알림이다 — 답을 기다리지 않는다.
      write({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } });
    },
    listSessions: async (cwd) => {
      let result: Record<string, unknown>;
      try {
        result = await call('session/list', { cwd });
      } catch {
        // 이 기능을 안 내놓는 어댑터가 있다. 없는 것은 없는 대로 — 빈 목록이
        // 「지난 대화가 없다」와 같은 화면을 만든다(둘 다 고를 것이 없다).
        return [];
      }
      const raw = Array.isArray(result.sessions) ? result.sessions : [];
      const summaries: AcpSessionSummary[] = [];
      for (const item of raw) {
        const row = asRecord(item);
        const sessionId = typeof row?.sessionId === 'string' ? row.sessionId : null;
        const folder = typeof row?.cwd === 'string' ? row.cwd : null;
        // 어느 폴더의 것인지 모르는 줄은 **버린다.** 「아마 이 폴더겠지」로
        // 남겨 두면 남의 폴더 제목이 화면에 뜨는 바로 그 사고가 된다.
        if (!sessionId || !folder) continue;
        summaries.push({
          sessionId,
          cwd: folder,
          title: typeof row.title === 'string' && row.title.trim() ? row.title : null,
          updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
        });
      }
      return keepSessionsInFolder(summaries, cwd);
    },
    loadSession: async (params) => {
      const result = await call('session/load', {
        sessionId: params.sessionId,
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
        /*
         * ⚠️ **이어받는 대화에도 같은 지시를 준다** (2026-08-16 검수에서 적발).
         *
         * 종전에는 새 대화에만 붙었다. 그래서 「지난 대화」로 이어받은 세션은
         * **다른 규칙으로 움직였다** — 관계를 바꿀 때 `why` 를 적으라는 요구도,
         * 폴더 밖으로 나가지 말라는 요구도 없는 채로. 같은 화면 · 같은 폴더인데
         * 어제 시작한 대화와 오늘 시작한 대화가 다르게 굴면 그건 규칙이 아니다.
         */
        ...(params.appendSystemPrompt
          ? { _meta: { systemPrompt: { append: params.appendSystemPrompt } } }
          : {}),
      });
      // 어댑터가 `sessionId` 를 안 돌려주는 경우가 있어 요청한 값을 유지한다.
      const sessionId =
        typeof result.sessionId === 'string' ? result.sessionId : params.sessionId;
      return { sessionId, choices: readSessionChoices(result) };
    },
    setModel: async (sessionId, modelId) => {
      try {
        await call('session/set_model', { sessionId, modelId });
        return true;
      } catch {
        return false;
      }
    },
    setMode: async (sessionId, modeId) => {
      try {
        await call('session/set_mode', { sessionId, modeId });
        return true;
      } catch {
        return false;
      }
    },
    ingest,
    dispose: () => {
      disposed = true;
      unsubscribe();
      for (const [, waiting] of pending) {
        waiting.reject(new Error('acp session closed'));
      }
      pending.clear();
    },
  };
}

function selected(optionId: string) {
  return { outcome: { outcome: 'selected', optionId } };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** 권한 요청 원문에서 화면과 정책이 쓸 것만 추린다. */
/**
 * 부른 **도구의 이름**을 뽑는다. 구조화된 자리를 먼저 보고 없으면 제목을 쓴다.
 *
 * ⚠️ 제목으로 정책을 판정하지 않는다는 이 파일의 규율(계약 ②)과 부딪히는 것처럼
 * 보이는데, 다르다. 그 규율이 막으려던 것은 **사람이 읽으라고 지은 문장**에서
 * 경로를 긁어내는 것이었다(문구가 바뀌면 정책이 조용히 뒤집힌다). 여기서 찾는
 * 것은 문장이 아니라 **식별자**이고, 우선 순위도 구조화된 자리가 먼저다 —
 * `allow_always` 선택지의 `_meta` 에 `targets[].toolName` 이 실려 온다(실측).
 * 제목은 그것이 없을 때의 차선이며, 실측에서 그 값은 도구 이름 그 자체였다
 * (`"mcp__atlas-vault__add_concept"`).
 */
function readToolName(params: Record<string, unknown>): string | null {
  const options = Array.isArray(params.options) ? params.options : [];
  for (const entry of options) {
    const changes = asRecord(asRecord(asRecord(entry)._meta).permission).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const targets = asRecord(change).targets;
      if (!Array.isArray(targets)) continue;
      for (const target of targets) {
        const t = asRecord(target);
        if (t.type === 'tool' && typeof t.toolName === 'string') return t.toolName;
      }
    }
  }
  const title = asRecord(params.toolCall).title;
  return typeof title === 'string' ? title : null;
}

/**
 * 이 도구가 **우리가 꽂아 준 볼트 MCP 서버**의 것인가.
 *
 * ## 왜 이게 필요한가 (2026-08-16 실측으로 발견)
 *
 * 진짜 세션을 한 바퀴 돌려 보니 **에이전트가 지도에 아무것도 못 썼다.**
 * 우리 관문이 우리 자신의 도구를 막고 있었다:
 *
 * ```
 * 권한 요청: 밖 · (경로 없음)  ×4  → 전부 거절
 * 답: "MCP 툴 호출이 전부 권한 거부로 막혀서 지도에 실제로 쓰지 못했습니다"
 * ```
 *
 * 원인은 정책이 **파일 경로만 볼 줄 알았다**는 것이다. MCP 도구 호출에는
 * `file_path` 가 없으니 「경로를 모름 → 물어봄」으로 떨어졌고, 자동 응답이
 * 없는 실측 환경에서는 그게 곧 거절이었다.
 *
 * 그런데 그 서버는 **우리가 볼트 경로로 띄운 것**이라 볼트 밖을 건드릴 수가
 * 없다 — 「볼트 안 파일」과 정확히 같은 근거로 자동 허용이 맞다. 관문이
 * 지키려는 것은 「볼트 밖」이지 「도구를 쓰는 것」이 아니다.
 *
 * ⚠️ **남는 위험 하나**: 프로젝트의 `.mcp.json` 이 같은 이름의 서버를 정의하면
 * 이 판정을 빌려 갈 수 있다. 이름이 겹치면 어댑터 쪽에서 충돌이 나므로 좁은
 * 구멍이지만, 0은 아니다. 그래서 이름을 여기 리터럴로 적지 않고 **우리가
 * 주입할 때 쓰는 그 상수**를 가져다 쓴다 — 한 곳만 바꾸면 둘이 같이 움직인다.
 */
export function isVaultMcpTool(toolName: string | null, serverName: string): boolean {
  if (!toolName || !serverName) return false;
  return toolName.startsWith(`mcp__${serverName}__`);
}

/**
 * 요청에 딸려 온 **경로**를 찾는다 — 이름이 도구마다 다르다.
 *
 * ## 왜 여러 이름을 보나 (2026-08-16, 두 번째 검수에서 적발)
 *
 * 종전에는 `file_path` **하나만** 봤다. 그건 클로드 쪽 내장 도구의 이름이고,
 * **우리가 꽂아 준 MCP 서버는 그 이름을 한 번도 안 쓴다** — 우리 서버의 인자는
 * `filePath` 다(실측: `mcp/src/index.js` 에 `file_path` 는 0회, `filePath` 는
 * 30회). 그래서 우리 도구의 요청은 언제나 「경로를 모름」이 됐고, 바로 앞
 * 커밋에서 막았다고 적어 둔 그 구멍이 **실제로는 안 막혀 있었다.**
 *
 * 더 나쁜 것은 그때 쓴 검사가 `file_path` 를 손으로 지어 넣었다는 것이다 —
 * 실제 서버가 절대 만들지 않는 모양이라, 검사는 초록인데 화면은 뚫려 있었다.
 * 이 저장소가 「지어낸 입력으로 통과하는 게이트는 게이트가 아니다」라고 적어
 * 둔 그 실패다.
 *
 * 폴더를 훑는 도구들(`analyze_repo_structure` · `index_project` ·
 * `infer_imports` · `connect_project_source`)은 파일이 아니라 **디렉터리**를
 * 받으므로 그 이름(`rootPath`)도 같이 본다. 판정은 결국 「이 경로가 볼트
 * 안인가」이고, 그 질문에는 파일이든 폴더든 답이 있다.
 */
function readPathArg(rawInput: Record<string, unknown>): string | null {
  const KEYS = ['file_path', 'filePath', 'rootPath', 'root_path', 'path', 'targetPath'];
  for (const key of KEYS) {
    const value = rawInput[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

export function toPermissionRequest(params: Record<string, unknown>): AcpPermissionRequest {
  const toolCall = asRecord(params.toolCall);
  const rawInput = asRecord(toolCall.rawInput);
  const rawOptions = Array.isArray(params.options) ? params.options : [];
  return {
    title: typeof toolCall.title === 'string' ? toolCall.title : null,
    toolCallId: typeof toolCall.toolCallId === 'string' ? toolCall.toolCallId : null,
    toolName: readToolName(params),
    toolKind: typeof toolCall.kind === 'string' ? toolCall.kind : null,
    // 제목이 아니라 이 값으로 판정한다 — 제목은 볼트 안이면 상대 경로,
    // 밖이면 절대 경로라서 문구가 바뀌는 날 정책이 조용히 뒤집힌다.
    filePath: readPathArg(rawInput),
    rawInput,
    reviewKind: 'permission',
    options: rawOptions.flatMap((entry) => {
      const option = asRecord(entry);
      const optionId = typeof option.optionId === 'string' ? option.optionId : null;
      const kind = typeof option.kind === 'string' ? option.kind : null;
      if (!optionId || !kind) return [];
      return [{ optionId, kind, name: typeof option.name === 'string' ? option.name : null }];
    }),
  };
}
