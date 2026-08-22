import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * Docs deep links — **`?slug=` in the URL beats the stored "last document".**
 *
 * **What happened** (field review 2026-08-08, real-device Chrome). In a session
 * with a local vault open, entering the docs surface via
 * `?slug=domains/typed-api` **opened the last-viewed document and silently
 * overwrote the URL with that slug too.** An agent leaving a link for a person is
 * this product's core promise, and that link was losing to the recipient's last
 * screen.
 *
 * **Cause — the blind spot of a good fix.** The 2026-08-01 fix, "when the vault
 * changes, clear vault-scoped address state", is right: `?slug=` is a name that
 * only means something inside one vault, so switching vaults must clear it. The
 * problem is that **the cold load's source-preference hydration**
 * (`sample:… → local:…`) looked like a vault switch to that cleanup: a deep link
 * someone had just handed over was mistaken for a leftover mid-boot and erased, and
 * tab restoration filled the vacancy with the last document. The fix's own comment
 * said *"첫 마운트의 `?slug=` 는 잔재가 아니라 누군가 준 것"* (a `?slug=` on first
 * mount is not a leftover but something someone handed you) — but that protection
 * only covered the first run and never reached a switch during boot.
 *
 * **Why e2e.** The defect is **a race between three async layers** (URL parsing,
 * source-preference hydration, tab restoration). No unit test of any single layer
 * can say who wins across the whole boot — all three layers passed their own unit
 * tests while producing this defect.
 *
 * Both directions are measured: deep-link survival (this fix) and **clearing the
 * slug on a vault switch after settling** (the 2026-08-01 fix's guarantee). Fixing
 * the former while killing the latter brings back stale-slug noise.
 */

/**
 * A nested slug that really exists in the fixture — the folder prefix is required
 * to reproduce the defect.
 *
 * ⚠️ **The slug must exist only in the fixture** (2026-08-08). It was
 * `capabilities/checkout` at first, and that name **also exists in the shipped
 * sample vault** — so the test stayed green even when the deep link was cleared
 * while boot passed through the sample window and the sample's document of the same
 * name opened. A target present in both vaults cannot measure which vault opened
 * it.
 */
const DEEP_SLUG = "capabilities/deeplink-probe";
const DEEP_TITLE = /딥링크 표적 문서/;


/**
 * Switches the source **to sample** — the control moved on 2026-08-08.
 *
 * It used to be the 「샘플 | 로컬」 (sample | local) radio at the right edge of the
 * screen. #987 (docs chrome consolidation) removed that radio and gathered display,
 * switching, and diagnostics into the **vault chip menu**, because two places on
 * screen were stating the same fact.
 *
 * ⚠️ **This spec was not updated in that PR, and CI stayed broken across six
 * merges.** `.claude/rules/testing.md` warns about exactly that — *"화면을
 * 삭제하면 같은 PR 에서 e2e spec 도 같이 훑어 지운다"* (delete a screen and sweep
 * its e2e specs in the same PR). The property being guarded (a vault switch after
 * settling clears the slug) is unchanged and only **the control's location** moved,
 * so instead of deleting the test it is gathered here in one place — the next move
 * needs one edit.
 */
/**
 * **Opens the chip menu — never relying on a single click.**
 *
 * ⚠️ On the dev server (Turbopack) a click that lands before hydration is **lost**.
 * Pressing a button React has not attached to yet does nothing, and the following
 * `toBeVisible` will not open even after waiting 10 seconds — waiting does not
 * revive a lost click. `playwright.config.ts` already warns about this fragility
 * (on-demand recompilation causes sporadic failures); it passes on static export
 * and dies only on dev — on 2026-08-09 it went red in CI only, in exactly that
 * shape.
 *
 * So it **clicks again until the menu opens**, and does not click when it is
 * already open (clicking an open menu closes it).
 */
async function openVaultChipMenu(page: import("@playwright/test").Page): Promise<void> {
  /*
   * ⚠️ **Only pick the visible one.** During a screen transition the old and new
   * trees are briefly mounted together, so the same testid matches **twice** and both
   * are hidden at that moment (measured on dev 2026-08-09: strict-mode conflict plus
   * `unexpected value "hidden"`). The user can only touch the visible one, so only
   * that one is targeted.
   */
  const trigger = page.locator('[data-testid="vault-chip-menu-trigger"]:visible');
  const anyRow = page.locator('[data-testid="vault-chip-use-sample"]:visible');
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(
      async () => {
        if (await anyRow.isVisible().catch(() => false)) return true;
        await trigger.click({ timeout: 5_000 }).catch(() => undefined);
        return anyRow.isVisible().catch(() => false);
      },
      {
        timeout: 20_000,
        message:
          "볼트 칩 메뉴가 열리지 않았다 — dev 에서는 하이드레이션 전 클릭이 유실되므로 다시 눌러야 한다",
      },
    )
    .toBe(true);
}

async function switchToSample(page: import("@playwright/test").Page): Promise<void> {
  await openVaultChipMenu(page);
  await page.locator('[data-testid="vault-chip-use-sample"]:visible').click();
}

/** Is the current source local? Read from the radio state in the chip menu. */
async function expectSourceIsLocal(page: import("@playwright/test").Page): Promise<void> {
  await openVaultChipMenu(page);
  await expect(page.locator('[data-testid="vault-chip-use-local"]:visible')).toHaveAttribute(
    "aria-checked",
    "true",
    { timeout: 10_000 },
  );
  await page.keyboard.press("Escape");
  // Wait out the exit — a `Surface` stays in the DOM as inert while leaving, and a
  // text selector finds it too (this really caused a strict-mode conflict in
  // local-vault-picker).
  await expect(page.locator('[data-testid="vault-chip-use-sample"]:visible')).toBeHidden();
}

/** Is the current source the sample vault? */
async function expectSourceIsSample(page: import("@playwright/test").Page): Promise<void> {
  await openVaultChipMenu(page);
  await expect(page.locator('[data-testid="vault-chip-use-sample"]:visible')).toHaveAttribute(
    "aria-checked",
    "true",
    { timeout: 10_000 },
  );
  await page.keyboard.press("Escape");
  // Wait out the exit — a `Surface` stays in the DOM as inert while leaving, and a
  // text selector finds it too (this really caused a strict-mode conflict in
  // local-vault-picker).
  await expect(page.locator('[data-testid="vault-chip-use-sample"]:visible')).toBeHidden();
}

test.describe("문서함 딥링크 — URL 이 이긴다", () => {
  test("로컬 볼트 복원 뒤의 콜드 로드에서 ?slug= 가 살아남는다", async ({ page }) => {
    test.setTimeout(120_000);
    await stubDirectoryPicker(page, FIXTURE_VAULT);

    // ① Open the vault from the map — the handle persists in IndexedDB.
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("first-run-starter-open").click();
    await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
    await page.getByTestId("vault-guide-pick-existing").click();
    // If the vault does not attach, everything below measures the sample instead — the same evidence a11y-vault-backed uses.
    await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });

    // ② Open the docs surface **without** a slug to create the stored "last
    //    document" — the deep-link-vs-last-document contest needs that value to exist.
    await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .not.toBeNull();
    const restedSlug = new URL(page.url()).searchParams.get("slug");
    expect(restedSlug, "기본 선택이 아무 문서도 못 열었다 — 이 시험이 헛돈다").not.toBeNull();
    expect(restedSlug).not.toBe(DEEP_SLUG);

    // ③ Cold-load deep link — if the defect is alive, the URL is overwritten here with ②'s slug.
    await page.goto(`/ko/docs/?guides=off&slug=${encodeURIComponent(DEEP_SLUG)}`, {
      waitUntil: "domcontentloaded",
    });
    // The URL can wobble until the vault finishes loading — measure the final state.
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .toBe(DEEP_SLUG);
    await expect(
      page.getByTestId("gateway-doc-title").or(page.locator("main")).first(),
    ).toContainText(DEEP_TITLE, { timeout: 20_000 });
  });

  test("정착 뒤 샘플로 바꾸면 볼트 전용 슬러그를 걷어낸다 — 2026-08-01 보장 유지", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await stubDirectoryPicker(page, FIXTURE_VAULT);
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("first-run-starter-open").click();
    await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
    await page.getByTestId("vault-guide-pick-existing").click();
    // If the vault does not attach, everything below measures the sample instead — the same evidence a11y-vault-backed uses.
    await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });

    await page.goto(`/ko/docs/?guides=off&slug=${encodeURIComponent(DEEP_SLUG)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .toBe(DEEP_SLUG);

    // Switch the source to sample from a settled state — a genuine vault switch.
    await switchToSample(page);
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .not.toBe(DEEP_SLUG);
  });

  /**
   * A blind spot caught by the second field review, 2026-08-08: the first test above
   * passed while the real device failed. The difference was **whether the profile had
   * used the sample scope first**. On a boot whose stored source preference is
   * `server`, the "server settles immediately" predicate makes the sample window read
   * as settled; then, when local vault restoration finishes and the landing
   * auto-switch (C5) flips it, that switch is mistaken for a user vault switch and
   * the deep link is cleared.
   */
  test("샘플을 먼저 쓰던 프로필의 콜드 로드에서도 로컬 전용 딥링크가 살아남는다", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await stubDirectoryPicker(page, FIXTURE_VAULT);
    await seedFirstRunSeen(page);

    // ① Create traces of the sample scope, matching the real-device incident profile:
    //    use the docs surface on sample first (storing the preference plus sample tabs
    //    and recents), then open the vault.
    await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .not.toBeNull();
    await page.evaluate(() => {
      window.localStorage.setItem("demo:docs-vault:source", "server");
    });

    // ② Open the vault from the map and use the docs surface on local once to create
    //    **the local scope's "last document"** — the candidate that would fill the
    //    vacancy left by a cleared deep link. (In the real-device incident this tab
    //    restoration is what wrote the final URL.)
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("first-run-starter-open").click();
    await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
    await page.getByTestId("vault-guide-pick-existing").click();
    await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });
    await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .not.toBeNull();
    const localRestedSlug = new URL(page.url()).searchParams.get("slug");
    expect(localRestedSlug).not.toBe(DEEP_SLUG);

    // ③ Cold-load deep link with the stored preference still on sample — the deep
    //    link must survive while boot passes through "sample settles → landing
    //    auto-switch".
    // The address contradicting the deep link **for even one moment** is a defect.
    //    Which race freezes that cleared instant differs per device (on the real device
    //    tab restoration froze it and left README), and polling only the final value
    //    turns green wherever it self-healed. So every replaceState call is recorded and
    //    the assertion is "zero calls lost the slug".
    await page.addInitScript(() => {
      const w = window as unknown as { __urlTrace?: string[] };
      w.__urlTrace = [];
      const orig = history.replaceState.bind(history);
      history.replaceState = (s, ti, url) => {
        w.__urlTrace?.push(String(url));
        return orig(s, ti, url);
      };
    });
    await page.evaluate(() => {
      window.localStorage.setItem("demo:docs-vault:source", "server");
    });
    await page.goto(`/ko/docs/?guides=off&slug=${encodeURIComponent(DEEP_SLUG)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .toBe(DEEP_SLUG);
    await expect(
      page.getByTestId("gateway-doc-title").or(page.locator("main")).first(),
    ).toContainText(DEEP_TITLE, { timeout: 20_000 });
    // Search the full record up to the end of boot for any call that dropped the slug.
    const trace = await page.evaluate(
      () => (window as unknown as { __urlTrace?: string[] }).__urlTrace ?? [],
    );
    expect(trace.length, "replaceState 가 한 번도 안 불렸다 — 계측이 헛돈다").toBeGreaterThan(0);
    const dropped = trace.filter(
      (url) => !url.includes(`slug=${encodeURIComponent(DEEP_SLUG)}`),
    );
    expect(
      dropped,
      "부팅 중 주소가 딥링크를 잃었다 — 이 찰나를 탭 복원이 굳히면 실기기 사고가 된다",
    ).toEqual([]);
  });

  /**
   * The second defect from the same root: on a boot whose stored preference is
   * `local` the landing auto-switch never fires, so the one-shot ref is never spent —
   * and that loaded shot **bounced the user's first switch to "sample" straight back
   * to local** (real device, 2026-08-08: still local at both 300ms and 1800ms after
   * the click). The landing decision must conclude exactly once, at the moment the
   * restoration attempt ends, and must not participate in manual switches after
   * that.
   */
  test("저장 취향이 로컬인 부팅에서 첫 샘플 전환이 즉시 먹는다", async ({ page }) => {
    test.setTimeout(120_000);
    await stubDirectoryPicker(page, FIXTURE_VAULT);
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("first-run-starter-open").click();
    await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
    await page.getByTestId("vault-guide-pick-existing").click();
    await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });

    await page.evaluate(() => {
      window.localStorage.setItem("demo:docs-vault:source", "local");
    });
    await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
    await expectSourceIsLocal(page);

    await switchToSample(page);
    // The bounce-back is immediate — once the switch takes, it must stay.
    await page.waitForTimeout(1_500);
    await expectSourceIsSample(page);
  });
});
