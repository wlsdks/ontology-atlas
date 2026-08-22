import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { FIRST_RUN_STARTER_DISMISSED_KEY } from "../../src/features/first-run-starter/model/first-run-starter-dismiss";

/**
 * **Sweeps three contracts for transient surfaces across every route** (2026-08-11).
 *
 * ## Why this spec exists
 *
 * On 2026-08-10 the owner found three defects in the real product — the map's
 * dead-end notice appeared in a screen corner, never dismissed itself, and swallowed
 * the arrow keys while it was up. **No check could see any of it.**
 *
 * The first attempt swept without any declaration. The instrument then picked "the
 * largest visible element" as the surface and measured **the scrim** instead of the
 * dialog, producing 6 violations that were all the instrument's fault (the settings
 * sheet closes on Escape and returns focus correctly). So surfaces now **declare
 * their own kind** (`shared/ui/transient-surface.ts`) — this spec measures only that
 * declaration and never guesses.
 *
 * ## Each kind is measured for different properties
 *
 * - **All**: they move on appearance (no hard cut).
 * - `notice` · `hint`: **never take focus.** That one property makes two of the three
 *   2026-08-10 defects structurally impossible — without focus they cannot intercept
 *   keys or stop the dismissal timer.
 * - `anchored` · `menu` · `sheet`: close on Escape and **return focus to whatever
 *   opened them.**
 *
 * ## Idling guard
 *
 * If no declared surface was opened, this spec measured nothing. So the number
 * actually opened is asserted — to distinguish "passed" from "found nothing", which
 * is how this repository lost a release in 2026-08.
 */

/**
 * The routes swept — **every destination** (widened 2026-08-11). The gateway reading
 * surfaces (`/guide`, `/changelog`) have zero open/close triggers, so including them
 * would measure nothing (verified).
 */
const ROUTES = [
  "/ko/",
  "/ko/topology/",
  "/ko/docs/",
  "/ko/ontology/insights/",
  "/ko/projects/",
  "/ko/project/new/",
  "/ko/agents/",
  "/ko/git/",
] as const;

/**
 * **The kinds this sweep must open** — asserted at runtime, and the declaration
 * contract reads this line
 * (`transient-surface-declaration.contract.test.ts`).
 *
 * The sweep reads kinds off the screen, so no kind string remains in the code, and
 * there was no static way to know which kinds are actually being measured. This line
 * fills that hole.
 */
const SWEEP_MUST_OPEN = ["sheet"] as const;

const FOCUSLESS = new Set(["notice", "hint"]);
const NEEDS_ESCAPE = new Set(["anchored", "menu", "sheet"]);

/** The minimum number of surfaces this sweep must actually open — derived from the 2026-08-11 measurement. */
const MIN_OPENED = 3;

/** The kinds of declared surfaces currently **visible** on screen. */
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
         * ⚠️ **Reload for every trigger.** A version that opened several triggers in a row
         * on one load falsely reported "focus does not return" on two routes — putting the
         * focus location into the failure message showed it on **the previous trigger**
         * (`app-nav-rail-agent-status`). The focus and state left by the earlier trigger
         * contaminated the next verdict. Opening each cleanly by hand returns focus to the
         * trigger on all three routes.
         *
         * In hindsight this sweep needed **five** instrument fixes before it told the truth
         * (mistaking the largest element for the surface; mistaking a leftover surface for
         * the current one; not waiting for the exit; comparing focus by a marker that a
         * rerender erases; contamination between triggers). That is this file's reason for
         * existing: **when the measuring tool is wrong, neither green nor red is
         * evidence.**
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
        // Just after the first frame of the entrance — measuring here catches the animation still alive.
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
           * ⚠️ **Give it time to settle.** A first version that pressed Escape 70ms after
           * appearance falsely reported "focus does not return" on two routes — the sheet was
           * still moving focus inside itself, and closing mid-move leaves no settled place to
           * return to. A person does not close something after 70ms, and the animation
           * measurement already finished above.
           */
          await page.waitForTimeout(420);
          await page.keyboard.press("Escape");
          /*
           * ⚠️ **Wait for the exit.** A first version that measured once and decided falsely
           * reported "does not close on Escape" twice — at 360ms the exit animation was still
           * on screen. The criterion for dismissal is "shortly", not "at that instant".
           */
          /*
           * ⚠️ **Look only at that kind.** A first version that asked "is any declared surface
           * present" reported "does not close on Escape" whenever another surface (a hover
           * card, a detail panel) happened to be up on the map. Whether it closed is a
           * question about **that surface**.
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
           * ⚠️ **Compare focus return by identity, never by a marker planted in the DOM.**
           * The first version looked up `[data-sweep-trigger]`, but on screens where closing
           * the surface rerenders that region (`/docs`, `/ontology/insights`) the marker
           * disappeared and it reported "does not return" **even though focus had returned
           * correctly**. Measured by hand, all three routes return focus to the trigger.
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
   * **The dead-end notice must not take focus** — the sweep above covers only what a
   * trigger opens, so this keyboard-only surface is measured separately. The direct
   * gate for the 2026-08-10 defect.
   */
  test("키보드로만 나타나는 안내도 초점을 받지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedFirstRunSeen(page);
    /*
     * ⚠️ **Collapse the getting-started card.** In a browser with no vault chosen it
     * covers the canvas, so **surfaces opened by mouse cannot be reached** (measured:
     * `.map-overlay-in` swallowed the right click, and that click also closed the
     * popover). The keyboard passes through, so the walk tests above were unaffected,
     * which is why this hole stayed invisible.
     *
     * It is collapsed using what the product already has — the same key "just browsing"
     * uses. No test-only bypass is introduced.
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
   * **Opens a node popover (`anchored`) for real and measures it** (2026-08-11).
   *
   * ⚠️ The route sweep sees only what `[aria-expanded]`/`[aria-haspopup]` triggers
   * open. Measured: all 8 surfaces opened across 9 routes were **`sheet`**. So kinds
   * that open only on the canvas are opened separately here — **a declaration nobody
   * measures is decoration**, which was the dissent recorded in this change's decision
   * entry.
   *
   * ⚠️ **Do not click the node with the mouse.** In a browser with no vault chosen, a
   * panel over the map covers the canvas and eats the click (measured: the right click
   * timed out after 120s, and that click also closed the popover). Selecting with the
   * arrow keys opens the same popover — which also matches the user flow, and what
   * this test measures is not how it was opened but whether what opened honours the
   * contract.
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
    // "Beside what called it" — farther than half a screen and it no longer reads as connected to its cause.
    expect(geom!.dx, "팝오버가 고른 노드에서 너무 멀다").toBeLessThan(geom!.canvasWidth / 2);
    /*
     * `anchored` may take focus, but **not when the selection was made with the arrow
     * keys** — if it does, the next arrow key never reaches the map, which is the exact
     * shape of the 2026-08-10 defect.
     */
    expect(geom!.tookFocus, "방향키로 열린 팝오버가 초점을 가져갔다 — 다음 걸음이 막힌다").toBe(false);

    /*
     * ⚠️ **Close after the camera transition finishes.** A version that pressed Escape
     * mid-transition left the popover in place (measured). A person does not close while
     * the map is moving, and what this test measures is whether it closes, not whether it
     * closes mid-transition.
     */
    await page.waitForTimeout(600);
    await page.keyboard.press("Escape");
    await expect(anchored, "Escape 로 팝오버가 닫히지 않는다").toBeHidden({ timeout: 4_000 });
    // Focus must stay on the canvas — here the canvas is what called it.
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("data-surface-role") === "map-canvas"),
      "팝오버를 닫고 나서 초점이 지도를 떠났다",
    ).toBe(true);
  });
});
