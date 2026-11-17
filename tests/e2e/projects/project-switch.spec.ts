import { expect, test, type Page } from "@playwright/test";
import en from "../../../messages/en.json";
import { seedFirstRunSeen } from "../first-run-seed";
import { stubDirectoryPicker } from "../vault-picker-stub";

/*
 * The Projects destination means the selected project: the one whose page was opened last in this
 * session, else the folder's only project, else the list. Every step navigates in the app, since a
 * reload starts a new session and forgets the selection by design.
 */

const detail = en.projectPages.detail;
const selector = en.projectPages.selector;

function projectDoc(slug: string, title: string): string {
  return ["---", "kind: project", `slug: ${slug}`, `title: ${title}`, "---", "", `# ${title}`, "", `${title} exists for this spec.`, ""].join("\n");
}

const TWO_PROJECTS = {
  "projects/alpha-shop.md": projectDoc("alpha-shop", "Alpha Shop"),
  "projects/beta-ledger.md": projectDoc("beta-ledger", "Beta Ledger"),
};
const ONE_PROJECT = { "projects/alpha-shop.md": projectDoc("alpha-shop", "Alpha Shop") };

async function openFolder(page: Page, files: Record<string, string>) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await stubDirectoryPicker(page, files);
  await seedFirstRunSeen(page);
  await page.goto("/en/topology/");
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 20_000 });
}

const projectsDoor = (page: Page) => page.getByTestId("app-nav-rail-item-projects");

test.describe("the Projects destination opens the selected project", () => {
  test("with two projects it returns to the project opened last, and the list marks and leads with it", async ({ page }) => {
    await openFolder(page, TWO_PROJECTS);

    await projectsDoor(page).click();
    await expect(page).toHaveURL(/\/en\/projects\/$/);
    const grid = page.getByTestId("project-selector-grid");
    await expect(grid.getByTestId("project-selector-card")).toHaveCount(2);
    await expect(page.getByTestId("project-selector-selected-tag"), "nothing is selected before a project is opened").toHaveCount(0);
    await expect(grid.locator("> li"), "the grid holds only project cards").toHaveCount(2);
    await expect(grid.getByTestId("project-selector-next-slot")).toHaveCount(0);
    await expect(page.getByTestId("project-selector-next-slot")).toBeVisible();

    await grid.getByRole("link", { name: "Beta Ledger", exact: true }).click();
    await expect(page).toHaveURL(/\/project\/fallback\/\?slug=beta-ledger/);
    const switcher = page.getByTestId("project-detail-switch");
    await expect(switcher).toHaveText(detail.topBarSwitch);

    await page.getByTestId("app-nav-rail-item-map").click();
    await expect(page).toHaveURL(/\/en\/topology\//);
    await projectsDoor(page).click();
    await expect(page, "the destination returns to the project opened last").toHaveURL(/\/project\/fallback\/\?slug=beta-ledger/);

    await page.getByTestId("project-detail-switch").click();
    await expect(page).toHaveURL(/\/en\/projects\/$/);
    const first = grid.getByTestId("project-selector-card").first();
    await expect(first.getByRole("link", { name: "Beta Ledger", exact: true })).toHaveAttribute("aria-current", "true");
    await expect(first.getByTestId("project-selector-selected-tag")).toHaveText(selector.selectedTag);
    await expect(page.getByTestId("project-selector-selected-tag")).toHaveCount(1);
  });

  test("with one project its page offers adding a project and leads to the list", async ({ page }) => {
    await openFolder(page, ONE_PROJECT);

    await projectsDoor(page).click();
    await expect(page).toHaveURL(/\/project\/fallback\/\?slug=alpha-shop/);
    const switcher = page.getByTestId("project-detail-switch");
    await expect(switcher).toHaveText(detail.topBarAdd);

    await switcher.click();
    await expect(page).toHaveURL(/\/en\/projects\/$/);
    await expect(page.getByTestId("project-selector-selected-tag"), "the only project counts as selected").toHaveCount(1);
    await expect(page.getByTestId("project-selector-grid").getByTestId("project-selector-next-slot")).toHaveCount(0);
  });
});
