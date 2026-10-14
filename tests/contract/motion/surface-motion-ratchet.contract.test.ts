import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  censusAppearingSurfaces,
  censusHardCuts,
  MOTION_MECHANISMS,
  walkTsx,
} from '../lib/surface-motion-census';
import { judgeRatchet } from '../lib/ratchet-base';

/**
 * Hard-cut surfaces can never grow. The census walks all of `src/` and `app/`, not a registry, so an
 * empty list cannot make zero a truth about nothing; the probes below prove the scanner is alive.
 */

/**
 * **A literal — not derived from the inventory.**
 *
 * The old `BASELINE = HARD_CUT_REGISTRY.length` made "it never grows" **impossible to
 * fail in principle** (adding a row raised the baseline with it). The control ratchet
 * pinned both its baselines as literals to avoid inheriting that defect, and the same
 * applies here — registering a new hard cut requires raising this number **by hand**,
 * and that diff is where the "why" goes.
 */
const BASELINE_HARD_CUTS = 0;

/**
 * The total of openable surfaces, also the denominator of `tests/e2e/a11y-open-surfaces.spec.ts`.
 * Judged against the merge base (`tests/contract/lib/ratchet-base.ts`); a new surface is a
 * `tests/contract/ratchet-raises/appearing-surfaces/<slug>.json` record. The fallback is never edited.
 */
const APPEARING_SURFACES_FALLBACK = 57;

const SELF = 'tests/contract/motion/surface-motion-ratchet.contract.test.ts';
const FIXTURES = 'tests/fixtures/surface-motion';

const census = censusHardCuts(process.cwd());

describe('등장·퇴장 래칫 — 소스 전수', () => {
  it('하드컷이 늘지 않는다 — 새 표면은 나가는 길을 지고 태어난다', () => {
    expect(
      census.length,
      `Surfaces that appear conditionally with no way out grew from ${BASELINE_HARD_CUTS} to ${census.length}.\n` +
        `Wrapping in \`<Surface open={…}>\` brings the exit window, exit class, inert and focus return by default.\n` +
        `If this debt truly cannot be paid, raise BASELINE_HARD_CUTS by hand and say why in that diff.\n` +
        census.map((c) => `  [${c.kind}] ${c.what} — ${c.at.join(' · ')}`).join('\n'),
    ).toBeLessThanOrEqual(BASELINE_HARD_CUTS);
  });

  it('갚았으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    expect(
      census.length,
      `Hard cuts fell from ${BASELINE_HARD_CUTS} to ${census.length}. Lower this file's BASELINE_HARD_CUTS ` +
        `to ${census.length} as well; otherwise the difference stays as room to get worse again.`,
    ).toBeGreaterThanOrEqual(BASELINE_HARD_CUTS);
  });

  it('기준선이 **리터럴**이다 — 센서스에서 파생되면 「늘지 않는다」가 실패 불가가 된다', () => {
    expect(
      /const BASELINE_HARD_CUTS = \d+;/.test(readFileSync(SELF, 'utf8')),
      'BASELINE_HARD_CUTS 를 `census.length` 로 두면 멈춤쇠가 양방향으로 헐거워진다(구 등록부의 실제 결함).',
    ).toBe(true);
  });
});

/**
 * **Detector probes** — the `/gate-probe` discipline.
 *
 * The three assertions above run only on "today's numbers", so everything stays green
 * even if the detector dies quietly — one regex matching nothing. That state is
 * indistinguishable on screen from "there are no violations". Here the predicate is
 * aimed at **in both directions**.
 *
 * ⚠️ That is exactly why this round exists, so the probes verify not "the function is
 * alive" but **"it really consumes the whole product"**.
 */
describe('탐지기 프로브 — 이 게이트가 실제로 무엇을 잡는가', () => {
  const addOne = (fixture: string) => censusHardCuts(process.cwd(), ['src', 'app'], [`${FIXTURES}/${fixture}`]);

  it('① 소스 전수를 실제로 먹는다 — 빈 집합 위에서 놀지 않는다', () => {
    /*
     * Aimed at the number of files scanned and the total of entering surfaces, not at a violation
     * existing, so repaying the debt to 0 cannot turn it red.
     */
    const scanned = [...walkTsx(join(process.cwd(), 'src')), ...walkTsx(join(process.cwd(), 'app'))];
    expect(scanned.length, '스캐너가 제품 트리를 못 걸었다면 모든 수가 거짓이다').toBeGreaterThan(200);

    const appearing = censusAppearingSurfaces(process.cwd());
    expect(appearing.length, '등장 표면이 0이면 스캐너나 경로가 깨진 것이다').toBeGreaterThan(0);
    expect(
      new Set(appearing.map((c) => c.file)).size,
      '전부 한 파일에서 나왔다면 스캔 범위가 무너진 것이다',
    ).toBeGreaterThan(3);
  });

  it('①-b 전환된 표면이 분모에서 사라지지 않는다 — 갚을수록 눈이 머는 결함', () => {
    /*
     * Converted `<Surface>` sites must stay in the denominator, else 0 hard cuts is indistinguishable from
     * not looking.
     */
    const appearing = censusAppearingSurfaces(process.cwd());
    const converted = appearing.filter((c) => c.what === '<Surface>');
    expect(
      converted.length,
      '`<Surface>` 로 전환한 표면이 한 건도 안 세어졌다 — 탐지기 ⓪ 가 죽었다',
    ).toBeGreaterThan(10);
    expect(
      new Set(converted.map((c) => c.file)).size,
      '전환된 표면이 한 파일에만 있다면 스캔이 무너진 것이다',
    ).toBeGreaterThan(5);
  });

  it('② 소유자가 심었던 그 모양 — 이름 없는 인라인 오버레이를 잡는다', () => {
    const fixture = `${FIXTURES}/InlineOverlay.tsx.fixture`;
    expect(existsSync(fixture), '프로브 픽스처가 사라지면 탐지기 증명도 사라진다').toBe(true);
    const withProbe = addOne('InlineOverlay.tsx.fixture');
    expect(
      withProbe.length,
      '`{open && <div className="fixed … z-50">}` 를 못 잡았다. 이게 구 게이트가 초록이던 바로 그 모양이다.',
    ).toBe(census.length + 1);
    expect(withProbe.some((c) => c.file.endsWith('InlineOverlay.tsx.fixture') && c.kind === 'inline')).toBe(true);
  });

  it('③ 부모가 조건부로 그리는 명명 표면을 잡는다', () => {
    const withProbe = addOne('NamedHardCutHost.tsx.fixture');
    expect(withProbe.length).toBe(census.length + 1);
    expect(withProbe.some((c) => c.what === 'ProbeSurfacePanel' && c.kind === 'named')).toBe(true);
  });

  it('④ 내용 교체는 세지 않는다 — 이 판별식이 죽으면 게이트가 소음이 된다', () => {
    const withProbe = addOne('ContentSwap.tsx.fixture');
    expect(
      withProbe.length,
      'A content swap inside an already mounted container was counted as a hard cut. The gate would then ' +
        'start demanding an exit where there is nothing to fix; three real sites are of this kind.',
    ).toBe(census.length);
  });

  it('⑤ 기제를 갖춘 표면은 놓아준다 — 전환한 것이 되돌아가면 여기서 걸린다', () => {
    const converted = [
      'src/widgets/ontology-map/ui/OntologyMapDetailPanel.tsx',
      'src/widgets/vault-agent-panel/ui/VaultAgentPanel.tsx',
      'src/widgets/project-drawer/ui/ProjectDrawer.tsx',
      'src/widgets/search-palette/ui/SearchPalette.tsx',
    ];
    for (const file of converted) {
      expect(existsSync(file), `${file} 이 사라졌다 — 회귀 가드도 같이 죽는다`).toBe(true);
      expect(
        MOTION_MECHANISMS.some((m) => readFileSync(file, 'utf8').includes(m)),
        `${file} 에서 등장/퇴장 기제가 사라졌다 — 센서스가 13 안이어도 이건 회귀다`,
      ).toBe(true);
      expect(census.some((c) => c.file === file && c.kind === 'named')).toBe(false);
    }
  });

  it('⑦ 열 수 있는 표면의 **분모**가 조용히 늘지 않는다 — 접근성 측정 목록의 입력', () => {
    /*
     * This number is the hard-cut inventory's denominator and also the 19 in
     * `tests/e2e/a11y-open-surfaces.spec.ts`'s "measures 5/19". A new surface turns this
     * red first, and that is the moment to also ask **whether that surface is being
     * opened and measured**. Without a denominator, "0 violations on open surfaces" is
     * said without knowing how many were never opened.
     */
    const appearing = censusAppearingSurfaces(process.cwd());
    const verdict = judgeRatchet({
      gate: 'appearing-surfaces',
      measure: (root) => (root === process.cwd() ? appearing : censusAppearingSurfaces(root)).length,
      reads: ['src', 'app'],
      fallback: APPEARING_SURFACES_FALLBACK,
    });
    expect(
      appearing.length,
      `Conditionally appearing surfaces reached ${appearing.length}, over the ceiling ${verdict.ceiling}.\n${verdict.explain}\n` +
        `If you added a surface, check that OPENERS in a11y-open-surfaces.spec.ts has a way to open it,\n` +
        `and name that way in the raise record's why: when the denominator grows silently, nobody notices 5/19 has become 5/30.\n` +
        appearing.map((c) => `  [${c.kind}] ${c.what} — ${c.at[0]}`).join('\n'),
    ).toBeLessThanOrEqual(verdict.ceiling);
    expect(appearing.length, '하드컷은 등장 표면의 부분집합이다').toBeGreaterThanOrEqual(census.length);
  });

  it('⑥ 기제 목록이 살아 있다 — 목록이 비면 모든 표면이 하드컷이 된다', () => {
    expect(MOTION_MECHANISMS.length).toBeGreaterThan(3);
    // An enter-only class is not a mechanism — the missing exit path is the debt this
    // gate counts.
    expect(MOTION_MECHANISMS).not.toContain('map-overlay-in');
    expect(MOTION_MECHANISMS).not.toContain('animate-in');
    expect(MOTION_MECHANISMS).not.toContain('animate-out');
  });
});
