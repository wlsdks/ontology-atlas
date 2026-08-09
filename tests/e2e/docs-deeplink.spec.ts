import { expect, test } from "@playwright/test";

import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * 문서함 딥링크 — **URL 의 `?slug=` 는 저장된 「마지막 문서」를 이긴다.**
 *
 * ## 무엇이 났나 (2026-08-08 실사용 검수, 실기기 Chrome)
 *
 * 로컬 볼트를 연 세션에서 `?slug=domains/typed-api` 로 문서함에 들어갔더니
 * **마지막에 본 문서가 열리고 URL 까지 그 슬러그로 조용히 덮였다.** 에이전트가
 * 사람에게 링크를 남기는 것이 이 제품의 핵심 약속인데, 그 링크가 받는 사람의
 * 마지막 화면에 지는 것이다.
 *
 * ## 원인 — 좋은 수리의 사각
 *
 * 2026-08-01 의 「볼트가 바뀌면 볼트 전용 주소 상태를 걷어낸다」 수리는 옳다 —
 * `?slug=` 는 한 볼트 안에서만 뜻이 있는 이름이라, 볼트를 바꾸면 지워야 한다.
 * 문제는 **콜드 로드의 소스 취향 hydration**(`sample:… → local:…`)이 그 정리의
 * 눈에 볼트 전환으로 보였다는 것: 방금 누군가 준 딥링크가 부팅 도중 잔재로
 * 오인되어 지워지고, 그 빈자리에 탭 복원이 마지막 문서를 앉혔다. 수리의 주석
 * 자신이 *"첫 마운트의 `?slug=` 는 잔재가 아니라 누군가 준 것"* 이라 적어 뒀지만
 * 그 보호는 첫 실행에만 걸렸고 부팅 중 전환에는 닿지 않았다.
 *
 * ## 왜 e2e 인가
 *
 * 결함이 **세 비동기 층의 경주**다(URL 파싱 · 소스 취향 hydration · 탭 복원).
 * 어느 한 층의 단위 시험도 「부팅 전체에서 누가 이기는가」를 말하지 못한다 —
 * 실제로 세 층 각각은 자기 단위 시험을 통과한 채로 이 결함을 만들었다.
 *
 * 두 방향을 다 잰다: 딥링크 생존(이번 수리)과, **정착 후 볼트 전환 시 슬러그
 * 걷어내기**(2026-08-01 수리의 보장) — 앞의 것을 고치며 뒤의 것을 죽이면
 * 낡은 슬러그 소음이 되돌아온다.
 */

/**
 * 픽스처에 실재하는 중첩 슬러그 — 폴더 접두사가 있어야 결함이 재현된다.
 *
 * ⚠️ **픽스처에만 있는 슬러그여야 한다** (2026-08-08). 처음엔
 * `capabilities/checkout` 이었는데, 그 이름은 **배포 샘플 볼트에도 있다** —
 * 그래서 부팅이 샘플 창을 지나는 동안 딥링크가 걷히고 샘플의 같은 문서가
 * 열려도 시험이 초록이었다. 표적이 두 볼트에 다 있으면 「어느 볼트가
 * 열었나」를 재지 못한다.
 */
const DEEP_SLUG = "capabilities/deeplink-probe";
const DEEP_TITLE = /딥링크 표적 문서/;


/**
 * 소스를 **샘플로 바꾼다** — 누르는 자리가 2026-08-08 에 옮겨졌다.
 *
 * 종전엔 화면 오른쪽 끝의 「샘플 | 로컬」 라디오였다. #987(문서함 크롬 통합)이
 * 그 라디오를 지우고 표시·전환·점검을 **볼트 칩 메뉴** 하나로 모았다 — 같은
 * 사실을 화면 두 곳이 말하고 있었기 때문이다.
 *
 * ⚠️ **그때 이 스펙을 같이 고치지 않아 CI 가 깨진 채 여섯 PR 이 머지됐다.**
 * `.claude/rules/testing.md` 가 정확히 그것을 경고한다 — *"화면을 삭제하면 같은
 * PR 에서 e2e spec 도 같이 훑어 지운다"*. 지키는 성질(정착 후 볼트 전환이
 * 슬러그를 걷어낸다)은 그대로이고 **누르는 자리만** 바뀌었으므로, 시험을 지우지
 * 않고 여기 한 곳으로 모아 다음에 또 옮겨도 한 군데만 고치면 되게 한다.
 */
/**
 * **칩 메뉴를 연다 — 한 번의 클릭에 기대지 않는다.**
 *
 * ⚠️ dev 서버(Turbopack)에서는 하이드레이션 전에 떨어진 클릭이 **유실**된다.
 * React 가 아직 붙지 않은 버튼을 누르면 아무 일도 안 일어나고, 그다음
 * `toBeVisible` 은 10초를 기다려도 열리지 않는다 — 기다림이 잃어버린 클릭을
 * 되살려 주지는 않기 때문이다. `playwright.config.ts` 가 이미 경고한 그
 * 취약성이고(온디맨드 재컴파일이 산발 실패를 낸다), 정적 export 에서는 통과하고
 * dev 에서만 죽는다 — 2026-08-09 에 실제로 그 모양으로 CI 만 빨갰다.
 *
 * 그래서 **메뉴가 열릴 때까지 다시 누른다.** 열려 있으면 클릭하지 않는다
 * (열린 메뉴를 또 누르면 닫힌다).
 */
async function openVaultChipMenu(page: import("@playwright/test").Page): Promise<void> {
  /*
   * ⚠️ **보이는 것만 집는다.** 화면 전환 중에는 이전 트리와 새 트리가 잠깐
   * 함께 떠 있어서 같은 testid 가 **둘**로 잡히고, 그 순간 둘 다 hidden 이다
   * (2026-08-09 dev 실측: strict mode 충돌 + `unexpected value "hidden"`).
   * 사용자가 만질 수 있는 것은 보이는 쪽 하나이므로 그것만 대상으로 한다.
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

/** 지금 보고 있는 소스가 로컬인가 — 칩 메뉴의 라디오 상태로 읽는다. */
async function expectSourceIsLocal(page: import("@playwright/test").Page): Promise<void> {
  await openVaultChipMenu(page);
  await expect(page.locator('[data-testid="vault-chip-use-local"]:visible')).toHaveAttribute(
    "aria-checked",
    "true",
    { timeout: 10_000 },
  );
  await page.keyboard.press("Escape");
  // 퇴장 대기 — Surface 는 나가는 동안 inert 로 DOM 에 남고, 텍스트 셀렉터는
  // 그것도 찾아낸다(local-vault-picker 에서 실제로 strict mode 충돌을 냈다).
  await expect(page.locator('[data-testid="vault-chip-use-sample"]:visible')).toBeHidden();
}

/** 지금 보고 있는 소스가 샘플인가. */
async function expectSourceIsSample(page: import("@playwright/test").Page): Promise<void> {
  await openVaultChipMenu(page);
  await expect(page.locator('[data-testid="vault-chip-use-sample"]:visible')).toHaveAttribute(
    "aria-checked",
    "true",
    { timeout: 10_000 },
  );
  await page.keyboard.press("Escape");
  // 퇴장 대기 — Surface 는 나가는 동안 inert 로 DOM 에 남고, 텍스트 셀렉터는
  // 그것도 찾아낸다(local-vault-picker 에서 실제로 strict mode 충돌을 냈다).
  await expect(page.locator('[data-testid="vault-chip-use-sample"]:visible')).toBeHidden();
}

test.describe("문서함 딥링크 — URL 이 이긴다", () => {
  test("로컬 볼트 복원 뒤의 콜드 로드에서 ?slug= 가 살아남는다", async ({ page }) => {
    test.setTimeout(120_000);
    await stubDirectoryPicker(page, FIXTURE_VAULT);

    // ① 지도에서 볼트를 연다 — 핸들이 IndexedDB 에 남는다.
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?guides=off");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("first-run-starter-open").click();
    await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
    await page.getByTestId("vault-guide-pick-existing").click();
    // 볼트가 안 물리면 아래 전부가 샘플을 잰 것이 된다 — a11y-vault-backed 와 같은 증거.
    await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });

    // ② 문서함을 슬러그 **없이** 열어 「마지막 문서」 저장값을 만든다 —
    //    이 값이 있어야 「딥링크 vs 마지막 문서」 대결이 성립한다.
    await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .not.toBeNull();
    const restedSlug = new URL(page.url()).searchParams.get("slug");
    expect(restedSlug, "기본 선택이 아무 문서도 못 열었다 — 이 시험이 헛돈다").not.toBeNull();
    expect(restedSlug).not.toBe(DEEP_SLUG);

    // ③ 콜드 로드 딥링크 — 결함이 살아 있으면 여기서 URL 이 ②의 슬러그로 덮인다.
    await page.goto(`/ko/docs/?guides=off&slug=${encodeURIComponent(DEEP_SLUG)}`, {
      waitUntil: "domcontentloaded",
    });
    // 볼트 로드가 끝날 때까지 URL 이 흔들릴 수 있다 — 최종 상태를 잰다.
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
    // 볼트가 안 물리면 아래 전부가 샘플을 잰 것이 된다 — a11y-vault-backed 와 같은 증거.
    await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 30_000 });

    await page.goto(`/ko/docs/?guides=off&slug=${encodeURIComponent(DEEP_SLUG)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .toBe(DEEP_SLUG);

    // 정착된 상태에서 소스를 샘플로 전환 — 진짜 볼트 전환이다.
    await switchToSample(page);
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .not.toBe(DEEP_SLUG);
  });

  /**
   * 2026-08-08 2차 실사용 검수가 잡은 사각. 위 첫 시험은 통과하는데 실기기가
   * 실패했다 — 차이는 **프로필이 샘플 스코프를 먼저 썼는가**였다. 저장된 소스
   * 취향이 `server` 인 부팅은 「서버는 즉시 정착」 술어에 걸려 샘플 창이
   * 정착으로 관측되고, 로컬 볼트 복원이 끝나 랜딩 자동 전환(C5)이 뒤집는 순간
   * 그 전환이 「사용자 볼트 전환」으로 오인되어 딥링크가 걷혔다.
   */
  test("샘플을 먼저 쓰던 프로필의 콜드 로드에서도 로컬 전용 딥링크가 살아남는다", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await stubDirectoryPicker(page, FIXTURE_VAULT);
    await seedFirstRunSeen(page);

    // ① 샘플 스코프의 흔적을 만든다 — 실기기 사고 프로필 그대로:
    //    문서함을 샘플로 먼저 쓰고(취향 저장 + 샘플 탭·최근), 그 뒤 볼트를 연다.
    await page.goto("/ko/docs/?guides=off", { waitUntil: "domcontentloaded" });
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .not.toBeNull();
    await page.evaluate(() => {
      window.localStorage.setItem("demo:docs-vault:source", "server");
    });

    // ② 지도에서 볼트를 열고, 문서함을 로컬로 한 번 써서 **로컬 스코프의
    //    「마지막 문서」**를 만든다 — 걷힌 딥링크의 빈자리를 차지할 후보다.
    //    (실기기 사고에서 최종 URL 을 쓴 것이 바로 이 탭 복원이었다.)
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

    // ③ 저장 취향은 여전히 샘플인 채로 콜드 로드 딥링크 — 부팅이
    //    「샘플 정착 → 랜딩 자동 전환」을 지나는 동안 딥링크가 살아남아야 한다.
    // 주소가 딥링크를 **한 순간이라도** 부정하면 결함이다 — 걷힌 찰나를 어느
    //    경주가 굳히는지는 기기마다 다르고(실기기에서는 탭 복원이 굳혀 README 로
    //    남았다), 최종값 폴링만 재면 자가 치유된 쪽만 초록이 된다. 그래서
    //    replaceState 전수를 기록해 「슬러그를 잃은 호출 0건」을 단언한다.
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
    // 부팅이 끝난 지금까지의 전체 기록에서 슬러그를 떨군 호출을 찾는다.
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
   * 같은 뿌리의 둘째 결함 — 저장 취향이 `local` 인 부팅에서는 랜딩 자동 전환이
   * 쏘일 일이 없어 원샷 ref 가 소진되지 않았고, 그 장전된 한 발이 **사용자의
   * 첫 「샘플」 전환을 그 자리에서 로컬로 되튕겼다**(2026-08-08 실기기:
   * 클릭 후 300ms·1800ms 모두 로컬). 랜딩 판정은 복원 시도가 끝나는 순간
   * 단 한 번으로 종결되어야 하고, 그 뒤의 수동 전환에 관여하면 안 된다.
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
    // 되튕김은 즉시 일어난다 — 전환이 붙었으면 그대로 유지되어야 한다.
    await page.waitForTimeout(1_500);
    await expectSourceIsSample(page);
  });
});
