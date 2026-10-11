import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearLocalEndpoint,
  countChatCapableModels,
  hostOfBaseUrl,
  isEmbeddingOnlyModel,
  isLocalEndpointReady,
  parseOpenAiModelList,
  readLocalEndpoint,
  readLocalVerdict,
  writeLocalEndpoint,
} from './local-endpoint';
import type { LlmVerifyResult } from './tauri-secrets';

function verifyResult(overrides: Partial<LlmVerifyResult>): LlmVerifyResult {
  return {
    provider: 'local',
    ok: false,
    denied: false,
    httpStatus: null,
    message: null,
    durationMs: 12,
    loggedAt: '2026-08-01T00:00:00.000Z',
    body: null,
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('설치된 모델 목록', () => {
  it('OpenAI 호환 목록에서 이름만 꺼낸다', () => {
    // The exact response shape measured on the owner's machine, 2026-08-01.
    const body = JSON.stringify({
      object: 'list',
      data: [
        { id: 'qwen3:8b', object: 'model', owned_by: 'library' },
        { id: 'gemma4:12b', object: 'model', owned_by: 'library' },
      ],
    });
    expect(parseOpenAiModelList(body)).toEqual(['gemma4:12b', 'qwen3:8b']);
  });

  it('임베딩 전용 모델을 이름으로 추측해 지우지 않는다', () => {
    // The OpenAI-compatible list does not carry that fact. Dropping them would make
    // the screen deny something the user's runner actually has; if an unusable model
    // is picked, relaying the runner's own error is the honest answer.
    const body = JSON.stringify({
      data: [{ id: 'nomic-embed-text:latest' }, { id: 'qwen3:8b' }],
    });
    expect(parseOpenAiModelList(body)).toContain('nomic-embed-text:latest');
  });

  it('임베딩 전용 모델은 1번이 되지 못한다 (알파벳 → 쓸모)', () => {
    // Measured on the owner's machine 2026-08-01: 4 of 7 models were embedding-only,
    // and alphabetical order put `embeddinggemma:latest` first, so it was selected
    // and saved as "connected" — a state that would fail on the first question was
    // reported as success.
    const body = JSON.stringify({
      data: [
        { id: 'qwen3:8b' },
        { id: 'embeddinggemma:latest' },
        { id: 'nomic-embed-text:latest' },
        { id: 'gemma3:12b' },
        { id: 'bge-m3:latest' },
        { id: 'all-minilm:latest' },
        { id: 'llama3.2:3b' },
      ],
    });
    const models = parseOpenAiModelList(body);
    // The first three are the chat-capable ones, alphabetical among themselves as before.
    expect(models.slice(0, 3)).toEqual(['gemma3:12b', 'llama3.2:3b', 'qwen3:8b']);
    // The four embedding models move down but **do not disappear** — ranking is not hiding.
    expect(models.slice(3)).toEqual([
      'all-minilm:latest',
      'bge-m3:latest',
      'embeddinggemma:latest',
      'nomic-embed-text:latest',
    ]);
  });

  it('깨진 본문·빈 본문은 빈 목록이지 예외가 아니다', () => {
    expect(parseOpenAiModelList('')).toEqual([]);
    expect(parseOpenAiModelList('not json')).toEqual([]);
    expect(parseOpenAiModelList('{"data":"nope"}')).toEqual([]);
    expect(parseOpenAiModelList('{"data":[{"noid":1}]}')).toEqual([]);
  });
});

describe('임베딩 전용 판정', () => {
  it('이름에 embed 가 들어가면 임베딩으로 본다', () => {
    for (const name of [
      'embeddinggemma:latest',
      'nomic-embed-text:latest',
      'mxbai-embed-large',
      'snowflake-arctic-embed2:568m',
      'granite-embedding:278m',
      'qwen3-embedding:8b',
      'text-embedding-3-small',
    ]) {
      expect(isEmbeddingOnlyModel(name), name).toBe(true);
    }
  });

  it('embed 라는 낱말이 없는 알려진 계열도 판정한다', () => {
    for (const name of [
      'bge-m3:latest',
      'gte-large',
      'e5-mistral-7b-instruct',
      'all-minilm:22m',
      'paraphrase-multilingual:latest',
    ]) {
      expect(isEmbeddingOnlyModel(name), name).toBe(true);
    }
  });

  it('대화 모델을 임베딩으로 오판하지 않는다', () => {
    for (const name of [
      'qwen3:8b',
      'gemma3:12b',
      'llama3.2:3b',
      'deepseek-r1:14b',
      'mistral-small:latest',
      'gpt-oss:20b',
      'phi4:latest',
    ]) {
      expect(isEmbeddingOnlyModel(name), name).toBe(false);
    }
  });

  it('대화 가능한 개수는 임베딩으로 확신되는 것만 뺀 수다', () => {
    expect(
      countChatCapableModels([
        'qwen3:8b',
        'embeddinggemma:latest',
        'bge-m3:latest',
        'gemma3:12b',
      ]),
    ).toBe(2);
  });
});

describe('실패 이유는 서로 구별된다', () => {
  it('상태 코드가 없으면 러너가 꺼져 있거나 포트가 다른 것이다', () => {
    // Collapsing this into "we couldn't check" leaves the user unable to tell
    // whether to start the runner or fix the address.
    const verdict = readLocalVerdict(
      verifyResult({ httpStatus: null, message: '그 주소에서 응답이 없어요' }),
    );
    expect(verdict.reason).toBe('unreachable');
  });

  it('404 는 연결은 됐으나 OpenAI 호환 주소가 아닌 것이다', () => {
    const verdict = readLocalVerdict(verifyResult({ httpStatus: 404 }));
    expect(verdict.reason).toBe('not-compatible');
  });

  it('200 인데 목록이 비면 설치된 모델이 없는 것이다', () => {
    const verdict = readLocalVerdict(
      verifyResult({ ok: true, httpStatus: 200, body: '{"data":[]}' }),
    );
    expect(verdict.reason).toBe('no-models');
    expect(verdict.models).toEqual([]);
  });

  it('200 + 목록이면 통과이고 고를 것이 함께 온다', () => {
    const verdict = readLocalVerdict(
      verifyResult({ ok: true, httpStatus: 200, body: '{"data":[{"id":"qwen3:8b"}]}' }),
    );
    expect(verdict.reason).toBe('ok');
    expect(verdict.models).toEqual(['qwen3:8b']);
  });
});

describe('설정 보관', () => {
  it('주소만 있고 모델이 없으면 아직 쓸 수 있는 상태가 아니다', () => {
    // Sent as is, the first round trip dies with "model is required" and the user
    // has no idea what they left out.
    expect(isLocalEndpointReady({ baseUrl: 'http://localhost:11434', model: '' })).toBe(false);
    expect(isLocalEndpointReady({ baseUrl: '', model: 'qwen3:8b' })).toBe(false);
    expect(isLocalEndpointReady({ baseUrl: 'http://localhost:11434', model: 'qwen3:8b' })).toBe(
      true,
    );
  });

  it('쓰고 읽고 지우는 한 바퀴', () => {
    writeLocalEndpoint({ baseUrl: 'http://localhost:1234/v1 ', model: ' qwen3:8b ' });
    expect(readLocalEndpoint()).toEqual({
      baseUrl: 'http://localhost:1234/v1',
      model: 'qwen3:8b',
    });
    clearLocalEndpoint();
    expect(readLocalEndpoint().model).toBe('');
  });

  it('깨진 값은 없는 값과 같은 화면이면 충분하다', () => {
    window.localStorage.setItem('ontology-atlas:local-endpoint', '{{{');
    expect(readLocalEndpoint().model).toBe('');
    expect(readLocalEndpoint().baseUrl).toBe('http://localhost:11434');
  });
});

describe('목적지 호스트', () => {
  it('포트까지가 사실이다 — 감사 줄에 남는 값과 같은 문법', () => {
    expect(hostOfBaseUrl('http://localhost:11434')).toBe('localhost:11434');
    expect(hostOfBaseUrl('http://localhost:1234/v1')).toBe('localhost:1234');
    expect(hostOfBaseUrl('https://box.example.com:8080/v1')).toBe('box.example.com:8080');
  });
});
