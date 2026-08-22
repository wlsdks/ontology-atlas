import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * **The first words never call a model** — this slice's core contract, locked in code.
 *
 * Why it is a contract: the chips are rendered at a moment when the user has not yet
 * pressed send. A single call going out to build a chip would be ① a transmission
 * without consent and ② spending someone else's money (their BYOK bill). That is
 * precisely the basis on which the design rejected "the agent speaks first" (an
 * automatic first turn), and what makes that rejection hold is this file's purity. A
 * discipline written only in a document is not followed.
 *
 * Locked in two directions:
 *  1. **Structure** — the generator module does not import a transmission path (as a
 *     value, not a type).
 *  2. **Behaviour** — building chips in any folder state makes 0 bridge or network
 *     calls.
 */

const FIRST_WORDS_SOURCE = readFileSync(
  path.join(process.cwd(), 'src/features/vault-agent/model/first-words.ts'),
  'utf8',
);

/** Paths that could lead to a transmission — touching any one makes the chips not free. */
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

      // Empty folder, folder with a queue, node selected — all three cases the screen renders.
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
