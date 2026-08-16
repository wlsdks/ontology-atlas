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
  }): Promise<{ sessionId: string; modes?: Record<string, unknown> }>;
  prompt(sessionId: string, blocks: unknown[]): Promise<{ stopReason?: string }>;
  cancel(sessionId: string): Promise<void>;
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
      return { sessionId, modes: asRecord(result.modes) };
    },
    prompt: async (sessionId, blocks) => {
      const result = await call('session/prompt', { sessionId, prompt: blocks });
      return { stopReason: typeof result.stopReason === 'string' ? result.stopReason : undefined };
    },
    cancel: async (sessionId) => {
      // 취소는 알림이다 — 답을 기다리지 않는다.
      write({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } });
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
