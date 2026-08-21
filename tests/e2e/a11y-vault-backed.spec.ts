import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_VAULT, FIXTURE_VAULT_NODE_COUNT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Playwright 스펙은 CJS 로 로드된다(`import.meta` 를 쓰면 파일이 아예 안 실린다).
const { judgeText } = require("../../scripts/lib/contrast.mjs");
const AXE_PATH = require.resolve("axe-core/axe.min.js");

/**
 * 접근성·대비 래칫 — **볼트를 물린 상태**.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 왜 이 파일이 있나 (2026-08-04)
 * ════════════════════════════════════════════════════════════════════
 *
 * `a11y-ratchet` 은 17 URL 의 **첫 화면**을 잰다. `a11y-open-surfaces` 는 눌러야
 * 나타나는 표면 5개를 연다. 그 파일이 스스로 적어 뒀듯, 열지 **못한** 나머지가
 * 안 열리는 이유는 대부분 «볼트가 필요»해서다.
 *
 * 이 라운드의 실사용 시험이 그 대가를 숫자로 냈다:
 *
 *   새로 지은 화면이 두 래칫을 **둘 다** 통과했다. 그 화면에는 AA 위반 2건이
 *   있었다. 게이트가 잰 것은 **볼트가 없어서 비어 있던 그 라우트**였다.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 무엇이 진짜 사각지대였나 — 전수의 결론
 * ════════════════════════════════════════════════════════════════════
 *
 * 「볼트가 없으면 빈 화면」이라는 진단은 **절반만 맞았다.** 볼트 미선택 상태의
 * 기본 데이터 소스는 배포되는 샘플(`samples/storefront/`, 112 개념 · 241 관계)
 * 이라, 대부분의 라우트는 비어 있지 않다. 볼트를 물려 다시 잰 결과(16 상태
 * 전수, 1512×900) **볼트를 무는 것 자체가 새로 드러낸 위반은 0** 이었다.
 *
 * 실제로 눈을 감기고 있던 것은 셋이고, 수확 순서대로다:
 *
 * | # | 사각지대 | 드러난 위반 |
 * |---|---|---:|
 * | 1 | **주소가 실재하지 않았다** — 프로젝트 두 라우트가 실행 중 데이터 소스에 없는 슬러그를 열어 강등 카드(요소 40)와 **빈 화면(요소 0)** 을 재고 있었다 | `aria-valid-attr-value` **1** |
 * | 2 | **첫 화면만 잰다** — 공방의 첫 화면은 선택지 카드(요소 24)다. 나침 무대와 빈 소켓은 한 번 더 눌러야 태어난다 | `color-contrast` **2** |
 * | 3 | **데이터 모양** — 샘플에 교차 도메인 엣지가 없어 결합 격자가 안 그려졌다 | (PR #918 이 상환) |
 *
 * 그래서 이 파일이 하는 일은 «볼트를 물려 새 위반을 캔다» 가 아니라
 * **그 상태들을 도달 가능하게 만들고, 도달했다는 것을 단언하는 것**이다. 오늘
 * 기준선이 0 이어도, 내일 이 화면들이 조용히 비면 «위반 0» 이 아니라 «미측정»
 * 으로 빨개진다.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 어떤 볼트인가
 * ════════════════════════════════════════════════════════════════════
 *
 * `fixture-vault.ts` 가 그 판정과 **이 픽스처가 놓치는 것의 목록**을 갖고 있다.
 * 요약: 도그푸드는 매주 움직여서, 배포 샘플은 이미 볼트 없는 상태의 데이터라서
 * 안 쓴다. 픽스처의 약점(현실의 모양을 놓친다)은 아래 «렌더됐다는 증거»로 상쇄한다.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 이 게이트가 공회전하지 않는다는 증명 — 네 겹
 * ════════════════════════════════════════════════════════════════════
 *
 * 1. **볼트가 물렸다** — 첫 실행 카드가 사라지고 지도가 볼트 축척을 그린다.
 *    실패하면 스펙 전체가 그 자리에서 죽는다(조용히 통과하면 이 파일이 무의미).
 * 2. **상태가 열렸다** — 상태마다 그 상태에서만 존재하는 셀렉터가 보여야 한다.
 * 3. **본문이 있다** — `<main>` 안 요소 바닥. 셸 크롬은 `<main>` 밖이라 안 센다.
 * 4. **채집이 살아 있다** — axe 통과 룰 · 대비 조합 바닥.
 */

/** axe 는 WCAG A/AA 만 — best-practice 를 섞으면 규격 위반과 취향이 한 숫자가 된다. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * **이 숫자들은 내려가기만 한다.**
 *
 * 2026-08-04 전수(16 상태)에서 나온 3건은 이 PR 이 전부 갚았다:
 *   - `aria-valid-attr-value` 1 — 공유 탭바가 `insights-` 접두사를 박아 둬서,
 *     프로젝트 상세에서 선택된 탭의 `aria-controls` 가 존재하지 않는 패널을
 *     가리켰다. 접두사를 프롭으로 빼고 소비처가 `role="tabpanel"` 을 그린다.
 *   - `color-contrast`(대비 판정) 2 — 공방 빈 소켓의 보조 잉크가 앰버 틴트
 *     위의 `--color-text-quaternary`(4.29:1). quaternary 라이선스가 «정지한
 *     무채 바탕까지»라 이미 규격 밖이었다 → tertiary(5.03:1).
 *
 * 램프 토큰은 **한 개도 안 건드렸다** — 둘 다 자리별 이관이다.
 */
const AXE_BASELINE: Readonly<Record<string, number>> = {};
const CONTRAST_BASELINE_FAILING_COMBINATIONS = 0;

/**
 * 상태의 증거·상호작용을 기다리는 시간.
 *
 * ⚠️ **`click()` 에도 반드시 넘긴다.** Playwright 의 `expect` 타임아웃은 단언에만
 * 걸리고 `locator.click()` 은 `actionTimeout` 미설정 시 **테스트 타임아웃까지**
 * 기다린다 — 프로브 실측: 빈 볼트를 물렸더니 안 나타나는 칸을 누르려다 한 상태가
 * 8분을 먹고 스펙이 «Target page closed» 로 죽었다. 빨갛긴 해도 어느 상태가 왜
 * 안 열렸는지는 안 남는다.
 */
const EVIDENCE_TIMEOUT = 10_000;
/** 상태 하나가 `<main>` 안에 그려야 하는 요소의 바닥. 빈 화면은 0, 가장 마른 진짜 상태는 82. */
const MIN_MAIN_ELEMENTS = 40;
/** axe 가 내용에 적용해 통과시킨 룰의 바닥. 빈 문서는 2, 여기 가장 마른 상태는 25. */
const MIN_RULES_PASSED = 15;
/** 대비 판정이 실제로 잰 (전경·배경·크기) 조합의 바닥. 셸만 남으면 3, 여기 가장 마른 상태는 8. */
const MIN_COMBINATIONS = 6;

/**
 * 색·폰트 채집. 판정은 순수 함수(`scripts/lib/contrast.mjs`)가 한다.
 *
 * ⚠️ **오탐 방지 두 겹** (지난 감사에서 오탐 3건이 났다):
 *   - `aria-hidden="true"` 안쪽은 접근성 트리에 없다 — 위반이 아니다.
 *   - `elementFromPoint` 로 **그 자리에 실제로 보이는지** 확인한다. 닫힌
 *     `<details>` · 다른 것에 덮인 요소가 여기서 걸러진다.
 * (`display:none` · `visibility:hidden` · `opacity:0` · 뷰포트 밖은 그 앞에서
 * 이미 걸러진다.)
 *
 * 이 두 겹은 후보를 **줄이기만** 하므로 오탐은 못 만들고 미탐은 만들 수 있다 —
 * 잰 조합 수 바닥(`MIN_COMBINATIONS`)이 그 방향의 퇴화를 잡는다.
 */
const COLLECT = `(() => {
  const resolveBackground = (el) => {
    const stack = [];
    for (let node = el; node; node = node.parentElement) {
      const m = /rgba?\\(([^)]+)\\)/.exec(getComputedStyle(node).backgroundColor);
      if (!m) continue;
      const p = m[1].split(/[\\s,/]+/).filter(Boolean).map(Number);
      const a = p.length > 3 ? p[3] : 1;
      if (a <= 0) continue;
      stack.push([p[0], p[1], p[2], a]);
      if (a >= 1) break;
    }
    let base = [8, 9, 10, 1];
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const [r, g, b, a] = stack[i];
      base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a), 1];
    }
    return 'rgb(' + base[0] + ', ' + base[1] + ', ' + base[2] + ')';
  };
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('*')) {
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (!own) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    const cx = Math.min(Math.max(r.x + r.width / 2, 1), innerWidth - 1);
    const cy = Math.min(Math.max(r.y + r.height / 2, 1), innerHeight - 1);
    const hit = document.elementFromPoint(cx, cy);
    if (!hit || (hit !== el && !el.contains(hit) && !hit.contains(el))) continue;
    const bg = resolveBackground(el);
    const key = cs.color + '|' + cs.fontSize + '|' + cs.fontWeight + '|' + bg;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fg: cs.color, bg, fontSizePx: parseFloat(cs.fontSize), fontWeight: cs.fontWeight, sample: own.slice(0, 40) });
  }
  return out;
})()`;

interface VaultState {
  readonly name: string;
  /** 열 URL (쿼리 포함 가능). */
  readonly url: string;
  /**
   * **이 상태에서만 존재하는 것.** 안 보이면 아무것도 안 잰 것이다 —
   * 픽스처가 모양을 못 냈거나 화면이 조용히 비었다는 뜻.
   */
  readonly evidence: string;
  /** 상태를 만드는 상호작용(선택). */
  readonly act?: (page: Page) => Promise<void>;
}

/**
 * `toBeVisible()` 는 opacity 등장 모션의 첫 프레임에서도 참이다. 그 순간 axe 를
 * 실행하면 최종 토큰 대비가 아니라 반투명 중간 프레임을 재서, 같은 화면이 실행
 * 타이밍에 따라 초록/빨강을 오간다. 증거를 품은 가장 가까운 Surface 의 유한 모션만
 * 끝까지 기다린다. heartbeat 같은 무한 애니메이션은 기다리지 않는다.
 */
async function waitForEvidenceMotionToSettle(page: Page, evidence: string): Promise<void> {
  await page.locator(evidence).first().evaluate(async (node) => {
    const motionRoot = node.closest('[data-surface-state]') ?? node;
    const finiteAnimations = motionRoot.getAnimations({ subtree: true }).filter((animation) => {
      const iterations = animation.effect?.getTiming().iterations;
      return iterations !== Infinity && animation.playState !== 'finished';
    });
    await Promise.all(finiteAnimations.map((animation) => animation.finished.catch(() => undefined)));
  });
}

/**
 * 재는 상태들. **라우트가 아니라 상태 단위**다 — 같은 URL 이라도 탭/펼침에 따라
 * 다른 DOM 이 태어나고, 그 차이가 정확히 첫 화면 래칫이 못 보던 것이다.
 */
const STATES: readonly VaultState[] = [
  {
    name: "지도 · 관계 contextual editor",
    url: "/ko/topology/?p=capability%3Acheckout&workbench=edit&edit=relates%3Acapability%3Ainvoice",
    evidence: '[data-testid="meaning-editor-panel"]',
  },
  {
    name: "지도 — 볼트 축척",
    url: "/ko/topology/",
    evidence: '[data-testid="topology-concept-search"]',
  },
  {
    name: "인사이트 · 할 일",
    url: "/ko/ontology/insights/?tab=do-next",
    evidence: '[id^="insights-tabpanel"]',
  },
  {
    name: "인사이트 · 구성",
    url: "/ko/ontology/insights/?tab=composition",
    evidence: '[id^="insights-tabpanel"]',
  },
  {
    name: "인사이트 · 연결",
    url: "/ko/ontology/insights/?tab=connections",
    evidence: '[id^="insights-tabpanel"]',
  },
  {
    // 격자 자체가 «교차 도메인 엣지가 있는 볼트» 없이는 안 태어난다.
    name: "인사이트 · 경계 (교차 도메인 격자)",
    url: "/ko/ontology/insights/?tab=boundaries",
    evidence: '[data-testid="domain-coupling-grid"]',
  },
  {
    // 밀집 행 — PR #918 이 「데이터가 있어야 보이던 자리」로 처음 렌더한 DOM.
    name: "인사이트 · 경계 상세 (밀집 행)",
    url: "/ko/ontology/insights/?tab=boundaries",
    evidence: '[data-testid="domain-coupling-pair"]',
    async act(page) {
      await page.getByTestId("domain-coupling-cell").first().click({ timeout: EVIDENCE_TIMEOUT });
      await expect(page.getByTestId("domain-coupling-pair").first()).toBeVisible({ timeout: EVIDENCE_TIMEOUT });
    },
  },
  {
    name: "인사이트 · 신선도",
    url: "/ko/ontology/insights/?tab=freshness",
    evidence: '[id^="insights-tabpanel"]',
  },
  {
    // 종전 래칫은 이 자리에서 「폴더에 없어요」 강등 카드를 재고 있었다.
    name: "프로젝트 상세 · 개요",
    url: "/ko/project/storefront/",
    evidence: '[data-tab-panel="overview"]',
  },
  {
    name: "프로젝트 상세 · 구성",
    url: "/ko/project/storefront/",
    evidence: '[data-tab-panel="composition"]',
    async act(page) {
      await page.getByRole("tab").nth(1).click({ timeout: EVIDENCE_TIMEOUT });
      await expect(page.locator('[data-tab-panel="composition"]')).toBeVisible({ timeout: EVIDENCE_TIMEOUT });
    },
  },
  {
    // 종전 래칫은 이 자리에서 **`<main>` 도 없는 빈 화면**을 재고 있었다.
    name: "프로젝트 편집",
    url: "/ko/project/storefront/edit/",
    evidence: "form, input",
  },
  {
    name: "프로젝트 목록",
    url: "/ko/projects/",
    evidence: '[data-testid="project-selector-cli-placeholder-hint"]',
  },
  {
    name: "문서함",
    url: "/ko/docs/",
    evidence: '[data-testid="docs-vault-doc-list"]',
  },
  {
    // 지도 생성은 입력 다음에 **변경안 검토**가 한 번 더 열린다. 즉시 쓰기였던
    // 구 경로가 돌아오면 이 증거가 사라져 공회전 대신 빨개진다.
    name: "지도 · 새 개념 변경안 검토",
    url: "/ko/topology/?workbench=create",
    evidence: '[data-testid="create-node-change-review"]',
    async act(page) {
      await expect(page.getByTestId("create-node-form")).toBeVisible({ timeout: EVIDENCE_TIMEOUT });
      await page.getByTestId("create-node-title").fill("접근성 검토 임시 개념");
      await page.getByTestId("create-node-submit").click({ timeout: EVIDENCE_TIMEOUT });
      await expect(page.getByTestId("create-node-change-review")).toBeVisible({ timeout: EVIDENCE_TIMEOUT });
    },
  },
];

test("볼트를 물린 접근성·대비 래칫 — 데이터가 있어야 존재하는 상태를 잰다", async ({ page }) => {
  // 상태 14개 × (수렴 대기 + axe) — 기본 60초를 크게 넘는다.
  //
  // ⚠️ **여유를 크게 잡는 이유는 실패 경로다** (프로브 실측): 빈 볼트를 물려
  // 모든 상태가 안 열리게 만들었더니, 상태마다 증거 대기가 최대치까지 흐르며
  // 총합이 테스트 시간을 넘겨 «Target page closed» 로 죽었다. 빨개지긴 했지만
  // 화면에 남는 것이 **어느 상태가 왜 안 열렸는지가 아니라 타임아웃**이면
  // 진단력이 없다. 성공 경로는 40초 안팎이라 이 여유는 공짜다.
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1512, height: 900 });

  // ── ① 볼트를 문다 ────────────────────────────────────────────────────
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();

  // ★ 증거 ① — 볼트가 안 물리면 아래 전부가 «샘플 볼트를 잰 것» 이 되고, 그건
  //   기존 래칫이 이미 재고 있는 화면이다. 조용히 통과하면 이 파일이 무의미하다.
  await expect(
    page.getByTestId("first-run-starter"),
    "첫 실행 카드가 안 사라졌다 — 볼트가 안 물렸다. 이 스펙의 나머지는 모두 미측정이다.",
  ).toHaveCount(0, { timeout: 30_000 });

  // ★ 빈 집합 위에서 놀지 않는다 — `STATES` 를 비우면 아래 루프가 0회 돌고
  //   모든 단언이 초록이 된다(빈 집합은 모든 全稱 명제를 만족한다). 리터럴로
  //   못박아 둔다: 실측에서 파생하면 「줄지 않는다」가 원리적으로 실패 불가가 된다.
  expect(STATES.length, "재는 상태가 줄었다 — 지웠다면 왜 지웠는지가 diff 에 보여야 한다").toBeGreaterThanOrEqual(14);

  const axeCounts = new Map<string, number>();
  const axeSamples = new Map<string, string>();
  const contrastFailures: string[] = [];
  const notRendered: string[] = [];
  let totalCombinations = 0;
  const thinBodies: string[] = [];
  const thinAxe: string[] = [];
  const thinCombos: string[] = [];

  for (const state of STATES) {
    const url = `${state.url}${state.url.includes("?") ? "&" : "?"}guides=off`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // 지도는 물리 시뮬이 수렴해야 화면이 정해진다.
    await page.waitForTimeout(2500);

    let opened = true;
    try {
      if (state.act) await state.act(page);
      await expect(page.locator(state.evidence).first()).toBeVisible({ timeout: EVIDENCE_TIMEOUT });
      await waitForEvidenceMotionToSettle(page, state.evidence);
    } catch {
      opened = false;
    }
    if (!opened) {
      notRendered.push(`  ${state.name} (${state.url}) — «${state.evidence}» 가 안 보인다`);
      continue;
    }

    const mainElements = await page.evaluate(() => document.querySelectorAll("main *").length);
    if (mainElements < MIN_MAIN_ELEMENTS) {
      thinBodies.push(`  ${state.name}: <main> 안 요소 ${mainElements}`);
    }

    await page.addScriptTag({ path: AXE_PATH });
    const axeResult = await page.evaluate(async (tags) => {
      type Run = {
        violations: Array<{ id: string; nodes: Array<{ target: string[] }> }>;
        passes: Array<unknown>;
      };
      const run = await (
        window as unknown as { axe: { run: (ctx: Document, opts: unknown) => Promise<Run> } }
      ).axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
      return {
        rulesPassed: run.passes.length,
        violations: run.violations.map((v) => ({
          id: v.id,
          count: v.nodes.length,
          sample: v.nodes[0]?.target?.join(" ") ?? "",
        })),
      };
    }, WCAG_TAGS);

    if (axeResult.rulesPassed < MIN_RULES_PASSED) {
      thinAxe.push(`  ${state.name}: 내용에 적용돼 통과한 룰 ${axeResult.rulesPassed}`);
    }
    for (const v of axeResult.violations) {
      axeCounts.set(v.id, (axeCounts.get(v.id) ?? 0) + v.count);
      if (!axeSamples.has(v.id)) axeSamples.set(v.id, `${state.name} → ${v.sample}`);
    }

    const samples = (await page.evaluate(COLLECT)) as Array<{
      fg: string;
      bg: string;
      fontSizePx: number;
      fontWeight: string;
      sample: string;
    }>;
    let combos = 0;
    for (const s of samples) {
      const judged = judgeText(s);
      if (!judged) continue; // 못 읽은 색은 «통과» 가 아니라 미측정이다
      combos += 1;
      if (!judged.passes) {
        contrastFailures.push(
          `  ${state.name} — ${judged.ratio}:1 < ${judged.required} · ${s.fontSizePx}px/${s.fontWeight} · ${s.fg} on ${s.bg} — «${s.sample}»`,
        );
      }
    }
    totalCombinations += combos;
    if (combos < MIN_COMBINATIONS) {
      thinCombos.push(`  ${state.name}: 잰 조합 ${combos}`);
    }
  }

  // ── ② 「위반 0」과 「아무것도 안 쟀다」를 가른다 ──────────────────────
  expect(
    notRendered,
    `이 상태들이 안 열렸다 — 위반이 없는 게 아니라 **미측정**이다. 픽스처 볼트가 ` +
      `그 모양을 더 이상 못 내고 있거나(파일 ${FIXTURE_VAULT_NODE_COUNT}개), 화면이 ` +
      `조용히 비었다.\n${notRendered.join("\n")}`,
  ).toEqual([]);
  expect(
    thinBodies,
    `<main> 안에 요소가 ${MIN_MAIN_ELEMENTS}개도 안 그려졌다 — 셸 크롬만 남은 화면을 ` +
      `재고 있다.\n${thinBodies.join("\n")}`,
  ).toEqual([]);
  expect(
    thinAxe,
    `axe 가 룰을 ${MIN_RULES_PASSED}개도 내용에 적용하지 못했다 — 채집이 깨졌다.\n${thinAxe.join("\n")}`,
  ).toEqual([]);
  expect(
    thinCombos,
    `대비 판정이 조합을 ${MIN_COMBINATIONS}개도 못 쟀다 — 채집이 깨졌다.\n${thinCombos.join("\n")}`,
  ).toEqual([]);

  // ★ 총합 채집 가드 — 상태별 바닥을 다 넘고도 전체가 마르면 채집이 깨진 것이다.
  //   실측 총합: 잰 조합 250 안팎.
  expect(totalCombinations, "대비 조합 총합이 바닥 아래다 — 채집이 깨졌다").toBeGreaterThan(120);

  // ── ③ 래칫 ──────────────────────────────────────────────────────────
  const unknown = [...axeCounts.keys()].filter((id) => !(id in AXE_BASELINE)).sort();
  expect(
    unknown,
    `기준선에 없는 접근성 룰이 떴다 — 새 결함이다. 고쳐라. 정말 등재해야 한다면 ` +
      `AXE_BASELINE 을 올리는 커밋이 리뷰에 보여야 한다.\n` +
      unknown.map((id) => `  ${id}: ${axeSamples.get(id)}`).join("\n"),
  ).toEqual([]);

  for (const [id, max] of Object.entries(AXE_BASELINE)) {
    const actual = axeCounts.get(id) ?? 0;
    expect(actual, `\`${id}\` 위반이 ${max} → ${actual} 로 늘었다.`).toBeLessThanOrEqual(max);
  }

  expect(
    contrastFailures.length,
    `WCAG 1.4.3 미달 조합이 ${CONTRAST_BASELINE_FAILING_COMBINATIONS} → ` +
      `${contrastFailures.length} 로 늘었다.\n${contrastFailures.join("\n")}`,
  ).toBeLessThanOrEqual(CONTRAST_BASELINE_FAILING_COMBINATIONS);

  // ★ 고쳤는데 기준선을 안 내리면 그만큼이 **다시 나빠질 여유**로 남는다.
  expect(
    contrastFailures.length,
    `미달이 ${CONTRAST_BASELINE_FAILING_COMBINATIONS} → ${contrastFailures.length} 로 줄었다. ` +
      `CONTRAST_BASELINE_FAILING_COMBINATIONS 도 같이 내려라.`,
  ).toBeGreaterThanOrEqual(CONTRAST_BASELINE_FAILING_COMBINATIONS);
});
