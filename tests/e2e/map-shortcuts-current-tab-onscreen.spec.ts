import { expect, test } from "@playwright/test";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { waitForMapStill } from "./settle";

/**
 * **The current-screen tab promises what can be pressed now.**
 *
 * The sheet's default tab exists so a person is not handed forty rows at once:
 * it lists the keys of the screen they are on. The hub-rail group was listed
 * there unconditionally, while the rail itself draws only for a map that has
 * hub projects, only when the left panel is collapsed or the drawer is open,
 * and never below `md`. Measured on the map with the fixture folder and with
 * the sample one, panel open and collapsed: the rail was on screen 0 times out
 * of 4, and the tab advertised its three keys every time. Pressing `Home` did
 * nothing.
 *
 * A section may now name the control its keys drive. On the current-screen tab
 * it is listed only when that control is really on the screen as the sheet
 * opens; the `All` tab still documents it, so this removes an empty promise
 * rather than help.
 */
test("the current-screen tab drops keys whose control is not on the map", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installDesktopRailRuntime(page);
  await page.goto("/ko/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await waitForMapStill(page);

  // The measurement the rule rests on: no hub rail is on this screen.
  await expect(page.getByTestId("topology-hub-rail")).toHaveCount(0);

  await page.getByTestId("topology-shortcuts-help-button").click();
  const scroll = page.getByTestId("shortcut-sheet-scroll");
  await expect(scroll).toBeVisible();

  // The current-screen tab is the default and does not advertise the absent rail,
  // while the map's own keys — which are pressable — stay listed.
  await expect(page.getByTestId("shortcut-sheet-scope-current")).toHaveAttribute("aria-selected", "true");
  await expect(scroll.getByText("허브 레일", { exact: true }), "허브 레일이 화면에 없는데 지금 화면 탭이 그 키를 안내한다").toHaveCount(0);
  await expect(scroll.getByText("첫 허브로", { exact: true })).toHaveCount(0);
  await expect(scroll.getByText("지도 전체 맞춤", { exact: true })).toBeVisible();

  // The keys are not deleted: the All tab still documents them.
  await page.getByTestId("shortcut-sheet-scope-all").click();
  await expect(scroll.getByText("허브 레일", { exact: true })).toBeVisible();
  await expect(scroll.getByText("첫 허브로", { exact: true })).toBeVisible();
});
