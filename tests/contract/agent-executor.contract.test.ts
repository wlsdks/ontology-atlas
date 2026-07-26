// 앱 에이전트의 읽기 실행기 ↔ MCP 서버의 볼트 읽기 drift 차단.
//
// 도구 **이름·인자**는 `agent-tool-catalog.contract.test.ts` 가 잡는다.
// 여기서 잡는 것은 **답**이다: 같은 볼트에 같은 질문을 했을 때 화면 안
// 에이전트와 터미널의 MCP 에이전트가 같은 사실을 받아야 한다. 이 저장소의
// dogfood 볼트(`docs/ontology/`)를 양쪽이 실제로 읽는다 — 합성 픽스처가
// 아니라 실물이라, 파생 스텁·별칭 규칙 같은 미묘한 자리가 진짜로 대조된다.
//
// 한쪽만 바뀌면 여기서 깨진다: MCP 가 별칭 규칙을 바꾸면 웹 derive 도 같이
// 바꿔야 하고(그 반대도), 그러지 않으면 사람과 에이전트가 다른 온톨로지를
// 보게 된다 (#691 이 고친 바로 그 결함).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import manifest from '@/entities/docs-vault/data/manifest.json';
import content from '@/entities/docs-vault/data/content.json';
import type { VaultManifest } from '@/entities/docs-vault';
import { deriveOntologyFromVault } from '@/entities/docs-vault/lib/derive-ontology-from-vault';
import { derivationToInsight } from '@/features/vault-ontology/model/use-ontology-insight';
import {
  GRAPH_FRONTMATTER_KEYS,
  createToolExecutor,
} from '@/features/vault-agent/model/tool-executor';
import type { VaultReadPort } from '@/features/vault-agent/model/vault-read-port';
import type { NormalizedToolCall } from '@/features/vault-agent/model/provider-adapter';

const VAULT_DIR = join(__dirname, '../../docs/ontology');

/**
 * 번들 dogfood 매니페스트는 `docs/` 를 뿌리로 빌드돼 slug 앞에 `ontology/`
 * 한 조각이 남는다. MCP 는 `docs/ontology/` 를 뿌리로 읽으므로 그 조각을
 * 빼야 같은 이름이 된다 — 앱도 정확히 이 접두사 규칙을 쓴다
 * (`derivationToInsight({ agentSlugPrefix })`).
 */
const AGENT_SLUG_PREFIX = 'ontology/';

const bundled = manifest as unknown as VaultManifest;
const bodies = content as unknown as Record<string, string>;

const insight = derivationToInsight(deriveOntologyFromVault(bundled), undefined, {
  agentSlugPrefix: AGENT_SLUG_PREFIX,
});

function stripPrefix(slug: string): string {
  return slug.startsWith(AGENT_SLUG_PREFIX) ? slug.slice(AGENT_SLUG_PREFIX.length) : slug;
}

const port: VaultReadPort = {
  nodes: insight.nodes,
  edges: insight.edges,
  docs: bundled.docs
    .filter((doc) => typeof doc.frontmatter?.kind === 'string')
    .map((doc) => ({
      slug: stripPrefix(doc.slug),
      path: doc.path,
      title: doc.title,
      kind: String(doc.frontmatter.kind),
      domain:
        typeof doc.frontmatter.domain === 'string' ? doc.frontmatter.domain : undefined,
      frontmatter: doc.frontmatter,
      excerpt: doc.excerpt,
      mtime: doc.mtime,
    })),
  async readDocText(slug: string) {
    return bodies[`${AGENT_SLUG_PREFIX}${slug}`] ?? bodies[slug] ?? null;
  },
};

const execute = createToolExecutor(port);

function call(name: string, args: unknown = {}): NormalizedToolCall {
  return { id: 'c', name, args, argsInvalid: false };
}

async function run<T>(name: string, args: unknown = {}): Promise<T> {
  const result = await execute(call(name, args));
  return JSON.parse(result.content.split('\n…(truncated')[0]) as T;
}

// MCP 쪽은 볼트 폴더를 직접 읽는다 — 우리 매니페스트를 거치지 않는다.
const mcpVault = await import('../../mcp/src/vault.mjs');

describe('에이전트 읽기 실행기 ↔ MCP 볼트 읽기 (dogfood 볼트 실물)', () => {
  it('종류별 개수와 "이름만 불린 개념" 수가 통째로 같다', async () => {
    // 필드 이름까지 같다 — 화면 안 에이전트와 터미널의 에이전트가 같은
    // 문장으로 census 를 말해야 사용자가 두 숫자를 대조할 수 있다.
    const mcpKinds = mcpVault.listKinds(VAULT_DIR) as {
      total: number;
      byKind: Record<string, number>;
      referencedOnlyTotal: number;
      conceptsIncludingReferenced: number;
    };
    const ours = await run<typeof mcpKinds>('list_kinds');
    expect(ours).toEqual(mcpKinds);
  });

  it('kind 별 문서 slug 집합이 같다', async () => {
    // 한 번에 전부 받으면 왕복 상한(글자수)에 걸려 행이 잘린다 — 그건
    // 결함이 아니라 계약이다(사용자 비용 보호). 그래서 실사용과 같은 방식,
    // kind 로 좁혀서 대조한다.
    const mcpDocs = mcpVault.loadVaultDocs(VAULT_DIR) as Array<{
      slug: string;
      frontmatter: Record<string, unknown>;
    }>;
    const kinds = [...new Set(mcpDocs.map((doc) => String(doc.frontmatter.kind)))];
    for (const kind of kinds) {
      const expected = mcpDocs
        .filter((doc) => String(doc.frontmatter.kind) === kind)
        .map((doc) => doc.slug)
        .sort();
      const ours = await run<{ rows: Array<{ slug: string }>; truncated?: boolean }>(
        'list_concepts',
        { kind, limit: 500 },
      );
      expect(ours.truncated ?? false).toBe(false);
      expect(ours.rows.map((row) => row.slug).sort()).toEqual(expected);
    }
  });

  it('같은 노드를 물으면 같은 kind 를 답한다', async () => {
    const mcpDocs = mcpVault.loadVaultDocs(VAULT_DIR) as Array<{
      slug: string;
      frontmatter: Record<string, unknown>;
    }>;
    // 앞쪽 몇 개만 — 계약은 표본으로 충분하고, 전수는 느리기만 하다.
    for (const doc of mcpDocs.slice(0, 12)) {
      const ours = await run<{ kind: string; hasDocument: boolean }>('get_concept', {
        slug: doc.slug,
      });
      expect(ours.hasDocument).toBe(true);
      expect(ours.kind).toBe(doc.frontmatter.kind);
    }
  });

  it('백링크 대상 집합이 같다', async () => {
    const mcpDocs = mcpVault.loadVaultDocs(VAULT_DIR) as Array<{ slug: string }>;
    // 백링크가 실제로 있는 노드를 골라야 계약이 의미를 가진다.
    const withBacklinks = mcpDocs
      .map((doc) => ({
        slug: doc.slug,
        backlinks:
          (mcpVault.findBacklinks(VAULT_DIR, doc.slug) as Array<{
            slug: string;
            matchedKeys?: string[];
          }>) ?? [],
      }))
      .filter((row) => row.backlinks.length > 0)
      .slice(0, 8);
    expect(withBacklinks.length).toBeGreaterThan(0);

    for (const row of withBacklinks) {
      const ours = await run<{ backlinks: Array<{ slug: string; matchedKeys: string[] }> }>(
        'find_backlinks',
        { slug: row.slug },
      );
      // frontmatter 키로 걸린 것끼리 비교한다 — MCP 는 본문 언급도 함께
      // 세지만(그건 근거이지 관계가 아니다), 관계 집합은 정확히 같아야 한다.
      const expected = row.backlinks
        .filter((entry) => (entry.matchedKeys?.length ?? 0) > 0)
        .map((entry) => entry.slug)
        .sort();
      expect(ours.backlinks.map((entry) => entry.slug).sort()).toEqual(expected);
    }
  });

  it('제목 검색이 같은 문서를 찾는다', async () => {
    const mcpDocs = mcpVault.loadVaultDocs(VAULT_DIR) as Array<{
      slug: string;
      frontmatter: Record<string, unknown>;
    }>;
    const sample = mcpDocs.find(
      (doc) => typeof doc.frontmatter.title === 'string' && doc.frontmatter.title.trim(),
    );
    expect(sample).toBeTruthy();
    const ours = await run<{ matches: Array<{ slug: string }> }>('find_evidence', {
      title: sample?.frontmatter.title as string,
    });
    expect(ours.matches.some((match) => match.slug === sample?.slug)).toBe(true);
  });

  it('볼트 본문은 신뢰할 수 없는 데이터로 감싸여 나간다', async () => {
    const mcpDocs = mcpVault.loadVaultDocs(VAULT_DIR) as Array<{ slug: string }>;
    const documented = mcpDocs.find((doc) => doc.slug !== 'README') as { slug: string };
    const result = await execute(call('get_concept', { slug: documented.slug }));
    expect(result.content).toContain('<untrusted_vault_content>');
  });

  it('관계가 적히는 frontmatter 키 목록이 MCP 와 같다', () => {
    // 백링크는 지도 엣지가 아니라 이 키 목록에서 세어진다. 한쪽만 늘면
    // 화면 안 에이전트가 못 보는 관계가 생긴다.
    expect([...GRAPH_FRONTMATTER_KEYS].sort()).toEqual(
      [...(mcpVault.GRAPH_ARRAY_KEYS as string[]), 'domain'].sort(),
    );
  });

  it('번들 매니페스트가 실제 볼트와 어긋나 있지 않다 (계약의 전제)', () => {
    // 이 테스트가 없으면 위의 대조들이 "낡은 매니페스트 vs 실물" 을 비교하며
    // 조용히 통과할 수 있다. 커밋된 매니페스트는 `docs-vault:check` 가
    // 최신으로 유지한다 — 여기서는 그 전제를 한 번 더 붙잡는다.
    const readme = readFileSync(join(VAULT_DIR, 'README.md'), 'utf-8');
    expect(readme.length).toBeGreaterThan(0);
    const mcpDocs = mcpVault.loadVaultDocs(VAULT_DIR) as Array<{ slug: string }>;
    expect(port.docs.length).toBe(mcpDocs.length);
  });
});
