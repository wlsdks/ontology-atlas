/**
 * LLM 호출 감사 로그(`.ontology-atlas/llm-audit.jsonl`) 파서 — **읽기 전용**.
 *
 * 쓰기는 키를 쥔 Rust(`src-tauri/src/llm_audit.rs`)가 소유한다. 웹이 쓰지 않는
 * 이유는 `activity.jsonl` 과 같다: 기록의 주인이 전송의 주인과 같아야
 * "기록 없는 전송" 이 구조적으로 불가능해진다.
 *
 * 한 줄 스키마 v1:
 * `{"v":1,"at","provider","host","model","purpose","question","scope":{"nodes","promptChars","vaultChars"},"payloadSha256","outcome","httpStatus","responseChars","durationMs"}`
 *
 * - `host` 는 **나중에 더해진 필드**이고 그래서 `v` 는 1 그대로다. 이 필드가
 *   없는 옛 줄은 사용자 디스크에 이미 앉아 있으므로 `null` 로 읽는다 — 목적지를
 *   모른다는 사실을 그대로 말할 뿐, provider 이름으로 추측해 채우지 않는다.
 *   기록을 소급해 고치지 않는 것이 헌장 ⑤ 이고, 파서가 부재를 감당하는 것이
 *   그 약속의 코드 쪽 얼굴이다.
 * - 전송 **직전에** 결과 필드 없이 예약된 줄이 먼저 디스크에 앉는다. 응답 전에
 *   프로세스가 죽으면 그 줄이 그대로 남으므로, 결과 필드가 없는 줄은
 *   `outcome: 'unknown'` 으로 읽는다 — 없는 사실을 성공/실패로 지어내지 않는다.
 * - 깨진 줄은 건너뛴다(파서가 죽어 전체를 못 보여주는 것이 더 나쁘다).
 * - 응답 본문은 애초에 기록되지 않는다(길이만) — 대화 저장소가 아니다.
 *
 * writer(Rust) ↔ reader(여기) drift 는 공유 픽스처
 * `tests/fixtures/llm-audit-log.sample.jsonl` 을 양쪽이 보는 계약 테스트가 잡는다.
 */

export type LlmAuditOutcome = 'ok' | 'denied' | 'error' | 'unknown';

export interface LlmAuditScope {
  /** 발췌를 보낸 노드 slug 들. 연결 확인은 빈 배열. */
  nodes: string[];
  promptChars: number;
  vaultChars: number;
}

/** 한 왕복에 실려나간 도구 호출 — 이름과 대상만. 인자 전문은 기록되지 않는다. */
export interface LlmAuditToolRef {
  name: string;
  target: string;
}

export interface LlmAuditEntry {
  v: 1;
  at: string;
  provider: string;
  /**
   * 요청이 실제로 향한 호스트. `host` 가 없던 시절의 줄은 `null` — 없는 사실을
   * provider 이름으로 지어내지 않는다.
   */
  host: string | null;
  model: string | null;
  /** `'verify' | 'agent'` — 앞으로 값이 늘어도 파서는 그대로 통과시킨다. */
  purpose: string;
  /** 사용자 본인의 말. 연결 확인은 null. */
  question: string | null;
  scope: LlmAuditScope;
  /**
   * 이 왕복에 실린 도구 호출들. 필드가 **없는** 줄은 `null` — 빈 배열("도구를
   * 0개 썼다")과 다른 뜻이다. 연결 확인 줄에는 애초에 이 필드가 없다.
   */
  tools: LlmAuditToolRef[] | null;
  payloadSha256: string;
  outcome: LlmAuditOutcome;
  /** 아직 모를 수 있는 값들은 0 이 아니라 null — 0 은 사실 주장이다. */
  httpStatus: number | null;
  responseChars: number | null;
  durationMs: number | null;
}

const KNOWN_OUTCOMES: readonly LlmAuditOutcome[] = ['ok', 'denied', 'error'];

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readScope(value: unknown): LlmAuditScope {
  const raw = (value ?? {}) as Partial<LlmAuditScope>;
  return {
    nodes: Array.isArray(raw.nodes)
      ? raw.nodes.filter((node): node is string => typeof node === 'string')
      : [],
    promptChars: readNumber(raw.promptChars) ?? 0,
    vaultChars: readNumber(raw.vaultChars) ?? 0,
  };
}

function readTools(value: unknown): LlmAuditToolRef[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((row) => {
    const raw = row as Partial<LlmAuditToolRef> | null;
    if (!raw || typeof raw.name !== 'string') return [];
    return [{ name: raw.name, target: typeof raw.target === 'string' ? raw.target : '' }];
  });
}

export function parseLlmAuditLog(
  raw: string,
  { limit = 50 }: { limit?: number } = {},
): LlmAuditEntry[] {
  const entries: LlmAuditEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (parsed?.v !== 1) continue;
      if (typeof parsed.at !== 'string' || typeof parsed.provider !== 'string') continue;
      const outcome = parsed.outcome;
      entries.push({
        v: 1,
        at: parsed.at,
        provider: parsed.provider,
        host: typeof parsed.host === 'string' && parsed.host ? parsed.host : null,
        model: typeof parsed.model === 'string' ? parsed.model : null,
        purpose: typeof parsed.purpose === 'string' ? parsed.purpose : '',
        question: typeof parsed.question === 'string' ? parsed.question : null,
        scope: readScope(parsed.scope),
        tools: readTools(parsed.tools),
        payloadSha256:
          typeof parsed.payloadSha256 === 'string' ? parsed.payloadSha256 : '',
        outcome:
          typeof outcome === 'string' && KNOWN_OUTCOMES.includes(outcome as LlmAuditOutcome)
            ? (outcome as LlmAuditOutcome)
            : 'unknown',
        httpStatus: readNumber(parsed.httpStatus),
        responseChars: readNumber(parsed.responseChars),
        durationMs: readNumber(parsed.durationMs),
      });
    } catch {
      /* skip broken line */
    }
  }
  return entries.slice(-limit);
}

export const LLM_AUDIT_LOG_RELATIVE_PATH = '.ontology-atlas/llm-audit.jsonl';

/**
 * 볼트 폴더에서 감사 로그 tail 을 읽는다. 파일이 없으면 빈 배열 — 없다는 것
 * 자체가 "아직 아무것도 보내지 않았다" 는 사실이므로 오류가 아니다.
 */
export async function readLlmAuditLog(
  handle: FileSystemDirectoryHandle,
  { limit = 10 }: { limit?: number } = {},
): Promise<LlmAuditEntry[]> {
  try {
    const dir = await handle.getDirectoryHandle('.ontology-atlas');
    const file = await dir.getFileHandle('llm-audit.jsonl');
    const raw = await (await file.getFile()).text();
    return parseLlmAuditLog(raw, { limit });
  } catch {
    return [];
  }
}
