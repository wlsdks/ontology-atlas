import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **잠깐 뜨는 표면의 3계약을 전 라우트에서 훑는다** (2026-08-11).
 *
 * ## 왜 이 스펙이 생겼나
 *
 * 2026-08-10 에 소유자가 실물에서 결함 셋을 찾았다 — 지도 막다른 길 안내가 화면
 * 구석에 떴고, 스스로 사라지지 않았고, 떠 있는 동안 방향키가 안 먹었다.
 * **그것을 볼 수 있는 검사가 하나도 없었다.**
 *
 * 처음에는 표시 없이 훑어 봤다. 그러자 계기가 「화면에 뜬 것 중 가장 큰 요소」를
 * 표면으로 골라 다이얼로그 대신 **스크림**을 쟀고, 위반 6건이 떴는데 전부 계기
 * 탓이었다(설정 시트는 Escape 로 잘 닫히고 초점도 돌아온다). 그래서 표면이 **자기
 * 종류를 선언**하게 했다(`shared/ui/transient-surface.ts`) — 이 스펙은 그 선언만
 * 재고, 짐작하지 않는다.
 *
 * ## 종류마다 다른 성질을 잰다
 *
 * - **전부**: 나타날 때 움직인다(하드컷이 아니다).
 * - `notice` · `hint`: **초점을 받지 않는다.** 이 하나가 2026-08-10 결함 셋 중 둘을
 *   구조적으로 불가능하게 만든다 — 초점을 못 받으면 키를 가로챌 수도, 사라지는
 *   시계를 멈출 수도 없다.
 * - `anchored` · `menu` · `sheet`: Escape 로 닫히고 **초점이 부른 것으로 돌아온다.**
 *
 * ## 공회전 차단
 *
 * 선언한 표면을 하나도 못 열었으면 이 스펙은 아무것도 안 잰 것이다. 그래서 열어 본
 * 개수를 단언한다 — 「통과」와 「빈손」을 구별하려는 것이고, 그것이 이 저장소가
 * 2026-08 에 릴리스 하나를 잃은 방식이다.
 */

const ROUTES = ["/ko/topology/", "/ko/docs/", "/ko/ontology/insights/"] as const;

const FOCUSLESS = new Set(["notice", "hint"]);
const NEEDS_ESCAPE = new Set(["anchored", "menu", "sheet"]);

/** 이 스윕이 실제로 열어 본 표면의 최소 개수 — 2026-08-11 실측값에서 내려온다. */
const MIN_OPENED = 3;

/** 지금 화면에 **보이는** 선언 표면의 종류들. */
const visibleKinds = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[data-transient-surface]")]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return box.width > 8 && box.height > 8 && style.visibility !== "hidden" && Number(style.opacity) > 0.02;
      })
      .map((el) => (el as HTMLElement).dataset.transientSurface!),
  );

interface Opened {
  kind: string;
  route: string;
  trigger: string;
  animated: boolean;
  tookFocus: boolean;
  dx: number;
  dy: number;
}

test.describe("잠깐 뜨는 표면 3계약", () => {
  test("선언한 표면이 자기 계약을 지킨다", async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width: 1512, height: 900 });
    await seedFirstRunSeen(page);

    const opened: Opened[] = [];
    const violations: string[] = [];

    for (const route of ROUTES) {
      await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1_000);

      const triggerCount = await page.evaluate(
        () =>
          [...document.querySelectorAll("[aria-expanded],[aria-haspopup]")].filter((el) => {
            const box = el.getBoundingClientRect();
            return box.width > 1 && box.height > 1;
          }).length,
      );

      for (let index = 0; index < triggerCount; index += 1) {
        /*
         * ⚠️ **트리거마다 새로 로드한다.** 한 로드에서 여러 트리거를 연달아 열어 본 판이
         * 「초점이 안 돌아온다」를 두 라우트에서 헛보고했다 — 실패 메시지에 초점 위치를
         * 실어 보니 **직전 트리거**(`app-nav-rail-agent-status`)에 있었다. 앞 트리거가
         * 남긴 초점·상태가 다음 판정을 오염시킨 것이다. 손으로 깨끗하게 열어 재면 세
         * 라우트 다 트리거로 돌아온다.
         *
         * 되짚어 보면 이 스윕은 계기를 **다섯 번** 고쳐야 진실을 말했다(가장 큰 요소를
         * 표면으로 오인 · 남은 표면을 이번 것으로 오인 · 퇴장을 기다리지 않음 · 리렌더에
         * 지워지는 표시로 초점 비교 · 트리거끼리 오염). 그 자체가 이 파일의 존재 이유다:
         * **재는 도구가 틀리면 초록도 빨강도 증거가 아니다.**
         */
        if (index > 0) {
          await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(900);
        }
        const trigger = await page.evaluate((idx) => {
          const el = [...document.querySelectorAll("[aria-expanded],[aria-haspopup]")].filter((candidate) => {
            const box = candidate.getBoundingClientRect();
            return box.width > 1 && box.height > 1;
          })[idx] as HTMLElement | undefined;
          if (!el) return null;
          el.dataset.sweepTrigger = "1";
          const box = el.getBoundingClientRect();
          return {
            name: el.dataset.testid ?? el.getAttribute("aria-label") ?? el.tagName,
            cx: box.x + box.width / 2,
            cy: box.y + box.height / 2,
          };
        }, index);
        if (!trigger) continue;


        await page.locator("[data-sweep-trigger]").first().focus();
        await page.keyboard.press("Enter");
        // 등장 첫 프레임 직후 — 여기서 재야 애니메이션이 아직 살아 있다.
        await page.waitForTimeout(70);

        const shot = await page.evaluate(() => {
          const el = [...document.querySelectorAll("[data-transient-surface]")].find((candidate) => {
            const box = candidate.getBoundingClientRect();
            const style = getComputedStyle(candidate);
            return box.width > 8 && box.height > 8 && style.visibility !== "hidden" && Number(style.opacity) > 0.02;
          }) as HTMLElement | undefined;
          if (!el) return null;
          const box = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            kind: el.dataset.transientSurface!,
            animated:
              (el.getAnimations?.({ subtree: true }) ?? []).length > 0 ||
              (style.transitionDuration !== "0s" && style.transitionProperty !== "none"),
            tookFocus: el.contains(document.activeElement),
            cx: box.x + box.width / 2,
            cy: box.y + box.height / 2,
          };
        });

        if (shot) {
          opened.push({
            kind: shot.kind,
            route,
            trigger: trigger.name,
            animated: shot.animated,
            tookFocus: shot.tookFocus,
            dx: Math.abs(shot.cx - trigger.cx),
            dy: Math.abs(shot.cy - trigger.cy),
          });

          if (!shot.animated) {
            violations.push(`하드컷 · ${route} ${trigger.name} → ${shot.kind}`);
          }
          if (FOCUSLESS.has(shot.kind) && shot.tookFocus) {
            violations.push(
              `초점을 가져갔다 · ${route} ${trigger.name} → ${shot.kind} (키를 가로채고 스스로 사라지지 못한다)`,
            );
          }

          /*
           * ⚠️ **자리를 잡을 시간을 준다.** 등장 70ms 만에 Escape 를 누른 첫 판이
           * 「초점이 안 돌아온다」를 두 라우트에서 헛보고했다 — 시트가 아직 자기 안으로
           * 초점을 옮기는 중이었고, 그 중간에 닫으면 되돌릴 자리가 정해지지 않는다.
           * 사람은 70ms 만에 닫지 않는다. 애니메이션 측정은 이미 위에서 끝났다.
           */
          await page.waitForTimeout(420);
          await page.keyboard.press("Escape");
          /*
           * ⚠️ **퇴장은 기다려야 한다.** 한 번만 재고 판정한 첫 판이 「Escape 로 안
           * 닫힌다」를 두 번 헛보고했다 — 360ms 시점에는 퇴장 애니메이션이 아직
           * 화면에 남아 있었다. 사라짐의 기준은 「그 순간」이 아니라 「곧」이다.
           */
          /*
           * ⚠️ **그 종류만 본다.** 「선언 표면이 하나도 없나」로 물었던 첫 판은, 지도에서
           * 다른 표면(호버 카드 · 상세 패널)이 떠 있기만 해도 「Escape 로 안 닫힌다」로
           * 보고했다. 닫혔는지는 **그 표면**의 질문이다.
           */
          let stillOpen = true;
          for (let wait = 0; wait < 6; wait += 1) {
            await page.waitForTimeout(220);
            if (!(await visibleKinds(page)).includes(shot.kind)) {
              stillOpen = false;
              break;
            }
          }
          /*
           * ⚠️ **초점 복귀는 정체성으로 비교한다 — DOM 에 심은 표시로 하면 안 된다.**
           * 첫 판은 `[data-sweep-trigger]` 를 찾아 비교했는데, 표면이 닫히며 그 부분이
           * 다시 그려지는 화면(`/docs` · `/ontology/insights`)에서는 그 표시가 사라져
           * **초점이 제대로 돌아왔는데도** 「안 돌아온다」로 보고했다. 손으로 재 보니
           * 세 라우트 다 트리거로 돌아온다.
           */
          const after = await page.evaluate(
            ({ open, name }) => {
              const active = document.activeElement as HTMLElement | null;
              const identity = active?.dataset.testid ?? active?.getAttribute("aria-label") ?? active?.tagName ?? "";
              return { stillOpen: open, focusBack: identity === name, landed: identity };
            },
            { open: stillOpen, name: trigger.name },
          );
          if (NEEDS_ESCAPE.has(shot.kind)) {
            if (after.stillOpen) violations.push(`Escape 로 안 닫힌다 · ${route} ${trigger.name} → ${shot.kind}`);
            else if (!after.focusBack) {
              violations.push(
                `초점이 안 돌아온다 · ${route} ${trigger.name} → ${shot.kind} (초점은 "${after.landed}" 에 있다)`,
              );
            }
          }
        } else {
          await page.keyboard.press("Escape").catch(() => {});
        }

        await page.evaluate(() => {
          document.querySelector("[data-sweep-trigger]")?.removeAttribute("data-sweep-trigger");
        });
      }
    }

    expect(
      opened.length,
      `선언한 표면을 ${opened.length}개만 열었다 — 이 스윕이 공회전한다(표시가 빠졌거나 트리거를 못 눌렀다)`,
    ).toBeGreaterThanOrEqual(MIN_OPENED);
    expect(violations, `잠깐 뜨는 표면 계약 위반:\n${violations.join("\n")}`).toEqual([]);
  });

  /**
   * **막다른 길 안내는 초점을 받을 수 없다** — 위 스윕은 트리거로 열리는 것만 훑으므로
   * 키보드로만 나타나는 이 표면은 따로 잰다. 2026-08-10 결함의 직계 게이트다.
   */
  test("키보드로만 나타나는 안내도 초점을 받지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?e2e=1&guides=off");
    const canvas = page.getByTestId("topology-map-v2-canvas");
    await canvas.waitFor({ state: "visible", timeout: 20_000 });
    await canvas.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
    let found = false;
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(140);
      if ((await page.locator('[data-transient-surface="notice"]').count()) > 0) {
        found = true;
        break;
      }
    }
    expect(found, "안내가 종류를 선언하지 않는다 — 스윕이 이것을 잴 수 없다").toBe(true);
    const state = await page.evaluate(() => {
      const el = document.querySelector('[data-transient-surface="notice"]')!;
      return {
        tookFocus: el.contains(document.activeElement),
        canFocus: el.querySelectorAll('button,a[href],input,[tabindex]:not([tabindex="-1"])').length,
        animated: (el.getAnimations?.({ subtree: true }) ?? []).length > 0,
      };
    });
    expect(state.tookFocus, "안내가 초점을 가져갔다").toBe(false);
    expect(state.canFocus, "안내 안에 초점을 받을 수 있는 것이 있다 — 그것이 키를 가로챈다").toBe(0);
    expect(state.animated, "안내가 하드컷으로 나타났다").toBe(true);
  });
});
