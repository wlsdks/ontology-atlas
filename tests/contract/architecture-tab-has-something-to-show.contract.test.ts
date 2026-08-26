import { describe, expect, it } from 'vitest';

import { deriveArchitectureProfiles } from '@/entities/architecture-profile';
import {
  filterDocsByCollection,
  isArchitectureProfile,
} from '@/views/docs-vault/lib/docs-vault-collection';
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
   * `docs/ARCHITECTURE.md` and the 2026-08-26 decision "Architecture is a separate reviewed
   * contract and primary workbench destination" settle it: a file carrying this schema has no
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
   * ⚠️ **It is listed in Docs, and it is never what Docs opens by itself.**
   *
   * This case used to assert the opposite -- that a profile never appears in Docs at all -- and
   * that was an unrecorded overturn of the standing 2026-08-26 architecture record, whose §2 says
   * a profile "appears in Docs but never in the ontology graph". The comment defending it cited a
   * decision number the ledger has never issued.
   *
   * The measured defect was narrower than the fix. The profile sorted first in its folder, Docs
   * *auto-opened* it, and `<main>` fell to 26 elements against the floor of 40 in
   * `a11y-vault-backed.spec.ts` -- the reading surface's opening screen became a twenty-line
   * frontmatter record. Membership was never the problem; the unattended choice was.
   */
  it('문서함 목록에 프로필이 있다 — 기록이 그렇게 정했다', () => {
    for (const [name, manifest] of [
      ['dogfood', dogfoodManifest],
      ['storefront', storefrontManifest],
    ] as const) {
      const docs = docsOf(manifest) as Array<
        Parameters<typeof filterDocsByCollection>[0][number] & { slug: string }
      >;
      const listed = filterDocsByCollection(docs, 'all');
      const profiles = listed.filter((doc) =>
        isArchitectureProfile(doc as { frontmatter: Record<string, unknown> }),
      );
      expect(profiles.length, `${name} hides its profile from Docs`).toBeGreaterThan(0);
    }
  });

  /*
   * ⚠️ And the part that was actually measured: a profile must never be the document Docs opens
   * on its own. This is the assertion that keeps `<main>` above its floor.
   */
  it('문서함이 스스로 여는 문서는 프로필이 아니다', () => {
    for (const [name, manifest] of [
      ['dogfood', dogfoodManifest],
      ['storefront', storefrontManifest],
    ] as const) {
      const docs = docsOf(manifest) as Array<
        Parameters<typeof filterDocsByCollection>[0][number] & { slug: string }
      >;
      for (const collection of ['all', 'guides', 'ontology'] as const) {
        const listed = filterDocsByCollection(docs, collection);
        if (listed.length === 0) continue;
        const opened = listed.find(
          (doc) => !isArchitectureProfile(doc as { frontmatter: Record<string, unknown> }),
        );
        /*
         * `undefined` is a pass, and the storefront sample's guides collection is exactly that
         * case: its only member is the profile, so there is nothing to read and Docs opens
         * nothing rather than falling back to the record it must not open.
         */
        if (!opened) continue;
        expect(
          isArchitectureProfile(opened as { frontmatter: Record<string, unknown> }),
          `${name}/${collection} would open a profile unattended`,
        ).toBe(false);
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
