import { expect, test, type Page } from "@playwright/test";
import { FIXTURE_VAULT, FIXTURE_VAULT_NODE_COUNT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Playwright specs load as CJS; using `import.meta` stops the file loading at all.
const { judgeText } = require("../../scripts/lib/contrast.mjs");
const AXE_PATH = require.resolve("axe-core/axe.min.js");

/**
 * Accessibility and contrast ratchet — **with a vault attached.**
 *
 * ════════════════════════════════════════════════════════════════════
 * ## Why this file exists (2026-08-04)
 * ════════════════════════════════════════════════════════════════════
 *
 * `a11y-ratchet` measures the **first screen** of 17 URLs. `a11y-open-surfaces`
 * opens 5 surfaces that appear only after a click. As that file records, most of
 * what it **cannot** open stays closed because a vault is required.
 *
 * This round's field test put a number on the cost:
 *
 *   A newly built screen passed **both** ratchets. That screen had 2 AA
 *   violations. What the gates had measured was **the route sitting empty because
 *   there was no vault.**
 *
 * ════════════════════════════════════════════════════════════════════
 * ## What the blind spot actually was — the inventory's conclusion
 * ════════════════════════════════════════════════════════════════════
 *
 * The diagnosis "no vault means an empty screen" was **only half right**. With no
 * vault selected the default data source is the shipped sample
 * (`samples/storefront/`, 112 concepts · 241 relations), so most routes are not
 * empty. Re-measuring with a vault attached (all 16 states, 1512×900) found
 * **0 violations revealed by attaching a vault alone.**
 *
 * Three things were actually blinding the gates, in order of yield:
 *
 * | # | Blind spot | Violations revealed |
 * |---|---|---:|
 * | 1 | **The address did not exist** — two project routes opened a slug absent from the running data source, so the gates measured a degraded card (40 elements) and an **empty screen (0 elements)** | `aria-valid-attr-value` **1** |
 * | 2 | **Only the first screen is measured** — the studio's first screen is a choice card (24 elements); the compass stage and the empty socket are born after one more click | `color-contrast` **2** |
 * | 3 | **Data shape** — the sample has no cross-domain edges, so the coupling grid never rendered | (repaid by PR #918) |
 *
 * So this file's job is not to mine new violations by attaching a vault but **to
 * make those states reachable and to assert that they were reached**. Even with
 * today's baseline at 0, if these screens silently go empty tomorrow the gate turns
 * red as "not measured" rather than green as "0 violations".
 *
 * ════════════════════════════════════════════════════════════════════
 * ## Which vault
 * ════════════════════════════════════════════════════════════════════
 *
 * `fixture-vault.ts` holds that decision and **the list of what this fixture
 * misses**. In short: the dogfood vault moves every week, and the shipped sample is
 * already the data of the no-vault state. The fixture's weakness (it misses the
 * shape of reality) is offset by the "proof it rendered" checks below.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## Four layers proving this gate does not idle
 * ════════════════════════════════════════════════════════════════════
 *
 * 1. **The vault attached** — the first-run card disappears and the map draws the
 *    vault's scale. On failure the whole spec dies right there (passing silently
 *    would make this file meaningless).
 * 2. **The state opened** — each state must show a selector that exists only in it.
 * 3. **There is content** — a floor on elements inside `<main>`. Shell chrome sits
 *    outside `<main>` and is not counted.
 * 4. **Collection is alive** — floors on axe passing rules and contrast
 *    combinations.
 */

/** axe runs WCAG A/AA only — mixing in best-practice merges spec violations and taste into one number. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * **These numbers only go down.**
 *
 * The 3 violations from the 2026-08-04 inventory (16 states) were all repaid in
 * that PR:
 *   - `aria-valid-attr-value` 1 — the shared tab bar hard-coded an `insights-`
 *     prefix, so on project detail the selected tab's `aria-controls` pointed at a
 *     panel that did not exist. The prefix became a prop and the consumer renders
 *     `role="tabpanel"`.
 *   - `color-contrast` 2 — the studio's empty socket used
 *     `--color-text-quaternary` on an amber tint (4.29:1). The quaternary licence
 *     only extends to still, achromatic backgrounds, so it was already out of spec
 *     → tertiary (5.03:1).
 *
 * **Not one ramp token was touched** — both are per-place moves.
 */
const AXE_BASELINE: Readonly<Record<string, number>> = {};
const CONTRAST_BASELINE_FAILING_COMBINATIONS = 0;

/**
 * How long to wait for a state's evidence and interactions.
 *
 * ⚠️ **Pass it to `click()` too.** Playwright's `expect` timeout applies to
 * assertions only; without `actionTimeout`, `locator.click()` waits **until the
 * test timeout**. Measured with a probe: attaching an empty vault made one state
 * spend 8 minutes trying to click a cell that never appeared, and the spec died
 * with "Target page closed". It is red either way, but nothing records which state
 * failed to open or why.
 */
const EVIDENCE_TIMEOUT = 10_000;
/** Floor on elements a state must render inside `<main>`. An empty screen is 0; the thinnest real state is 82. */
const MIN_MAIN_ELEMENTS = 40;
/** Floor on rules axe applied to content and passed. An empty document is 2; the thinnest state here is 25. */
const MIN_RULES_PASSED = 15;
/** Floor on (foreground, background, size) combinations the contrast judge actually measured. Shell only is 3; the thinnest state here is 8. */
const MIN_COMBINATIONS = 6;

/**
 * Collects colours and fonts. The verdict is made by a pure function
 * (`scripts/lib/contrast.mjs`).
 *
 * ⚠️ **Two layers against false positives** (the previous audit produced 3):
 *   - Anything inside `aria-hidden="true"` is not in the accessibility tree, so it
 *     is not a violation.
 *   - `elementFromPoint` confirms the element is **actually visible at that
 *     point**, filtering out closed `<details>` and elements covered by others.
 * (`display:none`, `visibility:hidden`, `opacity:0`, and off-viewport are already
 * filtered before this.)
 *
 * Both layers can only **shrink** the candidate set, so they cannot create false
 * positives but can create false negatives — the floor on measured combinations
 * (`MIN_COMBINATIONS`) catches degradation in that direction.
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
  /** The URL to open (a query string is allowed). */
  readonly url: string;
  /**
   * **Something that exists only in this state.** If it is not visible, nothing was
   * measured — either the fixture failed to produce the shape or the screen silently
   * went empty.
   */
  readonly evidence: string;
  /** Optional interaction that produces the state. */
  readonly act?: (page: Page) => Promise<void>;
}

/**
 * `toBeVisible()` is true on the first frame of an opacity entrance too. Running
 * axe at that moment measures a semi-transparent intermediate frame rather than
 * the final token contrast, so the same screen flips green/red with timing. Only
 * the finite motion of the nearest `Surface` holding the evidence is awaited;
 * infinite animations such as the heartbeat are not.
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
 * The states measured. **States, not routes** — the same URL grows different DOM
 * depending on tab or expansion, and that difference is exactly what the
 * first-screen ratchet could not see.
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
    // The grid itself is not born without a vault that has cross-domain edges.
    name: "인사이트 · 경계 (교차 도메인 격자)",
    url: "/ko/ontology/insights/?tab=boundaries",
    evidence: '[data-testid="domain-coupling-grid"]',
  },
  {
    // Dense rows — the DOM PR #918 first rendered for a place that only appears with data.
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
    // The old ratchet measured the "not in your folder" degraded card here.
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
    // The old ratchet measured an **empty screen without even a `<main>`** here.
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
    // Creating from the map opens a **change review** after the input step. If the
    // old immediate-write path returns, this evidence disappears and the gate turns
    // red instead of idling.
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
  // 14 states × (convergence wait + axe) — well past the default 60s.
  //
  // ⚠️ **The generous budget is for the failure path** (measured with a probe):
  // attaching an empty vault so no state opens made every state's evidence wait run
  // to its maximum, and the total exceeded the test time, dying with "Target page
  // closed". It is red either way, but if what remains on screen is **a timeout
  // rather than which state failed to open and why**, it has no diagnostic value.
  // The success path runs about 40s, so this headroom is free.
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1512, height: 900 });

  // ── ① Attach the vault ───────────────────────────────────────────────
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();

  // ★ Evidence ① — if the vault does not attach, everything below measures the
  //   sample vault, which the existing ratchets already cover. Passing silently
  //   would make this file meaningless.
  await expect(
    page.getByTestId("first-run-starter"),
    "첫 실행 카드가 안 사라졌다 — 볼트가 안 물렸다. 이 스펙의 나머지는 모두 미측정이다.",
  ).toHaveCount(0, { timeout: 30_000 });

  // ★ Do not run on an empty set — emptying `STATES` makes the loop below run 0
  //   times and every assertion green (an empty set satisfies every universal
  //   claim). Pinned as a literal: deriving it from the measurement would make
  //   "it never shrinks" impossible to fail in principle.
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
    // The map's screen is only settled once the physics simulation converges.
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
      if (!judged) continue; // A colour that could not be read is unmeasured, not a pass
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

  // ── ② Separate "0 violations" from "nothing was measured" ────────────
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

  // ★ Aggregate collection guard — clearing every per-state floor while the total
  //   runs dry means collection is broken. Measured total: around 250 combinations.
  expect(totalCombinations, "대비 조합 총합이 바닥 아래다 — 채집이 깨졌다").toBeGreaterThan(120);

  // ── ③ The ratchet ───────────────────────────────────────────────────
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

  // ★ Fixing without lowering the baseline leaves exactly that much **headroom to regress**.
  expect(
    contrastFailures.length,
    `미달이 ${CONTRAST_BASELINE_FAILING_COMBINATIONS} → ${contrastFailures.length} 로 줄었다. ` +
      `CONTRAST_BASELINE_FAILING_COMBINATIONS 도 같이 내려라.`,
  ).toBeGreaterThanOrEqual(CONTRAST_BASELINE_FAILING_COMBINATIONS);
});
