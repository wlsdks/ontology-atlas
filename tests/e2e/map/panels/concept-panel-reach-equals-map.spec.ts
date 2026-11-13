import { expect, test, type Page } from "@playwright/test";

import "../../atlas-map-probe";
import { seedFirstRunSeen } from "../../first-run-seed";
import { waitForMapStill } from "../../settle";
import { stubDirectoryPicker } from "../../vault-picker-stub";
import type { DialProbe } from "../../../../src/widgets/ontology-map/dial/types";

const DOMAINS = ["orders", "payments", "catalog", "shipping"] as const;
const CAPABILITIES_PER_DOMAIN = 4;
/** Directed needs across and inside domains, one hub everything leans on, and a capability no one touches. */
const DEPENDS: readonly [string, string][] = [
  ["orders-0", "payments-0"], ["orders-0", "catalog-0"], ["orders-0", "catalog-1"], ["orders-0", "shipping-0"],
  ["orders-0", "orders-1"], ["orders-1", "catalog-0"], ["orders-2", "payments-1"], ["shipping-0", "orders-0"],
  ["shipping-1", "orders-0"], ["payments-2", "orders-0"], ["catalog-2", "catalog-0"], ["shipping-2", "catalog-0"],
  ["payments-0", "catalog-0"], ["payments-1", "catalog-0"], ["catalog-3", "catalog-0"], ["shipping-3", "payments-0"],
];
const RELATES: readonly [string, string][] = [["orders-0", "shipping-3"], ["payments-3", "catalog-3"]];

/** Four domains of four capabilities, plus a legacy domain of one. */
const MARKS = DOMAINS.length * (1 + CAPABILITIES_PER_DOMAIN) + 2;

function generatedVault(): Record<string, string> {
  const files: Record<string, string> = {};
  const body = (title: string) => `\n# ${title}\n\n${title} keeps one boundary of the product honest.\n`;
  const list = (refs: string[]) => `[${refs.join(", ")}]`;
  files["atlas.md"] = `---\nkind: project\ntitle: Atlas\nslug: atlas\ndomains: ${list([...DOMAINS, "legacy"].map((d) => `domains/${d}`))}\n---\n${body("Atlas")}`;
  for (const name of DOMAINS) {
    const capabilities = Array.from({ length: CAPABILITIES_PER_DOMAIN }, (_, c) => `capabilities/${name}-${c}`);
    files[`domains/${name}.md`] = `---\nkind: domain\ntitle: ${name}\ncapabilities: ${list(capabilities)}\n---\n${body(name)}`;
    for (let c = 0; c < CAPABILITIES_PER_DOMAIN; c += 1) {
      const slug = `${name}-${c}`;
      const needs = DEPENDS.filter(([from]) => from === slug).map(([, to]) => `capabilities/${to}`);
      const relates = RELATES.filter(([from]) => from === slug).map(([, to]) => `capabilities/${to}`);
      files[`capabilities/${slug}.md`] = [
        "---",
        "kind: capability",
        `title: ${name} step ${c}`,
        `domain: domains/${name}`,
        ...(needs.length ? [`depends_on: ${list(needs)}`, `relation_notes: { ${needs[0]}: "${slug} cannot finish without it." }`] : []),
        ...(relates.length ? [`relates: ${list(relates)}`] : []),
        "---",
      ].join("\n") + body(`${name} step ${c}`);
    }
  }
  files["domains/legacy.md"] = `---\nkind: domain\ntitle: legacy\nbroader: [domains/catalog]\ncapabilities: [capabilities/legacy-0]\n---\n${body("legacy")}`;
  files["capabilities/legacy-0.md"] = `---\nkind: capability\ntitle: legacy step 0\ndomain: domains/legacy\n---\n${body("legacy step 0")}`;
  files["docs/adr-1.md"] = `---\nkind: document\ntitle: ADR 1\ndescribes: [capabilities/orders-0, capabilities/payments-0]\n---\n${body("ADR 1")}`;
  return files;
}

async function openVault(page: Page): Promise<void> {
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, generatedVault());
  await page.goto("/en/topology/?guides=off&e2e=1", { waitUntil: "networkidle" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  const marks = MARKS;
  await page.waitForFunction((count) => {
    const dial = window.__atlasMap?.dial?.() as DialProbe | undefined;
    const drawn = window.__atlasMap?.nodes().filter((n) => n.kind === "domain" || n.kind === "capability").length;
    return dial?.owns === true && dial.placement.state === "settled" && drawn === count && document.querySelector("[data-vault-load-progress]") === null;
  }, marks, { timeout: 120_000 });
  await waitForMapStill(page);
}

/** Selects through the URL the map already reads, without reloading the picked folder. */
async function select(page: Page, id: string): Promise<void> {
  await page.evaluate((nodeId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("p", nodeId);
    (window as unknown as { next: { router: { push: (href: string) => void } } }).next.router.push(`${url.pathname}${url.search}`);
  }, id);
  await expect(page.getByTestId("map-detail-panel")).toHaveAttribute("data-selected-node-id", id);
  await page.waitForFunction((nodeId) => window.__atlasMap!.selection().nodeId === nodeId, id);
  await waitForMapStill(page);
}

/** The map's count line under the selection, as the canvas wrote it. */
const countLine = (page: Page, id: string) =>
  page.evaluate((nodeId) => {
    const dial = window.__atlasMap!.dial!() as DialProbe;
    return dial.texts.find((t) => t.id === nodeId && t.role === "status")?.text ?? "";
  }, id);

async function panelGroup(page: Page, key: "needs" | "neededBy"): Promise<{ total: number; rows: string[]; kinds: string[] }> {
  const group = page.locator(`[data-testid="map-detail-panel"] [data-datasheet-group="${key}"]`);
  if ((await group.count()) === 0) return { total: 0, rows: [], kinds: [] };
  const more = group.locator(`[data-datasheet-group-overflow="${key}"]`);
  if ((await more.count()) > 0 && (await more.getAttribute("aria-expanded")) === "false") await more.click();
  const total = Number(await group.locator(`[data-datasheet-group-total="${key}"]`).textContent());
  const rows = await group.locator("[data-datasheet-connection]").evaluateAll((els) => els.map((el) => el.getAttribute("data-datasheet-connection")!));
  return { total, rows, kinds: rows.map((id) => id.split(":")[0]!) };
}

test("each capability's and domain's reach groups hold what the map's count line counts, and no document", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 949 });
  await openVault(page);
  const ids = await page.evaluate(() => window.__atlasMap!.nodes().filter((n) => n.kind === "domain" || n.kind === "capability").map((n) => n.id));
  expect(ids.length).toBe(MARKS);
  const seen: string[] = [];
  for (const id of ids) {
    await select(page, id);
    const needs = await panelGroup(page, "needs");
    const neededBy = await panelGroup(page, "neededBy");
    expect(needs.rows.length, `${id}: every needs row opens`).toBe(needs.total);
    expect(neededBy.rows.length, `${id}: every needed-by row opens`).toBe(neededBy.total);
    expect([...needs.kinds, ...neededBy.kinds], `${id}: no document is reach`).not.toContain("document");
    const expected = [needs.total > 0 ? `needs ${needs.total}` : null, neededBy.total > 0 ? `needed by ${neededBy.total}` : null]
      .filter(Boolean)
      .join(" · ");
    expect(await countLine(page, id), `${id}: the map's count line is the panel's`).toBe(expected);
    seen.push(`${id} ${needs.total}/${neededBy.total}`);
  }
  // The capability a document describes and three others need: the panel used to count the document.
  expect(seen).toContain("capability:orders-0 5/3");
  // A domain with only a broader concept needs nothing and is needed by nothing.
  expect(seen).toContain("domain:legacy 0/0");
});
