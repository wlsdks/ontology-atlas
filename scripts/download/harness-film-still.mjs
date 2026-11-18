/**
 * The harness film's still pictures, shot from the film itself on `/<locale>/download/`: the window
 * at 1:1 after the problem line's chip has been pressed (no lift, no pointer), and the detail head
 * beside it for a narrow screen. The download page needs no desktop bridge, so this runs in a
 * context of its own, on a fake clock, so the frame is the same on every machine.
 *
 *   public/gateway/harness-film.<locale>.png         the window, 1104×560 CSS pixels at 2x
 *   public/gateway/harness-film-detail.<locale>.png  the detail head, 400×320 CSS pixels at 2x
 */
import path from "node:path";

/** Film time after the chip's press (6300ms) and before the lift (6700ms). */
const STILL_AT = 6550;
const DETAIL = { width: 400, height: 320 };

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
  while (at < STILL_AT) {
    if (Date.now() > deadline) throw new Error(`the harness film did not reach ${STILL_AT}ms`);
    await page.clock.runFor(16);
    at = (await page.locator("[data-film-window]").count()) ? await filmTime(page) : 0;
  }
  // The picture is the screen at 1:1, without the film's pointer or press ring.
  await page.evaluate(() => {
    const holder = document.querySelector("[data-harness-film-frame]");
    holder.style.transform = holder.style.transform.replace(/scale\([^)]*\)/, "scale(1)");
    for (const node of document.querySelectorAll('[data-film-node="pointer"], [data-film-node="ring"]')) node.style.visibility = "hidden";
  });
  const shots = [];
  const windowFile = path.join(outDir, `harness-film.${locale}.png`);
  await page.locator("[data-film-window]").screenshot({ path: windowFile });
  shots.push(windowFile);
  const pane = await page.locator('[data-film-window] [data-testid="harness-detail-pane"]').boundingBox();
  const detailFile = path.join(outDir, `harness-film-detail.${locale}.png`);
  await page.screenshot({ path: detailFile, clip: { x: pane.x + 1, y: pane.y, ...DETAIL } });
  shots.push(detailFile);
  await context.close();
  return shots;
}
