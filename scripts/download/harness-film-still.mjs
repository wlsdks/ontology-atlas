/**
 * The harness film's still pictures, shot from the film itself on `/<locale>/download/`: the window
 * at 1:1 after the problem line's chip has been pressed (no lift, no pointer), and for a phone one
 * close-up of the window per act. The download page needs no desktop bridge, so this runs in a
 * context of its own, on a fake clock, so the frame is the same on every machine.
 *
 *   public/gateway/harness-film.<locale>.webp           the window, 1104×560 CSS pixels at 2x
 *   public/gateway/harness-film-phone-<n>.<locale>.webp  act n's close-up, 480×360 CSS pixels at 2x
 */
import path from "node:path";

import { writeWebp } from "./webp.mjs";

/** Film time after the chip's press (6300ms) and before the lift (6700ms). */
const STILL_AT = 6550;

/**
 * Each act's close-up: when it is taken and which part of the 1104×560 window it shows. One 4:3
 * size for all four, so the phone stage keeps its height from act to act.
 */
const PHONE = { width: 480, height: 360 };
const PHONE_SHOTS = [
  { act: 1, at: 1700, x: 24, y: 160 },
  { act: 2, at: 4800, x: 320, y: 66 },
  { act: 3, at: STILL_AT, x: 584, y: 150 },
  { act: 4, at: 10400, x: 584, y: 180 },
];

async function filmTime(page) {
  return page.evaluate(() => {
    const fills = [...document.querySelectorAll('[data-testid="gateway-harness"] nav button span span')];
    const lit = fills.map((fill) => Number(/scaleX\(([\d.e-]+)\)/.exec(fill.style.transform)?.[1] ?? 0));
    const lengths = [2600, 2600, 2800, 2800];
    const starts = [0, 2600, 5200, 8000];
    const act = lit.findIndex((value) => value < 1);
    return act < 0 ? 10800 : starts[act] + lit[act] * lengths[act];
  });
}

/** Shows the screen at 1:1 without the film's pointer or press ring, runs `shoot`, then puts the film back. */
async function atOneToOne(page, shoot) {
  const saved = await page.evaluate(() => {
    const holder = document.querySelector("[data-harness-film-frame]");
    const transform = holder.style.transform;
    holder.style.transform = transform.replace(/scale\([^)]*\)/, "scale(1)");
    const hidden = [...document.querySelectorAll('[data-film-node="pointer"], [data-film-node="ring"]')];
    const visibility = hidden.map((node) => node.style.visibility);
    for (const node of hidden) node.style.visibility = "hidden";
    return { transform, visibility };
  });
  await shoot();
  await page.evaluate(({ transform, visibility }) => {
    document.querySelector("[data-harness-film-frame]").style.transform = transform;
    const hidden = [...document.querySelectorAll('[data-film-node="pointer"], [data-film-node="ring"]')];
    hidden.forEach((node, i) => (node.style.visibility = visibility[i] ?? ""));
  }, saved);
}

export async function captureHarnessFilm(browser, { baseUrl, locale, outDir }) {
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    reducedMotion: "no-preference",
    timezoneId: "UTC",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  await page.clock.install();
  await page.goto(`${baseUrl}/${locale}/download/`, { waitUntil: "load" });
  await page.clock.runFor(1500);
  await page.evaluate(() => {
    const film = document.querySelector('[data-testid="gateway-harness"]');
    const pane = document.querySelector("[data-app-shell-pane]");
    pane.scrollTo({ top: film.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop, behavior: "instant" });
  });
  const deadline = Date.now() + 60_000;
  let at = 0;
  const runTo = async (target) => {
    while (at < target) {
      if (Date.now() > deadline) throw new Error(`the harness film did not reach ${target}ms`);
      await page.clock.runFor(16);
      at = (await page.locator("[data-film-window]").count()) ? await filmTime(page) : 0;
    }
  };
  const shots = [];
  for (const shot of PHONE_SHOTS) {
    await runTo(shot.at);
    await atOneToOne(page, async () => {
      if (shot.at === STILL_AT) {
        const windowFile = path.join(outDir, `harness-film.${locale}.webp`);
        await writeWebp(browser, await page.locator("[data-film-window]").screenshot(), windowFile);
        shots.push(windowFile);
      }
      const frame = await page.locator("[data-film-window]").boundingBox();
      const file = path.join(outDir, `harness-film-phone-${shot.act}.${locale}.webp`);
      await writeWebp(browser, await page.screenshot({ clip: { x: frame.x + shot.x, y: frame.y + shot.y, ...PHONE } }), file);
      shots.push(file);
    });
  }
  await context.close();
  return shots;
}
