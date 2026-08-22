import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { trimToRecentSections } from '@/views/gateway-doc/lib/vault-doc';
// The generator-side implementation — the "same trim" contract below catches drift between the two.
import {
  GATEWAY_CHANGELOG_KEEP_SECTIONS,
  trimToRecentSections as generatorTrim,
} from '../../scripts/build-docs-vault.mjs';

/**
 * **Always-on size gate** for the bundled vault data (2026-08-19).
 *
 * **Why this test exists.** The hard budgets in `pnpm desktop:perf` (largest
 * chunk 1.5MiB, Next static total 8MiB) run only in
 * `desktop:release-preflight`, so **nobody saw red** while CHANGELOG grew to
 * 634KB and 263KB of headings rode in every route's shared chunk — it surfaced at
 * release prep as 1.71MiB/8.42MiB. Chunk size cannot be measured without
 * `next build`, but the **cause** of the growth (data JSON statically imported
 * into the shared chunk) is a file size and can be measured on every
 * `pnpm test:run`. This test moves that half to always-on; the other half (real
 * chunk measurement) still belongs to `desktop:perf`, which `checks:changed`
 * recommends when the relevant paths change.
 *
 * **Basis for the cap (measured 2026-08-19).** The shared chunk = this data
 * (minified) + app code ≈ 0.72MiB against a 1.5MiB budget. With a pretty-printed
 * total of 867KB, a 1.25MiB cap here turns red well before the minified chunk
 * approaches its budget. A PR raising this cap must include measured
 * `pnpm build && pnpm desktop:perf` output in its body — raising the number to
 * get green is breaking the instrument.
 */

const DATA_DIR = path.join(process.cwd(), 'src', 'entities', 'docs-vault', 'data');

/** Files that static-vault-source.ts **imports statically**, putting them in the shared chunk. */
const STATICALLY_BUNDLED = [
  'manifest.json',
  'gateway-content.json',
  'gateway-changelog.json',
  'sample-storefront.manifest.json',
  'sample-storefront.content.json',
] as const;

const AGGREGATE_BUDGET_BYTES = 1.25 * 1024 * 1024;

describe('번들 볼트 데이터 상시 예산', () => {
  it('공통 청크에 실리는 데이터 JSON 합이 예산 안이다', () => {
    const sizes = STATICALLY_BUNDLED.map((name) => ({
      name,
      bytes: statSync(path.join(DATA_DIR, name)).size,
    }));
    const total = sizes.reduce((sum, file) => sum + file.bytes, 0);
    expect(
      total,
      [
        '모든 라우트가 파싱하는 번들 볼트 데이터가 예산을 넘었다.',
        '가장 큰 것을 지연 로드(비동기 청크·public asset)로 옮기거나 미리보기로 잘라라.',
        ...sizes.map((f) => `  ${f.name}: ${(f.bytes / 1024).toFixed(0)}KB`),
      ].join('\n'),
    ).toBeLessThanOrEqual(AGGREGATE_BUDGET_BYTES);
    // Self-proof for the guard: an unreadable file makes statSync throw, and an
    // absurdly small total (the data having disappeared) means the gate is idling on
    // an empty set.
    expect(total).toBeGreaterThan(500 * 1024);
  });

  it('gateway-content 는 guide/* 만 담는다 — 전문 CHANGELOG 재유입 금지', () => {
    const gateway = JSON.parse(
      readFileSync(path.join(DATA_DIR, 'gateway-content.json'), 'utf8'),
    ) as Record<string, string>;
    const keys = Object.keys(gateway);
    expect(keys.length).toBeGreaterThan(5);
    const offenders = keys.filter((slug) => !slug.startsWith('guide/'));
    expect(
      offenders,
      'guide/* 밖의 문서가 동기 번들에 들어왔다 — 커지는 문서는 contentPreviews(잘린 미리보기)나 public asset 으로 가야 한다.',
    ).toEqual([]);
  });

  it('번들 매니페스트의 headings 는 비어 있다 — 별도 청크 분리 유지', () => {
    for (const name of ['manifest.json', 'sample-storefront.manifest.json']) {
      const manifest = JSON.parse(
        readFileSync(path.join(DATA_DIR, name), 'utf8'),
      ) as { docs: Array<{ slug: string; headings: unknown[] }> };
      expect(manifest.docs.length).toBeGreaterThan(10);
      const inline = manifest.docs.filter((doc) => doc.headings.length > 0);
      expect(
        inline.map((doc) => doc.slug),
        `${name} 에 headings 가 도로 인라인됐다 — 263KB 가 모든 라우트 공통 청크로 돌아간다. scripts/build-docs-vault.mjs 의 splitManifestHeadings 를 보라.`,
      ).toEqual([]);
    }
    // The extracted map really has content — both being empty is loss, not separation.
    const headings = JSON.parse(
      readFileSync(path.join(DATA_DIR, 'manifest.headings.json'), 'utf8'),
    ) as Record<string, unknown[]>;
    expect(Object.keys(headings).length).toBeGreaterThan(50);
  });
});

describe('관문 CHANGELOG 미리보기 계약', () => {
  const changelogRaw = readFileSync(
    path.join(process.cwd(), 'docs', 'CHANGELOG.md'),
    'utf8',
  );
  const committed = JSON.parse(
    readFileSync(path.join(DATA_DIR, 'gateway-changelog.json'), 'utf8'),
  ) as { body: string; omittedSections: number };

  it('생성기의 절단과 화면의 절단이 같은 구현이다 (drift 방지)', () => {
    const fromGenerator = generatorTrim(changelogRaw, GATEWAY_CHANGELOG_KEEP_SECTIONS);
    const fromView = trimToRecentSections(changelogRaw, GATEWAY_CHANGELOG_KEEP_SECTIONS);
    expect(fromGenerator).toEqual(fromView);
  });

  it('커밋된 미리보기가 현재 CHANGELOG 의 앞부분 그대로다', () => {
    const expected = trimToRecentSections(changelogRaw, GATEWAY_CHANGELOG_KEEP_SECTIONS);
    expect(committed.body).toBe(expected.body);
    expect(committed.omittedSections).toBe(expected.omittedSections);
    // The preview really is trimmed — CHANGELOG only grows, so 0 omitted sections
    // means either the trim died or the full text came back.
    expect(committed.omittedSections).toBeGreaterThan(0);
  });

  it('화면 표시 상한이 번들 절 수를 넘지 않는다 — 넘으면 그만큼 안 보인다', () => {
    const pageSource = readFileSync(
      path.join(process.cwd(), 'app', '[locale]', 'changelog', 'page.tsx'),
      'utf8',
    );
    const match = /const RECENT_SECTIONS = (\d+)/.exec(pageSource);
    expect(match, 'changelog 페이지의 RECENT_SECTIONS 선언을 찾지 못했다').not.toBeNull();
    expect(Number(match![1])).toBeLessThanOrEqual(GATEWAY_CHANGELOG_KEEP_SECTIONS);
  });
});
