import { describe, expect, it } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { trimToRecentSections } from '@/views/gateway-doc/lib/vault-doc';
// 생성기 쪽 구현 — 아래 「같은 절단」 계약이 두 구현의 drift 를 잡는다.
import {
  GATEWAY_CHANGELOG_KEEP_SECTIONS,
  trimToRecentSections as generatorTrim,
} from '../../scripts/build-docs-vault.mjs';

/**
 * 번들 볼트 데이터의 **상시 크기 게이트** (2026-08-19).
 *
 * ## 왜 이 시험이 있나
 *
 * `pnpm desktop:perf` 의 하드 예산(최대 청크 1.5MiB · Next 정적 합 8MiB)은
 * `desktop:release-preflight` 에서만 돌아서, CHANGELOG 가 634KB 로 자라고
 * headings 263KB 가 모든 라우트의 공통 청크에 실리는 동안 **아무도 빨간불을
 * 못 봤다** — 릴리스 준비에서야 1.71MiB/8.42MiB 로 발견됐다. 청크 크기는
 * `next build` 없이 못 재지만, 청크를 키운 **원인**(공통 청크에 정적으로
 * import 되는 데이터 JSON)은 파일 크기라서 매 `pnpm test:run` 에서 잴 수
 * 있다. 이 시험이 그 절반을 상시로 옮긴 것이다 — 나머지 절반(진짜 청크
 * 측정)은 여전히 `desktop:perf` 가 갖고, `checks:changed` 가 관련 경로 변경
 * 시 그것을 추천한다.
 *
 * ## 상한의 근거 (실측 2026-08-19)
 *
 * 공통 청크 = 이 데이터들(minify 후) + 앱 코드 ≈ 0.72MiB (예산 1.5MiB).
 * pretty-printed 합계 867KB 기준으로 상한 1.25MiB 를 두면, minify 후에도
 * 청크가 예산에 닿기 한참 전에 여기가 먼저 빨간불이 된다. 이 상한을 올리는
 * PR 은 `pnpm build && pnpm desktop:perf` 실측을 본문에 적어야 한다 —
 * 숫자만 올려 초록을 만드는 것은 계기를 고장 내는 것이다.
 */

const DATA_DIR = path.join(process.cwd(), 'src', 'entities', 'docs-vault', 'data');

/** static-vault-source.ts 가 **정적으로 import** 해 공통 청크에 실리는 파일들. */
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
    // 가드 자가 증명 — 파일이 하나라도 못 읽히면 statSync 가 던지고, 합이
    // 터무니없이 작으면(데이터가 사라졌으면) 게이트가 빈 집합 위에서 놀고
    // 있는 것이다.
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
    // 떼어낸 맵이 실제로 차 있다 — 둘 다 비면 분리가 아니라 유실이다.
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
    // 미리보기가 실제로 잘려 있다 — CHANGELOG 는 계속 자라는 문서이므로
    // 접힌 절이 0 이라면 절단이 죽었거나 전문이 도로 들어온 것이다.
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
