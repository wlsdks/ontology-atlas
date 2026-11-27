import type { Page } from "@playwright/test";

import { mountDesktopVault } from "../desktop-rail-arrival-harness";

/**
 * Opens a map address the way a returning person does in the installed app: the folder is chosen
 * once through the native picker (`mountDesktopVault`), then the address is visited and the app
 * restores the folder it remembers. Call `installDesktopRailRuntime` before this.
 */
export async function openMapOnApp(
  page: Page,
  address: string,
  options: { waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit" } = {},
): Promise<void> {
  const locale = /^\/([a-z]{2})(?:\/|\?|$)/.exec(address)?.[1] ?? "en";
  await mountDesktopVault(page, locale);
  await page.goto(address, options);
}

/**
 * Opens the folder through the picker as the first thing the session does and leaves the page on
 * the map's own address, so the first draw (its assembly) happens in the document the spec watches.
 * A second visit to the map in the same session opens assembled, so `openMapOnApp` cannot stand in.
 * Call `installDesktopRailRuntime` before this.
 */
export async function openFirstMapOnApp(page: Page, mapAddress: string): Promise<void> {
  await page.goto(mapAddress.replace("/topology/", "/"));
  await page.getByTestId("first-run-open").click();
}

const READY_RUNTIME = {
  id: "codex-acp", label: "Codex", verified: true, isolated: true, icon: null, brandInk: null, description: "", website: null,
  license: null, launchKind: "npx", cliPath: "/fixture/cli", adapterPath: null, adapterPackage: "@agentclientprotocol/codex-acp", state: "ready",
};

/** What the native agent probe answers when one in-app agent is ready, so the map's agent dock opens its workbench rather than asking for a key. */
export const READY_AGENT = { fast: [READY_RUNTIME], probed: [READY_RUNTIME] };
