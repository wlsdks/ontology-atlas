#!/usr/bin/env node
/**
 * Captures the app screens the gateway's screens stage shows, once per locale
 * (`public/gateway/<screen>.<locale>.webp`). A script, not a hand-taken screenshot: these screens
 * exist only inside the desktop app and the gateway promises each picture is a real screen
 * (`SurfaceCapture`), so the real static export runs in a browser with the Tauri bridge answered by
 * Node against real files: this repository's `docs/ontology`, its harness files (`AGENTS.md`,
 * `.claude/`, `.codex/`) and `git log -- docs/ontology`. Only a small sample library, the
 * project-source binding and one saved automation are added in memory.
 *
 * Nothing is written but the pictures; every path the app sees is under the fake root
 * `/work/ontology-atlas`, so no private path reaches a picture. The pictures are 1336×860 CSS pixels
 * at device scale 2, dark, in the page's own language (the Korean set on `/ko/...`).
 *
 * Usage (against a static export; the dev server's compile waits make captures flaky):
 *
 *   pnpm build
 *   node scripts/web/serve-static-export.mjs --port=3198 &
 *   pnpm gateway:capture -- --base-url=http://127.0.0.1:3198 [--only=library,git] [--locales=ko,en] [--out=public/gateway]
 *
 * `--only=harness-film` shoots the download page's harness film stills instead
 * (`harness-film-still.mjs`), in ko, en, ja and zh; it needs no bridge.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

import { REPO } from "./gateway-capture/capture-context.mjs";
import { makeBridge } from "./gateway-capture/native-bridge.mjs";
import { buildOverlay } from "./gateway-capture/sample-library.mjs";
import { captureHarnessFilm } from "./harness-film-still.mjs";
import { MAP_SCREEN, NEURAL_SCREEN } from "./map-screen.mjs";
import { writeWebp } from "./webp.mjs";

const VIEWPORT = { width: 1336, height: 860 };

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.join("=") || "true"];
    }),
);
const BASE_URL = args["base-url"] ?? "http://127.0.0.1:3198";
const OUT_DIR = path.resolve(REPO, args.out ?? "public/gateway");
const ONLY = args.only ? new Set(args.only.split(",")) : null;
const VERBOSE = args.verbose === "true";

// A UTC day (the capture browser's clock) on which this repository has commits.
const BRIEFING_ANCHOR = "2026-11-10";

/**
 * Each screen: where to go and what to wait for before the shutter. `prepare` runs after the
 * route settles and may press what the picture needs (a tab, a row).
 */
const SCREENS = [
  {
    name: "library",
    route: "/library/",
    async prepare(page) {
      await page.getByTestId("library-workspace-wiki").click().catch(() => {});
      await page.waitForTimeout(2500);
    },
  },
  {
    name: "harness",
    route: "/architecture/?view=overview",
    async prepare(page) {
      await page.waitForTimeout(6000);
    },
  },
  {
    name: "projects",
    route: "/project/ontology-atlas/",
    async prepare(page) {
      await page.waitForTimeout(3000);
    },
  },
  {
    name: "git",
    route: "/git/",
    async prepare(page) {
      await page.waitForTimeout(3000);
    },
  },
  {
    name: "automations",
    route: "/automations/",
    async prepare(page) {
      // The saved check is a documents automation: it compares the Library's pages with
      // their sources and needs no agent.
      await page.getByTestId("automations-tab-documents").click();
      await page.waitForTimeout(3000);
    },
  },
  {
    name: "planning",
    route: "/planning/",
    async prepare(page) {
      await page.locator("[data-planning-choose]").first().click();
      await page.getByRole("button", { name: "FEATURES.md", exact: true }).click();
      await page.getByRole("heading", { level: 1 }).nth(1).waitFor().catch(() => {});
      await page.waitForTimeout(2500);
    },
  },
  {
    name: "changes",
    route: "/changes/",
    async prepare(page) {
      await page.locator('[data-briefing-surface] button[aria-haspopup="dialog"]').first().click();
      await page.locator("input[type=date]").fill(BRIEFING_ANCHOR);
      await page.keyboard.press("Escape");
      // Closing the dialog returns focus to its button; the picture shows no focus ring.
      await page.evaluate(() => document.activeElement?.blur());
      await page.waitForTimeout(2500);
    },
  },
];

async function installRuntime(context, bridge) {
  await context.exposeBinding("__atlasCaptureBridge", async (_source, command, input) => {
    try {
      const value = await bridge(command, input);
      return { ok: true, value: value?.binary ? { base64: value.binary.toString("base64") } : value };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  });
  await context.addInitScript(() => {
    const callbacks = new Map();
    let nextCallback = 1;
    window.isTauri = true;
    window.__TAURI_INTERNALS__ = {
      transformCallback(callback) {
        const id = nextCallback++;
        callbacks.set(id, callback);
        return id;
      },
      async invoke(command, input = {}) {
        const answer = await window.__atlasCaptureBridge(command, input);
        if (!answer.ok) throw new Error(answer.message);
        if (command === "planning_read_file" || command === "planning_open_document" || command === "read_vault_text_files") {
          const bytes = Uint8Array.from(atob(answer.value.base64), (char) => char.charCodeAt(0));
          return bytes.buffer;
        }
        if (command !== "read_vault_binary_file") return answer.value;
        const raw = atob(answer.value.base64);
        const stamped = new Uint8Array(8 + raw.length);
        new DataView(stamped.buffer).setBigUint64(0, BigInt(answer.value.lastModified), true);
        for (let index = 0; index < raw.length; index += 1) stamped[8 + index] = raw.charCodeAt(index);
        return stamped.buffer;
      },
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => undefined };
  });
}

const LOCALES = args.locales ? args.locales.split(",") : ["ko", "en"];
const BROWSER_LOCALE = { ko: "ko-KR", en: "en-US" };

/** The harness film's stills are shot from the download page itself, in every page language. */
const FILM_LOCALES = args.locales ? args.locales.split(",") : ["ko", "en", "ja", "zh"];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const unstubbed = new Set();
  const browser = await chromium.launch();

  if (ONLY?.has("harness-film")) {
    for (const locale of FILM_LOCALES) {
      for (const file of await captureHarnessFilm(browser, { baseUrl: BASE_URL, locale, outDir: OUT_DIR })) {
        console.log(`captured ${path.relative(REPO, file)}`);
      }
    }
  }

  for (const locale of ONLY && [...ONLY].every((name) => name === "harness-film") ? [] : LOCALES) {
    // A fresh context per locale: its own storage, its own overlay, its own opened folder.
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      colorScheme: "dark",
      locale: BROWSER_LOCALE[locale] ?? locale,
      reducedMotion: "reduce",
      timezoneId: "UTC",
    });
    await installRuntime(context, makeBridge(buildOverlay(locale), unstubbed));
    const page = await context.newPage();
    // A control a redesign removed fails the run here instead of waiting for ever.
    page.setDefaultTimeout(30_000);
    if (VERBOSE) page.on("console", (message) => console.log(`[page] ${message.text()}`));

    await page.goto(`${BASE_URL}/${locale}/?guides=off`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("first-run-open").click();
    await page.getByTestId("app-nav-rail").waitFor({ timeout: 60_000 });

    for (const screen of [...SCREENS, MAP_SCREEN, NEURAL_SCREEN]) {
      if (ONLY ? !ONLY.has(screen.name) : screen.explicit) continue;
      if (screen.locales && !screen.locales.includes(locale)) continue;
      const viewport = screen.viewport ?? VIEWPORT;
      await page.setViewportSize(viewport);
      await page.goto(`${BASE_URL}/${locale}${screen.route}`);
      await page.waitForLoadState("networkidle");
      await screen.prepare(page);
      // The pointer rests off the picture so no hover state is captured.
      await page.mouse.move(viewport.width - 2, viewport.height - 2);
      const file = screen.out ? path.join(REPO, screen.out) : path.join(OUT_DIR, `${screen.name}.${locale}.webp`);
      if (screen.out) await page.screenshot({ path: file });
      else await writeWebp(browser, await page.screenshot(), file);
      console.log(`captured ${path.relative(REPO, file)}`);
    }
    await context.close();
  }

  await browser.close();
  if (unstubbed.size) console.log(`unstubbed native commands: ${[...unstubbed].sort().join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
