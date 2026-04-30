import { expect, test } from "@playwright/test";
import { createAccountMemberUser } from "./support/emulator-admin";

/**
 * 멤버 초대 panel 렌더링 검증.
 * - owner 만 "공간 멤버" card 를 본다.
 * - 초대 form 이 email input · role select · 초대 button 을 포함한다.
 * - 현재 멤버 목록에 자기 자신이 "나" 배지와 함께 표시.
 *
 * 실 Cloud Function 호출 (inviteAccountMember) 은 emulator 에 함수가 없어
 * 403/500 으로 실패하므로 UI 렌더까지만 검증. 실 invite/remove 동작은 stage
 * 배포 환경에서 수동 smoke 대상.
 */
test.describe("멤버 초대 panel", () => {
  test("owner 는 account-settings 에서 '공간 멤버' card 를 본다", async ({ page }) => {
    const suffix = Date.now();
    const email = `owner-invite-${suffix}@narnia.local`;
    const password = "narnia-pass-123";
    const displayName = `owner ${suffix}`;

    await createAccountMemberUser({
      email,
      password,
      displayName,
      accountId: "sandbox-lab",
      role: "owner",
    });

    await page.goto("/login/?account=sandbox-lab");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(password);
    await page.getByRole("button", { name: "이메일로 로그인" }).click();

    await page.goto("/account/?account=sandbox-lab");

    // 멤버 card 는 canManage (owner) 에게만 노출.
    const membersCard = page.getByRole("heading", { name: "공간 멤버" });
    await expect(membersCard).toBeVisible();

    // 초대 form 요소 존재 확인.
    await expect(page.getByPlaceholder("member@team.com")).toBeVisible();
    const roleSelect = page.getByRole("combobox");
    await expect(roleSelect).toBeVisible();
    await expect(page.getByRole("button", { name: /초대/ })).toBeVisible();

    // "현재 멤버" 목록에 자기 이메일 + "나" 배지.
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText("나", { exact: true })).toBeVisible();
  });

  test("editor 는 '공간 멤버' card 를 보지 못한다 (owner 전용)", async ({ page }) => {
    const suffix = Date.now();
    const email = `editor-${suffix}@narnia.local`;
    const password = "narnia-pass-123";
    const displayName = `editor ${suffix}`;

    await createAccountMemberUser({
      email,
      password,
      displayName,
      accountId: "sandbox-lab",
      role: "editor",
    });

    await page.goto("/login/?account=sandbox-lab");
    await page.getByLabel("이메일").fill(email);
    await page.getByLabel("비밀번호").fill(password);
    await page.getByRole("button", { name: "이메일로 로그인" }).click();

    await page.goto("/account/?account=sandbox-lab");
    await expect(page.getByRole("heading", { name: "공간 멤버" })).toHaveCount(0);
  });
});
