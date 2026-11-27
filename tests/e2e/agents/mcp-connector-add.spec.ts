import { expect, test } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "../desktop-rail-arrival-harness";
import { waitForBoxStill } from "../settle";

/**
 * The add-a-connector dialog, in the installed app, against a folder.
 *
 * **Why this is worth an e2e rather than only a component test.** One list under one search, a
 * press that attaches or asks in place, and a by-hand form folded at the bottom of the same scroll
 * box are exactly the kind of thing that passes in jsdom and fails on a rendered page: the dialog
 * owns the scroll, the unfolded form has to come into view, and a press has to land where the
 * row says. The component tests own the writes and the refusals; this owns the journey.
 */

async function openConnectorsWithVault(
  page: import("@playwright/test").Page,
  extraFiles: Record<string, string> = {},
) {
  await installDesktopRailRuntime(page, extraFiles, undefined, { writable: true });
  await mountDesktopVault(page, "ko");
  await page.goto("/ko/agents/?tab=mcp&mcp=connectors");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("connectors-panel")).toBeVisible();
}

test("the connector deep link lands on its slot, even in a short window", async ({ page }) => {
  test.setTimeout(300_000);
  /* The app's window floor is 720 tall, so the short window is read there. */
  await page.setViewportSize({ width: 1440, height: 720 });
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
  // The list renders under the scroll and pushes the group down; read where it comes to rest,
  // not the frame the list first appeared on.
  await waitForBoxStill(page.locator("#mcp-connectors"));

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

test("the empty state is one sentence, one line of disclosure and one door", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await openConnectorsWithVault(page);

  /*
   * With nothing attached: one sentence saying what a connector is, one quiet line saying where
   * the traffic goes, and one door.
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

test("the add dialog is one list under one search, with manual entry as a collapsed line at the bottom", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await openConnectorsWithVault(page);
  await page.getByTestId("connectors-add-open").click();
  const dialog = page.getByTestId("connectors-add-dialog");
  await expect(dialog).toBeVisible();

  /*
   * One list: the catalogue as a group with its capture date, and the by-hand form folded under it.
   */
  await expect(page.getByTestId("connectors-catalogue-section")).toBeVisible();
  await expect(page.getByTestId("connectors-catalogue-item")).not.toHaveCount(0);
  await expect(page.getByTestId("connectors-custom-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("connectors-custom-name")).toHaveCount(0);

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

test("a row that asks nothing connects with one press, shows the address to be run beforehand, and starts switched off", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await openConnectorsWithVault(page);
  await page.getByTestId("connectors-add-open").click();
  await page.getByTestId("connectors-search").fill("context7");

  const row = page.locator('[data-testid="connectors-catalogue-item"][data-catalogue-id="context7"]');
  await expect(row).toBeVisible();
  /*
   * The address is written out before the press. Context7's address asks nothing, so the press
   * writes the row and closes.
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

test("a row that needs a token asks in place, with a field for the token and a press to attach it", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await openConnectorsWithVault(page);
  await page.getByTestId("connectors-add-open").click();
  await page.getByTestId("connectors-search").fill("notion");

  const notion = page.locator('[data-testid="connectors-catalogue-item"][data-catalogue-id="notion"]');
  // Notion is a program with a token, so its own button asks in place instead of attaching.
  await expect(notion.getByTestId("connectors-catalogue-add")).toHaveAttribute("data-press", "asks");
  await expect(notion.getByTestId("connectors-catalogue-runs")).toContainText("@notionhq/notion-mcp-server@2.5.1");
  await expect(notion.getByTestId("connectors-catalogue-version")).toHaveText("2026-09-07에 확인한 2.5.1 버전");
  await notion.getByTestId("connectors-catalogue-add").click();
  const ask = page.getByTestId("connectors-catalogue-ask");
  await expect(ask).toBeVisible();
  await expect(ask).toContainText("@notionhq/notion-mcp-server");
  await expect(ask).toContainText("NOTION_TOKEN");
  // The app holds the token in the keychain, so the row offers the field and the press itself.
  await expect(page.getByTestId("connectors-catalogue-ask-value")).toBeVisible();
  await expect(page.getByTestId("connectors-catalogue-ask-add")).toBeVisible();
  // The same facts can still go into the by-hand form, filled in and unfolded.
  await page.getByTestId("connectors-catalogue-ask-edit").click();
  await expect(page.getByTestId("connectors-custom-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("connectors-custom-provenance")).toBeVisible();
  await expect(page.getByTestId("connectors-custom-name")).toHaveValue("notion");
  await expect(page.getByTestId("connectors-custom-args")).toHaveValue("-y @notionhq/notion-mcp-server@2.5.1");
  await expect(page.getByTestId("connectors-item")).toHaveCount(0);
});

test("an install link only opens the dialog prefilled and connects nothing", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await installDesktopRailRuntime(page, {}, undefined, { writable: true });
  await mountDesktopVault(page, "ko");

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
  // The old address redirects into the Agents destination.
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
