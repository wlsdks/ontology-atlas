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
 * **관문을 없애는 모드는 내놓지 않는다.**
 *
 * 실측(2026-08-16)에서 어댑터가 내놓는 모드에는 권한 확인을 통째로 건너뛰는
 * 것들이 섞여 있다:
 *
 * - `bypassPermissions` — *"Bypass all permission checks"*
 * - `acceptEdits` — *"Auto-accept file edit operations"*
 * - `agent-full-access` — codex 쪽의 같은 갈래
 *
 * 이 앱은 「폴더 밖 파일을 건드릴 때 먼저 물어본다」고 화면에서 약속한다. 그
 * 약속을 한 번의 드롭다운 선택으로 무를 수 있으면 그건 약속이 아니라 기본값이다.
 * 그래서 **여기서는 안 내놓는다** — 그 모드가 정말 필요한 사람은 그 도구를 자기
 * 터미널에서 그렇게 쓰면 된다. 우리가 막는 것이 아니라, **우리 화면이 지킬 수
 * 있는 약속만 내놓는** 것이다.
 *
 * ⚠️ 「거절로 닫히는」 모드는 막지 않는다(`dontAsk` 는 미리 허용 안 된 것을
 * **거절**한다 — 안전한 쪽으로 실패한다). 가르는 기준은 「엄격한가」가 아니라
 * **「묻지 않고 통과시키는가」**다.
 */
const GATE_REMOVING_MODES = new Set(['bypassPermissions', 'acceptEdits', 'agent-full-access']);

export function keepGateSafeModes(modes: AcpChoice[]): AcpChoice[] {
  return modes.filter((mode) => !GATE_REMOVING_MODES.has(mode.id));
}

/** `{availableModels|availableModes, current…Id}` 를 화면이 쓰는 모양으로. */
function toChoices(raw: unknown, listKey: string): AcpChoice[] {
  const block = asRecord(raw);
  const list = block && Array.isArray(block[listKey]) ? (block[listKey] as unknown[]) : [];
  const out: AcpChoice[] = [];
  for (const item of list) {
    const row = asRecord(item);
    const id =
      typeof row?.modelId === 'string'
        ? row.modelId
        : typeof row?.id === 'string'
          ? row.id
          : null;
    if (!id) continue;
    out.push({
      id,
      name: typeof row.name === 'string' && row.name.trim() ? row.name : id,
      description: typeof row.description === 'string' ? row.description : null,
    });
  }
  return out;
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
}

export function readSessionChoices(result: Record<string, unknown>): AcpSessionChoices {
  return {
    models: toChoices(result.models, 'availableModels'),
    currentModelId: currentId(result.models, 'currentModelId'),
    // 모드는 **거르고** 내보낸다 — 위 주석 참고.
    modes: keepGateSafeModes(toChoices(result.modes, 'availableModes')),
    currentModeId: currentId(result.modes, 'currentModeId'),
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
  /** `edit` · `execute` · `read` … 화면이 아이콘/색을 고르는 타입 있는 사실. */
  toolKind: string | null;
  /** 있으면 절대 경로. 정책 판정의 근거이자 화면이 보여 줄 대상. */
  filePath: string | null;
  /** 고를 수 있는 것들 — `kind` 로만 다룬다. */
  options: Array<{ optionId: string; kind: string; name: string | null }>;
}

export interface AcpClientHandlers {
  /** 스트리밍 갱신 — 텍스트 청크·툴콜·계획 등. */
  onUpdate?: (update: Record<string, unknown>) => void;
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

  const write = (payload: unknown) => {
    void transport.send(JSON.stringify(payload));
  };

  const call = (method: string, params: unknown): Promise<Record<string, unknown>> => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      write({ jsonrpc: '2.0', id, method, params });
    });
  };

  const answerPermission = async (id: unknown, params: Record<string, unknown>) => {
    const request = toPermissionRequest(params);
    const allowOnce = request.options.find((o) => o.kind === 'allow_once');
    const rejectOnce = request.options.find((o) => o.kind === 'reject_once');

    // 볼트 안이면 앱이 대신 허용한다. 여기서 매번 물으면 대화가 성립하지 않는다.
    const verdict = await handlers.verdict(request.filePath);
    if (verdict === 'allow-inside-vault' && allowOnce) {
      write({ jsonrpc: '2.0', id, result: selected(allowOnce.optionId) });
      return;
    }

    // 밖이거나 경로를 모르면 사용자에게 묻는다.
    let chosen: string | null = null;
    try {
      chosen = await handlers.askUser(request);
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
      const result = await call('session/prompt', { sessionId, prompt: blocks });
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
export function toPermissionRequest(params: Record<string, unknown>): AcpPermissionRequest {
  const toolCall = asRecord(params.toolCall);
  const rawInput = asRecord(toolCall.rawInput);
  const rawOptions = Array.isArray(params.options) ? params.options : [];
  return {
    title: typeof toolCall.title === 'string' ? toolCall.title : null,
    toolKind: typeof toolCall.kind === 'string' ? toolCall.kind : null,
    // 제목이 아니라 이 값으로 판정한다 — 제목은 볼트 안이면 상대 경로,
    // 밖이면 절대 경로라서 문구가 바뀌는 날 정책이 조용히 뒤집힌다.
    filePath: typeof rawInput.file_path === 'string' ? rawInput.file_path : null,
    options: rawOptions.flatMap((entry) => {
      const option = asRecord(entry);
      const optionId = typeof option.optionId === 'string' ? option.optionId : null;
      const kind = typeof option.kind === 'string' ? option.kind : null;
      if (!optionId || !kind) return [];
      return [{ optionId, kind, name: typeof option.name === 'string' ? option.name : null }];
    }),
  };
}
