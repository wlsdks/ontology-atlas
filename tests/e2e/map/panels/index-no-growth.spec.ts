import { expect, test, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";
import { stubDirectoryPicker, writeFolderBeforePick } from "../../vault-picker-stub";

/**
 * The INDEX has one job, getting to a concept, so a selection made on the map must not change its
 * shape: the panel and its footer stay where they were, the tree does not scroll, and the nearest
 * visible row above a hidden selection is marked instead of opened.
 */

const DOMAINS = ["orders", "payments", "shipping", "catalog", "inventory", "returns", "sellers", "platform"];
const CAPABILITIES_PER_DOMAIN = 4;
const ELEMENTS_PER_CAPABILITY = 2;

const body = (title: string) => `\n${title} keeps one boundary of the product honest.\n\n## Includes\n- One responsibility.\n`;

function folder(): Record<string, string> {
  const files: Record<string, string> = {};
  const domains = DOMAINS.map((name) => `domains/${name}`);
  files["atlas.md"] = `---\nkind: project\ntitle: Commerce platform\nslug: atlas\ndomains: [${domains.join(", ")}]\n---\n${body("Commerce platform")}`;
  for (const [d, domain] of domains.entries()) {
    files[`${domain}.md`] = `---\nkind: domain\ntitle: Domain ${DOMAINS[d]}\n---\n${body(domain)}`;
    for (let c = 0; c < CAPABILITIES_PER_DOMAIN; c += 1) {
      const capability = `capabilities/${DOMAINS[d]}-${c}`;
      const elements = Array.from({ length: ELEMENTS_PER_CAPABILITY }, (_, e) => `elements/${DOMAINS[d]}-${c}-${e}`);
      for (const element of elements) files[`${element}.md`] = `---\nkind: element\ntitle: Element ${element.slice(9)}\n---\n${body(element)}`;
      files[`${capability}.md`] = `---\nkind: capability\ntitle: Capability ${DOMAINS[d]} ${c}\ndomain: ${domain}\nelements: [${elements.join(", ")}]\n---\n${body(capability)}`;
    }
  }
  files["adr-002.md"] = `---\nkind: document\ntitle: ADR 002 one order per checkout\ndescribes: [capabilities/orders-0]\n---\n${body("ADR 002")}`;
  files["notes/untyped.md"] = "# A note with no kind\n\nNot on the map yet.\n";
  return files;
}

/**
 * The five example concepts, one per kind, and the row expected to carry the mark. A document has
 * no INDEX row and no Flat mark, so it is addressed by id and leaves the tree unmarked.
 */
const EXAMPLES: ReadonlyArray<{ title: string; id?: string; holder: string | null; row: boolean }> = [
  { title: "Capability orders 0", holder: "Domain orders", row: true },
  { title: "Domain payments", holder: null, row: true },
  { title: "Element shipping-1-0", holder: "Domain shipping", row: true },
  { title: "ADR 002 one order per checkout", id: "document:adr-002", holder: null, row: false },
  { title: "Commerce platform", holder: null, row: true },
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1512, height: 949 },
] as const;

const PANEL = '[data-testid="topology-index-panel"]';

function measure(page: Page) {
  return page.evaluate((panelSelector) => {
    const panel = document.querySelector<HTMLElement>(panelSelector)!;
    const tree = panel.querySelector<HTMLElement>('[data-testid="topology-index-tree"]')!;
    const footer = panel.querySelector<HTMLElement>('[data-testid="topology-index-uncataloged-docs"]');
    const titleOf = (row: Element | null) => row?.querySelector(".truncate")?.textContent?.trim() ?? null;
    return {
      height: panel.getBoundingClientRect().height,
      footerTop: footer ? footer.getBoundingClientRect().top : null,
      treeScroll: tree.scrollTop,
      marked: [...panel.querySelectorAll("[data-holds-selection]")].map(titleOf),
      selected: [...panel.querySelectorAll('[role="treeitem"][aria-selected="true"]')].map(titleOf),
      open: [...panel.querySelectorAll('[role="treeitem"][aria-expanded="true"]')].map(titleOf),
    };
  }, PANEL);
}

async function nodeIdByTitle(page: Page, title: string): Promise<string> {
  const id = await page.evaluate((wanted) => window.__atlasMap?.nodes().find((node) => node.label === wanted)?.id ?? null, title);
  expect(id, `the map has no concept titled ${title}`).not.toBeNull();
  return id!;
}

async function select(page: Page, id: string) {
  await page.evaluate(
    (nodeId) =>
      (window as unknown as { next: { router: { push: (url: string) => void } } }).next.router.push(
        `/en/topology/?e2e=1&guides=off&p=${encodeURIComponent(nodeId)}`,
      ),
    id,
  );
  await expect(page.getByTestId("map-detail-panel")).toHaveAttribute("data-selected-node-id", id);
  await waitForMapStill(page);
}

for (const viewport of VIEWPORTS) {
  test(`at ${viewport.width}x${viewport.height} a selection marks its place in the INDEX without growing or scrolling it`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await seedFirstRunSeen(page);
    await stubDirectoryPicker(page, {});
    await page.goto("/en/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
    await writeFolderBeforePick(page, folder());
    await page.waitForFunction(() => "__atlasMap" in window);
    await page.getByTestId("topology-switch-to-my-data").click();
    await expect(page.locator(`${PANEL} [data-testid="topology-index-uncataloged-docs"]`)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("topology-index-source"), "the folder line outlived the read").toHaveCount(0);
    await waitForMapStill(page);

    const rest = await measure(page);
    expect(rest.open, "at rest the project is open and its domains closed").toEqual(["Commerce platform"]);
    console.log(`[index] ${viewport.width}x${viewport.height} at rest: panel ${Math.round(rest.height)} px`);

    for (const example of EXAMPLES) {
      await select(page, example.id ?? (await nodeIdByTitle(page, example.title)));
      const after = await measure(page);
      console.log(`[index] ${viewport.width}x${viewport.height} ${example.title}: panel ${Math.round(after.height)} px`);
      expect(Math.abs(after.height - rest.height), `${example.title}: the panel changed height`).toBeLessThanOrEqual(1);
      expect(Math.abs(after.footerTop! - rest.footerTop!), `${example.title}: the footer row moved`).toBeLessThanOrEqual(1);
      expect(after.treeScroll, `${example.title}: the tree scrolled`).toBe(rest.treeScroll);
      expect(after.open, `${example.title}: a selection opened rows`).toEqual(rest.open);
      if (example.holder) {
        expect(after.marked, `${example.title}: the nearest visible row is not marked`).toEqual([example.holder]);
        expect(after.selected).toEqual([]);
      } else {
        expect(after.marked, `${example.title}: a visible selection still marked a row`).toEqual([]);
        expect(after.selected, `${example.title}: the visible row is not styled as selected`).toEqual(example.row ? [example.title] : []);
      }
    }

    // Opening the marked row moves the mark onto the row it reveals.
    await select(page, await nodeIdByTitle(page, "Element shipping-1-0"));
    await page.locator(`${PANEL} [data-holds-selection]`).press("ArrowRight");
    await expect.poll(async () => (await measure(page)).marked).toEqual(["Capability shipping 1"]);
  });
}
