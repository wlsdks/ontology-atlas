import { expect, test } from "@playwright/test";
import { buildProjectSourceGraphHash } from "../../../../mcp/src/project-source-graph-hash.mjs";
import { buildProjectSourceReceipt } from "../../../../mcp/src/project-source-mint.mjs";
import { installDesktopRailRuntime, mountDesktopVault } from "../../desktop-rail-arrival-harness";

const documents = [
  { slug: "storefront", frontmatter: { kind: "project", title: "Storefront", domains: ["domains/order"] } },
  { slug: "domains/order", frontmatter: { kind: "domain", title: "Order", capabilities: ["capabilities/checkout"] } },
  { slug: "capabilities/checkout", frontmatter: { kind: "capability", title: "Checkout", domain: "domains/order", elements: ["elements/checkout"] } },
  { slug: "elements/checkout", frontmatter: { kind: "element", title: "Checkout implementation", domain: "domains/order", path: "src/missing-checkout.ts" } },
];
const otherDocuments = [
  { slug: "other", frontmatter: { kind: "project", title: "Other", domains: ["domains/other"] } },
  { slug: "domains/other", frontmatter: { kind: "domain", title: "Other domain", capabilities: ["capabilities/foreign"] } },
  { slug: "capabilities/foreign", frontmatter: { kind: "capability", title: "Foreign", domain: "domains/other", path: "src/missing-checkout.ts" } },
];
const files = Object.fromEntries([...documents, ...otherDocuments].map((doc, index) => [
  `${doc.slug}.md`,
  `---\nuid: 11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}\nslug: ${doc.slug}\n${Object.entries(doc.frontmatter).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n\n${doc.frontmatter.title} responsibility.\n`,
]));
const probe = { sourceId: "repair-source", kind: "git", revision: "abc", fingerprint: "git:abc:clean", dirty: false, truncated: false, files: [] };
function sidecar(target: string, sourcePath = "src/missing-checkout.ts") {
  const receipt = buildProjectSourceReceipt({
    projectSlug: "storefront",
    graphHash: buildProjectSourceGraphHash("storefront", documents.map((doc) => doc.slug === "elements/checkout" ? { ...doc, frontmatter: { ...doc.frontmatter, path: sourcePath } } : doc)),
    probe,
    witnesses: [{ id: `${target}:path`, nodeSlug: target, role: "implementation", path: sourcePath }],
    measuredAt: "2026-10-11T00:00:00.000Z",
  });
  return JSON.stringify({ contractVersion: 1, bindings: [{ projectSlug: "storefront", sourceId: probe.sourceId, rootPath: "/private/source-repair-fixture", kind: "git", boundAt: receipt.measuredAt, receipt }] });
}

for (const target of ["elements/checkout", "elements/deleted", "capabilities/foreign"]) {
  test(`source repair ${target === "elements/checkout" ? "opens its affected concept" : `recovers from ${target}`}`, async ({ page }) => {
    await page.setViewportSize({ width: 1512, height: 949 });
    await installDesktopRailRuntime(page, { ...files, ".ontology-atlas/project-sources.json": sidecar(target) }, undefined, { replaceFixture: true });
    await mountDesktopVault(page);
    await page.goto("/en/topology/?e2e=1&guides=off&p=project%3Astorefront", { waitUntil: "domcontentloaded" });
    const receipt = page.getByTestId("map-project-source-receipt");
    await expect(receipt).toBeVisible();
    if (process.env.REPAIR_CAPTURE_DIR) await page.screenshot({ path: `${process.env.REPAIR_CAPTURE_DIR}/${target.replace("/", "-")}-before.png` });
    if (target === "elements/checkout") {
      await expect(page.getByTestId("map-project-source-remedy")).toContainText("src/missing-checkout.ts");
      const repair = page.getByRole("button", { name: "Fix code location", exact: true });
      await repair.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByTestId("full-detail-a1").getByRole("heading", { level: 1 })).toHaveText("Checkout implementation");
      await expect(page.getByTestId("full-detail-a1")).toHaveAttribute("data-fulldetail-node", "element:checkout");
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("full-detail-a1")).toHaveCount(0);
      await page.goto("/en/topology/?e2e=1&guides=off&p=project%3Astorefront", { waitUntil: "domcontentloaded" });
      await expect(receipt).toHaveAttribute("data-source-action", "repair_source_path");
      await page.getByRole("button", { name: "Full detail", exact: true }).click();
      const fullDetail = page.getByTestId("full-detail-a1");
      await expect(fullDetail.getByRole("heading", { level: 1 })).toHaveText("Storefront");
      await expect(fullDetail).toContainText("nextActionTarget: elements/checkout");
      await expect(fullDetail).toContainText("missingSourcePath: src/missing-checkout.ts");
      await expect(fullDetail).not.toContainText("/private/source-repair-fixture");
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await fullDetail.getByTestId("full-detail-a1-handoff-copy").click();
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).toContain("nextActionTarget: elements/checkout");
      expect(copied).toContain("missingSourcePath: src/missing-checkout.ts");
      expect(copied).not.toContain("/private/source-repair-fixture");
      await fullDetail.getByRole("button", { name: "Fix code location", exact: true }).click();
      await expect(fullDetail.getByRole("heading", { level: 1 })).toHaveText("Checkout implementation");
    } else {
      await expect(receipt).toHaveAttribute("data-source-action", "remeasure_source");
      await expect(receipt).toHaveAttribute("data-source-top-gap", "receipt_malformed");
      await expect(page.getByTestId("full-detail-a1")).toHaveCount(0);
    }
    if (process.env.REPAIR_CAPTURE_DIR) await page.screenshot({ path: `${process.env.REPAIR_CAPTURE_DIR}/${target.replace("/", "-")}-after.png` });
  });
}

test("keeps a long missing filename readable inside the repair panel", async ({ page }) => {
  const sourcePath = `src/${"missing".repeat(45)}.ts`;
  await page.setViewportSize({ width: 1512, height: 949 });
  await installDesktopRailRuntime(page, {
    ...files,
    "elements/checkout.md": files["elements/checkout.md"].replace("src/missing-checkout.ts", sourcePath),
    ".ontology-atlas/project-sources.json": sidecar("elements/checkout", sourcePath),
  }, undefined, { replaceFixture: true });
  await mountDesktopVault(page);
  await page.goto("/en/topology/?e2e=1&guides=off&p=project%3Astorefront", { waitUntil: "domcontentloaded" });
  const reason = page.getByTestId("map-project-source-why");
  await expect(reason).toContainText(sourcePath);
  const bounds = await reason.evaluate((element) => ({ width: element.clientWidth, content: element.scrollWidth }));
  console.log(`[source-repair] long path width ${bounds.width}, content ${bounds.content}`);
  expect(bounds.content).toBeLessThanOrEqual(bounds.width);
});
