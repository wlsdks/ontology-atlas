import { expect, test, type Page } from "@playwright/test";

import { openLibraryWorkScenario } from "../library-work-harness";
import { waitForAnimationsDone, waitForBoxStill, waitForPageSettled } from "../settle";

/**
 * Accessibility ratchet for open surfaces. A closed screen that measures 0 says nothing about surfaces
 * that appear on a press, so each surface needs evidence it opened and a floor on rules axe applied
 * and passed (an empty document gives 2).
 */

const AXE_PATH = require.resolve("axe-core/axe.min.js");

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** The same floor as `a11y-ratchet.spec.ts`. An empty document gives 2; a real screen 25–30. */
const MIN_RULES_PASSED = 15;

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
  /** Protocol-level installed-app work state needed before the receipt history exists. */
  readonly libraryWorkReceipt?: boolean;
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
    name: "Map meaning review",
    route: "/ko/topology/",
    trigger: "topology-meaning-workbench-toggle",
    surface: '[data-testid="analysis-workbench"]',
  },
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
    name: "Analysis selected-fact request",
    route: "/ko/ontology/insights/?tab=connections",
    trigger: "analysis-selected-request-toggle",
    surface: '[data-testid="analysis-selected-request"]',
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
    name: "Architecture analysis history",
    // The blueprint is a view of the Harness destination, not its default.
    route: "/ko/architecture/?view=architecture",
    trigger: "architecture-review-open",
    surface: '[data-testid="analysis-workbench"]',
    dogfood: true,
  },
  {
    name: "아키텍처 근거 흐름",
    route: "/ko/architecture/?view=architecture",
    trigger: "architecture-evidence-rail",
    surface: '[data-testid="architecture-evidence-dock"]',
    dogfood: true,
  },
  {
    name: "Library work receipt history",
    route: "/en/library/",
    trigger: "library-work-history-toggle",
    surface: '[data-testid="library-work-recent"]',
    libraryWorkReceipt: true,
  },
];

/*
 * Measured Guidance needs the installed-app-like harness fixture, so it is intentionally not a
 * generic OPENERS row. `harness-tab.spec.ts` owns both real opening paths (desktop anchored dialog
 * and narrow modal), waits for their finite motion, and applies this file's same nonempty axe floor
 * with zero allowed WCAG violations. Keeping that proof beside its fixture avoids a fake opener
 * that can only reach the unavailable example.
 */

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
  if (o.libraryWorkReceipt) {
    const harness = await openLibraryWorkScenario(page);
    await harness.read(page);
    await expect(page.getByTestId("library-work-current")).toBeVisible();
  }
  if (o.dogfood) {
    await page.addInitScript(() => {
      window.localStorage.setItem("demo:sample-source:v1", "dogfood");
    });
  }
  /*
   * A route may already carry a query, so the separator is chosen rather than assumed: appending a
   * second `?` yields a malformed view parameter that opens the wrong view.
   */
  if (!o.libraryWorkReceipt) {
    const separator = o.route.includes("?") ? "&" : "?";
    await page.goto(`${o.route}${separator}guides=off`, { waitUntil: "domcontentloaded" });
    // Audit the screen the route lands on, not one still filling in or converging.
    await waitForPageSettled(page);
  }

  if (o.fileInput) {
    await page.getByTestId(o.fileInput.testId).setInputFiles({
      name: o.fileInput.name,
      mimeType: o.fileInput.mimeType,
      buffer: Buffer.from(o.fileInput.body),
    });
  }

  await page.getByTestId(o.trigger).first().click({ timeout: 8000 });

  // Evidence that it opened. Without this, the axe run below measures the *closed*
  // screen once more — duplicating the first-screen ratchet while falsely reporting
  // "0 violations on open surfaces".
  await expect(
    page.locator(o.surface).first(),
    `Pressing the "${o.name}" trigger did not open the surface, so this gate measured nothing. ` +
      `Suspect first that the trigger testid (${o.trigger}) outlived its component.`,
  ).toBeVisible({ timeout: 5000 });
  // Audit the surface once it has finished opening, not a frame of its entrance.
  await waitForAnimationsDone(page.locator(o.surface).first());
  await waitForBoxStill(page.locator(o.surface).first());
  await waitForAnimationsDone(page.locator("html"));

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

  expect(OPENERS.length, "열 표면 목록이 비면 시험은 공집합 위에서 전부 초록이다").toBeGreaterThanOrEqual(5);
  expect(
    new Set(OPENERS.map((o) => o.route)).size,
    "전부 한 라우트에서만 열면 다른 축의 표면은 여전히 아무도 안 본다",
  ).toBeGreaterThanOrEqual(3);

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
    `axe applied fewer than ${MIN_RULES_PASSED} rules to the content of a surface. That is not the absence of violations: ` +
      `the screen did not render or collection broke.\n${thin.join("\n")}`,
  ).toEqual([]);

  const unknown = [...counts.keys()].filter((id) => !(id in BASELINE)).sort();
  expect(
    unknown,
    `An open surface raised an accessibility rule the baseline does not have: a new defect.\n` +
      unknown.map((id) => `  ${id}: ${samples.get(id)}`).join("\n"),
  ).toEqual([]);

  for (const [id, max] of Object.entries(BASELINE)) {
    const actual = counts.get(id) ?? 0;
    expect(
      actual,
      `\`${id}\` violations grew from ${max} to ${actual}. The ratchet only goes down.\n` +
        `  e.g. ${samples.get(id) ?? "(none)"}`,
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
