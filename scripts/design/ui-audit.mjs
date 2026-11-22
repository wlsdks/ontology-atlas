#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CHECKS, formatFinding, formatSummary, parseRampNames, shouldFail } from "../lib/design/ui-audit-checks.mjs";
import { auditPage, FREEZE_CSS } from "../lib/design/ui-audit-probe.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_WIDTHS = [600, 768, 834, 1024, 1440, 1920, 2560];
const PER_CHECK = 5;

function parseArgs(argv) {
  const options = { routes: [], widths: DEFAULT_WIDTHS, height: 900, json: false };
  for (const arg of argv) {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    const value = rest.join("=");
    if (key === "url") options.url = value.replace(/\/$/, "");
    else if (key === "route") options.routes.push(value);
    else if (key === "widths") options.widths = value.split(",").map(Number).filter((n) => n > 0);
    else if (key === "height") options.height = Number(value);
    else if (key === "wait") options.wait = value;
    else if (key === "scope") {
      if (!value.trim()) throw new Error("--scope needs a CSS selector");
      options.scope = value;
    }
    else if (key === "json") options.json = true;
    else if (key === "setup") {
      if (!value.trim()) throw new Error("--setup needs a module path");
      options.setup = path.resolve(value);
    }
    else if (key === "shots") options.shots = path.resolve(value);
    else if (arg !== "--") throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.url || options.routes.length === 0) {
    throw new Error("usage: pnpm ui:audit -- --url=<base> --route=<path> [--route=...] [--widths=..] [--height=900] [--wait=<selector>] [--scope=<selector>] [--setup=<module.mjs>] [--json] [--shots=<dir>]");
  }
  return options;
}

function readRampNames() {
  const directory = path.join(ROOT, "app/styles");
  const css = readdirSync(directory)
    .filter((f) => f.endsWith(".css"))
    .map((f) => readFileSync(path.join(directory, f), "utf8"))
    .join("\n");
  return parseRampNames(css);
}

const options = parseArgs(process.argv.slice(2));
const rampNames = readRampNames();
const prepare = options.setup ? (await import(pathToFileURL(options.setup).href)).default : null;
if (options.setup && typeof prepare !== "function") throw new Error("--setup must export a default async function (page, { url, route, width, height })");
if (options.shots) mkdirSync(options.shots, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const route of options.routes) {
    for (const width of options.widths) {
      const context = await browser.newContext({ viewport: { width, height: options.height }, reducedMotion: "reduce", isMobile: width <= 768, hasTouch: width <= 768 });
      const page = await context.newPage();
      if (prepare) await prepare(page, { url: options.url, route, width, height: options.height });
      else await page.goto(`${options.url}${route}`, { waitUntil: "networkidle" });
      if (options.wait) await page.waitForSelector(options.wait);
      await page.addStyleTag({ content: FREEZE_CSS });
      await page.waitForTimeout(100);
      const { findings, unmeasured, measuredElements } = await auditPage(page, { width, rampNames, scope: options.scope });
      if (options.shots) {
        const name = `${route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root"}@${width}.png`;
        await page.screenshot({ path: path.join(options.shots, name) });
      }
      results.push({ route, width, findings, unmeasured, measuredElements });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (options.json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    const tail = r.unmeasured > 0 ? ` · contrast unmeasured ${r.unmeasured}` : "";
    console.log(formatSummary(r.route, r.width, r.findings) + tail + ` · subjects ${r.measuredElements}`);
    for (const check of CHECKS) {
      for (const f of r.findings[check].slice(0, PER_CHECK)) console.log(formatFinding(check, f));
    }
  }
  const totals = Object.fromEntries(CHECKS.map((c) => [c, results.reduce((n, r) => n + r.findings[c].length, 0)]));
  console.log(`total ${results.length} pages: ${CHECKS.map((c) => `${c} ${totals[c]}`).join(" · ")}`);
}
process.exitCode = shouldFail(results) ? 1 : 0;
