import { expect, test, type Page } from "@playwright/test";
import { buildProjectSourceGraphHash } from "../../../../mcp/src/project-source/project-source-graph-hash.mjs";
import { buildProjectSourceReceipt } from "../../../../mcp/src/project-source/project-source-mint.mjs";
import { installDesktopRailRuntime, mountDesktopVault } from "../../desktop-rail-arrival-harness";

const documents = [
  { slug: "storefront", frontmatter: { kind: "project", title: "Storefront", domains: ["domains/order"] } },
  { slug: "domains/order", frontmatter: { kind: "domain", title: "Order", capabilities: ["capabilities/checkout"] } },
  { slug: "capabilities/checkout", frontmatter: { kind: "capability", title: "Checkout", domain: "domains/order", elements: ["elements/cart"] } },
  { slug: "elements/cart", frontmatter: { kind: "element", title: "Cart", domain: "domains/order" } },
];
const files = Object.fromEntries(documents.map((doc, index) => [
  `${doc.slug}.md`,
  `---\nuid: 11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}\nslug: ${doc.slug}\n${Object.entries(doc.frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n\n${doc.frontmatter.title} body.\n`,
]));
const probe = { sourceId: "role-source", kind: "git", revision: "abc", fingerprint: "git:abc:clean", dirty: false, truncated: false, files: ["src/checkout.ts"] };
// No document names a `path`, so the receipt asks for code locations.
const receipt = buildProjectSourceReceipt({
  projectSlug: "storefront",
  graphHash: buildProjectSourceGraphHash("storefront", documents),
  probe,
  witnesses: [],
  measuredAt: "2026-10-11T00:00:00.000Z",
});
const sidecar = JSON.stringify({ contractVersion: 1, bindings: [{ projectSlug: "storefront", sourceId: probe.sourceId, rootPath: "/private/source-role-fixture", kind: "git", boundAt: receipt.measuredAt, receipt }] });
const vault = { ...files, ".ontology-atlas/project-sources.json": sidecar };
const RUNTIME = { id: "codex-acp", label: "Codex", verified: true, isolated: true, icon: null, brandInk: null, description: "", website: null, license: null, launchKind: "npx", cliPath: "/fixture/cli", adapterPath: null, adapterPackage: "@agentclientprotocol/codex-acp", state: "ready" };
const REQUEST_OPENING = "Find the capabilities and elements in this folder whose `path` is empty.";

async function openProjectPanel(page: Page) {
  await page.setViewportSize({ width: 1512, height: 949 });
  await mountDesktopVault(page);
  await page.goto("/en/topology/?e2e=1&guides=off&p=project%3Astorefront", { waitUntil: "domcontentloaded" });
  const panel = page.getByTestId("map-project-source-receipt");
  await expect(panel).toHaveAttribute("data-source-action", "record_source_role");
  return panel;
}

const REQUEST_PATTERN = new RegExp(`^${REQUEST_OPENING.replace(/[.`]/g, "\\$&")}`);
const sentAnything = (page: Page) =>
  page.evaluate(() => (window as unknown as { __nativeCalls: { command: string }[] }).__nativeCalls.some((call) => call.command === "acp_send"));

test("a folder with no code locations hands the request to the ready in-app agent", async ({ page }) => {
  await installDesktopRailRuntime(page, vault, { fast: [RUNTIME], probed: [RUNTIME] }, { replaceFixture: true });
  await openProjectPanel(page);

  await page.getByTestId("map-project-source-action").click();
  await expect(page.getByTestId("acp-chat-panel").getByRole("textbox")).toHaveValue(REQUEST_PATTERN);
  await expect(page.getByTestId("full-detail-a1")).toHaveCount(0);
  // Seating a request never sends it.
  expect(await sentAnything(page)).toBe(false);
});

test("the same step inside the project's full detail closes the dialog over the chat", async ({ page }) => {
  await installDesktopRailRuntime(page, vault, { fast: [RUNTIME], probed: [RUNTIME] }, { replaceFixture: true });
  await openProjectPanel(page);

  await page.getByRole("button", { name: "Details", exact: true }).click();
  const fullDetail = page.getByTestId("full-detail-a1");
  await fullDetail.getByRole("button", { name: "Ask the agent", exact: true }).click();
  await expect(fullDetail).toHaveCount(0);
  await expect(page.getByTestId("acp-chat-panel").getByRole("textbox")).toHaveValue(REQUEST_PATTERN);
  expect(await sentAnything(page)).toBe(false);
});

test("without an in-app agent the same step copies the request", async ({ page }) => {
  await installDesktopRailRuntime(page, vault, undefined, { replaceFixture: true });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await openProjectPanel(page);

  const action = page.getByTestId("map-project-source-action");
  await expect(action).toHaveText("Copy the request");
  await action.click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(REQUEST_OPENING);
  await expect(page.getByTestId("full-detail-a1")).toHaveCount(0);
});
