import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * **첫 마디는 모델을 부르지 않는다** — 이 슬라이스의 핵심 계약을 코드로 잠근다.
 *
 * 왜 계약인가: 칩은 사용자가 아직 [보내기]를 누르지 않은 순간에 그려진다.
 * 칩을 만들려고 한 번이라도 호출이 나가면 그것은 ① 동의 없는 전송이고 ②
 * 남의 돈(BYOK 요금)을 쓰는 일이다. 설계가 "에이전트가 먼저 말 걸기(자동 첫
 * 턴)" 를 기각한 근거가 정확히 이것이고, 그 기각을 성립시키는 것이 이 파일의
 * 순수성이다. 규율을 문서에만 쓰면 지켜지지 않는다.
 *
 * 두 방향으로 잠근다:
 *  1. **구조** — 생성기 모듈이 전송 경로를 import 하지 않는다(타입 아닌 값).
 *  2. **행동** — 어떤 폴더 상태로 칩을 만들어도 브리지/네트워크 호출이 0이다.
 */

const FIRST_WORDS_SOURCE = readFileSync(
  path.join(process.cwd(), 'src/features/vault-agent/model/first-words.ts'),
  'utf8',
);

/** 전송으로 이어질 수 있는 경로 — 하나라도 닿으면 칩이 공짜가 아니게 된다. */
const FORBIDDEN_IMPORTS = [
  'tauri-llm',
  'tauri-secrets',
  './agent-loop',
  './providers',
  './provider-adapter',
  '@tauri-apps/api',
];

describe('첫 마디 생성기 — 모델 호출 0', () => {
  it('전송 경로를 import 하지 않는다', () => {
    const imports = [...FIRST_WORDS_SOURCE.matchAll(/from\s+'([^']+)'/g)].map(
      (match) => match[1],
    );
    for (const forbidden of FORBIDDEN_IMPORTS) {
      expect(imports.some((source) => source.includes(forbidden))).toBe(false);
    }
  });

  it('네트워크·브리지 심볼이 소스에 없다', () => {
    for (const symbol of ['fetch(', 'invoke(', 'llmChat', 'XMLHttpRequest']) {
      expect(FIRST_WORDS_SOURCE.includes(symbol)).toBe(false);
    }
  });

  it('어떤 폴더 상태로 칩을 만들어도 fetch 가 0회다', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const { buildFirstWords } = await import(
        '@/features/vault-agent/model/first-words'
      );
      const labels = {
        missingDefinition: (title: string) => `def:${title}`,
        missingDomain: (title: string) => `domain:${title}`,
        missingRelations: (title: string) => `rel:${title}`,
        mapReview: 'map',
        emptyVault: 'empty',
      };
      const conceptNode = {
        id: 'capability:pay',
        kind: 'capability',
        title: 'pay',
        evidenceIds: ['capabilities/pay'],
        hasOwnDocument: true,
        agentSlug: 'capabilities/pay',
        ref: null,
      } as unknown as Parameters<typeof buildFirstWords>[0]['nodes'][number];
      const docFacts = new Map([
        ['capabilities/pay', { hasDefinition: false, domainRef: null, mtime: null }],
      ]);

      // 빈 폴더 · 큐 있는 폴더 · 노드 선택 — 화면이 그리는 세 경우 전부.
      const states: Array<Parameters<typeof buildFirstWords>[0]> = [
        { nodes: [], docFacts: new Map(), focusedRef: null },
        { nodes: [conceptNode], docFacts, focusedRef: null },
        { nodes: [conceptNode], docFacts, focusedRef: 'capabilities/pay' },
      ];
      for (const state of states) {
        expect(buildFirstWords(state, labels).length).toBeGreaterThan(0);
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
