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
    // 2026-08-01 소유자 기계 실측 응답의 모양 그대로.
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
    // 호환 목록에는 그 사실이 없다. 지우면 화면이 사용자의 러너에 있는 것을
    // 없는 것처럼 말한다 — 못 쓰는 모델을 고르면 러너가 준 오류를 그대로
    // 옮기는 쪽이 정직하다.
    const body = JSON.stringify({
      data: [{ id: 'nomic-embed-text:latest' }, { id: 'qwen3:8b' }],
    });
    expect(parseOpenAiModelList(body)).toContain('nomic-embed-text:latest');
  });

  it('임베딩 전용 모델은 1번이 되지 못한다 (알파벳 → 쓸모)', () => {
    // 2026-08-01 소유자 기계 실측: 7개 중 4개가 임베딩 전용이었고, 알파벳
    // 정렬이 `embeddinggemma:latest` 를 1번에 올려 그것이 실제로 선택돼
    // 「연결됨」으로 저장됐다 — 첫 질문에서 실패할 상태가 성공으로 표시됐다.
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
    // 앞 세 자리는 대화 가능한 것들이고, 그 안에서는 종전과 같은 알파벳 순서.
    expect(models.slice(0, 3)).toEqual(['gemma3:12b', 'llama3.2:3b', 'qwen3:8b']);
    // 임베딩 넷은 뒤로 밀리되 **사라지지 않는다** — 라벨링은 은닉이 아니다.
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
    // 화면이 "확인하지 못했어요" 한 문장으로 뭉개면 사용자는 러너를 켜야
    // 하는지 주소를 고쳐야 하는지 알 수 없다.
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
    // 그대로 보내면 첫 왕복이 "model is required" 로 죽고, 사용자는 자기가
    // 뭘 빠뜨렸는지 모른다.
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
