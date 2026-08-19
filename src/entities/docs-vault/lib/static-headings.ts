import type { SampleSource } from '@/shared/lib/sample-source';
import type { VaultHeading } from '../model/types';

/**
 * 번들 볼트의 slug → headings 맵을 **필요할 때** 가져온다.
 *
 * ## 왜 매니페스트에서 떼어냈나 (2026-08-19)
 *
 * headings 는 `/docs` 화면(목차 레일 · 목차 삽입)만 쓰는데, 번들 매니페스트에
 * 인라인이라 263KB(도그푸드 기준)가 **모든 라우트**의 공통 청크에 실렸다 —
 * 데스크톱 성능 예산(최대 청크 1.5MiB)을 넘긴 원인 중 하나다. 그래서
 * `scripts/build-docs-vault.mjs` 가 번들 매니페스트의 docs 는 `headings: []`
 * 로 비우고 맵을 별도 JSON 으로 내며, 여기의 dynamic import 가 그 JSON 을
 * `/docs` 전용 비동기 청크로 만든다.
 *
 * ## 짝 규율
 *
 * 매니페스트를 고른 것과 **같은 볼트**의 headings 여야 한다(2026-07-26 «한
 * 화면에 두 볼트» 결함의 같은 규율). 그래서 이 로더도 `SampleSource` 로
 * 분기한다 — 호출자는 `StaticVaultSource.source` 를 그대로 넘긴다.
 *
 * ## 로컬 모드에는 필요 없다
 *
 * 사용자 vault 의 매니페스트는 디스크에서 만들어지고(`build-local-manifest`)
 * headings 가 그대로 인라인이다 — 이 로더는 번들 볼트(static 모드)에서만
 * 소비된다.
 */
export type StaticVaultHeadings = Record<string, VaultHeading[]>;

export async function loadStaticVaultHeadings(
  source: SampleSource,
): Promise<StaticVaultHeadings> {
  const mod =
    source === 'storefront'
      ? await import('../data/sample-storefront.headings.json')
      : await import('../data/manifest.headings.json');
  return mod.default as StaticVaultHeadings;
}
