import { describe, expect, it } from 'vitest';

import { resolveStaticVaultSource } from '@/entities/docs-vault';
import { computeVaultHealth } from '@/entities/knowledge-graph/lib/vault-health';
import { chatSuggestions } from '@/features/acp-session/model/chat-suggestions';

/**
 * 추천이 **진짜 볼트**를 통과해도 이 폴더의 것을 짚는지 잠근다.
 *
 * ## 왜 단위 테스트만으로는 부족한가
 *
 * `chat-suggestions.test.ts` 는 「어떤 사실이 오면 무엇을 권하나」를 잠그고,
 * `AcpChatPanel.test.tsx` 는 「화면이 그것을 그리고 눌리는가」를 잠근다. 둘 다
 * 초록인데 화면에는 아무 값도 없을 수 있다 — 그 사이에 **데이터 경로**가 있고,
 * 거기서 끊기면(건강 계산이 다른 모양을 돌려주거나, 우리 볼트에는 그런 사실이
 * 아예 없거나) 두 테스트 어느 쪽도 못 본다.
 *
 * 그래서 여기서는 **실제 볼트 매니페스트 → 건강 계산 → 추천** 을 통째로 돌린다.
 * 지어낸 입력이 아니라 우리가 매일 보는 그 볼트다(dogfooding).
 *
 * ## 무엇을 잠그고 무엇을 안 잠그나
 *
 * **잠근다**: 경로가 끊기지 않는가 · 추천이 늘 하나는 나오는가 · 슬러그를
 * 짚는 추천이 나올 때 그 슬러그가 **실재하는 노드**인가.
 *
 * **안 잠근다**: 우리 볼트에 지금 섬이 몇 개인가. 그건 볼트를 고칠 때마다
 * 바뀌는 값이라 못박으면 아무 결함도 없는데 빨개진다.
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
    // 이 볼트에 고칠 것이 하나라도 있으면 「설명해줘」만 나오면 안 된다 —
    // 나오면 재료가 화면까지 못 온 것이다.
    const hasWork =
      health.islands.length > 0 ||
      health.missingContainment.length > 0 ||
      unevidenced.length > 0;
    if (!hasWork) return; // 볼트가 완벽하면 검사할 것이 없다
    expect(
      out.some((s) => s.kind !== 'explain'),
      '고칠 것이 있는데 추천은 「설명해줘」뿐이다',
    ).toBe(true);
  });
});
