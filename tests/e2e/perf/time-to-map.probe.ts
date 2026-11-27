import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { test } from "@playwright/test";

import { isPortOpen } from "../../../scripts/perf/vite-move/tcp-port.mjs";
import { installDesktopRailRuntime, seedKnownDesktopFolders, DESKTOP_VAULT_ROOT } from "../desktop-rail-arrival-harness";
import { storefrontSampleFiles } from "../map/storefront-sample-files";
import { waitForMapSettled } from "../settle";

/**
 * The browser half of `pnpm perf:ui-move`'s dev-start measurement; `scripts/perf/vite-move/`
 * runs it and reads `result.json`. It is no spec: the suite's `testMatch` never lists a
 * `.probe.ts`, and the folder's own `playwright.config.ts` starts no server and warms no route,
 * either of which would hide the cold start being measured.
 *
 * The browser is launched and the faked app runtime installed first, so none of that lands in the
 * measured time. The script then writes `t0` (epoch ms, just before it spawns `pnpm dev`); this
 * probe waits for the port to accept a connection, opens the map and waits for it to settle.
 */
const MAP_ADDRESS = "/en/topology/?e2e=1&guides=off";
const WAIT_LIMIT_MS = 150_000;
const POLL_MS = 20;

function probeFile(name: string): string {
  const directory = process.env.ATLAS_PROBE_DIR;
  if (!directory) throw new Error("ATLAS_PROBE_DIR is not set: this probe is run by `pnpm perf:ui-move`");
  return path.join(directory, name);
}

async function waitUntil(condition: () => boolean | Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + WAIT_LIMIT_MS;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`gave up waiting for ${what}`);
    await sleep(POLL_MS);
  }
}

test("time from the dev command to a settled map", async ({ page, baseURL }) => {
  test.setTimeout(WAIT_LIMIT_MS * 2);
  const port = Number(new URL(baseURL!).port);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(`uncaught: ${error.message}`));

  await page.setViewportSize({ width: 1400, height: 860 });
  await installDesktopRailRuntime(page, storefrontSampleFiles(), undefined, { replaceFixture: true });
  await seedKnownDesktopFolders(page, [{ path: DESKTOP_VAULT_ROOT }]);

  writeFileSync(probeFile("ready"), "");
  await waitUntil(() => existsSync(probeFile("t0")), "the script to start the dev server");
  const t0 = Number(readFileSync(probeFile("t0"), "utf8"));

  await waitUntil(() => isPortOpen(port), "the dev server to accept connections");
  const listeningMs = Date.now() - t0;
  await page.goto(MAP_ADDRESS, { waitUntil: "domcontentloaded", timeout: WAIT_LIMIT_MS });
  await waitForMapSettled(page, { timeout: WAIT_LIMIT_MS });
  const mapSettledMs = Date.now() - t0;

  writeFileSync(probeFile("result.json"), JSON.stringify({ listeningMs, mapSettledMs, consoleErrors }));
});
