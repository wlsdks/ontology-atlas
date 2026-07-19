import { expect, test } from "@playwright/test";

test.describe("ontology builder workflow", () => {
  test("restores a saved vault node from the builder node query", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.removeItem("demo:builder-palette:collapsed:v1");
      window.localStorage.removeItem("demo:builder-inspector:collapsed:v1");
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en/ontology/edit/?node=capabilities%2Ftopology-analysis-modes");

    await expect(
      page.getByRole("heading", { name: "Concept Save/edit" }),
    ).toBeAttached();
    // 헤더 상태 문구는 #386 카피 평문화로 교체됐다("0 draft changes · 0
    // links" → 미저장 변경 유무를 그대로 말하는 한 줄).
    await expect(page.getByText("No unsaved changes")).toBeVisible();
    const writeStatus = page.getByLabel("Save/edit status");
    await expect(writeStatus).toHaveCount(0);

    await expect(
      page.getByRole("dialog", { name: "Save/edit onboarding" }),
    ).toHaveCount(0);

    // `.first()`: 상주 인스펙터와 아래 화면폭용 상세 모달이 같은 라벨을 달고
    // DOM 에 동시 존재한다(모달은 xl:hidden 이라 보이지 않음). strict 위반을
    // 피해 보이는 쪽만 잡는다 — 중복 렌더 정리는 별도 큐(아래 주석 참조).
    const inspector = page.getByLabel("Selected ontology concept detail").first();
    await expect(inspector).toBeVisible();
    // `.first()` 인 이유: xl+ 에서도 상세 **모달**이 DOM 에 남아(CSS 로만
    // 숨김) 상주 인스펙터와 같은 배지를 2번 렌더한다. 보이는 쪽(상주
    // 인스펙터)만 단언한다. 모달 조건부 렌더 정리는 별도 큐.
    await expect(
      inspector.getByText("sample (read-only) · Capability").first(),
    ).toBeVisible();
    await expect(inspector.getByLabel("Name").first()).toHaveValue(
      "Topology Analysis Modes",
    );
    await expect(
      inspector.getByText("capabilities/topology-analysis-modes").first(),
    ).toBeVisible();
    // 이 테스트가 약속하는 계약은 "`?node=` 딥링크가 저장된 vault 개념을
    // 상주 인스펙터로 복원한다" 까지다. 이 아래에 있던 레이아웃/저장상태
    // 패널 단언들은 빌더 재구성(#390) 으로 ⋯ 오버플로 메뉴 소유가 됐고,
    // 그 내용은 `src/views/ontology-edit` 단위 스위트(237 tests)가 덮는다 —
    // 없어진 레이아웃을 e2e 가 계속 검사하는 것이 이번 부패의 원인이었으므로
    // 여기서는 딥링크 복원만 지킨다.
  });

  test("does not mount the minimap on mobile before canvas measurements settle", async ({
    page,
  }) => {
    const consoleMessages: string[] = [];
    page.on("console", (message) => {
      consoleMessages.push(message.text());
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/ontology/edit/?node=capabilities%2Ftopology-analysis-modes");

    await expect(
      page.getByRole("heading", { name: "Concept Save/edit" }),
    ).toBeAttached();
    await page.waitForTimeout(250);

    expect(
      consoleMessages.filter((message) => message.includes("Received NaN")),
    ).toEqual([]);
  });

  test("mobile: hides canvas-only controls while keeping draft handoff", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/ontology/edit/?node=capabilities%2Ftopology-analysis-modes");

    // `.first()`: 모바일 fallback 안내가 상주 인스펙터 아래 화면폭 분기와
    // 함께 2벌 렌더된다(보이는 건 하나). 중복 렌더 정리는 별도 큐.
    await expect(page.getByText("Desktop recommended").first()).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Layout · Open canvas view and arrangement options",
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Fullscreen (F)" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Open details panel for Topology Analysis Modes",
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("dialog", { name: "Selected concept details panel" }),
    ).toHaveCount(0);
    // 빌더 재구성(#360 인스펙터 상주 · #390 단일 헤더+⋯메뉴) 이후 모바일은
    // 캔버스 조작을 아예 노출하지 않고 "데스크톱 권장" fallback + 진입점
    // 3개만 준다 — 저장 상태/추가 액션은 ⋯ 메뉴(데스크톱) 소유로 이동했다.
    await expect(page.getByRole("link", { name: "Open tree →" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open topology" }))
      .toHaveAttribute("href", "/en/topology/");
    await expect(page.getByRole("link", { name: "Validate graph" }))
      .toHaveAttribute("href", "/en/ontology/insights/");
  });

  test("mobile: draft write summary actions stay inside the viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en/ontology/edit/");

    await page.getByRole("button", { name: /^Add domain$/ }).click();
    // `.first()`: 모바일에선 같은 생성 폼이 시트/인스펙터 양쪽 DOM 에 렌더돼
    // (보이는 건 하나) strict 위반이 난다 — 중복 렌더 정리는 별도 큐.
    await page.locator('input[name="node-title"]').first().fill("Access Control Mobile");
    await page.getByRole("button", { name: "Save · agent handoff" }).click();

    const writeStatus = page.getByLabel("Save/edit status");
    await expect(writeStatus).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Copy agent packet for 1 draft concepts ready to save",
      }),
    ).toBeVisible();

    const overflowingElements = await writeStatus.locator("*").evaluateAll((els) => {
      const viewport = document.documentElement.clientWidth;
      return els
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            label: el.textContent || el.getAttribute("aria-label") || "",
            tag: el.tagName,
            left: rect.left,
            right: rect.right,
            viewport,
          };
        })
        .filter((item) => item.left < 0 || item.right > item.viewport);
    });

    expect(overflowingElements).toEqual([]);
  });

  test("mobile: operations chrome stays inside the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/en/ontology/edit/");

    const overflowingChrome = await page
      .getByRole("navigation", { name: "Operations" })
      .locator("*")
      .evaluateAll((els) => {
        const viewport = document.documentElement.clientWidth;
        return els
          .map((el) => {
            const rect = el.getBoundingClientRect();
            return {
              label: el.textContent || el.getAttribute("aria-label") || "",
              tag: el.tagName,
              left: rect.left,
              right: rect.right,
              width: rect.width,
              viewport,
            };
          })
          .filter(
            (item) =>
              item.width > 0.5 &&
              (item.left < -0.5 || item.right > item.viewport + 0.5),
          );
      });

    expect(overflowingChrome).toEqual([]);
  });

  test("localizes selected node detail sheet chrome in Korean", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ko/ontology/edit/?node=capabilities%2Ftopology-analysis-modes");

    await expect(page.getByRole("heading", { name: "개념 저장·편집" })).toBeAttached();
    await expect(page.getByText("개념 상세").first()).toBeVisible();
    // 인스펙터가 상주(#360)로 바뀌어 "상세 창 열기" 버튼은 ⋯ 메뉴 안으로
    // 들어갔다 — 데스크톱에서 검증할 한국어 계약은 상주 패널 자체다.
    // `.first()`: 상주 인스펙터와 아래 화면폭용 상세 모달이 같은 라벨로
    // DOM 에 동시 존재한다(보이는 건 하나) — 중복 렌더 정리는 별도 큐.
    await expect(page.getByLabel("선택한 온톨로지 개념 상세").first()).toBeVisible();
  });
});
