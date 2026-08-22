import { describe, expect, it } from 'vitest';

import { resolveStaticVaultSource } from '@/entities/docs-vault';
import { computeVaultHealth } from '@/entities/knowledge-graph/lib/vault-health';
import { chatSuggestions } from '@/features/acp-session/model/chat-suggestions';

/**
 * Locks that suggestions still point at things in this folder when they run
 * through the **real vault**.
 *
 * **Why unit tests are not enough.** `chat-suggestions.test.ts` locks "given
 * these facts, what is suggested" and `AcpChatPanel.test.tsx` locks "does the
 * screen draw it and is it clickable". Both can be green while the screen shows
 * nothing — between them lies the **data path**, and a break there (health
 * returning a different shape, or our vault simply not having such a fact) is
 * invisible to both.
 *
 * So this runs the whole chain: **real vault manifest → health computation →
 * suggestions**. Not invented input, but the vault we look at every day
 * (dogfooding).
 *
 * **Locked**: the path does not break · at least one suggestion always appears ·
 * when a suggestion names a slug, that slug is **a node that exists**.
 *
 * **Not locked**: how many islands our vault has right now. That changes with
 * every vault edit, so pinning it turns red with no defect present.
 */

const manifest = resolveStaticVaultSource('dogfood').manifest;

function suggestionsForRealVault() {
  const health = computeVaultHealth(manifest.docs);
  const unevidenced = manifest.docs
    .filter((doc) => {
      const fm = doc.frontmatter as Record<string, unknown> | undefined;
      if (fm?.kind !== 'capability') return false;
      const path = fm.path;
      return !(typeof path === 'string' && path.trim().length > 0);
    })
    .map((doc) => doc.slug)
    .sort();
  return { health, unevidenced, out: chatSuggestions({
    nodeCount: health.summary.nodes,
    islands: health.islands,
    missingContainment: health.missingContainment,
    unevidenced,
  }) };
}

describe('추천은 진짜 볼트를 통과해도 이 폴더의 것을 짚는다', () => {
  it('검사가 헛돌고 있지 않다 — 볼 볼트가 실재한다', () => {
    expect(manifest.docs.length).toBeGreaterThan(50);
    const { health } = suggestionsForRealVault();
    expect(health.summary.nodes).toBeGreaterThan(50);
  });

  it('경로가 끊기지 않는다 — 추천이 늘 하나는 나온다', () => {
    const { out } = suggestionsForRealVault();
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it('슬러그를 짚는 추천은 **실재하는 노드**를 짚는다', () => {
    const { out } = suggestionsForRealVault();
    const known = new Set(manifest.docs.map((d) => d.slug));
    for (const s of out) {
      for (const [key, value] of Object.entries(s.params)) {
        if (typeof value !== 'string') continue;
        expect(
          known.has(value),
          `${s.kind}.${key} 가 볼트에 없는 「${value}」 를 짚는다`,
        ).toBe(true);
      }
    }
  });

  it('우리 볼트에 실제로 있는 결함 하나는 추천으로 올라온다', () => {
    const { out, health, unevidenced } = suggestionsForRealVault();
    // If this vault has anything to fix, "explain" must not be the only suggestion —
    // if it is, the material never reached the screen.
    const hasWork =
      health.islands.length > 0 ||
      health.missingContainment.length > 0 ||
      unevidenced.length > 0;
    if (!hasWork) return; // A perfect vault leaves nothing to check
    expect(
      out.some((s) => s.kind !== 'explain'),
      '고칠 것이 있는데 추천은 「설명해줘」뿐이다',
    ).toBe(true);
  });
});
