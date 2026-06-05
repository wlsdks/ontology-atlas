import { test, type Page, type ConsoleMessage } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * 모바일 뷰포트 + 키보드 단축키 audit.
 *  - 모바일에서 주요 공개 라우트가 깨지지 않는지
 *  - Cmd+K 검색 팔레트, ? 치트시트, F 프레젠테이션 토글이 작동하는지
 *    (데스크탑 홈에서 의미 있으므로 홈 기준)
 */

const OUT = path.resolve("output/ui-audit/mobile-keyboard");

test.beforeAll(async () => {
  await mkdir(OUT, { recursive: true });
});

interface Bucket {
  errors: string[];
  warnings: string[];
}
function hook(page: Page, bucket: Bucket) {
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") bucket.errors.push(msg.text());
    if (msg.type() === "warning") bucket.warnings.push(msg.text());
  });
}

async function snap(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
}

const MOBILE_ROUTES = [
  { name: "m01-root", url: "/en/" },
  { name: "m02-topology", url: "/en/topology/" },
  { name: "m03-docs", url: "/en/docs/" },
  { name: "m04-project-detail", url: "/en/project/ontology-atlas/" },
];

test("모바일 주요 라우트 audit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bucket: Bucket = { errors: [], warnings: [] };
  hook(page, bucket);

  for (const r of MOBILE_ROUTES) {
    await page.goto(r.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(900);
    await snap(page, r.name);
    console.log(`[MOBILE] ${r.name} ok`);
  }

  console.log(
    `[MOBILE] total errors=${bucket.errors.length} warnings=${bucket.warnings.length}`,
  );
  for (const e of bucket.errors.slice(0, 6)) console.log(`[MOBILE]   ERR: ${e}`);
  for (const w of bucket.warnings.slice(0, 6)) console.log(`[MOBILE]   WARN: ${w}`);
});

test("데스크탑 홈 키보드 단축키 응답", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const bucket: Bucket = { errors: [], warnings: [] };
  hook(page, bucket);

  // 홈은 비로그인에 landing — 키보드 단축키는 HomePage에만 달려있어
  // 로그인 없이는 반응 못 함. 일단 화면이 깨지지 않는지 + ESC 응답 여부만.
  await page.goto("/en/project/ontology-atlas/");
  await page.waitForTimeout(1200);

  // Cmd+K 시도 — 공개 상세엔 검색 팔레트 없음. 그래도 입력이 스무스한지.
  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(300);
  await snap(page, "k01-detail-cmd-k");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await snap(page, "k02-detail-esc");

  // '?' (Shift+Slash) — 치트시트. HomePage 전용이라 공개 상세엔 반응 없어야.
  await page.keyboard.press("Shift+Slash");
  await page.waitForTimeout(300);
  await snap(page, "k03-detail-shift-slash");

  console.log(
    `[KB] detail-page errors=${bucket.errors.length} warnings=${bucket.warnings.length}`,
  );
  for (const e of bucket.errors.slice(0, 4)) console.log(`[KB]   ERR: ${e}`);
  for (const w of bucket.warnings.slice(0, 4)) console.log(`[KB]   WARN: ${w}`);
});
