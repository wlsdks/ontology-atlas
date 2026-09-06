import { expect, test } from "@playwright/test";
import { FIXTURE_VAULT } from "../fixture-vault";
import { seedFirstRunSeen } from "../first-run-seed";
import { stubDirectoryPicker } from "../vault-picker-stub";

test("walk", async ({ page }) => {
  test.setTimeout(600_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await stubDirectoryPicker(page, { ...FIXTURE_VAULT });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });
  // === the walk starts here; a folder is now open ===

  const shot = (name: string) =>
    page.screenshot({ path: `/Users/jinan/.claude/jobs/8b063fe2/tmp/walker2/${name}.png`, fullPage: false });

  await page.waitForTimeout(1000);
  await shot("01-topology-landed");
  console.log("=== STEP 1: topology landed ===");
  console.log(await page.innerText("body"));

  // Step 2: the nav has 지도/아키텍처/문서함/자료실/분석/프로젝트/에이전트/MCP/기록.
  // "자료실" (reading room / library) is the closest word to "Library" the
  // user is looking for. Click it.
  await page.getByRole("link", { name: "자료실", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await shot("02-library-landed");
  console.log("=== STEP 2: clicked 자료실 (library) ===");
  console.log(page.url());
  console.log(await page.innerText("body"));

  // Step 3: "외부에서 가져오기" (bring in from outside) is the label closest
  // to "connect Notion". Click it.
  await page.getByText("외부에서 가져오기", { exact: true }).click();
  await page.waitForTimeout(800);
  await shot("03-import-from-outside");
  console.log("=== STEP 3: clicked 외부에서 가져오기 ===");
  console.log(page.url());
  console.log(await page.innerText("body"));

  // Step 4: a dialog listing Notion/Confluence/Jira/GitHub/다른 서비스 appeared.
  // Click Notion.
  await page.getByText("Notion", { exact: true }).click();
  await page.waitForTimeout(800);
  await shot("04-notion-clicked");
  console.log("=== STEP 4: clicked Notion ===");
  console.log(page.url());
  console.log(await page.innerText("body"));

  // Step 5: dialog now shows step 1 of 3, warning that the coding tool
  // (not Atlas) opens the login window and holds what it receives, and that
  // deleting the connection later does not revoke the permission. Click
  // "연결하기" (Connect) to proceed and see what actually happens headless.
  await page.getByRole("button", { name: "연결하기" }).click();
  await page.waitForTimeout(1500);
  await shot("05-connect-clicked");
  console.log("=== STEP 5: clicked 연결하기 (Connect) ===");
  console.log(page.url());
  console.log(await page.innerText("body"));
});
