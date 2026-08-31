import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

const PLAN_DIGEST = `sha256:${"a".repeat(64)}`;
const SOURCE_DIGEST = `sha256:${"b".repeat(64)}`;

function envelope(overrides: { projectSlug?: string; sourceDigest?: string; writePlan?: unknown } = {}) {
  const projectSlug = overrides.projectSlug ?? "storefront";
  const plan = {
    concepts: [{ slug: "storefront" }],
    relations: [{ from: "storefront", type: "domains", to: "commerce" }],
    competencyAnswers: { scope: "answered" },
  };
  return {
    qualification: {
      contract: "constructionQualification:v1",
      subject: { projectSlug, graphDigest: PLAN_DIGEST, sourceDigest: SOURCE_DIGEST },
      purposeAuthority: { outcome: "사람과 에이전트가 같은 로컬 의미를 판단한다." },
      competencyQuestions: [{ id: "cq:scope", question: "What is in scope?" }],
      witnesses: [{ id: "w:scope", kind: "source_span", provenance: { sourceRef: "README.md:1-3", digest: SOURCE_DIGEST } }],
      cqResults: [], claims: [], citationChecks: [],
      axisResults: [], diagnostics: [],
      acceptance: { decision: "accepted", decidedBy: "jinan", authority: "human", planDigest: PLAN_DIGEST },
    },
    analysis: {
      project: { slug: projectSlug },
      proposalValidation: {
        reviewPlan: plan,
        writePlan: overrides.writePlan === undefined ? structuredClone(plan) : overrides.writePlan,
        findings: [],
        constructionLifecycle: {
          contract: "ontologyConstructionLifecycle:v1",
          qualificationStatus: "qualified",
          writeEligibility: "executable",
          planDigest: PLAN_DIGEST,
          sourceDigest: overrides.sourceDigest ?? SOURCE_DIGEST,
          firstBlockingPhase: null,
          diagnostics: [],
          nextAction: "승인된 행만 작성한다.",
        },
      },
    },
  };
}

async function openJson(page: import("@playwright/test").Page, value: unknown) {
  await page.getByTestId("construction-review-ingress").setInputFiles({
    name: "construction-review.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(value)),
  });
}

test.describe("프로젝트 온톨로지 구축 검수", () => {
  test.beforeEach(async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.goto("/ko/project/storefront/?guides=off");
    await expect(page.getByTestId("construction-review-ingress")).toBeAttached();
  });

  test("정상 묶음은 hero 아래에서 현재 결정과 exact plan을 보여준다", async ({ page }) => {
    await openJson(page, envelope());

    const summary = page.getByTestId("construction-review-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toHaveAttribute("data-qualification-status", "qualified");
    await expect(summary).toHaveAttribute("data-write-eligibility", "executable");
    await expect(page.getByTestId("construction-review-human-approval")).toContainText("jinan");
    await expect(page.getByTestId("construction-review-plan-counts")).toContainText("1");
    await expect(summary).toHaveAttribute("data-plan-equality", "equal");
  });

  test("전문가 검토용 초안은 CQ·계획을 바꾸되 원본 판정과 digest를 보존한다", async ({ page }) => {
    const localKeysBefore = await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key !== "ontology-atlas:last-route").sort(),
    );
    await openJson(page, envelope());
    await page.getByTestId("construction-review-evidence-toggle").click();
    await page.getByTestId("construction-review-draft-toggle").click();

    await page.getByTestId("construction-review-cq-scope").fill("Which meaning is actually in scope?");
    await page.getByTestId("construction-review-plan-draft").fill('{"concepts":[{"slug":"revised-storefront"}]}');
    await expect(page.getByTestId("construction-review-draft-dirty")).toContainText("다시 검증");
    await expect(page.getByTestId("construction-review-plan-digest")).toContainText(PLAN_DIGEST);
    await expect(page.getByTestId("construction-review-summary")).toHaveAttribute("data-qualification-status", "qualified");
    await expect(page.getByTestId("construction-review-summary")).toHaveAttribute("data-plan-equality", "equal");
    await expect
      .poll(() => page.evaluate(() => Object.keys(localStorage).filter((key) => key !== "ontology-atlas:last-route").sort()))
      .toEqual(localKeysBefore);
  });

  test("390·1023·1024·1512에서 요약과 근거 disclosure가 넘치거나 가려지지 않는다", async ({ page }, testInfo) => {
    await openJson(page, envelope());
    for (const width of [390, 1023, 1024, 1512]) {
      await page.setViewportSize({ width, height: 900 });
      const summary = page.getByTestId("construction-review-summary");
      await expect(summary).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        `${width}px horizontal overflow`,
      ).toBe(true);
      const toggle = page.getByTestId("construction-review-evidence-toggle");
      expect(
        await toggle.evaluate((element) => {
          element.scrollIntoView({ block: "center" });
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return hit === element || element.contains(hit);
        }),
        `${width}px evidence toggle must not be covered`,
      ).toBe(true);
      if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
      await expect(page.getByTestId("construction-review-evidence")).toBeVisible();
      const draftToggle = page.getByTestId("construction-review-draft-toggle");
      if (await draftToggle.getAttribute("aria-expanded") === "false") await draftToggle.click();
      await expect(page.getByTestId("construction-review-draft-fields")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        `${width}px draft horizontal overflow`,
      ).toBe(true);
      if (width === 390 || width === 1512) {
        await page.screenshot({ path: testInfo.outputPath(`construction-${width}.png`), fullPage: true });
      }
    }
  });

  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    test(`${reducedMotion} 모션에서도 근거 표면은 이동 없이 공용 crossfade만 쓴다`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await openJson(page, envelope());
      await page.getByTestId("construction-review-evidence-toggle").click();

      const evidence = page.getByTestId("construction-review-evidence");
      await expect(evidence).toBeVisible();
      await expect(evidence).toHaveClass(/map-overlay-in/);
      const motion = await evidence.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          animationName: style.animationName,
          animationDuration: style.animationDuration,
          transform: style.transform,
        };
      });
      expect(motion.animationName).toContain("panelCrossfadeIn");
      expect(motion.animationDuration).not.toBe("0s");
      expect(motion.transform).toBe("none");
    });
  }

  for (const [state, value] of [
    ["malformed", { broken: true }],
    ["project_mismatch", envelope({ projectSlug: "other-project" })],
    ["digest_mismatch", envelope({ sourceDigest: `sha256:${"c".repeat(64)}` })],
    ["plan_mismatch", envelope({ writePlan: { concepts: [], relations: [], competencyAnswers: {} } })],
  ] as const) {
    test(`${state} 결과는 fail-closed 한다`, async ({ page }) => {
      await openJson(page, value);
      await expect(page.getByTestId("construction-review-error")).toHaveAttribute(
        "data-envelope-state",
        state,
      );
      await expect(page.getByTestId("construction-review-summary")).toHaveCount(0);
    });
  }
});
