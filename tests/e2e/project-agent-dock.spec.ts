import { expect, test } from "@playwright/test";

import { installDesktopRailRuntime, mountDesktopVault } from "./desktop-rail-arrival-harness";

/**
 * The project page's agent dock (2026-09-19): with the desktop bridge and a guarded runtime,
 * the overview's ask opens a dock beside the page and seats the brief instructions as the
 * first turn. The dock mounts only behind the bridge, so the static a11y opener list cannot
 * reach it; this spec is the surface's own check (see `surface-motion-ratchet`, 50 -> 51).
 *
 * The bridge stub never resolves `acp_start`, so the turn stays pending: what is asserted is
 * the frame opening, the request standing in the transcript, and closing putting the
 * conversation away rather than unmounting it.
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

test.describe("project agent dock", () => {
  test.beforeEach(async ({ page }) => {
    await installDesktopRailRuntime(page, {}, { fast: [RUNTIME], probed: [RUNTIME] });
    await mountDesktopVault(page);
  });

  test("the ask opens the dock beside the page and seats the brief request", async ({ page }) => {
    await page.goto("/en/project/fallback/?slug=storefront&guides=off");
    const ask = page.getByTestId("project-detail-brief-ask");
    await expect(ask).toBeVisible({ timeout: 30_000 });

    // The runtime probe answers after the page paints, so the copy button may stand first.
    await expect(ask).toHaveAttribute("data-agent-route", "agent", { timeout: 30_000 });
    const open = page.getByTestId("project-detail-brief-ask-open");
    await expect(open).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("project-detail-brief-ask-copy")).toHaveCount(0);

    const frame = page.getByTestId("project-agent-dock-frame");
    await expect(frame).toHaveAttribute("data-dock-state", "empty");

    await open.click();
    await expect(frame).toHaveAttribute("data-dock-state", "open");
    const dock = page.getByTestId("project-agent-dock");
    await expect(dock).toBeVisible();
    // The eyebrow names the project the turn is about, and the brief request is the one seated
    // to send once the session is ready. The stub never resolves `acp_start`, so the transcript
    // stands at "the tool is starting" and the request is read from the surface, not the text.
    await expect(dock).toContainText("Online Store");
    await expect(dock).toHaveAttribute("data-agent-request-kind", "brief");
    await expect(dock.getByTestId("acp-chat-transcript")).toBeVisible({ timeout: 30_000 });
    // The frame's width transition is the one motion here; the capture waits for it to end.
    await frame.evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
    await page.screenshot({ path: ".claude/shots-2026-09-19/41-project-agent-dock.png" });

    // Closing puts the conversation away; the frame stays mounted and inert.
    await dock.getByTestId("acp-dock-close").click();
    await expect(frame).toHaveAttribute("data-dock-state", "put-away");
    await expect(frame).toHaveAttribute("inert", "");
    await expect(page.getByTestId("project-detail-brief-ask-open")).toBeVisible();
  });
});
