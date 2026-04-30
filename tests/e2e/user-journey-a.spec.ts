import { expect, test } from "@playwright/test";

/**
 * T-10. 지침서 §2.A 공개 방문자 여정을 하나의 플로우로 재현한다.
 * audit-only: 치명적 단절(상세가 안 열림, Cmd+K가 안 열림 등)만 실패시키고,
 * 체감 지연이나 문구 결손은 console 리포트로 남겨 다음 사이클 티켓 후보로 쓴다.
 *
 * 다루는 구간:
 *   A1. 공유 링크(`/project/aslan-maps/`)로 진입 → 상세가 즉시 읽힘
 *   A2. 루트(`/`) 진입 → landing이 제품 성격을 10초 안에 설명
 *   A5. 상세에서 Cmd+K 검색 팔레트가 열림·닫힘
 *
 * A3(데모 로그인)·A4(토폴로지 드래그 → 드로어)는 emulator·데이터 의존이라
 * 별도 spec(public-topology / topology-drag-public)에서 다룬다.
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
  // aslan-maps 프로젝트의 실제 이름은 "Narnia" (포트폴리오 자체가 주인공).
  // title 포맷 규약은 `<project.name> · Narnia` 이므로 `Narnia` 를 반드시 포함
  // 해야 하고, 비어있으면 안 된다. slug 와 name 이 일반적으로 다르므로 slug
  // 자체를 title 에서 찾는 건 잘못(cycle 19~24 에서 "aslan" 문자열 검색이
  // 계속 false-positive 찾아오던 버그). 대신 SEO 정합성은
  // entities/project/model/seo-metadata.test.ts 에서 전 프로젝트 엄격 검증.
  const EXPECTED_DETAIL_NAME = "Narnia";
  const detailStart = Date.now();
  await page.goto("/project/aslan-maps/", { waitUntil: "domcontentloaded" });
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
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Narnia 브랜드 마크가 hero 영역에 반드시 있어야 한다(§1.3 단일 채색 랜딩).
  const narnia = page.getByText("Narnia", { exact: true }).first();
  await expect(narnia).toBeVisible({ timeout: 10_000 });
  const landingTtfb = Date.now() - landingStart;
  if (landingTtfb > 5_000) {
    findings.push(`A2 landing Narnia 마크까지 ${landingTtfb}ms (5s 초과)`);
  }
  // 비로그인 landing(ServiceEntryLanding)의 핵심 설명 문구와 헤드라인.
  const landingSub = page.getByText("문서 기반 프로젝트 토폴로지");
  if ((await landingSub.count()) === 0) {
    findings.push("A2 landing subtitle '문서 기반 프로젝트 토폴로지' 사라짐");
  }
  const landingH1 = page.getByRole("heading", { name: /문서가\s*프로젝트/ });
  if ((await landingH1.count()) === 0) {
    findings.push("A2 landing h1 '문서가 프로젝트 구조가 됩니다' 사라짐");
  }

  // ── A5. 상세 Cmd+K → 같은 페이지에서 검색 팔레트 ───────────────────────
  // T-11 이후, 상세에서 Cmd+K는 `/`로 튕기지 않고 상세 페이지 안에 SearchPalette를
  // 바로 연다. URL은 그대로, Escape로 닫히며 다시 Cmd+K로 토글된다.
  await page.goto("/project/aslan-maps/", { waitUntil: "domcontentloaded" });
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
  const shortcutDialog = page.getByRole("dialog", { name: "키보드 단축키" });
  await expect(shortcutDialog).toBeVisible({ timeout: 3_000 });
  expect(new URL(page.url()).pathname).toBe(detailPathBefore);
  await page.keyboard.press("Escape");
  await expect(shortcutDialog).toHaveCount(0, { timeout: 3_000 });

  // ── 리포트 ──────────────────────────────────────────────────────────────
  console.log(`[JOURNEY-A] A1 detail heading ${detailTtfb}ms`);
  console.log(`[JOURNEY-A] A2 landing Narnia ${landingTtfb}ms`);
  console.log(`[JOURNEY-A] findings=${findings.length} pageerror=${pageErrors.length} console.error=${consoleErrors.length}`);
  for (const f of findings.slice(0, FINDING_LIMIT)) console.log(`[JOURNEY-A]   • ${f}`);
  for (const e of pageErrors.slice(0, FINDING_LIMIT)) console.log(`[JOURNEY-A]   ! pageerror: ${e}`);
  for (const e of consoleErrors.slice(0, FINDING_LIMIT)) console.log(`[JOURNEY-A]   ! console.error: ${e}`);

  // audit-only: pageerror가 여정 중에 터지는 것만 즉시 실패. findings·console은 리포트용.
  expect(pageErrors, `공개 여정 중 pageerror ${pageErrors.length}건:\n${pageErrors.slice(0, 5).join("\n")}`).toHaveLength(0);
});
