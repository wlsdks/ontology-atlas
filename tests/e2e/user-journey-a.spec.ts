import { expect, test } from "@playwright/test";
import { useDogfoodSample } from "./sample-source";

/**
 * T-10. 지침서 §2.A 공개 방문자 여정을 하나의 플로우로 재현한다.
 * audit-only: 치명적 단절(상세가 안 열림, Cmd+K가 안 열림 등)만 실패시키고,
 * 체감 지연이나 문구 결손은 console 리포트로 남겨 다음 사이클 티켓 후보로 쓴다.
 *
 * 다루는 구간:
 *   A1. 공유 링크(`/en/project/ontology-atlas/`)로 진입 → 상세가 즉시 읽힘
 *   A2. 루트(`/en/`) 진입 → 지도(HomePage)가 곧 첫 화면 — 별도 마케팅 랜딩
 *       경유 없이 10초 안에 INDEX/브랜드 pill 이 뜬다 (root-first-open B3).
 *   A5. 상세에서 Cmd+K 검색 팔레트가 열림·닫힘
 *
 * A3/A4 topology interaction is covered by topology-drag.
 */

const FINDING_LIMIT = 15;

test("A1·A2·A5 공개 여정 한 플로우", async ({ page }) => {
  // 이 여정은 dogfood 프로젝트(`/project/ontology-atlas/`)를 밟는다 — 2026-07-26
  // 기본 샘플이 예시 비즈니스로 바뀌었으니 명시 선택한다.
  await useDogfoodSample(page);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  /** 시간 예산 — 기계 속도를 타므로 **보고만** 한다. */
  const findings: string[] = [];
  /*
   * **결정론적 사실 — 이쪽은 실패시킨다** (2026-08-17 검사 전수조사).
   *
   * 이 spec 은 이름이 「여정」인데 여정 단언이 전부 `console.log` 였다.
   * *"A2 root map INDEX panel missing — landing detour regression?"* 같은
   * 문장은 기계 속도와 무관한 사실인데도 찍고 통과했다. 기계 속도를 타는
   * 것(TTFB 예산)만 보고로 남기고, 있고 없음이 갈리는 것은 실패로 올린다.
   */
  const defects: string[] = [];

  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  // ── A1. 공유 링크 → 상세 ────────────────────────────────────────────────
  // URL slug 는 `ontology-atlas`, 화면에 세우는 이름은 `Ontology Atlas`.
  // 여기서 볼 것은 표기법이 아니라 "그 프로젝트가 렌더됐는가" 다.
  const EXPECTED_DETAIL_NAME = "Ontology Atlas";
  const DETAIL_NAME_RE = /ontology[- ]atlas/i;
  const detailStart = Date.now();
  await page.goto("/en/project/ontology-atlas/", { waitUntil: "domcontentloaded" });
  const detailHeading = page.getByRole("heading").first();
  await expect(detailHeading).toBeVisible({ timeout: 10_000 });
  const detailTtfb = Date.now() - detailStart;
  const detailTitle = await page.title();
  if (!detailTitle || !DETAIL_NAME_RE.test(detailTitle)) {
    defects.push(`A1 title 에 프로젝트 이름 "${EXPECTED_DETAIL_NAME}" 누락: "${detailTitle}"`);
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
    defects.push(
      `A1 hydration 후에도 body 에 "${EXPECTED_DETAIL_NAME}" 텍스트가 나타나지 않음 — client-side render 실패 가능`,
    );
  }

  // ── A2. 루트 = 지도 (root-first-open B3, 별도 마케팅 랜딩 없음) ──────────
  // `getByText("Ontology Atlas", { exact: true })` used to match visible
  // hero copy on the old marketing LandingPage. Root-first-open moved that
  // copy to `/download` — the only surviving "Ontology Atlas" mark on `/`
  // is the persistent AppNavRail brand link (`title`/`aria-label`, icon-only,
  // no text child), so assert via its accessible name instead.
  const landingStart = Date.now();
  await page.goto("/en/", { waitUntil: "domcontentloaded" });
  const productName = page.getByRole("link", { name: "Ontology Atlas", exact: true }).first();
  await expect(productName).toBeVisible({ timeout: 10_000 });
  const landingTtfb = Date.now() - landingStart;
  if (landingTtfb > 5_000) {
    findings.push(`A2 root map product mark까지 ${landingTtfb}ms (5s 초과)`);
  }
  /*
   * **여기서 INDEX 를 요구하던 검사를 지웠다** (2026-08-17 검사 전수조사).
   *
   * 종전에는 `/` 에 지도 INDEX 가 없으면 *"landing detour regression?"* 을
   * 찍었다. 그런데 그 기대는 **뒤집힌 계약**이다 — 2026-07-30 결정으로 볼트를
   * 아직 안 고른 웹 방문자의 `/` 는 관문(`/download` 와 같은 얼굴)이고
   * INDEX 는 없는 것이 맞다(`.claude/rules/architecture.md` 「URL 계약」).
   * 지금 그 계약을 지키는 검사는 따로 있다 —
   * `ontology-ui.spec.ts` 의 "root renders the gateway face": `download-gnb`
   * 가 보이고 `topology-index-panel` 은 0개.
   *
   * 이 줄이 **로그로만 찍혀서** 계약이 뒤집힌 뒤로도 계속 「결함」이라고
   * 말하고 있었고 아무도 못 봤다. 실패로 올리자마자 그 사실이 드러났다.
   * 남의 계약을 여기서 다시 재지 않는다.
   */

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
  console.log(`[JOURNEY-A] A2 root map product mark ${landingTtfb}ms`);
  console.log(`[JOURNEY-A] findings=${findings.length} pageerror=${pageErrors.length} console.error=${consoleErrors.length}`);
  for (const f of findings.slice(0, FINDING_LIMIT)) console.log(`[JOURNEY-A]   • ${f}`);
  for (const e of pageErrors.slice(0, FINDING_LIMIT)) console.log(`[JOURNEY-A]   ! pageerror: ${e}`);
  for (const e of consoleErrors.slice(0, FINDING_LIMIT)) console.log(`[JOURNEY-A]   ! console.error: ${e}`);

  console.log(`[JOURNEY-A] defects=${defects.length}`);
  for (const d of defects) console.log(`[JOURNEY-A]   ✗ ${d}`);

  // pageerror 와 **결정론적 사실**은 실패. 시간 예산(findings)과 console.error 는 보고용.
  expect(pageErrors, `공개 여정 중 pageerror ${pageErrors.length}건:\n${pageErrors.slice(0, 5).join("\n")}`).toHaveLength(0);
  expect(
    defects,
    `공개 여정이 약속한 것이 화면에 없다 ${defects.length}건:\n${defects.join("\n")}`,
  ).toEqual([]);
});
