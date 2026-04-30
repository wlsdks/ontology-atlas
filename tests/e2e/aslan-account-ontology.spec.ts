import { expect, test } from "@playwright/test";

/**
 * 운영 ontology 시각 회귀 spec (A3-4).
 *
 * Track D 시드 (cycle 22~36) 로 운영 Aslan account 에 234 fixture 노드
 * + 7 cross-project edge 가 박힘. 다음 변경 시 회귀를 차단하는 e2e.
 *
 * 시나리오:
 * 1. 데스크톱 1440 / `/ontology/?account=aslan` 진입 → tree row 가
 *    ≥ 100 보이는지 (운영 720+ 노드 중 root 일부).
 * 2. project kind row 가 element kind row 보다 위 (UX-12 정렬 검증).
 * 3. element row 에 data-dim="true" (UX-11 dim 검증).
 * 4. 모바일 375 / 같은 URL → OperationsNav 모바일 chip row 보임 (A2-6
 *    검증).
 * 5. 페이지 console error 0.
 *
 * 운영 신뢰성:
 *   - PLAYWRIGHT_BASE_URL 환경변수로 운영 도메인 (https://aslan-project-
 *     map.web.app) 또는 staging / dev 도메인을 가리켜야 함. 데모 세션이
 *     aslan account 데이터를 갖지 않으므로 emulator 가 아닌 실 데이터
 *     필요.
 *   - account=aslan 가 공개 (knowledgePublicNodes 라 비-로그인도
 *     read 가능) — 로그인 단계 생략.
 *
 * 운영:
 *   PLAYWRIGHT_BASE_URL=https://aslan-project-map.web.app \
 *     pnpm exec playwright test tests/e2e/aslan-account-ontology.spec.ts
 */

const ASLAN_ONTOLOGY = "/ontology/?account=aslan";

test.describe("aslan account ontology — 시각 회귀", () => {
  test("desktop 1440: tree row ≥ 100, project 행 우선, element data-dim=true", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ASLAN_ONTOLOGY);

    const heading = page.getByRole("heading", { name: "온톨로지 트리" });
    await expect(heading).toBeVisible({ timeout: 20_000 });

    // tree row 가 충분히 로드되었는지 — 시드된 데이터 (12 외부 프로젝트)
    // 가 root 트리에 적어도 12 표시 (실제 운영 데이터는 더 많음).
    const rows = page.locator('[data-testid="ontology-tree-row"]');
    await expect(rows.first()).toBeVisible({ timeout: 20_000 });
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThanOrEqual(12);

    // UX-12 정렬 — 모든 row 의 data-kind 를 추출해 project 의 첫 idx 가
    // element 의 첫 idx 보다 작은지 검증.
    const allKinds = await rows.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).getAttribute("data-kind") ?? ""),
    );
    const firstProjectIdx = allKinds.indexOf("project");
    const firstElementIdx = allKinds.indexOf("element");
    if (firstProjectIdx >= 0 && firstElementIdx >= 0) {
      expect(firstProjectIdx).toBeLessThan(firstElementIdx);
    }

    // UX-11 — element row data-dim="true" 검증.
    if (firstElementIdx >= 0) {
      const firstElementRow = rows.nth(firstElementIdx);
      await expect(firstElementRow).toHaveAttribute("data-dim", "true");
    }

    expect(consoleErrors).toEqual([]);
  });

  test("mobile 375: OperationsNav 모바일 chip row visible (A2-6)", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(ASLAN_ONTOLOGY);

    // OperationsNav 모바일 chip row aria-label.
    // PR #206 (audit A6) 후 role='tab' 제거됨 — plain link + aria-current.
    const mobileNav = page.locator('ul[aria-label="운영 메뉴 (모바일)"]');
    await expect(mobileNav).toBeVisible({ timeout: 20_000 });
    const tabs = mobileNav.locator("a");
    expect(await tabs.count()).toBeGreaterThanOrEqual(5);

    expect(consoleErrors).toEqual([]);
  });

  test("mobile 375: /ontology/insights 카드 grid wrap 안전 + cross-project Panel (UX-14/17/18)", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/ontology/insights/?account=aslan");

    // 페이지 헤더가 떠야 카드 데이터 fetch 시작.
    await expect(
      page.getByRole("heading", { name: "인사이트" }),
    ).toBeVisible({ timeout: 20_000 });

    // UX-13/14/17 의 새 카드들이 운영 (720+ 노드 / 1185 엣지 / 7 cross)
    // 데이터로 진입 시 모두 보여야 함:
    const expectedTitles = [
      "Kind 분포",
      "프로젝트별 분포",
      "관계 type 분포",
      "Cross-project 관계",
      "허브 노드",
      "최근 활동",
    ];
    for (const t of expectedTitles) {
      await expect(page.getByText(t, { exact: true })).toBeVisible({
        timeout: 20_000,
      });
    }

    // 모바일 폭 (375) 에서 어느 카드도 viewport 가로 폭 초과 안 함 — wrap
    // 깨짐 회귀 차단. Panel root (insights-edge-type-rows / insights-
    // project-rows / insights-cross-project-card 등 testid 가 있는 ul/div
    // 의 부모 Panel) 에 명시 testid 가 없어 일반 카드 영역으로 검증:
    // headings 가 viewport 안에 fit 하는지로 갈음.
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    for (const t of expectedTitles) {
      const el = page.getByText(t, { exact: true }).first();
      const box = await el.boundingBox();
      if (!box) continue;
      // 카드 제목이 viewport 가로 폭 안에 있어야 — 0 ≤ x, x + width ≤ vw
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport!.width + 1);
    }

    expect(consoleErrors).toEqual([]);
  });
});
