import { expect, test } from "@playwright/test";
import { useDogfoodSample } from "./sample-source";

/**
 * /ontology surface smoke — trimmed (2026-07 e2e decontamination).
 *
 * This file used to cover the old `/ontology` tree/workbench page
 * (`OntologyViewPage`, `ontology-command-bar`, `#tree-data-warnings`, the
 * MCP/Agents settings tab, the Insights maintenance board, …). That page was
 * retired when `/ontology` converged into a thin redirect to
 * `/topology?index=expanded` (B3 — "허브가 곧 지도"), so those 17 tests only
 * failed waiting for markup that no longer renders — no product defect, just
 * e2e rot. They were deleted rather than repaired because the surface itself
 * is gone; equivalent current-surface coverage lives in
 * `topology-v2-smoke.spec.ts`.
 *
 * One more test ("데이터가 없으면 detail 패널은 노출되지 않음") was dropped even
 * though it still reported green: it asserted zero `ontology-node-detail`
 * elements, but that testid has zero producers left in `src/` — the
 * assertion passes vacuously forever regardless of actual empty-state
 * behavior, so it stopped being a real regression guard.
 *
 * The five tests below survive because they exercise routes/testids that
 * are still live today (`/`, `/download/`, `/projects/`, and `/ontology/`'s
 * redirect-then-render-topology behavior) and still fail for a real reason
 * if broken.
 */
test.describe("ontology view UI", () => {
  // 이 파일의 단언은 전부 dogfood 볼트 데이터(프로젝트 이름 · 딥링크 슬러그 ·
  // 노드 라벨)에 기댄다. 2026-07-26 기본 샘플이 예시 비즈니스로 바뀌었으니
  // 기본값에 기대지 않고 파일 단위로 명시 선택한다.
  test.beforeEach(async ({ page }) => {
    await useDogfoodSample(page);
  });

  /**
   * **이 검사는 2026-07-30 에 주소가 갈렸다.**
   *
   * 원래 문장은 *"root renders the topology map directly (no marketing landing
   * detour)"* — 2026-07 root-first-open 결정을 그대로 인코딩했다. 소유자 서명으로
   * 그 결정이 뒤집혀 `/` 는 웹 방문자의 얼굴이 됐고 지도는 `/topology` 로 갔다.
   *
   * **검사를 지우지 않고 둘로 옮겼다.** 지도가 곧장 뜬다는 보증은 그대로 있고,
   * 묻는 주소만 바뀐다. 지웠다면 이 전환이 보증 하나를 없앤 일이 됐을 것이다.
   */
  test("desktop: /topology renders the map directly (no detour)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/topology/");
    await expect(page.getByTestId("topology-index-panel")).toBeVisible();
    // 옛 마케팅 랜딩의 히어로 문구는 어느 주소에도 남아 있지 않다.
    await expect(page.getByText("Codebase ontology that grows with AI")).toHaveCount(0);
  });

  test("desktop: root renders the gateway face, not the workbench", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/");
    // 얼굴의 상단 바가 뜨고, 워크벤치의 INDEX 는 없다.
    await expect(page.getByTestId("download-gnb")).toBeVisible();
    await expect(page.getByTestId("topology-index-panel")).toHaveCount(0);
  });

  test("desktop: /download states installability before it explains the product", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/download/");

    // The headline comes from the catalog, not from a copy of it. Pinning the
    // sentence is what broke this spec on the 2026-07-27 remake: the assertion
    // was about *the page having one headline*, but it was written as "this
    // exact sentence", so a rewrite read as a regression.
    const headings = page.getByRole("heading", { level: 1 });
    await expect(headings).toHaveCount(1);
    await expect(headings).toBeVisible();

    // The macOS action is a single stable target across both release states:
    // the Apple Silicon DMG once published, the browser map before that.
    // Asserting the label would pin this spec to one state and break on
    // release day — assert the role the element plays.
    //
    // [재조준 2026-08-19] 이 자리는 판(`download-primary-cta`)이었다. 소유자가
    // 설치 절을 통째로 걷어내면서(*"맨 마지막 이거는 없어도 될듯? 어차피 맨
    // 위에 다 있어서"*) 같은 역할을 히어로 CTA 가 진다.
    const primary = page.getByTestId("gateway-hero-cta");
    await expect(primary).toBeVisible();

    /*
     * [삭제 2026-08-19] 함께 사라진 주어들 — 저장소 출구 링크
     * (`download-repo-link`) · 플랫폼 절 둘(`download-platform-macos` ·
     * `download-platform-windows`) · 검증 레일(`download-trust`, Developer ID ·
     * SHA-256) · 아키텍처 안내(`About This Mac`). 전부 다운로드 판과 검증
     * 레일 안에 있었다. `docs/DECISIONS.md` 2026-08-19 가 그 대가를 적는다.
     *
     * 서명·공증 주장은 히어로 신뢰줄 한 줄로 남았으므로 그것만 잰다.
     */
    await expect(page.getByText(/Signed and notarized by Apple/i).first()).toBeVisible();
    await expect(page.getByText(/Open Anyway/i)).toHaveCount(0);
    await expect(page.getByText(/Not signed yet/i)).toHaveCount(0);

    // Operator-only release-pipeline status must never reach the public page.
    await expect(page.getByText(/waiting on PR review/i)).toHaveCount(0);
    await expect(page.getByText(/version alignment/i)).toHaveCount(0);
  });

  // #712 회귀 가드의 형제 — 이 라우트는 하단 탭바가 없는 유일한 라우트라
  // 예약고를 잡지 않는다. 브라우저 없이는 잴 수 없는 층이므로 여기서 잰다.
  test("desktop: /download keeps breathing room at the scroll end and never scrolls sideways", async ({
    page,
  }) => {
    for (const width of [1280, 1024, 768]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/en/download/");
      await page.waitForLoadState("networkidle");

      const measured = await page.evaluate(() => {
        const main = document.getElementById("main");
        if (!main) return null;
        let scroller: HTMLElement = main;
        let node: HTMLElement | null = main;
        while (node && node !== document.documentElement) {
          const style = getComputedStyle(node);
          if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
            scroller = node;
            break;
          }
          node = node.parentElement;
        }
        scroller.scrollTop = scroller.scrollHeight;
        /**
         * ⚠️ **박스가 있다고 잉크가 아니다.**
         *
         * 닫힌 `<details>` 의 내용은 최신 Chromium 에서 `display: none` 이
         * 아니라 **`content-visibility: hidden`** 으로 처리된다(전개 애니메이션을
         * 가능하게 하려고 바뀐 동작). 그래서 칠해지지도 않고 히트 테스트도 안
         * 되는데 **레이아웃 박스는 그대로 남는다** — 높이만 보고 세면 화면에
         * 없는 561px 짜리 유령이 "마지막 잉크"가 된다(실측 2026-07-29:
         * `/download` 의 「받아도 되는 이유」 접힘이 여백 -505px 를 만들었다).
         *
         * `checkVisibility()` 가 이 구분의 표준 답이다. 이 검사의 이름이
         * *잉크* 인 이상, 판정 기준도 칠해지는가여야 한다.
         */
        const lastInk = [...main.querySelectorAll("*")]
          .filter((element) => {
            // ② **잎만 본다.** 컨테이너의 하단 패딩은 여백이지 내용이 아니다 —
            // 형제 스펙(`scroll-end-gap.spec.ts`)이 이미 같은 규칙을 쓴다. 이걸
            // 안 하면 바깥 래퍼의 `pb-…` 가 그대로 "마지막 잉크" 가 되어, 여백을
            // 정확히 그 여백만큼 **없다고** 보고한다(실측 2026-07-29: 실제 글자는
            // 760 에서 끝나는데 래퍼 박스가 800 이라 gap 0 으로 읽혔다).
            if (element.children.length > 0) return false;
            const rect = element.getBoundingClientRect();
            if (rect.height <= 2 || rect.width <= 2) return false;
            // ① 칠해지는가 — 위 주석 참고.
            return typeof element.checkVisibility === "function" ? element.checkVisibility() : true;
          })
          .reduce((max, element) => Math.max(max, element.getBoundingClientRect().bottom), 0);
        return {
          gap: Math.round(scroller.getBoundingClientRect().bottom - lastInk),
          overflowX: main.scrollWidth - main.clientWidth,
        };
      });

      expect(measured, `#main must exist at ${width}px`).not.toBeNull();
      expect(measured!.gap, `scroll-end breathing room at ${width}px`).toBeGreaterThanOrEqual(24);
      expect(measured!.overflowX, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  // R+ /projects redesign — the census/activity/card-zone layout
  // (`docs/prototypes/projects-list-final.html`) dropped the old
  // WorkspaceOntologyStrip shortcut and per-card "Proof · N" query-pack link.
  // Ontology navigation is already covered by the bottom tab bar elsewhere —
  // these two tests guard the *replacement* affordances instead: the
  // new-project CTA and the card's "View in topology" link.
  test("mobile: new-project CTA is tappable and opens the create form", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/projects/");
    // `next dev` can transiently double-render this page's client tree
    // (streaming/hydration artifact, not visible in a production static
    // export) — under load from other tests this occasionally leaves two
    // `project-selector-new-cta` nodes in the DOM for one frame, which trips
    // Playwright's strict-mode locator. Letting the network settle first
    // gives that duplicate time to collapse before the strict-mode query.
    await page.waitForLoadState("networkidle");

    const newProjectCta = page.getByTestId("project-selector-new-cta");
    await expect(newProjectCta).toBeVisible();
    const ctaBox = await newProjectCta.boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(ctaBox?.height).toBeGreaterThanOrEqual(32);
    await newProjectCta.click();
    await expect(page).toHaveURL(/\/en\/project\/new\/?(\?|$)/);
  });

  test("mobile: project cards expose a tappable topology link", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/projects/");

    const topologyLink = page
      .getByTestId("project-selector-card")
      .filter({ hasText: "ontology-atlas" })
      .getByRole("link", { name: "View in topology" });
    await expect(topologyLink).toBeVisible();
    const linkBox = await topologyLink.boundingBox();
    expect(linkBox).not.toBeNull();
    expect(linkBox?.height).toBeGreaterThanOrEqual(32);
    await topologyLink.click();
    await expect(page).toHaveURL(/\/en\/topology\/\?p=ontology-atlas/);
  });

  test("mobile: dogfood tree content is visible without horizontal overflow", async ({ page }) => {
    // `/ontology/` redirects to `/topology/?index=expanded` — this still
    // exercises real current behavior (the redirect + the expanded INDEX
    // panel rendering dogfood content), not the retired tree page.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/ontology/");

    // 화면 표기(`Ontology Atlas`)와 slug(`ontology-atlas`) 둘 다 허용 —
    // 이 테스트가 보는 건 도그푸드 내용이 렌더되는가이지 표기법이 아니다.
    await expect(page.getByText(/ontology[- ]atlas/i).first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
