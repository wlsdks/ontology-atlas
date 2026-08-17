import { expect, test, type ConsoleMessage } from "@playwright/test";

/**
 * 공개 화면이 **조용히 깨져 있지 않은가** — 좁은 화면과 콘솔, 두 가지.
 *
 * ## 이 파일이 세 파일을 대신한다 (2026-08-16)
 *
 * 이 자리에는 스펙이 셋 있었고 **셋 다 단언이 하나도 없었다**:
 *
 * | 파일 | 줄 | `expect` |
 * |---|---:|---:|
 * | `mobile-overflow-check.spec.ts` | 23 | **0** |
 * | `mobile-keyboard-audit.spec.ts` | 89 | **0** |
 * | `ui-audit-v2.spec.ts` | 101 | **0** |
 *
 * 셋 다 값을 모아 `console.log` 로 뿌리거나 `output/` 에 스크린샷을 남길 뿐이라,
 * **무엇이 깨져도 초록이었다.** 게다가 첫째는 2026-05-03 에 지워진 위젯
 * (`project-knowledge-topology`)을 셀렉터로 쓰고 있어서 재는 대상 자체가
 * 없었고, 셋째는 페이지 이동 실패조차 `console.log` 로 삼켰다(500 이 떠도 통과).
 * 이 저장소의 규율 그대로다 — **한 번도 빨개질 수 없는 검사는 없는 검사와
 * 구별되지 않는다.**
 *
 * 그렇다고 그 셋이 모으던 것이 쓸모없지는 않았다. 그래서 **모으던 것을 단언으로
 * 바꿨다**: 가로 넘침과 콘솔 오류. 둘 다 사용자가 곧바로 겪는 것이고, 둘 다
 * 화면을 안 열어 보면 모르는 것이다.
 *
 * 셋째 파일이 하던 단축키 확인(⌘K · ?)은 **버리지 않았다** — 그 둘은 이미
 * 단언이 있는 스펙들이 덮고 있다(`docs-rename-address` · `user-journey-a` ·
 * `destination-shortcuts` · `keyboard-path` · `map-keyboard-walk`).
 *
 * ## 켤 때 위반 수
 *
 * **0**. 아래 여섯 라우트를 390×844 에서 재 봤고 넘침도 콘솔 오류도 없었다.
 * 그래서 이 검사는 오늘 상태를 그대로 잠그는 것이지, 새 빚을 만드는 것이 아니다.
 */

/** 로그인 없이 아무나 여는 화면들 — 첫인상이 여기서 정해진다. */
const PUBLIC_ROUTES = [
  "/en/",
  "/en/topology/",
  "/en/docs/",
  "/en/projects/",
  "/en/download/",
  "/en/guide/",
] as const;

/** 폰 기준 폭. 이 저장소의 반응형 계약이 재는 가장 좁은 칸과 같다. */
const PHONE = { width: 390, height: 844 };

/**
 * 걸러 낼 소음.
 *
 * 지금은 비어 있다 — 켤 때 실측이 0이었으므로 면제가 필요 없었다. 나중에 무엇을
 * 넣게 되면 **그 자리에 이유를 적는다**: 면제는 「이 오류는 우리 것이 아니다」
 * 라는 주장이고, 근거 없는 주장은 검사를 조용히 껐다는 뜻이다.
 */
const IGNORED_CONSOLE: RegExp[] = [];

test.describe("공개 화면 건강 — 좁은 화면과 콘솔", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`${route} — 가로로 넘치지 않고 콘솔이 조용하다`, async ({ page }) => {
      const problems: string[] = [];
      page.on("console", (message: ConsoleMessage) => {
        if (message.type() !== "error") return;
        const text = message.text();
        if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
        problems.push(`console: ${text.slice(0, 200)}`);
      });
      page.on("pageerror", (error: Error) => {
        problems.push(`pageerror: ${error.message.slice(0, 200)}`);
      });

      await page.setViewportSize(PHONE);
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      // ⚠️ 종전 스펙은 이동 실패를 `console.log` 로 삼켰다 — 500 이 떠도 통과했다.
      expect(response?.ok(), `${route} 를 열지 못했다 (${response?.status()})`).toBe(true);
      await page.waitForTimeout(1_200);

      const width = await page.evaluate(() => ({
        /*
         * ⚠️ **`documentElement.scrollWidth` 로 재면 안 된다** — 이 앱은
         * `html`·`body` 에 `overflow-x: hidden` 이 걸려 있어서 그 값은
         * **언제나** `clientWidth` 와 같다. 그걸로 쓴 첫 판은 2000px 짜리
         * 원소를 일부러 심어도 초록이었다 — 즉 **한 번도 빨개질 수 없는
         * 검사**였고, 그건 이 파일이 걷어낸 세 스펙과 같은 병이다.
         *
         * `body.scrollWidth` 는 넘치는 내용을 실제로 반영한다(심어 본 2000px 가
         * 그대로 잡혔다). 그리고 자기 상자 안에서 잘리는 라벨 같은 것은 안
         * 잡는다 — 그건 페이지 넘침이 아니라 그 상자의 일이라 옳다.
         */
        scroll: document.body.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      /*
       * 1px 여유는 소수 픽셀 반올림 몫이다. 그보다 넘치면 화면 밖으로 밀려난
       * 내용이 잘려서 아예 닿을 수 없게 되고, 그건 이 저장소가 「넓은 것은
       * 자기 상자 안에서 스크롤한다」고 적어 둔 그 규칙을 어긴 것이다.
       */
      expect(
        width.scroll,
        `${route} 가 ${PHONE.width}px 에서 가로로 넘친다 (${width.scroll} > ${width.client}). ` +
          "표·코드블록·도해처럼 넓은 것은 자기 상자 안에서 스크롤해야 한다.",
      ).toBeLessThanOrEqual(width.client + 1);

      expect(problems, `${route} 에서 콘솔 오류가 났다:\n  ${problems.join("\n  ")}`).toEqual([]);
    });
  }
});
