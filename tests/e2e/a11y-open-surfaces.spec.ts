import { expect, test, type Page } from "@playwright/test";

/**
 * Accessibility ratchet — **open surfaces**.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## Why this file is separate (2026-08-04)
 * ════════════════════════════════════════════════════════════════════
 *
 * `a11y-ratchet.spec.ts` opens the audited URLs and measures **the first screen
 * only**, so surfaces that **appear on a press** — overlays, panels, sheets, menus —
 * had never been measured at all. Its three baselines really are 0, but that 0 was
 * «the closed screen's 0». The sentence `audited-routes.ts`'s preamble records about
 * routes applies to surfaces unchanged: **a screen that was not measured is not a
 * screen that passed.**
 *
 * This file exists because the 2026-08-04 system audit found AA failures in that
 * blind spot. Its first run produced **7** immediately, all of them elements that do
 * not exist on a closed screen.
 *
 * ### First sweep — 5 surfaces, 7 violations (2026-08-04, 1512×900)
 *
 * | Surface | Rule | Measured | What |
 * |---|---|---:|---|
 * | settings sheet | `color-contrast` | 2 | `#7170ff` (marker indigo) at **4.1:1** on `#1f2230` and **3.9:1** on `#232634` |
 * | global search | `color-contrast` | 3 | `#82828a` (`--color-text-quaternary`) at **4.38 · 4.14 · 4.38** on overlays |
 * | next-action row menu | `target-size` | 2→0 | the menu covered the row actions, leaving 81.8×17 and 32×17; the 2026-08-13 one-step lift of the analysis prose (11→12.5px) grew the row height and recovered 24×24 |
 * | shortcut sheet · document sort menu | — | 0 | |
 *
 * **That round fixed none of the three, because they are the spec's work.** The spec
 * round (the design-systems ink round, 2026-08-04) then repaid two of them: the 5 indigo
 * findings were covered by the exhaustive migration of 23 hand-written accent×tint
 * sites (`accent-ink-contrast` baseline 23 → 0), and the 3 `#82828a` findings were
 * replaced under the "text on a raised background starts at tertiary" licence
 * (`tests/contract/quaternary-ink-surface.contract.test.ts`). Hence the
 * `color-contrast` baseline below is 5 → 0. The 2 `target-size` findings also reached
 * 0 when the 2026-08-13 one-step type lift grew the row.
 *
 * - The 5 indigo findings are an **ink ramp verdict**. `--color-indigo-accent` is
 *   licensed for "darkest backgrounds only" (`accent-ink-contrast.contract.test.ts`)
 *   and here it sits on a tint. Whether each site is replaced or the value lifted is
 *   a matter for convening design-systems, and .claude/rules/design.md names that list
 *   explicitly.
 * - The 3 `#82828a` findings are an **already known limit**.
 *   `a11y-ratchet.spec.ts`'s preamble records *"⚠️ still failing on hover/selected
 *   (overlay-2, 4.36) — text on a pressable row starts at tertiary"*, and this gate
 *   **confirmed that sentence on a real screen for the first time**. A warning that
 *   existed only in prose now has numbers.
 * - The 2 `target-size` findings are overlap, so they are a **layout** decision, not
 *   a value one.
 *
 * So they are **registered as a ratchet**: today's counts are locked as the ceiling
 * and no new violation may enter. Demanding 0 without clearing them first would be
 * red from day one, and a red gate is soon switched off.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## How many surfaces can be opened — the denominator
 * ════════════════════════════════════════════════════════════════════
 *
 * The exhaustive source count is **22** (`censusAppearingSurfaces`, surfaces that
 * appear conditionally). This file opens **6** of them. Most of the rest cannot be
 * opened here because they **need a vault** (document editor autocomplete, the agent
 * panel) or require canvas coordinates (map node popover, right-click menu — the
 * route through `?e2e=1`'s `window.__atlasMap` reached coordinate conversion this
 * round, but the click never landed on a node, so it was deferred).
 *
 * **Why the denominator is written into the code**: writing 6/22 lets the next person
 * ask "why are the other 16 not measured". Opening 6 and saying nothing makes that
 * question disappear. When the denominator grows, `surface-motion-ratchet`'s "openable
 * surfaces never grow" turns red first — and that is the moment to review this list
 * too.
 *
 * ════════════════════════════════════════════════════════════════════
 * ## Proof that this gate is not idling
 * ════════════════════════════════════════════════════════════════════
 *
 * "0 violations on open surfaces" and "in fact nothing was opened" are
 * indistinguishable on screen — which is the very reason this round exists. So every
 * surface carries **two layers**:
 *
 * 1. **Evidence that it opened** — after pressing the trigger, that surface's selector
 *    must actually be visible. This blocks the accident where a testid outlives its
 *    component (the 2026-08 release).
 * 2. **Collection is alive** — the number of rules axe applied to the content and
 *    passed must be above a floor. On an empty document that number is 2.
 */

const AXE_PATH = require.resolve("axe-core/axe.min.js");

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** The same floor as `a11y-ratchet.spec.ts`. An empty document gives 2; a real screen 25–30. */
const MIN_RULES_PASSED = 15;

/**
 * The exhaustive source count from `censusAppearingSurfaces()`. See "the
 * denominator" above.
 *
 * 20 → 22 (2026-08-04): "connect my agent" became a stepped flow, adding two collapse
 * branches (the step body and the "not working?" drawer). Both need a vault to open,
 * so they are not yet among the surfaces this file opens — which is what the
 * denominator says.
 *
 * 22 → 20 (evening of 2026-08-04): those two branches moved to the list-row
 * disclosure grammar (`.ai-row-disclosure`, box always rendered with only the content
 * collapsing) and stopped being conditional *appearing surfaces*. Accessibility of the
 * collapsed content (tab order, no AT exposure) is carried by the box's `inert`, and
 * `AgentSetupStep.test.tsx` measures that contract.
 *
 * 20 → 21 (2026-08-08): the editor's `@` mention gained a **relation-picking second
 * step**. The first step (picking a concept) inherited the old wiki-link popover's
 * slot so the count was unchanged; only that second step is new. This surface appears
 * only after **a local vault + opening a document + entering edit + typing `@` +
 * picking a concept**, so it does not fit the single-click `OPENERS` grammar below —
 * which is what the denominator says. Its keyboard contract (↑↓, Enter, Esc) is
 * carried by widget-level tests rather than this file.
 *
 * 21 → 22 (2026-08-12): the evidence disclosure in project review results. The route
 * that injects local JSON and then presses the real toggle fits OPENERS below, so this
 * surface is included in the axe measurement as well as the denominator.
 *
 * 22 → 23 (2026-08-14): a specialist session-draft disclosure was added inside the
 * same review artifact. It is a local editing surface that does not modify the
 * original receipt, and the construction review e2e measures its opening and overflow
 * at 390/1023/1024/1512.
 *
 * 23 → 25 (2026-08-16): the ACP chat panel and the permission card inside it. Neither
 * **can fit the OPENERS grammar below** — without the desktop bridge
 * (`isAcpBridgeAvailable`) they do not render at all, so this browser-run sweep cannot
 * open them in principle. The permission card goes one layer deeper still: it appears
 * only when the agent tries to touch something outside the vault. The denominator says
 * so (the same class as the "@ typing" surface above). Accessibility is carried by
 * widget-level tests — `AcpChatPanel.test.tsx` measures the card's
 * `role="alertdialog"`, its name wiring, and the contract that it has no closing X.
 *
 * 25 → 26 (2026-08-16): the ACP chat's **past-conversation list** popover. This sweep
 * cannot open it for the same reason as the two above — it needs the desktop bridge,
 * and beyond that the button only exists when **this folder really has past
 * conversations** (with none, nothing is drawn). Accessibility and the folder-scope
 * contract are carried by `AcpChatPanel.test.tsx` and
 * `tests/contract/acp-session-scope.contract.test.ts`.
 *
 * 26 → 29 (2026-08-21): one in-map relation editor plus the two input→changeset swap
 * surfaces of "new concept". All three need a locally writable vault, so this static
 * browser sweep's single-click OPENERS cannot open them. The relation editor's
 * keyboard handling, review step, and pre-write pause are carried by
 * `MeaningEditorPanel.test.tsx`, the creation swap by `CreateNodeForm.test.tsx`, and
 * the installed-app verification opens the real surfaces.
 *
 * 30 → 31 (2026-08-29): the ACP chat's post-turn next-step group. It cannot fit
 * this static browser OPENERS grammar: the surface needs the desktop ACP bridge,
 * an established session, and a completed latest turn with a nonblank agent
 * answer. `AcpChatPanel.test.tsx` covers its named group, keyboard-reachable rows,
 * state suppression, and prefill-without-send contract; the installed app carries
 * the actual 1512px turn and screenshot proof.
 *
 * 31 → 33 (2026-09-02): Architecture gained a same-route ACP dock and an on-canvas
 * evidence overlay. The overlay fits the static browser opener grammar and joins
 * the list below. The dock requires a verified desktop ACP runtime, vault path,
 * and bundled MCP server, so component tests plus the installed-app walkthrough
 * carry its accessibility proof.
 */
const APPEARING_SURFACES_IN_SOURCE = 33;

interface Opener {
  readonly name: string;
  readonly route: string;
  /** The testid of the trigger to press. */
  readonly trigger: string;
  /** What **must be visible** after the press. If it is not, this gate measured nothing. */
  readonly surface: string;
  /** Surfaces whose trigger only exists after an invisible local file transport is filled first. */
  readonly fileInput?: {
    readonly testId: string;
    readonly name: string;
    readonly mimeType: string;
    readonly body: string;
  };
  /** Built-in sample needed before this route exposes its conditional surface. */
  readonly dogfood?: boolean;
}

const CONSTRUCTION_PLAN_DIGEST = `sha256:${"a".repeat(64)}`;
const CONSTRUCTION_SOURCE_DIGEST = `sha256:${"b".repeat(64)}`;
const CONSTRUCTION_REVIEW_FILE = JSON.stringify({
  qualification: {
    contract: "constructionQualification:v1",
    subject: {
      projectSlug: "storefront",
      graphDigest: CONSTRUCTION_PLAN_DIGEST,
      sourceDigest: CONSTRUCTION_SOURCE_DIGEST,
    },
    purposeAuthority: { outcome: "사람과 에이전트가 같은 로컬 의미를 판단한다." },
    competencyQuestions: [],
    witnesses: [],
    cqResults: [],
    claims: [],
    citationChecks: [],
    axisResults: [],
    diagnostics: [],
    acceptance: {
      decision: "accepted",
      decidedBy: "jinan",
      authority: "human",
      planDigest: CONSTRUCTION_PLAN_DIGEST,
    },
  },
  analysis: {
    project: { slug: "storefront" },
    proposalValidation: {
      reviewPlan: {
        concepts: [{ slug: "storefront" }],
        relations: [{ from: "storefront", type: "domains", to: "commerce" }],
        competencyAnswers: { scope: "answered" },
      },
      writePlan: {
        concepts: [{ slug: "storefront" }],
        relations: [{ from: "storefront", type: "domains", to: "commerce" }],
        competencyAnswers: { scope: "answered" },
      },
      findings: [],
      constructionLifecycle: {
        contract: "ontologyConstructionLifecycle:v1",
        qualificationStatus: "qualified",
        writeEligibility: "executable",
        planDigest: CONSTRUCTION_PLAN_DIGEST,
        sourceDigest: CONSTRUCTION_SOURCE_DIGEST,
        firstBlockingPhase: null,
        diagnostics: [],
        nextAction: "승인된 행만 작성한다.",
      },
    },
  },
});

const OPENERS: readonly Opener[] = [
  {
    name: "설정 시트",
    route: "/ko/topology/",
    trigger: "app-settings-trigger",
    surface: '[data-testid="app-settings-popover"]',
  },
  {
    name: "단축키 시트",
    route: "/ko/topology/",
    trigger: "topology-shortcuts-help-button",
    surface: '[role="dialog"]',
  },
  {
    name: "이 지도에서 검색",
    route: "/ko/topology/",
    trigger: "topology-concept-search",
    surface: '[role="dialog"]',
  },
  {
    name: "문서 정렬 메뉴",
    route: "/ko/docs/",
    trigger: "docs-sidebar-order-toggle",
    surface: '[data-testid="docs-sidebar-order-menu"]',
  },
  {
    name: "다음 할 일 행 메뉴",
    route: "/ko/ontology/insights/",
    trigger: "do-next-row-menu",
    surface: '[data-testid="do-next-row-menu-popover"]',
  },
  {
    name: "프로젝트 검수 근거",
    route: "/ko/project/storefront/",
    trigger: "construction-review-evidence-toggle",
    surface: '[data-testid="construction-review-evidence"]',
    fileInput: {
      testId: "construction-review-ingress",
      name: "construction-review.json",
      mimeType: "application/json",
      body: CONSTRUCTION_REVIEW_FILE,
    },
  },
  {
    name: "아키텍처 근거 흐름",
    route: "/ko/architecture/",
    trigger: "architecture-evidence-rail",
    surface: '[data-testid="architecture-evidence-dock"]',
    dogfood: true,
  },
];

/**
 * **This number only goes down.** It is a literal — derived from the measurement,
 * "it never grows" would be impossible to fail in principle (exactly how the hard-cut
 * ratchet died).
 */
const BASELINE: Readonly<Record<string, number>> = {
  "color-contrast": 0,
  "target-size": 0,
};

async function openAndAudit(page: Page, o: Opener) {
  if (o.dogfood) {
    await page.addInitScript(() => {
      window.localStorage.setItem("demo:sample-source:v1", "dogfood");
    });
  }
  await page.goto(`${o.route}?guides=off`, { waitUntil: "domcontentloaded" });
  // The map's screen is only settled once the physics simulation converges.
  await page.waitForTimeout(2500);

  if (o.fileInput) {
    await page.getByTestId(o.fileInput.testId).setInputFiles({
      name: o.fileInput.name,
      mimeType: o.fileInput.mimeType,
      buffer: Buffer.from(o.fileInput.body),
    });
  }

  await page.getByTestId(o.trigger).first().click({ timeout: 8000 });
  await page.waitForTimeout(800);

  // Evidence that it opened. Without this, the axe run below measures the *closed*
  // screen once more — duplicating the first-screen ratchet while falsely reporting
  // "0 violations on open surfaces".
  await expect(
    page.locator(o.surface).first(),
    `«${o.name}» 트리거를 눌렀는데 표면이 안 열렸다 — 이 게이트는 아무것도 재지 않았다. ` +
      `트리거 testid(${o.trigger})가 컴포넌트보다 오래 살아남았는지 먼저 의심하라.`,
  ).toBeVisible({ timeout: 5000 });

  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async (tags) => {
    type Run = {
      violations: Array<{ id: string; nodes: Array<{ target: string[] }> }>;
      passes: Array<unknown>;
    };
    const run = await (
      window as unknown as { axe: { run: (c: Document, o: unknown) => Promise<Run> } }
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
}

test("접근성 래칫(열린 표면) — 새 룰 위반 0, 기존 개수는 늘지 않는다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1512, height: 900 });

  const counts = new Map<string, number>();
  const samples = new Map<string, string>();
  const thin: string[] = [];

  for (const o of OPENERS) {
    const r = await openAndAudit(page, o);
    if (r.rulesPassed < MIN_RULES_PASSED) {
      thin.push(`  ${o.name}: 내용에 적용돼 통과한 룰 ${r.rulesPassed}`);
    }
    for (const v of r.violations) {
      counts.set(v.id, (counts.get(v.id) ?? 0) + v.count);
      if (!samples.has(v.id)) samples.set(v.id, `${o.name} → ${v.sample}`);
    }
  }

  // Separates "0 violations" from "nothing was measured".
  expect(
    thin,
    `axe 가 표면당 ${MIN_RULES_PASSED}개 룰도 내용에 적용하지 못했다 — 위반이 없는 게 아니라 ` +
      `화면이 안 떴거나 채집이 깨진 것이다.\n${thin.join("\n")}`,
  ).toEqual([]);

  const unknown = [...counts.keys()].filter((id) => !(id in BASELINE)).sort();
  expect(
    unknown,
    `열린 표면에서 기준선에 없는 접근성 룰이 떴다 — 새 결함이다.\n` +
      unknown.map((id) => `  ${id}: ${samples.get(id)}`).join("\n"),
  ).toEqual([]);

  for (const [id, max] of Object.entries(BASELINE)) {
    const actual = counts.get(id) ?? 0;
    expect(
      actual,
      `\`${id}\` 위반이 ${max} → ${actual} 로 늘었다. 래칫은 내려가기만 한다.\n` +
        `  예: ${samples.get(id) ?? "(없음)"}`,
    ).toBeLessThanOrEqual(max);
  }

  // Fixing something without lowering the baseline leaves that much as **room to
  // regress**.
  const slack = Object.entries(BASELINE)
    .filter(([id, max]) => (counts.get(id) ?? 0) < max)
    .map(([id, max]) => `  ${id}: 기준선 ${max} · 실측 ${counts.get(id) ?? 0}`);
  expect(
    slack,
    `열린 표면의 위반이 줄었다 — 이 파일의 BASELINE 도 같이 내려라.\n${slack.join("\n")}`,
  ).toEqual([]);
});

test("측정 목록이 분모를 잃지 않는다 — 8/30 이라고 말할 수 있어야 한다", async () => {
  expect(OPENERS.length, "열 표면 목록이 비면 위 시험은 공집합 위에서 전부 초록이다").toBeGreaterThanOrEqual(5);
  expect(
    new Set(OPENERS.map((o) => o.route)).size,
    "전부 한 라우트에서만 열면 다른 축의 표면은 여전히 아무도 안 본다",
  ).toBeGreaterThanOrEqual(3);
  // The denominator must stay in the code so "why are the rest not measured" can be
  // asked.
  expect(APPEARING_SURFACES_IN_SOURCE).toBeGreaterThan(OPENERS.length);
});
