import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * The add-a-connector dialog, in the browser, against a real folder.
 *
 * **Why this is worth an e2e rather than only a component test.** One list under one search, a
 * press that attaches or asks in place, and a by-hand form folded at the bottom of the same scroll
 * box are exactly the kind of thing that passes in jsdom and fails on a rendered page: the dialog
 * owns the scroll, the unfolded form has to come into view, and a press has to land where the
 * row says. The component tests own the writes and the refusals; this owns the journey.
 *
 * ⚠️ **The web is the honest surface for this spec.** Scanning this machine's agent config files
 * goes through Tauri, which a browser cannot do — so here that group is its degradation card,
 * after the catalogue. It is checked, because the card having somewhere to go is the contract
 * `.claude/rules/surfaces.md` sets.
 */

async function openConnectorsWithVault(
  page: import("@playwright/test").Page,
  extraFiles: Record<string, string> = {},
) {
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT, ...extraFiles });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });
  await page.goto("/ko/agents/?tab=mcp&mcp=connectors");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("connectors-panel")).toBeVisible();
}

test("연결 도구 딥링크는 그 칸에 내려선다 — 짧은 창에서도", async ({ page }) => {
  test.setTimeout(300_000);
  /*
   * ⚠️ **Measured at four viewports, 2026-09-19.** `?mcp=connectors` stopped being a tab
   * switch and became a scroll when the MCP screen's two halves became two groups under one
   * strip. Nothing measured whether it lands: this spec only asserted the panel was *visible*,
   * which both groups always are now, so the deep link's whole effect sat outside coverage.
   *
   * A short window is the state that catches it. The scroll used to run while the connector
   * store was still loading, against a page at its short height; the list then rendered
   * underneath and pushed the group down, leaving the heading **140px above the viewport** at
   * 1440×600 — a link named "connectors" arriving with the connectors heading cut off. At
   * 1280×900 the group is in view without scrolling at all, which is why a desktop-sized
   * check saw nothing.
   */
  await page.setViewportSize({ width: 1440, height: 600 });
  /*
   * **Attached connectors are the state that catches it**, and the empty fixture is not: the
   * list is what renders after the scroll and pushes the group down, so with nothing attached
   * this assertion passes on code that has the defect. Measured both ways before it was kept.
   */
  await openConnectorsWithVault(page, {
    ".ontology-atlas/connectors.json": JSON.stringify({
      version: 1,
      connectors: [
        { id: "c1", name: "confluence", transport: "http", url: "https://mcp.atlassian.com/v1/mcp", args: [], env: [], headers: [], enabled: true },
        { id: "c2", name: "github", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], env: [], headers: [], enabled: false },
      ],
    }),
  });
  await expect(page.getByTestId("connectors-list")).toBeVisible({ timeout: 20_000 });

  const landing = await page.evaluate(() => {
    const group = document.getElementById("mcp-connectors");
    if (!group) return null;
    const rect = group.getBoundingClientRect();
    return { top: Math.round(rect.top), viewport: window.innerHeight };
  });
  expect(landing, "the connectors group is not on the page").not.toBeNull();
  expect(
    landing!.top,
    "the connectors heading is above the viewport — the scroll overshot",
  ).toBeGreaterThanOrEqual(0);
  expect(
    landing!.top,
    "the connectors group is below the fold — the deep link did not land on it",
  ).toBeLessThan(landing!.viewport);
});

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

test("추가 대화상자는 검색 하나 아래 한 목록이고, 직접 적기는 맨 아래 접힌 줄이다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await openConnectorsWithVault(page);
  await page.getByTestId("connectors-add-open").click();
  const dialog = page.getByTestId("connectors-add-dialog");
  await expect(dialog).toBeVisible();

  /*
   * No tabs (owner, 2026-09-07 afternoon). One list: the catalogue as a group with its capture
   * date beside the heading, the by-hand form folded under it, and — on the web — the card
   * saying why this machine cannot be scanned, after the list that does work here.
   */
  await expect(page.getByTestId("connectors-catalogue-section")).toBeVisible();
  await expect(page.getByTestId("connectors-catalogue-item")).not.toHaveCount(0);
  await expect(page.getByTestId("connectors-custom-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("connectors-custom-name")).toHaveCount(0);
  await expect(page.getByTestId("connectors-discovery-unavailable")).toBeVisible();
  await expect(page.getByTestId("connectors-web-get-app")).toHaveAttribute("href", /download/);

  // Closing is the corner control and Escape; there is no button under the list.
  await expect(page.getByTestId("connectors-add-close")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "닫기" })).toHaveCount(1);

  // One search box over every group — somebody typing "notion" does not know which one answers.
  await page.getByTestId("connectors-search").fill("notion");
  await expect(page.locator('[data-testid="connectors-catalogue-item"][data-catalogue-id="notion"]')).toBeVisible();
  await expect(
    page.locator('[data-testid="connectors-catalogue-item"][data-catalogue-id="github"]'),
  ).toHaveCount(0);

  await page.getByTestId("connectors-search").fill("nothing-matches-this");
  await expect(page.getByTestId("connectors-add-none")).toBeVisible();
  await expect(page.getByTestId("connectors-catalogue-section")).toHaveCount(0);
  // …and the by-hand form is one press away, through the empty card's one door.
  await expect(page.getByTestId("connectors-custom-toggle")).toHaveCount(0);
  await page.getByTestId("connectors-add-none-custom").click();
  await expect(page.getByTestId("connectors-custom-name")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("묻는 게 없는 줄은 한 번 눌러 붙고, 실행될 주소를 그 전에 보여 주며, 꺼진 채로 들어간다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await openConnectorsWithVault(page);
  await page.getByTestId("connectors-add-open").click();
  await page.getByTestId("connectors-search").fill("context7");

  const row = page.locator('[data-testid="connectors-catalogue-item"][data-catalogue-id="context7"]');
  await expect(row).toBeVisible();
  /*
   * The last thing on screen before the press is still the address, written out — the
   * difference between this and the deep-link CVEs recorded in
   * `docs/benchmark/MCP-ONE-CLICK-2026-09-07.md`. Context7's address asks nothing (no sign-in,
   * no token), so the press writes the row and closes.
   */
  await expect(row.getByTestId("connectors-catalogue-runs")).toContainText("https://mcp.context7.com/mcp");
  const add = row.getByTestId("connectors-catalogue-add");
  await expect(add).toHaveAttribute("data-press", "attaches");
  // Nothing has been written yet.
  await expect(page.getByTestId("connectors-item")).toHaveCount(0);
  await add.click();
  await expect(page.getByTestId("connectors-add-dialog")).toHaveCount(0);
  const item = page.getByTestId("connectors-item");
  await expect(item).toHaveCount(1);
  // Written down is not switched on.
  await expect(item).toHaveAttribute("data-connector-enabled", "false");
  await expect(page.getByTestId("connectors-item-runs")).toContainText("https://mcp.context7.com/mcp");

  // Opened again, the row says it is attached instead of offering a second copy.
  await page.getByTestId("connectors-add-open").click();
  await expect(
    page.locator('[data-testid="connectors-catalogue-item"][data-catalogue-id="context7"]'),
  ).toHaveAttribute("data-catalogue-attached", "true");
});

test("토큰이 필요한 줄은 그 자리에서 묻고, 키체인이 없는 웹에서는 칸 대신 이유를 말한다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await openConnectorsWithVault(page);
  await page.getByTestId("connectors-add-open").click();
  await page.getByTestId("connectors-search").fill("notion");

  const notion = page.locator('[data-testid="connectors-catalogue-item"][data-catalogue-id="notion"]');
  // Notion is a program with a token, so its own button asks in place instead of attaching.
  await expect(notion.getByTestId("connectors-catalogue-add")).toHaveAttribute("data-press", "asks");
  await notion.getByTestId("connectors-catalogue-add").click();
  const ask = page.getByTestId("connectors-catalogue-ask");
  await expect(ask).toBeVisible();
  await expect(ask).toContainText("@notionhq/notion-mcp-server");
  await expect(ask).toContainText("NOTION_TOKEN");
  // A browser has no keychain: no field, no press, and the sentence says what to do instead.
  await expect(page.getByTestId("connectors-catalogue-ask-value")).toHaveCount(0);
  await expect(page.getByTestId("connectors-catalogue-ask-add")).toHaveCount(0);
  // The same facts can still go into the by-hand form, filled in and unfolded.
  await page.getByTestId("connectors-catalogue-ask-edit").click();
  await expect(page.getByTestId("connectors-custom-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("connectors-custom-provenance")).toBeVisible();
  await expect(page.getByTestId("connectors-custom-name")).toHaveValue("notion");
  await expect(page.getByTestId("connectors-custom-args")).toHaveValue("-y @notionhq/notion-mcp-server");
  await expect(page.getByTestId("connectors-item")).toHaveCount(0);
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
  // The retired address still resolves: it redirects into the Agents destination.
  await expect(page).toHaveURL(/\/agents\/\?tab=mcp/);
  await page.waitForLoadState("networkidle");

  await expect(page.getByTestId("connectors-add-dialog")).toBeVisible();
  // The by-hand row is unfolded, already filled.
  await expect(page.getByTestId("connectors-custom-toggle")).toHaveAttribute("aria-expanded", "true");
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
  await page.getByTestId("connectors-add-close").click();
  await expect(page.getByTestId("connectors-item")).toHaveCount(0);
});
