import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";
import { BROKEN_VAULT, HEALTHY_VAULT } from "./fixtures/broken-vault";

/**
 * Does the screen **tell the truth about validation results** — a gate measured
 * with a defective vault.
 *
 * ## Why it has to be a defective vault
 *
 * Both the dogfood vault and the sample vault have 0 issues, so a gate asking
 * whether validation results appear on screen stayed green forever **with nothing to
 * see**. Measured 2026-08-04: opening a folder with 5 errors made four places lie at
 * once:
 *
 *   ① the readiness meter was 100% indigo (the danger segment measured 0px)
 *   ② the per-file diagnostics showed warnings and **hid errors**
 *   ③ documents without a `kind` had no diagnostics block rendered at all
 *   ④ a document absent from the map claimed to be "map evidence"
 *
 * None of the four can be reproduced on a healthy vault. So this spec **reproduces
 * the defects as data** and then measures the screen — and runs the same measurement
 * against a healthy vault to confirm the detector is not always-red.
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
 * The blocked-document rows on the "to do" tab, read as text.
 *
 * **What replaced the meter (2026-08-31).** This measurement used to read the readiness meter's
 * danger segment, because that was the only place a validation error reached the screen: a colour
 * band that said "5 blocked" and named none of them. The owner's one-list decision removed the
 * meter, and the same fact is now a row per document that names the file and says which check
 * failed. That is strictly more truth-telling, and it is what this gate measures now.
 */
async function measureBlockedRows(page: Page) {
  await page.goto("/ko/ontology/insights/?tab=do-next&guides=off");
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("do-next-list")).toBeVisible({ timeout: 20_000 });
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-fix-kind="blocked-document"]')].map((el) =>
      (el.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    const heading = document.querySelector('[data-testid="do-next-list-title"]');
    return { rows, heading: (heading?.textContent ?? "").replace(/\s+/g, " ").trim() };
  });
}

/**
 * Opens the docs surface and expands every folder.
 *
 * ⚠️ **Do not select via a `?slug=` deep link.** On a local vault that parameter
 * cannot beat the initial selection (measured 2026-08-04: whatever slug was given,
 * the alphabetically first document opened). That defect is not this spec's subject,
 * so selection happens the way a person does it — by clicking the tree. Whether the
 * instrument opened the screen it meant to measure is verified every time by
 * `openedFile` below.
 */
async function openDocsTree(page: Page) {
  await page.goto("/ko/docs/?guides=off");
  await page.waitForLoadState("networkidle");
  for (const folder of ["capabilities", "domains", "elements", "notes"]) {
    await page.getByRole("button", { name: new RegExp(folder) }).first().click();
    await page.waitForTimeout(120);
  }
}

/** Opens one document and measures whether that file states its own problems. */
async function measureDoc(page: Page, title: string, expectFile: string) {
  await page.getByRole("button", { name: title, exact: false }).first().click();
  // The validator runs after a 400ms debounce.
  await page.waitForTimeout(700);
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
    const header = document.querySelector("main .truncate.font-mono.text-caption");
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
  test("① 막힌 문서: 오류가 있으면 그 문서가 목록에서 자기 이름을 말한다", async ({ page }) => {
    await loadVault(page, BROKEN_VAULT);
    const broken = await measureBlockedRows(page);
    console.log("[blocked/broken]", JSON.stringify(broken));

    expect(
      broken.rows.length,
      "오류가 5건인데 「할 일」 목록에 막힌 문서가 한 줄도 없다 — 화면이 검사 결과를 말하지 않는다",
    ).toBeGreaterThan(0);
    // A row that says "your AI cannot read this" without saying which check failed is a colour
    // band with words on it. Every row must carry both the file and the reason.
    for (const row of broken.rows) {
      expect(row, `막힌 문서 행이 파일 이름을 말하지 않는다: ${row}`).toMatch(/[a-z-]+\//);
      expect(row.length, `막힌 문서 행에 이유가 없다: ${row}`).toBeGreaterThan(20);
    }
  });

  test("① 대조군 — 정상 볼트에는 막힌 문서 행이 없다", async ({ page }) => {
    await loadVault(page, HEALTHY_VAULT);
    const healthy = await measureBlockedRows(page);
    console.log("[blocked/healthy]", JSON.stringify(healthy));
    expect(
      healthy.rows,
      "정상 볼트에서까지 막힌 문서가 뜨면 이 계기는 항상-빨강이라 쓸모없다",
    ).toEqual([]);
  });

  test("② 오류가 파일 옆에서 보인다 (경고만 보여 주지 않는다)", async ({ page }) => {
    await loadVault(page, BROKEN_VAULT);
    await openDocsTree(page);
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
    await openDocsTree(page);
    const note = await measureDoc(page, "인수인계 메모", "notes/handover.md");
    console.log("[doc/handover]", JSON.stringify(note));
    expect(
      note.hasBlock,
      "kind 가 없으면 블록 자체가 안 그려졌다 — 사라지는 가장 흔한 경로가 침묵한다",
    ).toBe(true);
    expect(note.diagnostics.length).toBeGreaterThan(0);

    const ghost = await measureDoc(page, "유령 모듈", "elements/ghost.md");
    console.log("[doc/ghost]", JSON.stringify(ghost));
    expect(ghost.hasBlock, "kind 가 비었을 때도 같다").toBe(true);
    expect(ghost.diagnostics.map((d) => d.severity)).toContain("error");
  });

  test("④ 지도에 없는 문서는 「지도 근거」라고 말하지 않고, 죽은 CTA 도 없다", async ({
    page,
  }) => {
    await loadVault(page, BROKEN_VAULT);
    await openDocsTree(page);
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
    const domain = await measureDoc(page, "주문", "domains/orders.md");
    console.log("[doc/orders]", JSON.stringify(domain));
    expect(domain.proofState).toBe("true");
    expect(domain.mapHref ?? "").toContain("p=");
    expect(domain.stripMapHref ?? "", "노드가 있으면 스트립 링크는 그대로 산다").toContain("p=");
  });
});
