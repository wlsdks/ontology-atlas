import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "../../fixture-vault";
import { seedFirstRunSeen } from "../../first-run-seed";
import { stubDirectoryPicker } from "../../vault-picker-stub";

/**
 * The slug must exist only in the fixture:
 * a slug also in the sample vault cannot show which vault opened it.
 */
const DEEP_SLUG = "capabilities/deeplink-probe";
const DEEP_TITLE = /딥링크 표적 문서/;


/**
 * Click until the menu opens, but not when it is open: on dev a click before hydration is lost,
 * and clicking an open menu closes it.
 */
async function openVaultChipMenu(page: import("@playwright/test").Page): Promise<void> {
  /*
   * Pick the visible one: during a transition old and new trees are mounted together
   * and the testid matches twice.
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

async function waitForIntegratedOntologyReader(
  page: import("@playwright/test").Page,
): Promise<string> {
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/ko/library/" &&
      url.searchParams.get("tab") === "ontology" &&
      Boolean(url.searchParams.get("slug")),
    { timeout: 20_000 },
  );
  await expect(
    page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
  ).toBeVisible({ timeout: 20_000 });
  const slug = new URL(page.url()).searchParams.get("slug");
  expect(slug, "통합 Ontology reader가 선택 문서 없이 준비되었다").not.toBeNull();
  return slug!;
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
   * Covers a profile whose stored source preference is `server`: the sample window reads as settled and
   * the later landing auto-switch is mistaken for a user vault switch.
   */
  test("샘플을 먼저 쓰던 프로필의 콜드 로드에서도 로컬 전용 딥링크가 살아남는다", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await stubDirectoryPicker(page, FIXTURE_VAULT);
    await seedFirstRunSeen(page);

    // Leave traces of the sample scope first: preference, sample tabs and recents.
    await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
    await waitForIntegratedOntologyReader(page);
    await page.evaluate(() => {
      window.localStorage.setItem("demo:docs-vault:source", "server");
    });

    // Use docs on local once to create a last document, which would fill the slot of a cleared deep link.
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("first-run-starter-open").click();
    await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
    await page.getByTestId("vault-guide-pick-existing").click();
    await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });
    await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
    const localRestedSlug = await waitForIntegratedOntologyReader(page);
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
   * With a stored `local` preference the one-shot landing ref is never spent and bounces
   * the first manual switch back; the landing decision must conclude once.
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
    // measurement window: the defect bounced back within 300-1800 ms, so the switch must hold across that stretch.
    await page.waitForTimeout(1_500);
    await expectSourceIsSample(page);
  });
});
