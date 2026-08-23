import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  censusAppearingSurfaces,
  censusHardCuts,
  MOTION_MECHANISMS,
  walkTsx,
} from './lib/surface-motion-census';

/**
 * Enter/exit ratchet — **hard-cut surfaces can never grow.**
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 2026-08-04 — this gate had been running on an empty list
 * ════════════════════════════════════════════════════════════════════
 *
 * The day before, this file iterated over `HARD_CUT_REGISTRY` **alone**, and that
 * registry was empty. So "0 hard-cut surfaces" was not a truth about the product but
 * **a truth about an empty list**. The owner proved it by measurement — adding
 * `{open && <div className="fixed …">}` to a new panel file and running it produced
 * **5 passed**, green.
 *
 * The "detector probe" present at the time proved only that the predicate
 * **function** was alive. That is necessary, not sufficient: with the function alive
 * but **nothing feeding it the product**, the gate does not exist. This round changes
 * the input — not a list but the **whole** of `src/` and `app/`
 * (`lib/surface-motion-census.ts`).
 *
 * ### But "switch to exhaustive" was not the answer by itself — false positives were
 * measured first
 *
 * Exactly as the old registry's preamble warned: *only "the parent renders it
 * conditionally" is a defect; always-rendered surfaces and ones the parent already
 * animates are not.* Counting by suffix over-reports, and counting places that need
 * no fix as defects makes the next person attach exit paths where none are needed —
 * that is noise, not enforcement.
 *
 * So a **false-positive inventory was measured** before switching it on, and three
 * predicates brought it down:
 *
 * | Predicate | What it filters out | Measured |
 * |---|---|---|
 * | **look only at call sites** | "always rendered" is excluded structurally | — |
 * | **if the alternate branch draws something it is a «swap»** | "the parent already animates" is filtered mechanically | 2 survivor sites (`VaultAgentSetupPanel` · `ProjectQuickEditPanel`) |
 * | **an unpressable root is not a surface** | hover readouts, tour anchors | false-positive rate ~40% → **1 of 11** |
 *
 * Four false positives were **defects in the detector itself** — the interpretation
 * was wrong, not the values:
 *
 * | False positive | Cause | Fix |
 * |---|---|---|
 * | 5 surface kinds | a barrel (`index.ts`) was read as the real definition file | follow re-exports |
 * | `Tooltip` | the mechanism list lacked Radix's exit (`animate-out`) | added to the list |
 * | 2 hover cards | the root is `pointer-events-none` — a class where the motion budget **permits** 0ms | excluded from surfaces |
 * | tour anchor | `aria-hidden` and unpressable | same |
 *
 * One **false negative** also appeared: `DeltaPreviewModal` (a genuine hard-cut
 * modal) was classified as a "swap" and dropped entirely. The cause was terminating
 * the opening tag without brace depth, reading the `=>` in `onSave={() => {` as the
 * end of the tag — **the trap the control ratchet's preamble had already recorded**.
 * Fixed by replacing JSX walking with a brace-depth scan. Measure the wrong element
 * and the number is wrong even though it is a number.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 2026-08-04 (same day, second round) — 13 repaid. It is 0.
 * ════════════════════════════════════════════════════════════════════
 *
 * The morning's exhaustive count was 13 (11 inline + 2 named), and all thirteen were
 * moved to `<Surface>` the same day. The per-site table is in the PR body. What is
 * worth keeping is **why one day was enough**, and the answer is the lesson this
 * repository is learning for the second time:
 *
 * > What was missing was not discipline but **assets**.
 *
 * Ten of the thirteen took a single line, `<Surface open={…} origin="…">`. Only
 * three needed real design, and those three exposed holes in the primitive:
 *
 * | What was blocked | Why | What was added |
 * |---|---|---|
 * | full detail · docs drawer · studio preview | large screen-covering surfaces, while the primitive had **only one translate+scale grammar**. `globals.css` already had a brightness-only pair (`map-overlay-in/out`) that `Surface` could not apply | a `motion="overlay"` axis |
 * | 9 menu and dialog sites | nowhere to pass the root's `role`/`aria-label`/`id`, so wrapping them traded away **their accessible name** | pass-through for `role`, `id`, `aria-*`, `style`, `ref`, `onClick` |
 *
 * Full detail in particular had **only one wing** — `map-overlay-in` was attached by
 * hand so entering took 180ms, while there was no exit class, so closing made the
 * whole screen vanish in one frame. Exactly the class that passes value lint
 * flawlessly (an element with no transition at all leaves no literal either).
 *
 * ### Repaying it exposed **two defects in the gate itself**
 *
 * 1. **Repaying shrank the denominator.** Converting a site changes the call from
 *    `{cond && <div className="fixed … z-50">}` to `<Surface open={cond}>`, and the
 *    old detector looked only at **conditional call sites**, so that surface left the
 *    field of view entirely. Measured: repaying 13 took the total of entering
 *    surfaces from **19 to 8** — back to the state where "0 violations" and "not
 *    looking" are indistinguishable. → detector ⓪ (`<Surface open=`) was added, and
 *    positioner/definition duplicates were removed via `EXIT_DELEGATED`. After the
 *    fix the total is **20** — the one absent from the old 19 is the edge panel
 *    (`<Surface>` has no surface suffix so ① missed it, and it is not a `<div>` so ②
 *    missed it too. **Already-converted surfaces were outside the denominator from
 *    the start**).
 * 2. **Probe ① required a violation to exist.** With `census.length > 0` it turns red
 *    the moment the debt is fully repaid — a gate shaped to prevent its own repair.
 *    A probe's job is not "a violation exists" but **"it really consumes the
 *    product"**, so it is aimed at the number of files scanned and the **total of
 *    entering surfaces** (20 even when hard cuts are 0).
 *
 * ### This count is 0 now, and a new hard cut is caught wherever it is put
 *
 * The 0 is not "a truth about an empty list" — the five probes below really catch
 * three fixtures on every run, and the exhaustive scan proves it is alive via the
 * file count and the denominator.
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
 * **The total of openable surfaces** — anything that appears conditionally, whether
 * or not it has an exit path.
 *
 * This is the hard-cut denominator, and also the 20 in
 * `tests/e2e/a11y-open-surfaces.spec.ts`'s "measures 5/20". It is a literal for the
 * reason above.
 */
/*
 * 20 → 22 (2026-08-04, the stepped "connect my agent" flow). The two added are
 * **two collapse branches**: the step body (`AgentSetupStep`) and the "not working?"
 * drawer. Both were born as `<Surface>`, so hard cuts stay 0 — a growing denominator
 * is not itself a defect, and this hand-raised diff is where "what grew" is
 * recorded.
 *
 * 22 → 20 (evening of 2026-08-04, grammar correction for those same two branches).
 * The owner caught it in the installed app — *"it opens strangely and stutters?"*. Both are **in-flow collapses** wearing a floating
 * surface's grammar (`Surface` chrome: scale + fade, occupying layout during the exit
 * window). Frame measurement: on the 1→3 step transition the sibling below jumped
 * +254px in one frame, then −352px in one frame 140ms later (zero transition frames).
 * They moved to the list-row disclosure grammar (`.ai-row-disclosure` +
 * `useRowDisclosure`), and in that grammar the box is always drawn, so they stop
 * being conditional *entering surfaces* at all and leave the denominator — the exit
 * path is carried by the height transition, and `AgentSetupStep.test.tsx` pins that
 * contract (probes: stripping the grammar turns ① and ② red; re-applying the floating
 * grammar turns ③ red).
 */
/*
 * 20 → 21 (2026-08-08): the editor `@` mention's **relation-picking second step**.
 * This number is paired with the denominator in `a11y-open-surfaces.spec.ts`, so both
 * are raised together — raising one alone breaks that file's self-comparison first
 * (which is why the pair exists).
 */
/*
 * 25 → 26 (2026-08-16): the **past-conversation list** in the in-app chat. It grows
 * out of the list button in the header, so it was born as
 * `<Surface origin="top right">` and hard cuts stay 0.
 *
 * ⚠️ This surface **cannot be opened by a browser sweep** — it only exists after a
 * runtime is found on the desktop and a session is established. So the paired
 * denominator in `a11y-open-surfaces.spec.ts` is raised too, with the reason it
 * cannot join that file's list recorded there (the same path the permission card took
 * on 2026-08-16).
 */
const BASELINE_APPEARING_SURFACES = 29;

const SELF = 'tests/contract/surface-motion-ratchet.contract.test.ts';
const FIXTURES = 'tests/fixtures/surface-motion';

const census = censusHardCuts(process.cwd());

describe('등장·퇴장 래칫 — 소스 전수', () => {
  it('하드컷이 늘지 않는다 — 새 표면은 나가는 길을 지고 태어난다', () => {
    expect(
      census.length,
      `조건부로 나타나는데 나가는 길이 없는 표면이 ${BASELINE_HARD_CUTS} → ${census.length} 로 늘었다.\n` +
        `\`<Surface open={…}>\` 로 감싸면 퇴장 창 · 퇴장 클래스 · inert · 포커스 복귀가 기본으로 딸려 온다.\n` +
        `정말 갚을 수 없는 부채라면 BASELINE_HARD_CUTS 를 손으로 올리고 그 diff 에 «왜» 를 적어라.\n` +
        census.map((c) => `  [${c.kind}] ${c.what} — ${c.at.join(' · ')}`).join('\n'),
    ).toBeLessThanOrEqual(BASELINE_HARD_CUTS);
  });

  it('갚았으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    expect(
      census.length,
      `하드컷이 ${BASELINE_HARD_CUTS} → ${census.length} 로 줄었다. 이 파일의 BASELINE_HARD_CUTS 도 ` +
        `${census.length} 로 내려라. 안 내리면 그 차이가 다시 나빠질 여유로 남는다.`,
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
     * ⚠️ **This assertion changed its aim on 2026-08-04.** It used to be
     * `census.length > 0` — "the detector is alive only if at least one hard cut
     * exists". That held on the day the debt was 13, but it is **a shape that stops the
     * gate from ever being fully repaid**: it turns red the moment the count reaches 0.
     *
     * A probe's job is not "a violation exists" but **"it really consumes the
     * product"**. So it is aimed at two things independent of the hard-cut count — the
     * number of files scanned, and the **total of entering surfaces**, which is 20 even
     * when hard cuts are 0. A detector that reads no files and returns 0 passes
     * neither.
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
     * Measured 2026-08-04: moving 13 sites to `<Surface>` dropped the total of entering
     * surfaces from **19 to 8**. The detector looked only at conditional call sites, so
     * the converted surfaces (`<Surface open={cond}>`) left the field of view entirely —
     * and then "0 hard cuts" is once again indistinguishable from **not looking**.
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
      '이미 마운트된 컨테이너 안의 내용 교체를 하드컷으로 셌다. 그러면 고칠 것 없는 자리에 ' +
        '나가는 길을 붙이라고 요구하기 시작한다 — 실물 세 자리가 이 부류다.',
    ).toBe(census.length);
  });

  it('⑤ 기제를 갖춘 표면은 놓아준다 — 전환한 것이 되돌아가면 여기서 걸린다', () => {
    const converted = [
      'src/widgets/topology-map-v2/ui/TopologyV2DetailPanel.tsx',
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
    expect(
      appearing.length,
      `조건부로 나타나는 표면이 ${BASELINE_APPEARING_SURFACES} → ${appearing.length} 로 늘었다.\n` +
        `새 표면을 더했으면 a11y-open-surfaces.spec.ts 의 OPENERS 에 그것을 여는 길이 있는지 보고,\n` +
        `그 뒤 이 리터럴을 손으로 올려라 — 분모가 조용히 커지면 「5/19」가 「5/30」이 되어 있어도 아무도 모른다.\n` +
        appearing.map((c) => `  [${c.kind}] ${c.what} — ${c.at[0]}`).join('\n'),
    ).toBeLessThanOrEqual(BASELINE_APPEARING_SURFACES);
    expect(appearing.length, '하드컷은 등장 표면의 부분집합이다').toBeGreaterThanOrEqual(census.length);
  });

  it('⑥ 기제 목록이 살아 있다 — 목록이 비면 모든 표면이 하드컷이 된다', () => {
    expect(MOTION_MECHANISMS.length).toBeGreaterThan(3);
    // An enter-only class is not a mechanism — the missing exit path is the debt this
    // gate counts.
    expect(MOTION_MECHANISMS).not.toContain('map-overlay-in');
    expect(MOTION_MECHANISMS).not.toContain('animate-in');
  });
});
