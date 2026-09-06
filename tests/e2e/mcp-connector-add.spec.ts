import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * The add-a-connector dialog, in the browser, against a real folder.
 *
 * **Why this is worth an e2e rather than only a component test.** The three tabs, the search that
 * filters all of them, and the catalogue's hand-off into the by-hand form are exactly the kind of
 * thing that passes in jsdom and fails on a rendered page: the dialog owns a scroll box, the tab
 * strip owns roving focus, and the form it fills is inside the same scroll container. The
 * component tests own the writes and the refusals; this owns the journey.
 *
 * ⚠️ **The web is the honest surface for this spec.** "Found here" reads this machine's agent
 * config files through Tauri, which a browser cannot do — so on this surface that tab draws its
 * degradation card and the dialog opens on the catalogue instead. Both are checked, because the
 * card having somewhere to go is the contract `.claude/rules/surfaces.md` sets.
 */

async function openConnectorsWithVault(page: import("@playwright/test").Page) {
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });
  await page.goto("/ko/mcp/?tab=connectors");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("connectors-panel")).toBeVisible();
}

test("빈 상태는 한 문장·한 줄 공개·문 하나다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await openConnectorsWithVault(page);

  /*
   * The owner read this card on 2026-09-07 and asked for a design pass. What it must be with
   * nothing attached: one sentence saying what a connector is, one quiet line saying where the
   * traffic goes, and one door. Not two warnings about traffic that is not happening.
   */
  const empty = page.getByTestId("connectors-empty");
  await expect(empty).toBeVisible();
  /*
   * One quiet line, and it is the paragraph itself rather than a block of them. With connectors
   * present the same test id carries three sentences under the list; with none, two of the three
   * are about traffic that is not happening yet and a token nobody has entered.
   */
  const transfer = page.getByTestId("connectors-transfer");
  await expect(transfer).toBeVisible();
  await expect(transfer).toHaveJSProperty("tagName", "P");
  await expect(transfer.locator("p")).toHaveCount(0);
  await expect(page.getByTestId("connectors-add-open")).toBeVisible();
  // The list, its count line and the runtime note belong to a folder that has connectors.
  await expect(page.getByTestId("connectors-list")).toHaveCount(0);
  await expect(page.getByTestId("connectors-on-of-total")).toHaveCount(0);
});

test("추가 대화상자는 탭 셋이고, 검색은 셋 다 훑는다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await openConnectorsWithVault(page);
  await page.getByTestId("connectors-add-open").click();
  await expect(page.getByTestId("connectors-add-dialog")).toBeVisible();

  // Three tabs, and on the web the dialog opens on the one that can still answer somebody.
  await expect(page.locator("#connectors-add-tab-found")).toBeVisible();
  await expect(page.locator("#connectors-add-tab-catalogue")).toBeVisible();
  await expect(page.locator("#connectors-add-tab-custom")).toBeVisible();
  await expect(page.getByTestId("connectors-add-tabpanel")).toHaveAttribute(
    "data-add-tab",
    "catalogue",
  );

  /*
   * The catalogue says how big it is, when it was captured, and that Atlas audited none of it.
   * A list that implies completeness lies by omission (PO steward, 2026-09-07).
   */
  await expect(page.getByTestId("connectors-catalogue-provenance")).toBeVisible();
  await expect(page.getByTestId("connectors-catalogue-item")).not.toHaveCount(0);

  // One search box above the strip, filtering every tab — somebody typing "notion" does not know
  // which tab will answer them.
  await page.getByTestId("connectors-search").fill("notion");
  await expect(page.locator('[data-testid="connectors-catalogue-item"][data-catalogue-id="notion"]')).toBeVisible();
  await expect(
    page.locator('[data-testid="connectors-catalogue-item"][data-catalogue-id="github"]'),
  ).toHaveCount(0);

  await page.getByTestId("connectors-search").fill("nothing-matches-this");
  await expect(page.getByTestId("connectors-catalogue-empty")).toBeVisible();

  // The "found here" tab says why it cannot look and where to go, rather than an empty list.
  await page.getByTestId("connectors-search").fill("");
  await page.locator("#connectors-add-tab-found").click();
  await expect(page.getByTestId("connectors-discovery-unavailable")).toBeVisible();
  await expect(page.getByTestId("connectors-web-get-app")).toHaveAttribute(
    "href",
    /download/,
  );
});

test("카탈로그에서 고르면 직접 적기 탭이 채워져 열리고, 실행될 줄을 그대로 보여 준다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await openConnectorsWithVault(page);
  await page.getByTestId("connectors-add-open").click();
  await page.getByTestId("connectors-search").fill("notion");

  const notion = page.locator('[data-testid="connectors-catalogue-item"][data-catalogue-id="notion"]');
  await expect(notion).toBeVisible();
  // The hosted variant is the one with nothing to type, and it says so before it is chosen.
  const hosted = notion.locator('[data-variant-kind="remote"]').first();
  await expect(hosted).toContainText("https://mcp.notion.com/mcp");
  await hosted.getByTestId("connectors-catalogue-choose").click();

  /*
   * The pick fills the form; it does not attach. The last thing on screen before the press is
   * still the address, written out — which is the difference between this and the deep-link CVEs
   * recorded in `docs/benchmark/MCP-ONE-CLICK-2026-09-07.md`.
   */
  await expect(page.getByTestId("connectors-add-tabpanel")).toHaveAttribute("data-add-tab", "custom");
  await expect(page.getByTestId("connectors-custom-provenance")).toBeVisible();
  await expect(page.getByTestId("connectors-custom-name")).toHaveValue("notion");
  await expect(page.getByTestId("connectors-custom-url")).toHaveValue("https://mcp.notion.com/mcp");
  // Nothing has been written yet.
  await expect(page.getByTestId("connectors-item")).toHaveCount(0);

  await page.getByTestId("connectors-custom-add").click();
  await expect(page.getByTestId("connectors-add-dialog")).toHaveCount(0);
  const row = page.getByTestId("connectors-item");
  await expect(row).toHaveCount(1);
  // Written down is not switched on.
  await expect(row).toHaveAttribute("data-connector-enabled", "false");
  await expect(page.getByTestId("connectors-item-runs")).toContainText("https://mcp.notion.com/mcp");
});

test("설치 링크는 대화상자를 채워 열 뿐, 아무것도 붙이지 않는다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });

  /*
   * The Cursor/VS Code shape, carrying a value it is not allowed to set. The value is dropped
   * before the record exists and the names it tried to set are named on screen — a link never
   * sets a token, however convenient that would be.
   */
  const config = Buffer.from(
    JSON.stringify({
      name: "notion",
      command: "/opt/homebrew/bin/npx",
      args: ["-y", "@notionhq/notion-mcp-server"],
      env: { NOTION_TOKEN: "ntn_should_not_survive" },
    }),
    "utf8",
  ).toString("base64");
  await page.goto(`/ko/mcp/?tab=connectors&install=${encodeURIComponent(config)}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("connectors-add-dialog")).toBeVisible();
  await expect(page.getByTestId("connectors-add-tabpanel")).toHaveAttribute("data-add-tab", "custom");
  await expect(page.getByTestId("connectors-custom-name")).toHaveValue("notion");
  await expect(page.getByTestId("connectors-custom-args")).toHaveValue(
    "-y @notionhq/notion-mcp-server",
  );
  // The value never arrives, and the screen says which name it refused to set.
  await expect(page.getByTestId("connectors-link-notice")).toHaveAttribute(
    "data-link-notice",
    "dropped",
  );
  await expect(page.getByTestId("connectors-link-notice")).toContainText("NOTION_TOKEN");
  expect(await page.content()).not.toContain("ntn_should_not_survive");
  // And nothing was attached by arriving.
  await page.getByTestId("connectors-add-dialog").getByRole("button", { name: /닫기/ }).click();
  await expect(page.getByTestId("connectors-item")).toHaveCount(0);
});
