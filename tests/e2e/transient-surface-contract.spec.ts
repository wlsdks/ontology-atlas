import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { FIRST_RUN_STARTER_DISMISSED_KEY } from "../../src/features/first-run-starter/model/first-run-starter-dismiss";

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

/**
 * 훑는 라우트 — **목적지 전부**(2026-08-11 확장). 관문 읽을거리(`/guide`·`/changelog`)는
 * 여닫는 트리거가 0개라 넣어도 아무것도 안 잰다(실측).
 */
const ROUTES = [
  "/ko/",
  "/ko/topology/",
  "/ko/docs/",
  "/ko/ontology/studio/",
  "/ko/ontology/insights/",
  "/ko/projects/",
  "/ko/project/new/",
  "/ko/agents/",
  "/ko/git/",
] as const;

/**
 * **이 스윕이 반드시 열어야 하는 종류** — 런타임에 단언하고, 선언 계약이 이 줄을 읽는다
 * (`transient-surface-declaration.contract.test.ts`).
 *
 * 스윕은 화면에서 종류를 읽어 오므로 코드에 종류 문자열이 남지 않는다. 그래서 「어느
 * 종류가 실제로 재지고 있나」를 정적으로 알 방법이 없었다 — 이 줄이 그 구멍을 메운다.
 */
const SWEEP_MUST_OPEN = ["sheet"] as const;

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

    console.log(
      `[transient-sweep] 라우트 ${ROUTES.length} · 열어 본 표면 ${opened.length}개 · ` +
        `종류 ${[...new Set(opened.map((o) => o.kind))].join(",")}`,
    );

    for (const kind of SWEEP_MUST_OPEN) {
      expect(
        opened.map((o) => o.kind),
        `스윕이 ${kind} 를 한 번도 열지 못했다 — 사정거리가 줄었다`,
      ).toContain(kind);
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
    /*
     * ⚠️ **「시작하기」 카드를 접어 둔다.** 볼트를 안 고른 브라우저에서는 그 카드가
     * 캔버스를 덮어 **마우스로 여는 표면에 닿을 수 없다**(실측: `.map-overlay-in` 이
     * 오른쪽 클릭을 삼키고, 그 클릭이 팝오버까지 닫았다). 키보드는 통과하므로 위의
     * 걷기 시험들은 영향을 받지 않았고, 그래서 이 구멍이 여태 안 보였다.
     *
     * 접는 방법은 제품이 이미 가진 것을 쓴다 — 「그냥 둘러볼게요」가 쓰는 그 키다.
     * 시험용 우회로를 새로 만들지 않는다.
     */
    await page.addInitScript((key: string) => {
      try {
        window.sessionStorage.setItem(key, "1");
      } catch {
        /* private mode */
      }
    }, FIRST_RUN_STARTER_DISMISSED_KEY);
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

  /**
   * **노드 팝오버(`anchored`)를 실제로 열어 잰다** (2026-08-11).
   *
   * ⚠️ 라우트 훑기는 `[aria-expanded]`·`[aria-haspopup]` 트리거로 여는 것만 본다.
   * 실측: 9라우트에서 열린 표면 8개가 **전부 `sheet`** 였다. 그래서 캔버스 위에서만
   * 열리는 종류는 여기서 따로 연다 — **선언만 해 두고 아무도 재지 않으면 그 선언은
   * 장식이다**(이 변경의 결정 기록에 적어 둔 반대 의견이 그것이었다).
   *
   * ⚠️ **노드를 마우스로 누르지 않는다.** 볼트를 안 고른 브라우저에서는 지도 위 패널이
   * 캔버스를 덮어 클릭이 그 패널에 먹힌다(실측: 오른쪽 클릭이 120초 타임아웃, 그리고
   * 그 클릭이 팝오버까지 닫았다). 방향키로 고르면 같은 팝오버가 열린다 — 사용자 흐름
   * 으로도 그게 맞고, 이 시험이 재려는 것은 「무엇으로 열었나」가 아니라 「열린 것이
   * 계약을 지키나」다.
   */
  test("노드 팝오버가 부른 것 옆에 서고 Escape 로 닫힌다", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1512, height: 900 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?e2e=1&guides=off");
    const canvas = page.getByTestId("topology-map-v2-canvas");
    await canvas.waitFor({ state: "visible", timeout: 20_000 });
    await expect
      .poll(() => page.evaluate(() => window.__atlasMap?.nodes().length ?? 0), { timeout: 20_000 })
      .toBeGreaterThan(3);
    await canvas.focus();

    await page.keyboard.press("ArrowRight");
    const anchored = page.locator('[data-transient-surface="anchored"]').first();
    await expect(anchored, "노드를 골랐는데 팝오버가 종류를 선언하지 않는다").toBeVisible({ timeout: 8_000 });

    const geom = await page.evaluate(() => {
      const probe = window.__atlasMap;
      const id = probe?.selection().nodeId;
      const node = probe?.nodes().find((n) => n.id === id);
      const box = document.querySelector('[data-surface-role="map-canvas"]')!.getBoundingClientRect();
      const el = document.querySelector('[data-transient-surface="anchored"]')!;
      const surface = el.getBoundingClientRect();
      if (!node) return null;
      return {
        dx: Math.abs(surface.x + surface.width / 2 - (box.x + node.x)),
        canvasWidth: box.width,
        animated: (el.getAnimations?.({ subtree: true }) ?? []).length > 0,
        tookFocus: el.contains(document.activeElement),
      };
    });
    expect(geom, "고른 노드를 못 찾았다 — 이 시험이 공회전한다").not.toBeNull();
    // 「부른 것 옆」 — 한 화면 반보다 멀면 원인과 이어지지 않는다.
    expect(geom!.dx, "팝오버가 고른 노드에서 너무 멀다").toBeLessThan(geom!.canvasWidth / 2);
    /*
     * `anchored` 는 초점을 받아도 되지만, **방향키로 고른 경우에는 받아선 안 된다** —
     * 받으면 다음 방향키가 지도에 도착하지 않고, 그게 2026-08-10 결함의 정확한 모양이다.
     */
    expect(geom!.tookFocus, "방향키로 열린 팝오버가 초점을 가져갔다 — 다음 걸음이 막힌다").toBe(false);

    /*
     * ⚠️ **카메라 전환이 끝난 뒤에 닫는다.** 전환 중에 Escape 를 누른 판은 팝오버가
     * 그대로 남았다(실측). 사람은 지도가 움직이는 동안 닫지 않고, 이 시험이 재려는 것은
     * 「닫히나」이지 「전환 중에도 닫히나」가 아니다.
     */
    await page.waitForTimeout(600);
    await page.keyboard.press("Escape");
    await expect(anchored, "Escape 로 팝오버가 닫히지 않는다").toBeHidden({ timeout: 4_000 });
    // 초점은 캔버스에 남아야 한다 — 여기서는 캔버스가 「부른 것」이다.
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("data-surface-role") === "map-canvas"),
      "팝오버를 닫고 나서 초점이 지도를 떠났다",
    ).toBe(true);
  });
});
