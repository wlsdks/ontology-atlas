import { describe, expect, it } from 'vitest';

import { deriveArchitectureProfiles } from '@/entities/architecture-profile';
import dogfoodManifest from '../../src/entities/docs-vault/data/manifest.json';
import storefrontManifest from '../../src/entities/docs-vault/data/sample-storefront.manifest.json';
import ko from '../../messages/ko.json';
import en from '../../messages/en.json';

type Doc = { slug: string; frontmatter: Record<string, unknown> };
const docsOf = (manifest: unknown): Doc[] =>
  ((manifest as { docs?: Doc[] }).docs ?? []) as Doc[];

/**
 * **A tab in the rail must have something to show.**
 *
 * ⚠️ **Why** (measured 2026-08-26, on the built static export). `/architecture` rendered its empty
 * state for every first-time visitor, and the reason was not that the data was missing. The dogfood
 * vault carried a complete profile, the parser accepted it, and the values were in the shipped
 * bundle. The screen reads whichever **sample** is selected, `readSampleSourcePreference` defaults
 * to `storefront` for anyone with no stored choice, and the storefront sample had **zero** profiles.
 *
 * So the tab was permanently empty for a stranger — while the tool that built it had the answer on
 * disk the whole time. A rail entry that can only ever say "nothing here" is worse than no entry:
 * it spends the one click somebody gives a new surface.
 */
describe('아키텍처 탭 — 레일에 있는 탭은 보여 줄 것이 있어야 한다', () => {
  it('두 샘플 모두 프로필을 하나 이상 담는다', () => {
    for (const [name, manifest] of [
      ['dogfood', dogfoodManifest],
      ['storefront', storefrontManifest],
    ] as const) {
      const docs = docsOf(manifest);
      expect(docs.length, `${name} manifest must not be empty`).toBeGreaterThan(0);
      const profiles = deriveArchitectureProfiles(docs);
      expect(
        profiles.length,
        `${name} has no architecture profile, so /architecture is empty for anyone on that sample`,
      ).toBeGreaterThan(0);
    }
  });

  /*
   * ⚠️ The default is the one that matters. Somebody who has never chosen a sample is exactly the
   * person the empty state was failing, so pinning only the dogfood side would leave the measured
   * defect green.
   */
  it('저장된 선택이 없는 사람이 보는 샘플에도 프로필이 있다', () => {
    const profiles = deriveArchitectureProfiles(docsOf(storefrontManifest));
    expect(profiles.map((profile) => profile.slug)).toContain('storefront-services');
  });

  /*
   * ⚠️ The empty state still exists for a genuinely empty vault, and what it says then is the whole
   * point. It used to name the schema (`architecture-profile/v1`) and tell the reader to write the
   * document by hand — this repository's private vocabulary in the first sentence a stranger reads,
   * asking them to do the tool's job. Owner, 2026-08-26: *"a user is never going to write the
   * architecture down — we should analyse it and record it."*
   */
  it('빈 상태는 스키마 이름을 대지 않고, 손으로 쓰라고 하지 않는다', () => {
    for (const [locale, messages] of [
      ['ko', ko],
      ['en', en],
    ] as const) {
      // ⚠️ `architecture` holds nested objects (`modes`, `patternLabels`), so a
      // `Record<string, string>` cast does not describe it. Only the three strings are read.
      const architecture = messages.architecture;
      const body: string = architecture.noProfilesBody;
      expect(body, `${locale} body must exist`).toBeTruthy();
      expect(body, `${locale} must not name the schema at a stranger`).not.toContain(
        'architecture-profile/v1',
      );
      expect(
        `${String(architecture.noProfiles)} ${body}`.toLowerCase(),
        `${locale} must not tell somebody to author frontmatter by hand`,
      ).not.toMatch(/markdown|frontmatter/);
    }
  });
});
