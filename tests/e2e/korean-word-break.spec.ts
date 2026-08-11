import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **한국어 문장이 단어 중간에서 끊기지 않는다** (2026-08-12).
 *
 * ## 어디서 나왔나
 *
 * 분석 화면(`/ontology/insights`)을 눈으로 보다 「…으로 나 / 는 거예요」를 발견했다.
 * 「나눈」이 두 줄로 쪼개진 것이다. 원인은 그 문단의 `word-break: normal` 이고,
 * 이 저장소는 이미 다른 자리에서 `break-keep` 을 쓰고 있었다 — 즉 규격은 있는데
 * 그 자리에 안 걸려 있었다.
 *
 * ## lint 가 원리적으로 못 보는 층이다
 *
 * 위반이 **코드에 아무 값도 안 남긴다**: `break-keep` 을 안 쓰는 것은 클래스의
 * *부재*이고, 부재는 셀렉터로 잡을 수 없다(수천 개의 문단 전부에 그 클래스를
 * 요구하면 그건 규격이 아니라 소음이다). 그리고 진짜 판정 기준은 클래스가 아니라
 * **실제로 끊겼는가**다 — 폭이 넉넉하면 `normal` 이어도 안 끊긴다.
 *
 * ## 어떻게 재나
 *
 * 글자마다 `Range` 를 잡아 y 좌표를 읽고, y 가 바뀐 자리(줄바꿈)의 **앞뒤 글자**를
 * 본다. 둘 다 한글이고 사이에 공백이 없으면 단어 중간에서 끊긴 것이다. 공백에서
 * 끊긴 것은 정상이므로 세지 않는다.
 *
 * ## 공회전 차단
 *
 * 「끊긴 곳 0」은 **줄바꿈이 한 번도 없었을 때도** 참이다. 그래서 이 스펙은 두 번째
 * 숫자를 함께 단언한다: 여러 줄로 접힌 한국어 문장을 실제로 몇 개 봤는가. 0이면
 * 아무것도 재지 않은 것이다(`/gate-probe`).
 */

const ROUTES = [
  "/ko/ontology/insights/",
  "/ko/skills/",
  "/ko/projects/",
  "/ko/docs/",
  "/ko/",
] as const;

interface BreakScan {
  readonly midWord: { text: string; at: string; wordBreak: string; width: number }[];
  readonly wrappedTexts: number;
}

async function scan(page: import("@playwright/test").Page): Promise<BreakScan> {
  return page.evaluate(() => {
    const midWord: { text: string; at: string; wordBreak: string; width: number }[] = [];
    let wrappedTexts = 0;
    const root = document.querySelector("main") ?? document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent ?? "";
      if (text.trim().length < 24 || !/[가-힣]/.test(text)) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      const style = getComputedStyle(parent);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) < 0.05) continue;
      if (parent.closest("details:not([open])")) continue;

      const range = document.createRange();
      let previousY: number | null = null;
      let wrapped = false;
      for (let index = 0; index < text.length; index += 1) {
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getBoundingClientRect();
        if (rect.height === 0) continue;
        const y = Math.round(rect.y);
        if (previousY !== null && y > previousY + 2) {
          wrapped = true;
          const before = text[index - 1] ?? "";
          const after = text[index] ?? "";
          if (before.trim() && after.trim() && /[가-힣]/.test(before) && /[가-힣]/.test(after)) {
            midWord.push({
              text: `${text.slice(Math.max(0, index - 14), index)}|${text.slice(index, index + 14)}`,
              at: `${before}|${after}`,
              wordBreak: style.wordBreak,
              width: Math.round(parent.getBoundingClientRect().width),
            });
          }
        }
        previousY = y;
      }
      if (wrapped) wrappedTexts += 1;
    }
    return { midWord, wrappedTexts };
  });
}

test("한국어 문장이 단어 중간에서 끊기지 않는다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);

  const offenders: string[] = [];
  let wrappedTotal = 0;

  for (const route of ROUTES) {
    await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_800);
    const result = await scan(page);
    wrappedTotal += result.wrappedTexts;
    for (const hit of result.midWord) {
      offenders.push(`${route} 「${hit.text}」 (${hit.at}) · word-break=${hit.wordBreak} · 폭 ${hit.width}`);
    }
  }

  console.log(`[word-break] 여러 줄로 접힌 한국어 문장 ${wrappedTotal}개 · 단어 중간 끊김 ${offenders.length}건`);

  /*
   * 공회전 차단: 줄바꿈을 한 번도 못 봤으면 「0건」은 증거가 아니다.
   *
   * ⚠️ **문턱은 0 이다** — 실측이 3이라고 3을 못박으면, 문구 한 줄이 짧아져 두
   * 줄로 안 접히는 날 제품은 멀쩡한데 이 게이트가 빨개진다. 잠글 성질은
   * 「몇 개를 봤나」가 아니라 「보기는 했나」다.
   */
  expect(
    wrappedTotal,
    `여러 줄로 접힌 한국어 문장을 하나도 못 봤다 — 이 스펙이 아무것도 재지 않았다`,
  ).toBeGreaterThan(0);

  expect(
    offenders,
    `한국어가 단어 중간에서 끊겼다. 그 문단에 \`break-keep\` 을 붙여라:\n${offenders.join("\n")}`,
  ).toEqual([]);
});
