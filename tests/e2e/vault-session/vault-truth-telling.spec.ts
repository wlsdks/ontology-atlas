import { expect, test, type Page } from "@playwright/test";
import { installDesktopRailRuntime } from "../desktop-rail-arrival-harness";
import { waitForAnimationsDone } from "../settle";
import { BROKEN_VAULT } from "../fixtures/broken-vault";

/**
 * Defective-vault reader diagnostics: exact errors, untyped documents and map evidence; a healthy
 * sample cannot exercise these.
 */

async function loadVault(page: Page, seed: Record<string, string>) {
  await installDesktopRailRuntime(page, seed, undefined, { replaceFixture: true });
  await page.goto("/ko/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-open").click();
  await page.getByTestId("app-nav-rail").waitFor({ timeout: 60_000 });
}

/**
 * Opens the requested file through its honest reader context.
 *
 * Typed ontology nodes arrive in Library's fixed Ontology reader. Untyped files stay
 * reachable only through `/docs`' exact-document compatibility reader. The opened filename
 * is verified every time below, so the instrument cannot measure an unintended fallback.
 */
async function openDocument(page: Page, slug: string) {
  await page.goto(`/ko/docs/?guides=off&slug=${encodeURIComponent(slug)}`);
  await page.waitForLoadState("networkidle");
}

/** Opens one document and measures whether that file states its own problems. */
async function measureDoc(page: Page, title: string, expectFile: string) {
  await expect(page.getByRole("heading", { name: title, exact: false }).first()).toBeVisible();
  // The document the instrument meant has rendered, with its meta bar. The validator's 400ms
  // debounce re-validates only a draft being edited; at rest it validates on mount.
  await expect(page.locator('main [data-testid="docs-editor-path"]')).toHaveText(expectFile);
  await expect(page.getByTestId("doc-map-evidence").first()).toBeAttached();
  await waitForAnimationsDone(page.locator("main"));
  const measured = await page.evaluate(() => {
    const block = document.querySelector('[data-testid="doc-frontmatter-block"]');
    const diagnostics = Array.from(
      document.querySelectorAll('[data-testid="doc-frontmatter-issue"]'),
    ).map((el) => ({
      severity: el.getAttribute("data-severity") ?? "",
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
    }));
    const proof = document.querySelector('[data-testid="doc-map-evidence"]');
    const mapLink = document.querySelector<HTMLAnchorElement>('[data-testid="doc-map-open"]');
    const stripLink = document.querySelector<HTMLAnchorElement>(
      '[data-testid="docs-backlinks-open-in-map"]',
    );
    const header = document.querySelector('main [data-testid="docs-editor-path"]');
    return {
      openedFile: (header?.textContent ?? "").trim(),
      hasBlock: Boolean(block),
      blockVariant: block?.getAttribute("data-variant") ?? "",
      diagnostics,
      proofLabel: (proof?.textContent ?? "").replace(/\s+/g, " ").trim(),
      proofState: proof?.getAttribute("data-in-graph") ?? "",
      mapHref: mapLink?.getAttribute("href") ?? null,
      stripMapHref: stripLink?.getAttribute("href") ?? null,
    };
  });
  // Did the instrument really open the screen it meant to measure? Without this line
  // the spec could measure the wrong document eight times and stay green (it nearly
  // did).
  expect(measured.openedFile, "was the document under measurement opened").toBe(expectFile);
  return measured;
}

test.describe("defective vault: does the screen state the check result", () => {
  test("(2) errors show beside the file, not only warnings", async ({ page }) => {
    await loadVault(page, BROKEN_VAULT);
    await openDocument(page, "capabilities/checkout");
    const checkout = await measureDoc(page, "결제하기", "capabilities/checkout.md");
    console.log("[doc/checkout]", JSON.stringify(checkout));
    expect(checkout.hasBlock).toBe(true);
    const severities = checkout.diagnostics.map((d) => d.severity);
    expect(severities, "missing-uid is an error; showing only warnings is exactly backwards").toContain(
      "error",
    );
    expect(severities, "warnings on the same document must keep showing").toContain("warning");
  });

  test("(3) a document without kind states its own problem", async ({ page }) => {
    await loadVault(page, BROKEN_VAULT);
    await openDocument(page, "notes/handover");
    const note = await measureDoc(page, "인수인계 메모", "notes/handover.md");
    console.log("[doc/handover]", JSON.stringify(note));
    expect(
      note.hasBlock,
      "without kind the block itself was not drawn, so the most common path to disappearing stays silent",
    ).toBe(true);
    expect(note.diagnostics.length).toBeGreaterThan(0);

    await openDocument(page, "elements/ghost");
    const ghost = await measureDoc(page, "유령 모듈", "elements/ghost.md");
    console.log("[doc/ghost]", JSON.stringify(ghost));
    expect(ghost.hasBlock, "the same holds when kind is empty").toBe(true);
    expect(ghost.diagnostics.map((d) => d.severity)).toContain("error");
  });

  test("(4) a document absent from the map claims no map evidence and has no dead CTA", async ({
    page,
  }) => {
    await loadVault(page, BROKEN_VAULT);
    await openDocument(page, "notes/handover");
    // `notes/handover` has no kind, so it is not a graph node.
    const note = await measureDoc(page, "인수인계 메모", "notes/handover.md");
    console.log("[doc/handover-map]", JSON.stringify(note));
    expect(note.proofState, "the document is not in the graph").toBe("false");
    expect(note.mapHref, "without a ?p= the open-on-map action is not rendered at all").toBeNull();
    // The bottom backlink strip's "open in map" is **the originally measured defect**:
    // a `?? '/topology/'` fallback rendered an address with no `?p=`, so pressing it
    // selected nothing.
    expect(
      note.stripMapHref,
      "the bottom strip follows the same rule: no node to hold means no link",
    ).toBeNull();

    // A node that really exists in the graph must say the opposite.
    await openDocument(page, "domains/orders");
    const domain = await measureDoc(page, "주문", "domains/orders.md");
    console.log("[doc/orders]", JSON.stringify(domain));
    expect(domain.proofState).toBe("true");
    expect(domain.mapHref ?? "").toContain("p=");
    expect(domain.stripMapHref ?? "", "with a node, the strip link stays alive").toContain("p=");
  });
});
