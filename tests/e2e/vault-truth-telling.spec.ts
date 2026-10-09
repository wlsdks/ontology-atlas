import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForAnimationsDone } from "./settle";
import { stubDirectoryPicker } from "./vault-picker-stub";
import { BROKEN_VAULT } from "./fixtures/broken-vault";

/**
 * Defective-vault reader diagnostics: exact errors, untyped documents and map evidence.
 * The 2026-10-10 Analysis relationship/evidence decision retires the global repair list.
 * Its two list-only cases are removed; every reader diagnostic and positive/negative
 * map-evidence assertion remains. A healthy-looking sample cannot exercise these errors.
 */

async function loadVault(page: Page, seed: Record<string, string>) {
  await stubDirectoryPicker(page, seed);
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 20_000 });
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
  expect(measured.openedFile, "계측 대상 문서가 열렸는가").toBe(expectFile);
  return measured;
}

test.describe("결함 볼트 — 화면이 검사 결과를 말하는가", () => {
  test("② 오류가 파일 옆에서 보인다 (경고만 보여 주지 않는다)", async ({ page }) => {
    await loadVault(page, BROKEN_VAULT);
    await openDocument(page, "capabilities/checkout");
    const checkout = await measureDoc(page, "결제하기", "capabilities/checkout.md");
    console.log("[doc/checkout]", JSON.stringify(checkout));
    expect(checkout.hasBlock).toBe(true);
    const severities = checkout.diagnostics.map((d) => d.severity);
    expect(severities, "missing-uid 는 오류다 — 경고만 보이면 정확히 거꾸로다").toContain(
      "error",
    );
    expect(severities, "같은 문서의 경고도 계속 보여야 한다").toContain("warning");
  });

  test("③ kind 없는 문서가 자기 문제를 말한다", async ({ page }) => {
    await loadVault(page, BROKEN_VAULT);
    await openDocument(page, "notes/handover");
    const note = await measureDoc(page, "인수인계 메모", "notes/handover.md");
    console.log("[doc/handover]", JSON.stringify(note));
    expect(
      note.hasBlock,
      "kind 가 없으면 블록 자체가 안 그려졌다 — 사라지는 가장 흔한 경로가 침묵한다",
    ).toBe(true);
    expect(note.diagnostics.length).toBeGreaterThan(0);

    await openDocument(page, "elements/ghost");
    const ghost = await measureDoc(page, "유령 모듈", "elements/ghost.md");
    console.log("[doc/ghost]", JSON.stringify(ghost));
    expect(ghost.hasBlock, "kind 가 비었을 때도 같다").toBe(true);
    expect(ghost.diagnostics.map((d) => d.severity)).toContain("error");
  });

  test("④ 지도에 없는 문서는 「지도 근거」라고 말하지 않고, 죽은 CTA 도 없다", async ({
    page,
  }) => {
    await loadVault(page, BROKEN_VAULT);
    await openDocument(page, "notes/handover");
    // `notes/handover` has no kind, so it is not a graph node.
    const note = await measureDoc(page, "인수인계 메모", "notes/handover.md");
    console.log("[doc/handover-map]", JSON.stringify(note));
    expect(note.proofState, "그래프에 없는 문서다").toBe("false");
    expect(note.mapHref, "?p= 를 못 만들면 「지도에서 열기」 자체를 렌더하지 않는다").toBeNull();
    // The bottom backlink strip's "open in map" is **the originally measured defect**:
    // a `?? '/topology/'` fallback rendered an address with no `?p=`, so pressing it
    // selected nothing.
    expect(
      note.stripMapHref,
      "하단 스트립도 같은 규칙 — 잡을 노드가 없으면 링크가 없다",
    ).toBeNull();

    // A node that really exists in the graph must say the opposite.
    await openDocument(page, "domains/orders");
    const domain = await measureDoc(page, "주문", "domains/orders.md");
    console.log("[doc/orders]", JSON.stringify(domain));
    expect(domain.proofState).toBe("true");
    expect(domain.mapHref ?? "").toContain("p=");
    expect(domain.stripMapHref ?? "", "노드가 있으면 스트립 링크는 그대로 산다").toContain("p=");
  });
});
