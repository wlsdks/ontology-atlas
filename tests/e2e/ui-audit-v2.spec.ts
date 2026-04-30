import { test, type Page, type ConsoleMessage } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * knowledge-phase-2a 브랜치의 실제 UI 상태 audit.
 * 주요 공개 라우트와 admin 라우트를 순회하며 콘솔 에러·네트워크 실패·스크린샷 수집.
 */

const OUT = path.resolve("output/ui-audit/v2");
const LOG = "[AUDIT-V2]";

interface Bucket {
  errors: string[];
  warnings: string[];
  pageErrors: string[];
  reqFailures: string[];
}

function makeBucket(): Bucket {
  return { errors: [], warnings: [], pageErrors: [], reqFailures: [] };
}

function hook(page: Page, bucket: Bucket) {
  page.on("console", (msg: ConsoleMessage) => {
    const t = msg.text();
    if (msg.type() === "error") bucket.errors.push(t);
    if (msg.type() === "warning") bucket.warnings.push(t);
  });
  page.on("pageerror", (err) => bucket.pageErrors.push(err.message));
  page.on("requestfailed", (req) =>
    bucket.reqFailures.push(
      `${req.method()} ${req.url()} :: ${req.failure()?.errorText}`,
    ),
  );
}

function report(label: string, bucket: Bucket) {
  console.log(
    `${LOG} ${label}: err=${bucket.errors.length} warn=${bucket.warnings.length} pageerr=${bucket.pageErrors.length} reqfail=${bucket.reqFailures.length}`,
  );
  for (const e of bucket.errors.slice(0, 6)) console.log(`${LOG}   ERR: ${e}`);
  for (const e of bucket.pageErrors.slice(0, 6))
    console.log(`${LOG}   PAGEERR: ${e}`);
  for (const e of bucket.reqFailures.slice(0, 6))
    console.log(`${LOG}   REQFAIL: ${e}`);
}

async function snap(page: Page, name: string) {
  await page.screenshot({
    path: path.join(OUT, `${name}.png`),
    fullPage: false,
  });
}

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

const routes: Array<{ name: string; url: string; wait?: number }> = [
  { name: "01-root", url: "/", wait: 1200 },
  { name: "02-login", url: "/login", wait: 600 },
  { name: "03-signup", url: "/signup", wait: 600 },
  { name: "04-reset-password", url: "/reset-password", wait: 600 },
  { name: "05-account", url: "/account", wait: 800 },
  { name: "06-projects", url: "/projects/", wait: 800 },
  { name: "07-project-detail", url: "/project/aslan-maps/", wait: 1000 },
  { name: "08-admin-root", url: "/admin/", wait: 800 },
  { name: "09-admin-dev-login", url: "/dev/login/", wait: 600 },
  { name: "10-admin-dashboard", url: "/admin/dashboard/", wait: 800 },
  { name: "11-admin-knowledge", url: "/admin/knowledge/", wait: 800 },
];

test("데스크탑 라우트 순회", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const aggregate = makeBucket();
  hook(page, aggregate);

  for (const r of routes) {
    try {
      const res = await page.goto(r.url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(r.wait ?? 500);
      await snap(page, r.name);
      console.log(`${LOG} ${r.name} ${r.url} → ${res?.status()}`);
    } catch (err) {
      console.log(`${LOG} ${r.name} FAILED: ${(err as Error).message}`);
    }
  }

  report("desktop total", aggregate);
});

test("모바일 루트와 상세", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bucket = makeBucket();
  hook(page, bucket);

  for (const r of [routes[0], routes[1], routes[6]]) {
    const res = await page.goto(r.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(r.wait ?? 500);
    await snap(page, `mobile-${r.name}`);
    console.log(`${LOG} mobile ${r.name} → ${res?.status()}`);
  }

  report("mobile", bucket);
});
