'use client';

import {
  LOCAL_DEFAULT_BASE_URL,
  LOCAL_PROVIDER,
  type LlmVerifyResult,
} from './tauri-secrets';

/**
 * 「주소로 연결」 갈래의 화면 쪽 지식 — 어디로 보낼지(주소)와 어떤 모델을
 * 쓸지, 그리고 실패했을 때 **무엇 때문인지**.
 *
 * ## 왜 여기가 localStorage 인가
 *
 * 표면 계약(`surfaces.md`)이 이미 갈라 놨다: 비밀은 키체인, 취향은
 * localStorage, 표면을 넘어야 하는 사실은 볼트 안. 러너 주소와 고른 모델은
 * **비밀이 아니고**(키가 없는 갈래다) 볼트의 사실도 아니다 — 이 컴퓨터에서
 * 무엇이 돌고 있는지에 대한 이 컴퓨터의 설정이라, 다른 기계로 넘어가면
 * 오히려 틀린다. 그래서 취향 칸이 맞다.
 *
 * ## 왜 모델 목록을 저장하지 않나
 *
 * 목록의 진실원은 러너 자신이다. 저장해 두면 `ollama rm` 한 번에 화면이
 * 없는 모델을 고르라고 권한다. 목록은 [연결 확인]을 누를 때마다 실물에서
 * 다시 온다 — 그 한 번의 요청이 "살아 있나 · 호환되나 · 뭘 고를 수 있나"
 * 셋을 동시에 답한다.
 */

const STORAGE_KEY = 'ontology-atlas:local-endpoint';

export interface LocalEndpointSettings {
  /** 러너의 base URL. 비어 있으면 이 갈래는 아직 설정되지 않은 것이다. */
  baseUrl: string;
  /** 사용자가 목록에서 고른 모델. 고르기 전에는 빈 문자열이다. */
  model: string;
}

export const EMPTY_LOCAL_ENDPOINT: LocalEndpointSettings = {
  baseUrl: LOCAL_DEFAULT_BASE_URL,
  model: '',
};

/**
 * 이 갈래가 **실제로 쓸 수 있는 상태인가.** 주소만 적고 모델을 못 고른 상태는
 * 설정된 것이 아니다 — 그대로 보내면 첫 왕복이 "model is required" 로 죽고,
 * 사용자는 자기가 뭘 빠뜨렸는지 모른다.
 */
export function isLocalEndpointReady(settings: LocalEndpointSettings): boolean {
  return settings.baseUrl.trim().length > 0 && settings.model.trim().length > 0;
}

export function readLocalEndpoint(): LocalEndpointSettings {
  if (typeof window === 'undefined') return EMPTY_LOCAL_ENDPOINT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_LOCAL_ENDPOINT;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY_LOCAL_ENDPOINT;
    const record = parsed as Record<string, unknown>;
    return {
      baseUrl:
        typeof record.baseUrl === 'string' && record.baseUrl.trim()
          ? record.baseUrl.trim()
          : LOCAL_DEFAULT_BASE_URL,
      model: typeof record.model === 'string' ? record.model.trim() : '',
    };
  } catch {
    // 깨진 값은 없는 값과 같은 화면이면 충분하다 — 사용자가 할 일(주소를 다시
    // 확인하고 [연결 확인])이 같다.
    return EMPTY_LOCAL_ENDPOINT;
  }
}

export function writeLocalEndpoint(settings: LocalEndpointSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ baseUrl: settings.baseUrl.trim(), model: settings.model.trim() }),
    );
  } catch {
    // 저장 실패는 이 화면을 막을 이유가 아니다 — 이번 세션 동안은 그대로 쓴다.
  }
  notifyLocalEndpointChange();
}

export function clearLocalEndpoint(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 같은 이유로 무시한다. */
  }
  notifyLocalEndpointChange();
}

/**
 * 설정이 방금 바뀌었다는 신호 — 키체인 쪽 `subscribeSecretChange` 와 같은
 * 이유로 있다. 주소를 넣는 곳(설정 시트)과 그 주소로 살아나는 곳(지도 오른쪽
 * 도크)이 다른 표면이라, 신호가 없으면 사용자가 새로고침을 해야 한다.
 */
const LOCAL_ENDPOINT_CHANGE_EVENT = 'ontology-atlas:local-endpoint-change';

function notifyLocalEndpointChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(LOCAL_ENDPOINT_CHANGE_EVENT));
}

export function subscribeLocalEndpointChange(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(LOCAL_ENDPOINT_CHANGE_EVENT, handler);
  return () => window.removeEventListener(LOCAL_ENDPOINT_CHANGE_EVENT, handler);
}

/**
 * 이름만 보고 **대화를 못 하는 모델**임을 확신할 수 있는가.
 *
 * OpenAI 호환 `/v1/models` 에는 그 사실이 없다 — Ollama 네이티브
 * `/api/tags` 에만 `capabilities` 가 있고, 그것을 보러 가면 [연결 확인] 한
 * 번이 두 요청이 되어 **감사 줄과 화면이 어긋난다**(한 번 눌렀는데 기록은
 * 한 줄). 그래서 판정은 이름으로만 하고, **확신할 수 있는 것만** 참이라고
 * 한다.
 *
 * 판정은 두 갈래다. ① 이름에 `embed` 가 들어간 것 —
 * `embeddinggemma` · `nomic-embed-text` · `mxbai-embed-large` ·
 * `snowflake-arctic-embed` · `granite-embedding` · `qwen3-embedding` ·
 * `text-embedding-3-*` 가 여기 걸린다. ② `embed` 라는 낱말 없이 임베딩만
 * 내놓는 알려진 계열 — `bge-*` · `gte-*` · `e5-*` · `all-minilm` ·
 * `paraphrase-multilingual`.
 *
 * **오탐 위험**: 위 접두사로 시작하면서 대화가 되는 모델이 나오면 그 모델이
 * 목록 끝으로 밀리고 "임베딩 전용" 이라는 틀린 설명을 단다. 오늘 기준 그런
 * 모델은 없고, 걸리더라도 **고를 수는 있다**(지우지 않는다). 반대쪽
 * 미탐(우리가 모르는 임베딩 모델)은 종전과 똑같이 이름만 뜬 채 남는다 —
 * 회귀가 아니라 개선의 미달이다.
 */
export function isEmbeddingOnlyModel(name: string): boolean {
  // 태그(`:latest`)를 떼고 본다 — `bge-m3:latest` 도 같은 계열이다.
  const base = (name.split(':')[0] ?? name).trim().toLowerCase();
  if (base.includes('embed')) return true;
  return EMBEDDING_ONLY_PREFIXES.some(
    (prefix) => base === prefix || base.startsWith(`${prefix}-`),
  );
}

/** `embed` 라는 낱말 없이 임베딩만 내놓는 계열. 접두사로만 판정한다. */
const EMBEDDING_ONLY_PREFIXES = [
  'bge',
  'gte',
  'e5',
  'all-minilm',
  'paraphrase-multilingual',
];

/**
 * OpenAI 호환 `/v1/models` 응답 → 모델 이름 목록.
 *
 * 임베딩 전용 모델을 **지우지 않는다**: 지우면 화면이 사용자의 러너에 있는
 * 것을 없는 것처럼 말하게 된다. 대신 **순서**를 알파벳에서 **쓸모**로
 * 바꾼다 — 알파벳 순서는 `embeddinggemma:latest` 를 1번에 올렸고, 소유자가
 * 실제로 그것을 골라 「연결됨」으로 저장됐다(2026-08-01 실측: 러너 모델 7개
 * 중 4개가 임베딩 전용). **첫 질문에서 실패할 상태가 성공이라고 표시되는
 * 것**이 결함이었지, 목록에 있는 것 자체는 결함이 아니었다.
 *
 * 라벨링은 은닉이 아니다 — 화면은 임베딩으로 판정된 행에 "대화는 못 해요"
 * 를 붙이고(`Select` 의 `description`), 고르는 것은 여전히 사람이 한다.
 *
 * 같은 층 안에서는 종전과 같은 알파벳 순서다 — 바뀐 것은 층이 둘이 된 것
 * 하나뿐이라, 임베딩이 하나도 없는 러너에서는 목록이 종전과 똑같다.
 */
export function parseOpenAiModelList(body: string): string[] {
  try {
    const parsed: unknown = JSON.parse(body);
    const data = (parsed as { data?: unknown } | null)?.data;
    if (!Array.isArray(data)) return [];
    const names = data
      .map((row) => (row as { id?: unknown } | null)?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    return [...new Set(names)].sort((a, b) => {
      const rank = Number(isEmbeddingOnlyModel(a)) - Number(isEmbeddingOnlyModel(b));
      return rank !== 0 ? rank : a.localeCompare(b);
    });
  } catch {
    return [];
  }
}

/** 이 목록에서 대화에 쓸 수 있는 것 — 임베딩으로 확신되는 것만 뺀 수. */
export function countChatCapableModels(models: string[]): number {
  return models.filter((model) => !isEmbeddingOnlyModel(model)).length;
}

/**
 * 연결 확인이 실패한 **이유** — 화면이 서로 다른 다음 행동을 안내할 수 있게
 * 갈라 둔다. "확인하지 못했어요" 한 문장으로 뭉개면 사용자는 러너를 켜야
 * 하는지, 포트를 고쳐야 하는지, 다른 프로그램이 그 포트를 쓰고 있는지 알 수
 * 없다.
 */
export type LocalVerifyReason =
  | 'ok'
  /** 연결 자체가 안 됐다 — 러너가 꺼져 있거나 포트가 다르다. */
  | 'unreachable'
  /** 연결은 됐는데 OpenAI 호환 주소가 아니다(대개 다른 프로그램이 그 포트에). */
  | 'not-compatible'
  /** 호환 주소인데 설치된 모델이 하나도 없다. */
  | 'no-models'
  /** 그 밖 — 상태 코드/메시지를 그대로 보여준다. */
  | 'failed';

export interface LocalVerifyVerdict {
  reason: LocalVerifyReason;
  models: string[];
  /** 화면이 덧붙일 사실 — 상태 코드 또는 Rust 가 준 한 줄. */
  detail: string;
}

export function readLocalVerdict(result: LlmVerifyResult): LocalVerifyVerdict {
  if (!result.ok) {
    if (result.httpStatus === null) {
      return {
        reason: 'unreachable',
        models: [],
        detail: result.message ?? '',
      };
    }
    if (result.httpStatus === 404) {
      return { reason: 'not-compatible', models: [], detail: String(result.httpStatus) };
    }
    return {
      reason: 'failed',
      models: [],
      detail: result.message ?? String(result.httpStatus),
    };
  }
  const models = parseOpenAiModelList(result.body ?? '');
  if (models.length === 0) {
    return { reason: 'no-models', models, detail: '' };
  }
  return { reason: 'ok', models, detail: '' };
}

/** 감사 줄·화면 푸터가 함께 말하는 "어디로 갔나". 포트까지가 사실이다. */
export function hostOfBaseUrl(baseUrl: string): string {
  const withoutScheme = baseUrl.includes('://') ? baseUrl.split('://')[1] : baseUrl;
  return withoutScheme?.split(/[/?#]/)[0] ?? baseUrl;
}

export { LOCAL_PROVIDER };
