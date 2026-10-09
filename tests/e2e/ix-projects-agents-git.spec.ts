import { expect, test } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "./desktop-rail-arrival-harness";
import { RUNTIME, activeTestId, box } from "./ix-projects-agents-git-harness";

/**
 * Interaction sweep, 2026-09-25 — Projects, Agents and Git.
 *
 * Every assertion here is geometry, computed style or `document.activeElement`, measured in the
 * rendered page: the defects were a dock taller than the window, confirms that drop focus to
 * `<body>`, one decision drawn in five button shapes, and a Push that committed silently. The
 * screenshots land in `output/` for a person to judge; the numbers are the gate.
 */
test.describe("interaction sweep — projects, agents, git", () => {
  test.beforeEach(async ({ page }) => {
    await installDesktopRailRuntime(page, {}, { fast: [RUNTIME], probed: [RUNTIME] });
    await mountDesktopVault(page);
  });

  test("git confirms share one grammar, take focus, close on Escape and hand focus back", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await page.goto("/ko/git/?guides=off");
    const discard = page.getByTestId("atlas-git-discard");
    await expect(discard).toBeVisible({ timeout: 30_000 });
    const reader = page.getByTestId("atlas-git-diff-pre").locator("header");
    const doorBox = await box(discard);

    await discard.click();
    const step = page.getByTestId("atlas-git-discard-step");
    await expect(step).toBeVisible();
    expect(await activeTestId(page), "the discard step took no focus").toBe("atlas-git-discard-cancel");
    const stepBox = await box(step);
    const headerBox = await box(reader);
    // One slot: under the metadata, left-aligned, the column's full width (the restore shape).
    expect(Math.abs(stepBox.x - headerBox.x), "the discard card is not left-aligned with its document").toBeLessThanOrEqual(1);
    expect(Math.abs(stepBox.width - headerBox.width), "the discard card does not span its document").toBeLessThanOrEqual(1);
    const confirm = await box(page.getByTestId("atlas-git-discard-confirm"));
    const cancel = await box(page.getByTestId("atlas-git-discard-cancel"));
    expect([confirm.height, cancel.height, doorBox.height]).toEqual([32, 32, 32]);
    expect([confirm.fontSize, cancel.fontSize, doorBox.fontSize]).toEqual([14, 14, 14]);
    await page.screenshot({ path: "output/ix/git-discard-1512.png" });

    await page.keyboard.press("Escape");
    await expect(step).toHaveCount(0);
    expect(await activeTestId(page), "Escape dropped focus").toBe("atlas-git-discard");

    // The commit step: the same pair, the message at the field's own type size, and the door
    // that turns into it on the same step (it was 36px against the pair's 32).
    const commitDoor = await box(page.getByTestId("atlas-git-snapshot-button"));
    await page.getByTestId("atlas-git-snapshot-button").click();
    const input = page.getByTestId("atlas-git-message-input");
    await expect(input).toBeFocused();
    const commitConfirm = await box(page.getByTestId("atlas-git-confirm-button"));
    const commitCancel = await box(page.getByTestId("atlas-git-cancel-button"));
    expect([commitDoor.height, commitConfirm.height, commitCancel.height]).toEqual([32, 32, 32]);
    expect([commitDoor.fontSize, commitConfirm.fontSize, commitCancel.fontSize]).toEqual([14, 14, 14]);
    expect((await box(input)).fontSize, "the commit message is set smaller than the field").toBeGreaterThan(11);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("atlas-git-confirm-step")).toHaveCount(0);
    expect(await activeTestId(page)).toBe("atlas-git-snapshot-button");
  });

  test("Push with a pending change asks first and never commits on its own", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await page.goto("/ko/git/?guides=off");
    const push = page.getByTestId("atlas-git-remote-push");
    await expect(push).toBeVisible({ timeout: 30_000 });
    await push.click();
    await expect(page.getByTestId("atlas-git-confirm-step")).toBeVisible();
    await expect(page.getByTestId("atlas-git-push-optin")).toBeChecked();
    const snapshots = await page.evaluate(
      () =>
        (window as unknown as { __nativeCalls: { command: string }[] }).__nativeCalls.filter(
          (call) => call.command === "git_snapshot",
        ).length,
    );
    expect(snapshots, "Push committed without a confirm").toBe(0);
    // One name for one action on /ko: the confirm Push opened uses the Korean label, not "Push".
    await expect(page.getByTestId("atlas-git-confirm-step")).not.toContainText(/Push|Fetch|Pull/);

    // A cancelled Push leaves nothing behind: the next plain commit is not commit-and-push.
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("atlas-git-confirm-step")).toHaveCount(0);
    await page.getByTestId("atlas-git-snapshot-button").click();
    await expect(page.getByTestId("atlas-git-confirm-step")).toBeVisible();
    await expect(page.getByTestId("atlas-git-push-optin"), "a cancelled Push ticked the next commit's send").not.toBeChecked();
  });

  test("a finished commit hands focus to its result, not to <body>", async ({ page }) => {
    await page.addInitScript(() => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> };
        }
      ).__TAURI_INTERNALS__;
      const invoke = internals.invoke.bind(internals);
      internals.invoke = (command, args) =>
        command === "git_snapshot"
          ? Promise.resolve({
              committed: true,
              reason: null,
              commitHash: "f".repeat(40),
              subject: "docs: order",
              summary: null,
              counts: { total: 1 },
              files: [],
              stagedOutsideVault: [],
              push: null,
            })
          : invoke(command, args);
    });
    await page.setViewportSize({ width: 1512, height: 949 });
    await page.goto("/ko/git/?guides=off");
    const snapshot = page.getByTestId("atlas-git-snapshot-button");
    await expect(snapshot).toBeVisible({ timeout: 30_000 });
    await snapshot.click();
    await page.getByTestId("atlas-git-confirm-button").click();
    await expect(page.getByTestId("atlas-git-snapshot-result")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const active = document.activeElement;
          if (!active || active === document.body) return "BODY";
          return active.contains(document.querySelector('[data-testid="atlas-git-snapshot-result"]')) ? "RESULT" : active.tagName;
        }),
      )
      .toBe("RESULT");
  });

  test("an info hint opened by keyboard focus closes on Escape and keeps the focus", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/ko/agents/?guides=off");
    const note = page.getByTestId("app-settings-runtimes-disk-note");
    await expect(note).toBeAttached({ timeout: 30_000 });
    const panel = page.getByRole("tooltip").filter({ has: note });
    const button = page.locator("div.group").filter({ has: note }).getByRole("button").first();
    await button.focus();
    await expect.poll(() => panel.evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    // Shown by focus, the panel must not catch clicks meant for the rows it covers.
    expect(await panel.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
    await page.keyboard.press("Escape");
    await expect.poll(() => panel.evaluate((el) => getComputedStyle(el).opacity)).toBe("0");
    await expect(button, "Escape moved focus off the hint").toBeFocused();
  });

  test("the add-connector dialog hands focus back to its opener, and an empty search answers first", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/ko/agents/?tab=mcp&mcp=connectors&guides=off");
    const opener = page.getByTestId("connectors-add-open");
    await expect(opener).toBeVisible({ timeout: 30_000 });
    await opener.focus();
    await page.keyboard.press("Enter");
    const search = page.getByTestId("connectors-search");
    await expect(search).toBeFocused();

    await search.fill("zzzqq");
    const none = page.getByTestId("connectors-add-none");
    await expect(none).toBeVisible();
    // No particle that fits only vowel-final queries: the sentence reads right after any word.
    await expect(none).toContainText("「zzzqq」에 맞는 게 없어요");
    await expect(page.getByTestId("connectors-found-section")).toHaveCount(0);
    await expect(page.getByTestId("connectors-discovery-unavailable")).toHaveCount(0);
    const groups = await box(page.getByTestId("connectors-add-groups"));
    const noneBox = await box(none);
    expect(noneBox.y - groups.y, "the empty answer is not the first thing in the list").toBeLessThanOrEqual(1);
    await page.screenshot({ path: "output/ix/connectors-none-1280.png" });

    // One door to the by-hand form: the card's, not the card's and the fold's.
    const noneCustom = page.getByTestId("connectors-add-none-custom");
    await expect(noneCustom).toBeVisible();
    await expect(page.getByTestId("connectors-custom-toggle"), "two doors to the same form").toHaveCount(0);
    await noneCustom.click();
    await expect(page.getByTestId("connectors-custom-name"), "the door left the keyboard behind").toBeFocused();
    await expect(noneCustom, "the used door stayed on screen").toHaveCount(0);
    await expect(page.getByTestId("connectors-custom-toggle")).toHaveAttribute("aria-expanded", "true");
    // The form's two adds are one step, and it speaks in the dialog's own register.
    const variableAdd = await box(page.getByTestId("connectors-custom-variable-add"));
    const customAdd = await box(page.getByTestId("connectors-custom-add"));
    expect([variableAdd.height, variableAdd.fontSize]).toEqual([customAdd.height, customAdd.fontSize]);
    await expect(page.getByTestId("connectors-add-dialog")).not.toContainText("십시오");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("connectors-add-dialog")).toHaveCount(0);
    expect(await activeTestId(page), "closing the dialog dropped focus").toBe("connectors-add-open");

    await opener.click();
    await page.getByTestId("connectors-add-close").click();
    await expect(page.getByTestId("connectors-add-dialog")).toHaveCount(0);
    expect(await activeTestId(page)).toBe("connectors-add-open");
  });

  test("remote actions read in Korean on /ko and explain themselves on keyboard focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await page.goto("/ko/git/?guides=off");
    const fetch = page.getByTestId("atlas-git-remote-fetch");
    await expect(fetch).toBeVisible({ timeout: 30_000 });
    for (const id of ["fetch", "pull", "push"]) {
      await expect(page.getByTestId(`atlas-git-remote-${id}`)).not.toContainText(/Fetch|Pull|Push/);
      expect(await page.getByTestId(`atlas-git-remote-${id}`).getAttribute("title")).toBeNull();
    }
    await fetch.focus();
    const hint = page.getByTestId("atlas-git-remote-fetch-hint").first();
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("git fetch");
    // The hint panel hangs below the header and never covers the button it explains.
    const [button, panel] = [await box(fetch), await box(hint)];
    expect(panel.y, "hint covers its own button").toBeGreaterThanOrEqual(button.y + button.height);
    // Shown by focus, it lies across the "now" row and must not catch clicks meant for it.
    const hitsHint = await hint.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const points = [
        [r.left + 4, r.top + 4],
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.right - 4, r.bottom - 4],
      ];
      const tooltip = el.closest("[data-radix-popper-content-wrapper]") ?? el;
      return points.some(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && tooltip.contains(hit);
      });
    });
    expect(hitsHint, "the focus-shown hint catches the pointer over the row beneath it").toBe(false);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("atlas-git-remote-fetch-hint")).toHaveCount(0);
  });
});
