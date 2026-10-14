import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "../first-run-seed";
import { FIRST_RUN_STARTER_DISMISSED_KEY } from "../../../src/features/first-run-starter/model/first-run-starter-dismiss";
import { waitForAnimationsDone, waitForBoxStill, waitForMapStill, waitFrames } from "../settle";

/**
 * The route has arrived and its layout stopped moving. Not `waitForAnimationsDone(body)`: some routes
 * always animate somewhere, so a page-wide animation wait sits for the full hang ceiling.
 */
/** Frames a trigger gets to put a declared surface on screen before it counts as opening none. */
const SURFACE_FRAMES = 30;

async function routeSettled(page: import("@playwright/test").Page) {
  await page.waitForLoadState("networkidle");
  await waitForBoxStill(page.locator("body"));
}


/**
 * Sweeps declared transient surfaces (`shared/ui/surfaces/transient-surface.ts`) on every route. All kinds
 * move on appearance; notice and hint never take focus; anchored, menu and sheet close on Escape
 * and return focus to the opener. The idling guard asserts surfaces were actually opened.
 */

/** Every destination; the gateway reading surfaces (`/guide`, `/changelog`) have no triggers. */
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

/** The minimum number of surfaces the sweep must actually open, so a run that finds nothing fails. */
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
      const destination = route === "/ko/docs/" ? "/ko/library/?tab=ontology" : route;
      const destinationUrl = `${destination}${destination.includes("?") ? "&" : "?"}guides=off`;
      await page.goto(destinationUrl, { waitUntil: "domcontentloaded" });
      if (route === "/ko/docs/") {
        await expect(page).toHaveURL(
          (url) => url.pathname === "/ko/library/" && url.searchParams.get("tab") === "ontology",
        );
        await expect(
          page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
        ).toBeVisible();
      }
      await routeSettled(page);

      const triggerCount = await page.evaluate(
        () =>
          [...document.querySelectorAll("[aria-expanded],[aria-haspopup]")].filter((el) => {
            const box = el.getBoundingClientRect();
            return box.width > 1 && box.height > 1;
          }).length,
      );

      for (let index = 0; index < triggerCount; index += 1) {
        /*
         * Reload for every trigger: focus and state left by an earlier trigger contaminate the next and
         * falsely report that focus does not return.
         */
        if (index > 0) {
          await page.goto(destinationUrl, { waitUntil: "domcontentloaded" });
          if (route === "/ko/docs/") {
            await expect(page).toHaveURL(
              (url) =>
                url.pathname === "/ko/library/" && url.searchParams.get("tab") === "ontology",
            );
            await expect(
              page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
            ).toBeVisible();
          }
          await routeSettled(page);
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
        /*
         * The first painted frame of the entrance — measuring **there** is the point: the
         * sample has to land while the animation is still alive. It is found in the page, frame
         * by frame, rather than after a fixed 70 ms, which on a slow runner could land before
         * the surface mounted and on a fast one after a short entrance had ended. A trigger
         * that opens nothing is given up on after `SURFACE_FRAMES` frames.
         */
        const shot = await page.evaluate(
          (maxFrames) =>
            new Promise<{
              kind: string;
              animated: boolean;
              tookFocus: boolean;
              cx: number;
              cy: number;
            } | null>((resolve) => {
              let frames = 0;
              const nextFrame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));
              const tick = async () => {
                frames += 1;
                const el = [...document.querySelectorAll("[data-transient-surface]")].find((candidate) => {
                  const box = candidate.getBoundingClientRect();
                  const style = getComputedStyle(candidate);
                  return box.width > 8 && box.height > 8 && style.visibility !== "hidden" && Number(style.opacity) > 0.02;
                }) as HTMLElement | undefined;
                if (!el) {
                  if (frames < maxFrames) requestAnimationFrame(() => void tick());
                  else resolve(null);
                  return;
                }
                const box = el.getBoundingClientRect();
                const style = getComputedStyle(el);
                const animated =
                  (el.getAnimations?.({ subtree: true }) ?? []).length > 0 ||
                  (style.transitionDuration !== "0s" && style.transitionProperty !== "none");
                // Focus moves in an effect after the surface commits; give it two frames.
                await nextFrame();
                await nextFrame();
                resolve({
                  kind: el.dataset.transientSurface!,
                  animated,
                  tookFocus: el.contains(document.activeElement),
                  cx: box.x + box.width / 2,
                  cy: box.y + box.height / 2,
                });
              };
              requestAnimationFrame(() => void tick());
            }),
          SURFACE_FRAMES,
        );

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
           * ⚠️ **Let it settle first.** A first version that pressed Escape 70ms after
           * appearance falsely reported "focus does not return" on two routes — the sheet was
           * still moving focus inside itself, and closing mid-move leaves no settled place to
           * return to. The condition is the surface's entrance being over, which the browser's
           * own animation registry reports; 420 ms was a guess at the same thing.
           */
          await waitForAnimationsDone(page.locator("[data-transient-surface]").first());
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
          /*
           * A condition poll that returns once that kind is gone. The interval is frames, not 220 ms, so a
           * slow machine gets a longer exit. The loop ends by itself: failures collect into `violations`.
           */
          let stillOpen = true;
          for (let attempt = 0; attempt < 40; attempt += 1) {
            if (!(await visibleKinds(page)).includes(shot.kind)) {
              stillOpen = false;
              break;
            }
            await waitFrames(page, 12);
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
   * The dead-end notice must not take focus; the sweep covers only trigger-opened surfaces, so this
   * keyboard-only surface is measured separately.
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
    const canvas = page.getByTestId("ontology-map-canvas");
    await canvas.waitFor({ state: "visible", timeout: 20_000 });
    await canvas.focus();
    await page.keyboard.press("ArrowRight");
    await waitForMapStill(page, { what: "camera" });
    let found = false;
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press("ArrowLeft");
      // A press is answered within a few drawn frames; frames are the unit.
      await waitFrames(page, 8);
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
   * Opens a node popover (`anchored`) for real: the route sweep only reaches `sheet` kinds. Select with
   * arrow keys, not the mouse, since a panel over the map eats the click when no vault is chosen.
   */
  test("노드 팝오버가 부른 것 옆에 서고 Escape 로 닫힌다", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1512, height: 900 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?e2e=1&guides=off");
    const canvas = page.getByTestId("ontology-map-canvas");
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
    // Beside what called it: farther than half the canvas and it no longer reads as connected.
    expect(geom!.dx, "팝오버가 고른 노드에서 너무 멀다").toBeLessThan(geom!.canvasWidth / 2);
    /* After an arrow-key selection focus must stay put, or the next arrow key never reaches the map. */
    expect(geom!.tookFocus, "방향키로 열린 팝오버가 초점을 가져갔다 — 다음 걸음이 막힌다").toBe(false);

    /*
     * ⚠️ **Close after the camera transition finishes.** A version that pressed Escape
     * mid-transition left the popover in place (measured). A person does not close while
     * the map is moving, and what this test measures is whether it closes, not whether it
     * closes mid-transition. "Finished" is the camera's own frames repeating, not 600 ms.
     */
    await waitForMapStill(page, { what: "camera" });
    await page.keyboard.press("Escape");
    await expect(anchored, "Escape 로 팝오버가 닫히지 않는다").toBeHidden({ timeout: 4_000 });
    // Focus must stay on the canvas — here the canvas is what called it.
    expect(
      await page.evaluate(() => document.activeElement?.getAttribute("data-surface-role") === "map-canvas"),
      "팝오버를 닫고 나서 초점이 지도를 떠났다",
    ).toBe(true);
  });
});
