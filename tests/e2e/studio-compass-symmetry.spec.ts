import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * 나침 무대의 **좌우 대칭** — 점선이 닿는 자리와 상자의 중심이 같은가.
 *
 * ## 무엇을 지키나
 *
 * 공방은 관계 종류를 고정 방위에 놓는다(UP=is_a · DOWN=contains ·
 * RIGHT=depends · LEFT=relates). 「나침」이라는 그림의 뜻 전부가 그 방위의
 * 대칭에 있다. 좌·우 팔은 점선이 상자의 **세로 한가운데**로 들어오도록
 * 그려지므로(`StudioCompass` `layoutLane` 의 `struts`/`anchor`), 상자의 중심이
 * 그 자리에서 벗어나면 도해가 자기 문법을 어긴다.
 *
 * ## 왜 기계가 재야 하나
 *
 * 2026-08-04 실측: LEFT 질문(「비슷하거나 대체할 수 있는 것은?」)이 **한글
 * 기본 화면(1512×900)에서 이미 두 줄로 감겨** 상자가 64 → 82px 로 자랐다.
 * 상자는 `top` 고정 + `minHeight` 라 **아래로만** 자랐고, 그래서 점선이 닿는
 * 자리가 상자 중심에서 **9px**(영어는 8px) 빗나갔다. 코드에는 아무 값도 안
 * 남는 결함이다 — 두 값 다 정당한 램프 안이고 lint 가 볼 것이 없다. 재야만
 * 보인다.
 *
 * 그 자리의 주석은 이 성장을 「영어처럼 긴 문장일 때를 위한 의도」로 적어
 * 뒀는데, 한글 기본 화면에서 이미 발동하므로 그 전제가 틀렸다.
 *
 * ## 기준선을 무엇으로 잡나
 *
 * 중심 카드다. 카드는 언제나 무대의 세로 한가운데(CY)에 앉고(`cardTop =
 * CY - cardH / 2`), 좌·우 팔의 점선도 그 CY 로 들어온다. 그래서 「카드 중심 =
 * 좌우 소켓 중심」한 줄이 방위·모드·로케일과 무관한 계약이 된다.
 */

/** 1024 폭에서 무대는 0.797 로 축소된다 — 부분 픽셀 반올림만 허용한다. */
const CENTERLINE_TOLERANCE_PX = 0.75;

type SocketBox = {
  bearing: string;
  centerY: number;
  height: number;
  width: number;
};

async function measureStage(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const card = document.querySelector('[data-testid="studio-center-card"]');
    if (!card) return null;
    const cardRect = card.getBoundingClientRect();
    const sockets = [...document.querySelectorAll('[data-testid^="studio-socket-"]')].map(
      (el) => {
        const rect = el.getBoundingClientRect();
        return {
          bearing: (el.getAttribute("data-testid") ?? "").replace("studio-socket-", ""),
          centerY: rect.y + rect.height / 2,
          height: rect.height,
          width: rect.width,
        };
      },
    );
    return { cardCenterY: cardRect.y + cardRect.height / 2, sockets };
  });
}

for (const locale of ["ko", "en"] as const) {
  for (const width of [1512, 1280] as const) {
    test(`나침 무대 좌우 소켓의 중심선이 카드 중심과 같다 (${locale} · ${width}px)`, async ({
      page,
    }) => {
      await seedFirstRunSeen(page);
      await page.setViewportSize({ width, height: 900 });
      // create 모드는 네 방위가 전부 빈 소켓이라 좌·우가 한 화면에 같이 선다.
      await page.goto(`/${locale}/ontology/studio/?guides=off&mode=create`, {
        waitUntil: "networkidle",
      });

      const stage = page.getByTestId("studio-compass-stage");
      await expect(stage).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("studio-socket-left")).toBeVisible();
      await expect(page.getByTestId("studio-socket-right")).toBeVisible();

      const measured = await measureStage(page);
      expect(measured, "중심 카드가 없으면 이 게이트는 아무것도 안 잰다").not.toBeNull();

      const sockets = measured!.sockets as SocketBox[];
      const horizontal = sockets.filter((s) => s.bearing === "left" || s.bearing === "right");
      expect(
        horizontal.map((s) => s.bearing).sort(),
        "좌·우 소켓이 둘 다 있어야 대칭을 잴 수 있다",
        // 검사가 빈 집합 위에서 조용히 통과하는 것을 막는다.
      ).toEqual(["left", "right"]);

      for (const socket of horizontal) {
        expect(
          Math.abs(socket.centerY - measured!.cardCenterY),
          `${socket.bearing} 소켓의 중심선이 카드 중심에서 벗어났다 — 점선이 상자 한가운데로 안 들어온다 (h=${socket.height})`,
        ).toBeLessThanOrEqual(CENTERLINE_TOLERANCE_PX);
      }

      const left = horizontal.find((s) => s.bearing === "left")!;
      const right = horizontal.find((s) => s.bearing === "right")!;
      expect(
        Math.abs(left.centerY - right.centerY),
        "좌우 팔의 중심선이 서로 다르다 — 나침의 대칭이 깨졌다",
      ).toBeLessThanOrEqual(CENTERLINE_TOLERANCE_PX);
      expect(left.width, "좌우 팔의 폭은 같다").toBe(right.width);

      // 이 스펙이 재는 결함은 「자란 상자」에서만 나타난다. 아무것도 안 자라는
      // 화면만 재고 있으면 검사기가 헛도는 것이므로 그때 알아야 한다. 기준선은
      // 같은 렌더 안에서 절대 안 감기는 DOWN 소켓이다(숫자를 박지 않는다).
      const down = sockets.find((s) => s.bearing === "down");
      expect(down, "DOWN 소켓이 없으면 기준 높이를 못 잡는다").toBeTruthy();
      if (locale === "en") {
        expect(
          Math.max(left.height, right.height),
          "영어에서 좌·우 소켓이 하나도 안 감겼다 — 문안이나 폭이 바뀌었으니 이 게이트의 전제를 다시 확인해라",
        ).toBeGreaterThan(down!.height);
      }
    });
  }
}
