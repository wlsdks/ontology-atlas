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

/** 픽스처에 실재하는 중첩 슬러그 — 폴더 접두사가 있어야 결함이 재현된다. */
const DEEP_SLUG = "capabilities/checkout";

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
    ).toContainText(/결제|checkout/i, { timeout: 20_000 });
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
    await page.getByRole("radio", { name: "샘플" }).click();
    await expect
      .poll(async () => new URL(page.url()).searchParams.get("slug"), { timeout: 20_000 })
      .not.toBe(DEEP_SLUG);
  });
});
