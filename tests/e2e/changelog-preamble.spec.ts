import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **변경 내역이 관리자용 영어 머리말로 열리지 않는다** (2026-08-13 실측).
 *
 * `docs/CHANGELOG.md` 의 머리 인용구("Major change history … not PR-level
 * granularity")는 저장소 기여자에게 이 파일을 어떻게 쓰라고 말하는 메타다.
 * 화면의 lead(「무엇이 언제 바뀌었는지. 최신이 위입니다.」)가 같은 말을
 * 사용자 언어로 이미 하므로, KO 방문자의 첫 문단이 영어 관리 문서가 되는
 * 것은 중복이자 용어 누출이었다. 본문은 첫 날짜 항목부터 시작해야 한다.
 */
test("변경 내역 본문은 기여자용 머리말 없이 첫 항목부터 시작한다", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.goto("/ko/changelog/?guides=off", { waitUntil: "domcontentloaded" });
  const body = page.getByTestId("gateway-doc-body");
  await expect(body).toBeVisible();
  await expect(body).not.toContainText("PR-level granularity");
  // 첫 자식이 인용구가 아니라 날짜 항목(h2)이다 — 머리말이 사라진 자리에
  // 다른 무언가가 슬며시 서지 않는지까지 잰다.
  const firstTag = await body.evaluate((el) => el.firstElementChild?.tagName ?? null);
  expect(firstTag).toBe("H2");
});
