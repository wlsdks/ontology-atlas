#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CHECKS, formatFinding, formatSummary, parseRampNames, shouldFail } from "./lib/ui-audit-checks.mjs";
import { auditPage, FREEZE_CSS } from "./lib/ui-audit-probe.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_WIDTHS = [600, 768, 834, 1024, 1440, 1920, 2560];
const PER_CHECK = 5;

function parseArgs(argv) {
  const opts = { routes: [], widths: DEFAULT_WIDTHS, height: 900, json: false };
  for (const arg of argv) {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    const value = rest.join("=");
    if (key === "url") opts.url = value.replace(/\/$/, "");
    else if (key === "route") opts.routes.push(value);
    else if (key === "widths") opts.widths = value.split(",").map(Number).filter((n) => n > 0);
    else if (key === "height") opts.height = Number(value);
    else if (key === "wait") opts.wait = value;
    else if (key === "json") opts.json = true;
    else if (key === "shots") opts.shots = path.resolve(value);
    else if (arg !== "--") throw new Error(`unknown argument: ${arg}`);
  }
  if (!opts.url || opts.routes.length === 0) {
    throw new Error("usage: pnpm ui:audit -- --url=<base> --route=<path> [--route=...] [--widths=..] [--height=900] [--wait=<selector>] [--json] [--shots=<dir>]");
  }
  return opts;
}

function readRampNames() {
  const dir = path.join(ROOT, "app/styles");
  const css = readdirSync(dir)
    .filter((f) => f.endsWith(".css"))
    .map((f) => readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
  return parseRampNames(css);
}

const opts = parseArgs(process.argv.slice(2));
const rampNames = readRampNames();
if (opts.shots) mkdirSync(opts.shots, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const route of opts.routes) {
    for (const width of opts.widths) {
      const context = await browser.newContext({ viewport: { width, height: opts.height } });
      const page = await context.newPage();
      await page.goto(`${opts.url}${route}`, { waitUntil: "networkidle" });
      if (opts.wait) await page.waitForSelector(opts.wait);
      await page.addStyleTag({ content: FREEZE_CSS });
      await page.waitForTimeout(100);
      const { findings, unmeasured } = await auditPage(page, { width, rampNames });
      if (opts.shots) {
        const name = `${route.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root"}@${width}.png`;
        await page.screenshot({ path: path.join(opts.shots, name) });
      }
      results.push({ route, width, findings, unmeasured });
      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (opts.json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    const tail = r.unmeasured > 0 ? ` · contrast unmeasured ${r.unmeasured}` : "";
    console.log(formatSummary(r.route, r.width, r.findings) + tail);
    for (const check of CHECKS) {
      for (const f of r.findings[check].slice(0, PER_CHECK)) console.log(formatFinding(check, f));
    }
  }
  const totals = Object.fromEntries(CHECKS.map((c) => [c, results.reduce((n, r) => n + r.findings[c].length, 0)]));
  console.log(`total ${results.length} pages: ${CHECKS.map((c) => `${c} ${totals[c]}`).join(" · ")}`);
}
process.exitCode = shouldFail(results) ? 1 : 0;
