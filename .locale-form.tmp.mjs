import { chromium } from "@playwright/test";
const OUT = "/private/tmp/claude-501/-Users-jinan-orca-workspaces-ontology-atlas-main/2afb8dc8-30e0-40da-8df4-4d8d31e35f3f/scratchpad/final/";
const pickerStub = `
  window.showDirectoryPicker = async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle("locale-vault", { create: true });
    const patch = (h) => { if (!h.queryPermission) h.queryPermission = async () => "granted"; if (!h.requestPermission) h.requestPermission = async () => "granted"; return h; };
    patch(dir);
    const orig = dir.getDirectoryHandle.bind(dir);
    dir.getDirectoryHandle = async (...a) => patch(await orig(...a));
    return dir;
  };`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: "ko" });
const page = await ctx.newPage();
await page.addInitScript(pickerStub);
await page.addInitScript(() => { localStorage.setItem("guided-tour:v1","done"); localStorage.setItem("vault-open-guide:auto:v1","1"); });
await page.goto("http://localhost:3121/ko/topology/");
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1000);
await page.getByTestId("first-run-starter-open").click();
await page.waitForTimeout(400);
await page.getByTestId("vault-guide-pick-existing").click();
await page.waitForTimeout(6000);
// 에이전트 시트 닫기
await page.keyboard.press("Escape");
await page.waitForTimeout(700);
await page.getByTestId("checklist-cta-project").click();
await page.waitForTimeout(700);
// ① 영어만 채우면 막히는지
await page.getByTestId("create-node-title-secondary").fill("Online Store");
await page.waitForTimeout(400);
const blocked = await page.evaluate(() => ({
  warn: document.querySelector('[data-testid="create-node-primary-required"]')?.textContent?.slice(0, 40) ?? null,
  submitDisabled: document.querySelector('[data-testid="create-node-submit"]')?.disabled,
}));
console.log("[form] en-only:", JSON.stringify(blocked));
await page.screenshot({ path: `${OUT}locale-form-blocked.png`, clip: { x: 660, y: 100, width: 620, height: 320 } });
// ② 둘 다 채우면 저장 + 파일 검증
await page.getByTestId("create-node-title").fill("우리 회사 서비스");
await page.waitForTimeout(300);
await page.getByTestId("create-node-submit").click();
await page.waitForTimeout(2500);
const file = await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle("locale-vault");
  const projects = await dir.getDirectoryHandle("projects");
  for await (const [name, h] of projects.entries()) {
    if (h.kind === "file") return { name, text: (await (await h.getFile()).text()).slice(0, 200) };
  }
  return null;
});
console.log("[form] written:", JSON.stringify(file));
await ctx.close(); await browser.close();
