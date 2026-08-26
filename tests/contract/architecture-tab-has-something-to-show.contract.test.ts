import { describe, expect, it } from 'vitest';

import { deriveArchitectureProfiles } from '@/entities/architecture-profile';
import { filterDocsByCollection } from '@/views/docs-vault/lib/docs-vault-collection';
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
   * ⚠️ **A profile is not a Map node, and the schema alone must not be what says so.**
   *
   * `docs/ARCHITECTURE.md` and decision (120) settle it: a file carrying this schema has no
   * `kind:`, because it is "not an ontology kind and not an overloaded ontology `document`". I
   * broke that rule while adding the sample -- gave it `kind: document`, a `uid` and a `relates`
   * edge -- because the sample's own graph contract demanded every document be a connected node,
   * and satisfying the nearer test was easier than reading the standing decision. The gate exists
   * so the next person cannot make that trade quietly.
   */
  it('프로필은 지도 노드가 아니다 — kind 도 uid 도 갖지 않는다', () => {
    const everyDoc = [...docsOf(dogfoodManifest), ...docsOf(storefrontManifest)];
    const profiles = everyDoc.filter(
      (doc) => doc.frontmatter?.architecture_schema === 'architecture-profile/v1',
    );
    expect(profiles.length, 'there must be profiles to check').toBeGreaterThan(0);
    for (const profile of profiles) {
      expect(profile.frontmatter.kind, `${profile.slug} must not carry a kind`).toBeUndefined();
      expect(profile.frontmatter.uid, `${profile.slug} must not carry a graph uid`).toBeUndefined();
    }
  });

  /*
   * ⚠️ **And it does not appear in Docs either.** Docs is the ontology folder's reading surface, so
   * a profile listed there is the same overload decision (120) refuses, at a different door. It is
   * measurable, not a matter of taste: with the profile listed it sorted first, Docs opened it, and
   * `<main>` fell to 26 elements against the floor of 40 in `a11y-vault-backed.spec.ts` -- the
   * reading surface's opening screen became a twenty-line frontmatter record. Removing it put that
   * screen back to 92.
   */
  it('문서함 목록에는 프로필이 없다 — all 로 봐도', () => {
    for (const [name, manifest] of [
      ['dogfood', dogfoodManifest],
      ['storefront', storefrontManifest],
    ] as const) {
      const docs = docsOf(manifest) as Array<
        Parameters<typeof filterDocsByCollection>[0][number] & { slug: string }
      >;
      for (const collection of ['all', 'guides', 'ontology'] as const) {
        const listed = filterDocsByCollection(docs, collection);
        const leaked = listed.filter(
          (doc) =>
            (doc as { frontmatter: Record<string, unknown> }).frontmatter.architecture_schema ===
            'architecture-profile/v1',
        );
        expect(leaked.map((doc) => doc.slug), `${name}/${collection} lists a profile`).toEqual([]);
      }
    }
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
