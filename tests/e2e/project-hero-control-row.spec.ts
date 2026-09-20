import { expect, test } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "./desktop-rail-arrival-harness";

/**
 * The project page's hero control row, measured in the state the owner saw it in.
 *
 * On 2026-09-19 the owner read the row as crooked: with a folder open it drew "View topology"
 * filled, "Open review result" outlined and the quick-edit trigger as a bare `ghost` label, so
 * three weights stood in one row and the third had no box at all. The fix gives the trigger the
 * same outline as its sibling, which is a rendered fact rather than a source one — a variant prop
 * reads correct in the diff and still lands wrong if a class wins over it.
 *
 * So this measures what a person sees: every control the same height, sharing one baseline, and
 * exactly one of them filled.
 */
test("the hero's controls are one filled action and outline siblings, on one line", async ({ page }) => {
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
  await page.goto("/en/project/fallback/?slug=storefront&guides=off");

  const heroButtons = page.locator("main header button");
  await expect(heroButtons.first()).toBeVisible({ timeout: 30_000 });

  const row = await page.evaluate(() => {
    const controls = [...document.querySelectorAll("main header button")].filter((element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    return controls.map((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        label: (element.textContent ?? "").trim().slice(0, 24),
        height: Math.round(box.height),
        top: Math.round(box.top),
        background: style.backgroundColor,
        borderWidth: style.borderTopWidth,
      };
    });
  });

  expect(row.length, "the editable hero draws its three controls").toBeGreaterThanOrEqual(3);
  // One height, one baseline: a row whose members differ on either is the shape that reads as crooked.
  expect(new Set(row.map((control) => control.height)).size, `heights: ${JSON.stringify(row)}`).toBe(1);
  expect(new Set(row.map((control) => control.top)).size, `tops: ${JSON.stringify(row)}`).toBe(1);
  // Exactly one filled control. "Filled" is an opaque plane, not merely a background: the outline
  // variant carries `--color-overlay-1`, which is a 2% white wash and would count as filled under a
  // transparency test.
  const filled = row.filter((control) => {
    const alpha = /rgba\([^)]*,\s*([\d.]+)\)$/.exec(control.background);
    return alpha === null || Number(alpha[1]) === 1;
  });
  expect(filled.length, `filled: ${JSON.stringify(row)}`).toBe(1);
  // And no control is boxless — a bare label beside two boxes is the third weight the owner saw.
  expect(row.every((control) => parseFloat(control.borderWidth) > 0), `borders: ${JSON.stringify(row)}`).toBe(true);

  await page.screenshot({ path: ".claude/shots-2026-09-19/81-hero-row-editable.png" });
});

/**
 * The row above the hero, measured for the same reason.
 *
 * It held three type sizes at once: a 16px text door, a 14px label inside a pill forced to 40px by
 * a one-off height class, and an 11px folder total. The folder total was also the only number on
 * the page that does not describe this project, so it now rides the composition board's scope
 * sentence instead of the control row.
 */
test("the top bar draws controls of one size, and the folder total is not among them", async ({ page }) => {
  await installDesktopRailRuntime(page);
  await mountDesktopVault(page);
  await page.goto("/en/project/fallback/?slug=storefront&guides=off");

  const census = page.getByTestId("project-detail-global-census");
  await expect(census).toBeVisible({ timeout: 30_000 });

  const measured = await page.evaluate(() => {
    const controls = [
      document.querySelector('[data-testid="project-detail-docs-vault-link"] button'),
      document.querySelector('[data-testid="project-detail-copy-link"]'),
    ].filter((element): element is HTMLElement => element instanceof HTMLElement);
    const censusNode = document.querySelector('[data-testid="project-detail-global-census"]');
    const board = document.querySelector('[data-testid="project-detail-composition"]');
    return {
      controls: controls.map((element) => {
        const box = element.getBoundingClientRect();
        return {
          label: (element.textContent ?? "").trim().slice(0, 24),
          height: Math.round(box.height),
          top: Math.round(box.top),
          fontSize: getComputedStyle(element).fontSize,
        };
      }),
      censusInsideBoard: Boolean(board && censusNode && board.contains(censusNode)),
      censusRight: censusNode ? Math.round(censusNode.getBoundingClientRect().right) : null,
      controlsRight: controls.length
        ? Math.round(controls[controls.length - 1]!.getBoundingClientRect().right)
        : null,
    };
  });

  expect(measured.controls.length, "both doors are drawn").toBe(2);
  expect(
    new Set(measured.controls.map((control) => control.height)).size,
    `heights: ${JSON.stringify(measured.controls)}`,
  ).toBe(1);
  expect(
    new Set(measured.controls.map((control) => control.top)).size,
    `tops: ${JSON.stringify(measured.controls)}`,
  ).toBe(1);
  expect(
    new Set(measured.controls.map((control) => control.fontSize)).size,
    `font sizes: ${JSON.stringify(measured.controls)}`,
  ).toBe(1);
  // The folder total belongs to the scope sentence over the board, not to the control row.
  expect(measured.censusInsideBoard, "the folder total sits with the composition board").toBe(true);
  // And it ends on the same right rail the controls do, so the page has one edge rather than two.
  expect(measured.censusRight).toBe(measured.controlsRight);
});

/**
 * The state fact beside those controls, measured for the reason the row exists.
 *
 * "View only: open a folder to edit" is a `<span>` and cannot be pressed, but it wore the outline
 * button's own surface — `--color-overlay-1`, a border and the chip radius — so the row drew four
 * boxes of which one did nothing, and the difference was a border colour. A reader cannot tell a
 * fact from a door by looking. The page already draws a fact as a fact: the folder total over the
 * composition board is engraved text with no box.
 */
test("the view-only state is drawn as a fact, not as a fourth control", async ({ page }) => {
  await page.goto("/en/project/fallback/?slug=storefront&guides=off");

  const badge = page.getByTestId("project-detail-readonly-badge");
  await expect(badge).toBeVisible({ timeout: 30_000 });

  const measured = await page.evaluate(() => {
    const read = (element: Element | null) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        borderWidth: parseFloat(style.borderTopWidth),
        background: style.backgroundColor,
        radius: parseFloat(style.borderTopLeftRadius),
      };
    };
    const sibling = document.querySelector('[data-testid="project-detail-open-vault"]');
    return {
      badge: read(document.querySelector('[data-testid="project-detail-readonly-badge"]')),
      door: read(sibling instanceof HTMLElement ? (sibling.querySelector("button") ?? sibling) : null),
    };
  });

  // The fact carries no control surface at all: no border, no plane, no chip radius.
  expect(measured.badge, "the badge is on the page").not.toBeNull();
  expect(measured.badge!.borderWidth, `badge: ${JSON.stringify(measured.badge)}`).toBe(0);
  expect(measured.badge!.radius, `badge: ${JSON.stringify(measured.badge)}`).toBe(0);
  expect(
    /rgba\([^)]*,\s*0\)$/.test(measured.badge!.background) || measured.badge!.background === "transparent",
    `badge background: ${measured.badge!.background}`,
  ).toBe(true);
  // And the real door beside it still has one, so the row still distinguishes them.
  if (measured.door) {
    expect(measured.door.borderWidth, `door: ${JSON.stringify(measured.door)}`).toBeGreaterThan(0);
  }
});

/**
 * The board's doors, measured where a finger presses them.
 *
 * Each cell's door is the point of the cell: read the figures, then choose where to go. As a text
 * link it carries no height token, so its box is the font's height — 24px on a phone against the
 * 44px contract `globals.css` states. `touch-hit-expand` is that file's own remedy for
 * text-shaped controls: it widens the hit area under `pointer: coarse` and changes nothing
 * visible. A class cannot be checked by reading the source, because the rule lives in a media
 * query, so this presses around the box and asks what would receive it.
 */
test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("each surface door answers a press across the whole touch target", async ({ page }) => {
    await page.goto("/en/project/fallback/?slug=storefront&guides=off");
    await expect(page.getByTestId("project-detail-surface-board")).toBeVisible({ timeout: 30_000 });

    const measured = await page.evaluate(() => {
      const doors = [...document.querySelectorAll('[data-testid="project-detail-surface-open"]')];
      return doors.map((door) => {
        door.scrollIntoView({ block: "center" });
        const box = door.getBoundingClientRect();
        const x = Math.round(box.x + box.width / 2);
        const y = Math.round(box.y + box.height / 2);
        const receives = (dy: number) => {
          const at = document.elementFromPoint(x, y + dy);
          return Boolean(at && (at === door || door.contains(at) || at.closest?.('[data-testid="project-detail-surface-open"]') === door));
        };
        return {
          label: (door.textContent ?? "").trim().slice(0, 16),
          visible: Math.round(box.height),
          inside: receives(-20) && receives(20),
          outside: receives(-26) || receives(26),
        };
      });
    });

    expect(measured.length, "one door per surface").toBe(3);
    for (const door of measured) {
      // The visible box stays small; only the reach grows.
      expect(door.visible, `${door.label} box: ${JSON.stringify(door)}`).toBeLessThan(32);
      expect(door.inside, `${door.label} reach: ${JSON.stringify(door)}`).toBe(true);
      // And it does not reach so far that two controls could fight over one press.
      expect(door.outside, `${door.label} overreach: ${JSON.stringify(door)}`).toBe(false);
    }
  });
});
