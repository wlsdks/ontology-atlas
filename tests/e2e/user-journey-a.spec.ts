import { expect, test } from "@playwright/test";

/**
 * T-10. 지침서 §2.A 공개 방문자 여정을 하나의 플로우로 재현한다.
 * audit-only: 치명적 단절(상세가 안 열림, Cmd+K가 안 열림 등)만 실패시키고,
 * 체감 지연이나 문구 결손은 console 리포트로 남겨 다음 사이클 티켓 후보로 쓴다.
 *
 * 다루는 구간:
 *   A1. 공유 링크(`/en/project/ontology-atlas/`)로 진입 → 상세가 즉시 읽힘
 *   A2. 루트(`/en/`) 진입 → landing이 제품 성격을 10초 안에 설명
 *   A5. 상세에서 Cmd+K 검색 팔레트가 열림·닫힘
 *
 * A3/A4 topology interaction is covered by topology-drag.
 */

const FINDING_LIMIT = 15;

test("A1·A2·A5 공개 여정 한 플로우", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const findings: string[] = [];

  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // ── A1. 공유 링크 → 상세 ────────────────────────────────────────────────
  const EXPECTED_DETAIL_NAME = "ontology-atlas";
  const detailStart = Date.now();
  await page.goto("/en/project/ontology-atlas/", { waitUntil: "domcontentloaded" });
  const detailHeading = page.getByRole("heading").first();
  await expect(detailHeading).toBeVisible({ timeout: 10_000 });
  const detailTtfb = Date.now() - detailStart;
  const detailTitle = await page.title();
  if (!detailTitle || !detailTitle.includes(EXPECTED_DETAIL_NAME)) {
    findings.push(`A1 title 에 프로젝트 이름 "${EXPECTED_DETAIL_NAME}" 누락: "${detailTitle}"`);
  }
  if (detailTtfb > 5_000) {
    findings.push(`A1 상세 첫 heading까지 ${detailTtfb}ms (5s 초과)`);
  }
  // 상세 body 가 실제로 hydrate 돼서 프로젝트 이름이 본문에 나타나는지 확인.
  // server HTML 은 client-side rendering 으로 비어있으므로 hydration 후에만
  // 보인다. 이 assertion 은 "메타데이터만 있고 본문 비어있는" 회귀를 잡는다.
  const nameInBody = await page
    .getByText(EXPECTED_DETAIL_NAME)
    .first()
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!nameInBody) {
    findings.push(
      `A1 hydration 후에도 body 에 "${EXPECTED_DETAIL_NAME}" 텍스트가 나타나지 않음 — client-side render 실패 가능`,
    );
  }

  // ── A2. 루트 landing ────────────────────────────────────────────────────
  const landingStart = Date.now();
  await page.goto("/en/", { waitUntil: "domcontentloaded" });
  const productName = page.getByText("Ontology Atlas", { exact: true }).first();
  await expect(productName).toBeVisible({ timeout: 10_000 });
  const landingTtfb = Date.now() - landingStart;
  if (landingTtfb > 5_000) {
    findings.push(`A2 landing product mark까지 ${landingTtfb}ms (5s 초과)`);
  }
  const landingSub = page.getByText("Install the app, pick a local vault folder, and start.");
  if ((await landingSub.count()) === 0) {
    findings.push("A2 landing subtitle missing");
  }
  const landingH1 = page.getByRole("heading", { name: /Codebase ontology/ });
  if ((await landingH1.count()) === 0) {
    findings.push("A2 landing h1 missing");
  }

  // ── A5. 상세 Cmd+K → 같은 페이지에서 검색 팔레트 ───────────────────────
  // T-11 이후, 상세에서 Cmd+K는 `/`로 튕기지 않고 상세 페이지 안에 SearchPalette를
  // 바로 연다. URL은 그대로, Escape로 닫히며 다시 Cmd+K로 토글된다.
  await page.goto("/en/project/ontology-atlas/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(600); // hydration + useTypingShortcuts bind
  const isMac = process.platform === "darwin";
  const detailPathBefore = new URL(page.url()).pathname;
  await page.keyboard.press(isMac ? "Meta+k" : "Control+k");
  const paletteInput = page.locator("input#project-search-input");
  await expect(paletteInput).toBeVisible({ timeout: 3_000 });
  // URL이 상세에서 벗어나지 않아야 한다.
  expect(new URL(page.url()).pathname).toBe(detailPathBefore);
  await page.keyboard.press("Escape");
  await expect(paletteInput).toHaveCount(0, { timeout: 3_000 });

  // ── A5'. 상세 ? → 상세 페이지 안에서 ShortcutSheet 토글 (T-16) ─────────
  // useTypingShortcuts 는 event.key === '?' 을 보므로 KeyboardEvent 로 직접
  // 발사해 Playwright의 키맵 의존을 피한다.
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }));
  });
  const shortcutDialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(shortcutDialog).toBeVisible({ timeout: 3_000 });
  expect(new URL(page.url()).pathname).toBe(detailPathBefore);
  await page.keyboard.press("Escape");
  await expect(shortcutDialog).toHaveCount(0, { timeout: 3_000 });

  // ── 리포트 ──────────────────────────────────────────────────────────────
  console.log(`[JOURNEY-A] A1 detail heading ${detailTtfb}ms`);
  console.log(`[JOURNEY-A] A2 landing product mark ${landingTtfb}ms`);
  console.log(`[JOURNEY-A] findings=${findings.length} pageerror=${pageErrors.length} console.error=${consoleErrors.length}`);
  for (const f of findings.slice(0, FINDING_LIMIT)) console.log(`[JOURNEY-A]   • ${f}`);
  for (const e of pageErrors.slice(0, FINDING_LIMIT)) console.log(`[JOURNEY-A]   ! pageerror: ${e}`);
  for (const e of consoleErrors.slice(0, FINDING_LIMIT)) console.log(`[JOURNEY-A]   ! console.error: ${e}`);

  // audit-only: pageerror가 여정 중에 터지는 것만 즉시 실패. findings·console은 리포트용.
  expect(pageErrors, `공개 여정 중 pageerror ${pageErrors.length}건:\n${pageErrors.slice(0, 5).join("\n")}`).toHaveLength(0);
});
