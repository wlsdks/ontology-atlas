import { expect, test, type Locator, type Page } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "./desktop-rail-arrival-harness";

/**
 * Interaction sweep, 2026-09-25 — Projects, Agents and Git.
 *
 * Every assertion here is geometry, computed style or `document.activeElement`, measured in the
 * rendered page: the defects were a dock taller than the window, confirms that drop focus to
 * `<body>`, one decision drawn in five button shapes, and a Push that committed silently. The
 * screenshots land in `output/` for a person to judge; the numbers are the gate.
 */
const RUNTIME = {
  id: "claude-code",
  label: "Claude Agent",
  description: "",
  website: null,
  license: null,
  verified: true,
  icon: null,
  brandInk: null,
  launchKind: "npx",
  state: "ready",
  cliPath: "/opt/homebrew/bin/claude",
  adapterPath: null,
  adapterPackage: "@agentclientprotocol/claude-agent-acp",
  isolated: true,
};

type Box = { x: number; y: number; width: number; height: number; fontSize: number };

async function box(locator: Locator): Promise<Box> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
      fontSize: Number.parseFloat(getComputedStyle(el).fontSize),
    };
  });
}

async function activeTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return "BODY";
    return active.getAttribute("data-testid") ?? active.tagName;
  });
}

test.describe("interaction sweep — projects, agents, git", () => {
  test.beforeEach(async ({ page }) => {
    await installDesktopRailRuntime(page, {}, { fast: [RUNTIME], probed: [RUNTIME] });
    await mountDesktopVault(page);
  });

  // Below `xl` (1280) the dock is a full-width overlay; it used to be `absolute top-0` against a
  // row as tall as the page (1389 at 1040x806), so it never fitted the window there either.
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1512, height: 949 },
    { width: 1280, height: 800 },
    { width: 1279, height: 800 },
    { width: 1040, height: 806 },
    { width: 900, height: 800 },
  ]) {
    test(`project agent dock is one window tall at ${viewport.width}, header and composer both on screen`, async ({ page }) => {
      const overlay = viewport.width < 1280;
      await page.setViewportSize(viewport);
      await page.goto("/ko/project/fallback/?slug=storefront&guides=off");
      const open = page.getByTestId("project-detail-brief-ask-open");
      await expect(open).toBeVisible({ timeout: 30_000 });
      await open.focus();
      await page.keyboard.press("Enter");
      const frame = page.getByTestId("project-agent-dock-frame");
      await expect(frame).toHaveAttribute("data-dock-state", "open");
      await frame.evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
      const dock = page.getByTestId("project-agent-dock");
      const composer = dock.getByTestId("acp-chat-composer");
      const close = dock.getByTestId("acp-dock-close");
      await expect(composer).toBeVisible({ timeout: 30_000 });

      const measure = async () => ({
        frame: await box(frame),
        composer: await box(composer),
        close: await box(close),
      });
      const onOpen = await measure();
      expect(onOpen.frame.height, "the dock frame is taller than the window").toBeLessThanOrEqual(viewport.height);
      expect(onOpen.frame.y, "the dock frame starts above the window").toBeGreaterThanOrEqual(0);
      expect(onOpen.composer.y + onOpen.composer.height, "the composer starts below the fold").toBeLessThanOrEqual(viewport.height);
      expect(onOpen.close.y, "the close button is above the window").toBeGreaterThanOrEqual(0);
      await page.screenshot({ path: `output/ix/dock-${viewport.width}.png` });

      // Scrolling the page beside it does not carry the dock away.
      await page.getByTestId("app-shell-body-slot").evaluate((el) => el.scrollBy(0, 600));
      await page.waitForTimeout(100);
      const scrolled = await measure();
      expect(scrolled.close.y, "the dock header scrolled away with the page").toBeGreaterThanOrEqual(0);
      expect(scrolled.composer.y + scrolled.composer.height).toBeLessThanOrEqual(viewport.height);
      await page.screenshot({ path: `output/ix/dock-scrolled-${viewport.width}.png` });

      if (overlay) {
        // The overlay hides the opener, so the keyboard goes into the dock, and Escape puts it away.
        await expect
          .poll(() => frame.evaluate((el) => el.contains(document.activeElement)), {
            message: "focus stayed on the opener the overlay now covers",
          })
          .toBe(true);
        // The page the overlay covers is out of the Tab order while it is covered.
        expect(await page.locator("main#main").evaluate((el) => (el as HTMLElement).inert)).toBe(true);
        await page.keyboard.press("Escape");
        await expect(frame).toHaveAttribute("data-dock-state", "put-away");
        expect(await activeTestId(page), "Escape dropped focus").toBe("project-detail-brief-ask-open");
        return;
      }
      await close.click();
      await expect(frame).toHaveAttribute("data-dock-state", "put-away");
      expect(await activeTestId(page), "closing the dock dropped focus").toBe("project-detail-brief-ask-open");
    });
  }

  test("project quick edit names the two names in the reader's words, not schema keys", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/ko/project/fallback/?slug=storefront&guides=off");
    const toggle = page.getByTestId("public-quick-edit-toggle");
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await toggle.click();
    const hint = page.getByTestId("public-quick-edit-name-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("온라인 상점");
    const dialog = page.getByRole("dialog");
    await expect(dialog).not.toContainText(/display_|\(title\)/);
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
    expect([confirm.fontSize, cancel.fontSize, doorBox.fontSize]).toEqual([12.5, 12.5, 12.5]);
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
    expect([commitDoor.fontSize, commitConfirm.fontSize, commitCancel.fontSize]).toEqual([12.5, 12.5, 12.5]);
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

  test("commit detail shows the reader's clock, not the ISO instant", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await page.goto("/ko/git/?guides=off");
    const item = page.getByTestId("atlas-git-history-item").first();
    await expect(item).toBeVisible({ timeout: 30_000 });
    await item.click();
    const detail = page.getByTestId("atlas-git-history-detail").locator("header").first();
    await expect(detail).toBeVisible();
    await expect(detail).not.toContainText(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    await expect(detail.locator("time[datetime]")).toHaveCount(1);
  });

  test("agents and MCP header actions and row actions share one step", async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await page.goto("/ko/agents/?guides=off");
    const recheck = page.getByTestId("app-settings-runtimes-recheck");
    await expect(recheck).toBeVisible({ timeout: 30_000 });
    const recheckBox = await box(recheck);
    const chat = await box(page.getByTestId("app-settings-runtime-chat-claude-code"));
    const scan = await box(page.getByTestId("agent-doctor-scan").first());
    expect([chat.height, scan.height]).toEqual([32, 32]);
    expect(scan.fontSize, "the row's two actions use two type sizes").toBe(chat.fontSize);

    await page.getByTestId("agents-tab-mcp").click();
    const verify = page.getByTestId("agent-setup-verify-open");
    await expect(verify).toBeVisible({ timeout: 10_000 });
    const verifyBox = await box(verify);
    expect(verifyBox.height, "the MCP header action is a different height from the Agents one").toBe(recheckBox.height);
    expect(verifyBox.fontSize).toBe(recheckBox.fontSize);
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

  test("a catalogue card's add and its other ways in stand on one step", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/ko/agents/?tab=mcp&mcp=connectors&guides=off");
    await page.getByTestId("connectors-add-open").click({ timeout: 30_000 });
    await page.getByTestId("connectors-search").fill("context7");
    const row = page.locator('[data-testid="connectors-catalogue-item"][data-catalogue-id="context7"]');
    await expect(row).toBeVisible();
    const add = await box(row.getByTestId("connectors-catalogue-add"));
    const other = await box(row.getByTestId("connectors-catalogue-other").first());
    expect([other.height, other.fontSize], "one card, two type sizes at one height").toEqual([add.height, add.fontSize]);
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
});
