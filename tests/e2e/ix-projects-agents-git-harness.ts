import type { Locator, Page } from "@playwright/test";

export const RUNTIME = {
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

export async function box(locator: Locator): Promise<Box> {
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

export async function activeTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!active || active === document.body) return "BODY";
    return active.getAttribute("data-testid") ?? active.tagName;
  });
}
