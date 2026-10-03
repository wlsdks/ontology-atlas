import type { Page } from "@playwright/test";

/**
 * Counts, from inside the page, every frame request and every draw the download page's canvases
 * make, without a product hook: `requestAnimationFrame`, a 2D `clearRect` and a WebGL `clear`
 * are wrapped before any script runs. The hero canvas and the background field are told apart
 * by where they sit in the document.
 */
export async function installFrameProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = { raf: 0, hero: 0, field: 0, other: 0 };
    (window as unknown as { __frameProbe: typeof probe }).__frameProbe = probe;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb: FrameRequestCallback) => {
      probe.raf += 1;
      return raf(cb);
    };
    const tally = (canvas: HTMLCanvasElement | OffscreenCanvas | null | undefined): void => {
      if (!(canvas instanceof HTMLCanvasElement)) return;
      if (canvas.classList.contains("gateway-fx-field")) probe.field += 1;
      else if (canvas.closest('[data-testid="gateway-hero"]')) probe.hero += 1;
      else probe.other += 1;
    };
    const clearRect = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (this: CanvasRenderingContext2D, ...args) {
      tally(this.canvas);
      return clearRect.apply(this, args);
    };
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const clear = proto.clear;
      proto.clear = function (this: WebGLRenderingContext, mask: number) {
        tally(this.canvas as HTMLCanvasElement);
        return clear.call(this, mask);
      };
    }
  });
}

export interface FrameProbe {
  raf: number;
  hero: number;
  field: number;
  other: number;
}

export function readFrameProbe(page: Page): Promise<FrameProbe> {
  return page.evaluate(() => ({ ...(window as unknown as { __frameProbe: FrameProbe }).__frameProbe }));
}

/** The page scrolls inside the app shell's body slot, not the window. */
export function scrollHostTo(page: Page, top: number | "bottom"): Promise<void> {
  return page.evaluate((target) => {
    const host =
      [...document.querySelectorAll<HTMLElement>("*")].find(
        (el) =>
          el.scrollHeight - el.clientHeight > 2 && ["auto", "scroll"].includes(getComputedStyle(el).overflowY),
      ) ?? document.scrollingElement!;
    host.scrollTop = target === "bottom" ? host.scrollHeight : target;
  }, top);
}
