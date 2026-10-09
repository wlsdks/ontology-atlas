import { expect, test, type CDPSession, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";
import { syntheticVault } from "./hex-board-vaults";
import { waitForDomQuiet, waitForPageSettled } from "./settle";
import { stubDirectoryPicker } from "./vault-picker-stub";

const DOCS = syntheticVault(990, 10);

const STOPS: { go: { rail?: string; tab?: string; push?: string }; url?: RegExp; ready: string }[] = [
  { go: { rail: "architecture" }, url: /\/architecture\//, ready: '[data-testid="harness-views"]' },
  { go: { rail: "library" }, url: /\/library\//, ready: '[data-testid="library-workspace-panel"]' },
  { go: { tab: "library-workspace-wiki" }, ready: "#library-workspace-tabpanel-wiki" },
  {
    go: { tab: "library-workspace-ontology" },
    url: /^(?=.*[?&]tab=ontology\b)(?=.*[?&]slug=)/,
    ready: "#library-workspace-tabpanel-ontology",
  },
  { go: { rail: "automations" }, url: /\/automations\//, ready: '[data-testid="automations-list"],[data-testid="automations-empty-workbench"]' },
  { go: { rail: "insights" }, url: /\/ontology\/insights\//, ready: '[data-testid="analysis-workspace"]' },
  { go: { rail: "projects" }, url: /\/project\//, ready: '[data-testid="project-detail-body"]' },
  { go: { rail: "agents" }, url: /\/agents\//, ready: '[data-testid="agents-page"]' },
  { go: { tab: "agents-tab-mcp" }, ready: '[data-testid="mcp-page"]' },
  { go: { rail: "git" }, url: /\/git\//, ready: '[data-testid="git-page"]' },
  { go: { push: "/en/guide/" }, url: /\/guide\//, ready: '[data-testid="gateway-doc-body"]' },
  {
    go: { push: "/en/download/?hero=three" },
    url: /\/download\//,
    ready: '[data-testid="gateway-hero-object"][data-hero-engine="three"] canvas',
  },
];

async function visit(page: Page, stop: (typeof STOPS)[number]): Promise<void> {
  const { go } = stop;
  if (go.rail) await page.getByTestId(`app-nav-rail-item-${go.rail}`).click();
  else if (go.tab) await page.getByTestId(go.tab).click();
  else if (go.push) await routerPush(page, go.push);
  if (stop.url) await expect(page).toHaveURL(stop.url);
  await page.locator(stop.ready).first().waitFor();
  await waitForDomQuiet(page);
}

async function routerPush(page: Page, url: string): Promise<void> {
  await page.evaluate((to) => (window as unknown as { next: { router: { push: (u: string) => void } } }).next.router.push(to), url);
}

async function mapHoldsTheFolder(page: Page, hangTimeout?: number): Promise<void> {
  await page.waitForFunction(
    (count) =>
      Number(document.querySelector('[data-testid="ontology-map"]')?.getAttribute("data-source-node-count")) >= count,
    Math.floor(Object.keys(DOCS).length * 0.9),
    { timeout: hangTimeout },
  );
  await waitForPageSettled(page);
}

async function backToMap(page: Page): Promise<void> {
  await routerPush(page, "/en/topology/?guides=off");
  await mapHoldsTheFolder(page);
}

async function census(cdp: CDPSession): Promise<{ nodes: number; listeners: number }> {
  await cdp.send("HeapProfiler.collectGarbage");
  const { nodes, jsEventListeners } = await cdp.send("Memory.getDOMCounters");
  return { nodes, listeners: jsEventListeners };
}

test("three tours of every destination leave the map's DOM and listeners flat", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await stubDirectoryPicker(page, DOCS);
  await seedFirstRunSeen(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await page.goto("/en/topology/?guides=off");
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await mapHoldsTheFolder(page, 90_000);

  const afterTour: { nodes: number; listeners: number }[] = [];
  for (let tour = 1; tour <= 3; tour += 1) {
    for (const stop of STOPS) await visit(page, stop);
    await backToMap(page);
    afterTour.push(await census(cdp));
  }

  const [first, , third] = afterTour;
  const summary = afterTour.map((c, i) => `tour ${i + 1}: ${c.nodes} nodes, ${c.listeners} listeners`).join("; ");
  expect(third.nodes, summary).toBeLessThanOrEqual(Math.ceil(first.nodes * 1.05));
  expect(third.listeners, summary).toBeLessThanOrEqual(Math.ceil(first.listeners * 1.05));
});
