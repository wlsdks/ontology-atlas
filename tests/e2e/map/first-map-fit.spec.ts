import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

import "../atlas-map-probe";
import { installDesktopRailRuntime } from "../desktop-rail-arrival-harness";
import { openMapOnApp } from "./open-map-on-app";
import { waitForMapStill } from "../settle";
import type { DialProbe } from "../../../src/widgets/ontology-map/dial/dial-shapes";

/** One project, six domains whose titles are long enough to collide, eighteen capabilities and one shared element. */
const DOMAINS: readonly (readonly [title: string, capabilities: readonly string[]])[] = [
  ["Accounts", ["Manage customer types", "Manage customers and staff", "Manage own account", "Sign in and manage tokens"]],
  ["Catalogue and Promotions", ["Issue vouchers", "Manage attributes", "Manage channels", "Run promotions", "Run sales"]],
  ["Checkout and Orders", ["Build checkouts", "Cancel orders", "Complete a checkout", "Fulfill orders"]],
  ["Extensions", ["Manage apps", "Notify apps by webhook"]],
  ["Inventory", ["Allocate stock"]],
  ["Payments", ["Process payments", "Request refunds"]],
];
const ELEMENT = "Plugins Manager";
const DEPENDENCIES: Readonly<Record<string, readonly string[]>> = {
  "Cancel orders": ["Allocate stock", "Notify apps by webhook"],
  "Complete a checkout": ["Allocate stock", "Build checkouts", "Process payments", ELEMENT],
  "Fulfill orders": [ELEMENT],
  "Notify apps by webhook": ["Manage apps"],
  "Process payments": [ELEMENT],
  "Request refunds": ["Manage apps", ELEMENT],
};
const USES_ELEMENT = new Set(["Complete a checkout", "Process payments"]);

/**
 * Share of the free canvas, on its fuller axis, that the domain titles' bounding box must span.
 * Measured at these sizes: 0.66 to 0.76 fitted to the folder, 0.36 to 0.56 left at the bundled sample's fit.
 */
const MIN_TITLE_SPAN = 0.6;

const kebab = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const domainSlug = (title: string) => `domains/${kebab(title)}`;
const conceptSlug = (title: string) => (title === ELEMENT ? `elements/${kebab(title)}` : `capabilities/${kebab(title)}`);
const uid = (slug: string) => {
  const hex = createHash("sha256").update(slug).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const list = (slugs: readonly string[]) => `[${slugs.join(", ")}]`;
const note = (slug: string, fields: readonly string[], title: string) =>
  ["---", `uid: ${uid(slug)}`, `slug: ${slug}`, ...fields, `title: ${title}`, "---", "", `# ${title}`, ""].join("\n");

function folder(): Record<string, string> {
  const files: Record<string, string> = {
    "commerce.md": note("commerce", ["kind: project", `domains: ${list(DOMAINS.map(([title]) => domainSlug(title)))}`], "Commerce"),
    "elements/plugins-manager.md": note(conceptSlug(ELEMENT), ["kind: element", "domain: domains/extensions", "path: commerce/plugins/manager.py"], ELEMENT),
  };
  for (const [title, capabilities] of DOMAINS) {
    const extra = title === "Extensions" ? [`elements: ${list([conceptSlug(ELEMENT)])}`] : [];
    files[`${domainSlug(title)}.md`] = note(domainSlug(title), ["kind: domain", `capabilities: ${list(capabilities.map(conceptSlug))}`, ...extra], title);
    for (const capability of capabilities) {
      const fields = [
        "kind: capability",
        `domain: ${domainSlug(title)}`,
        `elements: ${list(USES_ELEMENT.has(capability) ? [conceptSlug(ELEMENT)] : [])}`,
        ...(DEPENDENCIES[capability] ? [`dependencies: ${list(DEPENDENCIES[capability].map(conceptSlug))}`] : []),
      ];
      files[`${conceptSlug(capability)}.md`] = note(conceptSlug(capability), fields, capability);
    }
  }
  return files;
}

const FOLDER = folder();
const CONCEPTS = Object.keys(FOLDER).length;

/** Opens the folder once through the picker, then reopens the map the way a returning person does. */
async function reopenFolder(page: Page): Promise<DialProbe> {
  await installDesktopRailRuntime(page, FOLDER, undefined, { replaceFixture: true });
  await openMapOnApp(page, "/en/topology/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator(`[data-testid="topology-scope-readout"][data-total-concepts="${CONCEPTS}"]`)).toBeVisible();
  await waitForMapStill(page, { what: "camera" });
  await waitForMapStill(page);
  return page.evaluate(() => window.__atlasMap!.dial!() as DialProbe);
}

function overlappingTitles(titles: DialProbe["texts"]): string[] {
  const hits: string[] = [];
  for (let i = 0; i < titles.length; i += 1) {
    for (let j = i + 1; j < titles.length; j += 1) {
      const a = titles[i]!.box;
      const b = titles[j]!.box;
      if (a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY) hits.push(`${titles[i]!.text} × ${titles[j]!.text}`);
    }
  }
  return hits;
}

for (const viewport of [{ width: 1280, height: 1080 }, { width: 1280, height: 800 }, { width: 1920, height: 1080 }]) {
  test(`a folder reopened at ${viewport.width}x${viewport.height} opens spread over the free canvas with no domain title over another`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const dial = await reopenFolder(page);
    const titles = dial.texts.filter((t) => t.role === "domain");
    expect(titles.map((t) => t.text).sort(), "every domain draws its title").toEqual(DOMAINS.map(([title]) => title).sort());
    const free = dial.freeRect;
    const across = (Math.max(...titles.map((t) => t.box.maxX)) - Math.min(...titles.map((t) => t.box.minX))) / (free.maxX - free.minX);
    const down = (Math.max(...titles.map((t) => t.box.maxY)) - Math.min(...titles.map((t) => t.box.minY))) / (free.maxY - free.minY);
    const span = Math.max(across, down);
    console.log(`[first-map-fit] ${viewport.width}x${viewport.height} titles span ${across.toFixed(2)} across and ${down.toFixed(2)} down the free canvas`);
    expect(overlappingTitles(titles)).toEqual([]);
    expect(span, "share of the free canvas the domain titles span").toBeGreaterThanOrEqual(MIN_TITLE_SPAN);
  });
}
