import { expect, test, type Page } from "@playwright/test";

/**
 * 프로그램이 옮긴 포커스가 **브라우저 기본 링을 그리지 않는다.**
 *
 * ## 왜 이 게이트가 생겼나 (2026-08-04 디자인 감사)
 *
 * 첫 실행 시트 「내 폴더를 지도로 켜기」는 열릴 때 `tabIndex={-1}` 컨테이너로
 * 포커스를 옮긴다 — 스크린리더가 제목부터 읽게 하는 올바른 처리다. 그런데 그
 * 컨테이너에 링을 끄는 처리가 없어서, `:focus-visible` 이 걸리고 브라우저 기본
 * 포커스 링(**시스템 하늘색** `rgb(153, 200, 255)`)이 모달 둘레에 그려졌다.
 *
 * 이게 왜 결함인가:
 *
 * - 헌장은 **무채색 + 인디고 하나**다(`forbidden.md` — "둘 이상의 채색 시스템
 *   금지"). 시스템 하늘색은 그 밖의 색이다.
 * - 하필 **앱을 처음 켜면 가장 먼저 보이는 모달**이고, 설치된 앱의 WKWebView
 *   에서는 더 두껍게 그려진다(앱·웹 양쪽 실측 재현).
 * - 그 링은 «누를 수 있다» 는 뜻인데 이 컨테이너는 누르는 것이 아니다 —
 *   신호가 거짓이다.
 *
 * ## ⚠️ 재현 경로가 「클릭해서 열기」가 아니다
 *
 * 처음 이 게이트를 쓸 때 시트를 **버튼 클릭으로** 열었더니 링이 안 나왔다.
 * Chrome 은 마지막 입력이 포인터였으면 프로그램 포커스에 `:focus-visible` 을
 * 안 걸기 때문이다. 결함이 실제로 사는 자리는 **첫 방문에 시트가 저절로 열리는
 * 경로** — 그때는 아직 아무 포인터 조작이 없어서 `:focus-visible` 이 걸리고
 * 링이 그려진다. 앱을 처음 켠 사람이 보는 것도 정확히 그 화면이다.
 * 클릭으로 여는 검사는 **결함이 살아 있어도 초록**이 된다.
 *
 * ## 이 검사가 «값 규칙» 이 아니라 e2e 인 이유
 *
 * 위반이 코드에 **아무 값도 남기지 않는다.** 빠진 것은 클래스 하나이고, 링을
 * 그리는 쪽은 브라우저 기본 스타일시트다. lint 로 볼 것이 없다 — 실제로 열어서
 * 계산된 `outline` 을 읽는 수밖에 없다. (`design.md` "lint 가 못 보는 층은
 * 계약 테스트가 맡는다" 와 같은 부류.)
 */
/**
 * 첫 방문 그대로 연다 — `seedFirstRunSeen` 도 `?guides=off` 도 쓰지 않고,
 * **아무것도 클릭하지 않는다**(위 경고 참고).
 */
async function openGuideSheetOnFirstRun(page: Page) {
  await page.goto("/ko/topology/");
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible({ timeout: 20_000 });
}

test("첫 실행 시트 — 프로그램 포커스가 브라우저 기본 링을 그리지 않는다", async ({ page }) => {
  await openGuideSheetOnFirstRun(page);

  const probe = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>("[data-testid='vault-guide-sheet']");
    if (!dialog) return null;
    const cs = getComputedStyle(dialog);
    return {
      focused: document.activeElement === dialog,
      focusVisible: dialog.matches(":focus-visible"),
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
    };
  });

  expect(probe, "시트를 못 찾았다").not.toBeNull();

  // ① 포커스는 **여전히** 컨테이너에 있어야 한다 — 링을 지우려고 접근성
  //    처리를 같이 지우면 고친 게 아니라 다른 것을 깬 것이다.
  expect(probe!.focused, "시트가 포커스를 안 받는다 — 스크린리더 낭독 시작점이 사라졌다").toBe(
    true,
  );

  // ② 그런데 링은 그려지지 않아야 한다. `outline-style: auto` 가 곧 브라우저
  //    기본 링이다(우리 토큰 링은 `solid`/`ring-*` 로 그린다).
  expect(
    probe!.outlineStyle,
    `브라우저 기본 포커스 링이 살아 있다 (outline: ${probe!.outlineStyle} ${probe!.outlineWidth})`,
  ).not.toBe("auto");
});

/**
 * 검출기가 **빈 집합 위에서 돌고 있지 않은지** 확인한다(`/gate-probe`).
 *
 * 위 검사는 «`outline-style` 이 auto 가 아니다» 를 단언한다. 만약 시트가 아예
 * 포커스를 못 받게 되면 그 단언은 **자동으로 초록**이 되고, 게이트는 아무것도
 * 안 지키면서 통과한다. 그래서 같은 페이지에서 «기본 링이 실제로 그려지는
 * 원소» 를 하나 만들어, 이 판정 방식이 진짜로 auto 를 구별하는지 확인한다.
 */
test("판정 방식 자체가 기본 링을 구별한다 — 헛도는 검사가 아님", async ({ page }) => {
  await openGuideSheetOnFirstRun(page);

  const control = await page.evaluate(() => {
    const el = document.createElement("div");
    el.tabIndex = -1;
    el.setAttribute("data-probe", "focus-ring");
    document.body.append(el);
    el.focus();
    const cs = getComputedStyle(el);
    const out = { outlineStyle: cs.outlineStyle, focusVisible: el.matches(":focus-visible") };
    el.remove();
    return out;
  });

  expect(
    control.outlineStyle,
    "링을 끄지 않은 컨테이너가 auto 로 안 나온다 — 이 검사는 아무것도 못 잡는다",
  ).toBe("auto");
});
