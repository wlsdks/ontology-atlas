import { test, expect } from "@playwright/test";

/**
 * 로컬 vault 진입 정책 회귀 차단.
 *
 * 현재 writable local vault 작업은 설치된 macOS 앱(Tauri runtime)에서만
 * 시작한다. 브라우저 hosted/docs 표면은 read-only sample 문서와 macOS
 * download 안내를 유지해야 한다.
 *
 * 검증 흐름:
 *  1. 브라우저에서 `/docs/?intent=local` 로 직접 들어와도 sample source 유지.
 *  2. local radio 는 disabled 이고 download 안내가 보인다.
 *  3. localStorage 에 stale local source 가 있어도 hosted browser 에서는
 *     writable picker / desktop welcome 을 열지 않는다.
 *
 * 실행: 별도 dev server (`next dev -p 3100`) 가 떠 있어야 함.
 *   pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts
 */

const PRESET_LOCAL_SOURCE = `
  try { window.localStorage.setItem('demo:docs-vault:source', 'local'); }
  catch (_) { /* private mode */ }
`;

test.describe("로컬 vault browser gate", () => {
  test("browser local intent keeps the hosted docs surface read-only", async ({
    page,
  }) => {
    await page.addInitScript(PRESET_LOCAL_SOURCE);

    await page.goto("/en/docs/?intent=local");

    await expect(page.getByRole("heading", { name: "Source Vault" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Sample" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Local" })).toBeDisabled();
    await expect(
      page.getByText(
        "Local vault work now starts in the installed macOS app. Use the download page to install it.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Open my markdown folder/ }),
    ).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Open or create an ontology vault/ }),
    ).not.toBeVisible();
  });

  test("browser local intent still shows sample graph docs", async ({ page }) => {
    await page.goto("/en/docs/?intent=local");

    await expect(
      page.getByRole("banner").getByText(/source records/),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Source tree" }),
    ).toBeHidden();
    await page.getByRole("button", { name: "Open source tree" }).click();
    await expect(page.getByRole("navigation", { name: "Source tree" }))
      .toBeVisible();
    await expect(page.getByRole("button", { name: "Agent Graph Workflow" }))
      .toBeVisible();
    await expect(page.getByRole("link", { name: "Open topology graph" }))
      .toHaveAttribute("href", "/en/topology/");
  });

  test("source status stays tucked away and avoids numbered flow labels", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/en/docs/");

    const statusToggle = page.getByRole("button", { name: "Source status" });
    await expect(statusToggle).toBeVisible();
    await expect(page.locator("#docs-source-contract")).toBeHidden();

    await statusToggle.click();
    const sourceStatus = page.locator("#docs-source-contract");
    await expect(sourceStatus).toBeVisible();
    await expect(sourceStatus).toContainText("Files");
    await expect(sourceStatus).toContainText("Graph");
    await expect(sourceStatus).toContainText("Agent");
    await expect(sourceStatus).not.toContainText("01");
    await expect(sourceStatus).not.toContainText("02");
    await expect(sourceStatus).not.toContainText("03");
  });
});
