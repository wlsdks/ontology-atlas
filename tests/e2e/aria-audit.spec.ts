import { expect, test } from "@playwright/test";

/**
 * T-09. 라우트별로 접근성 적합하지 않은 인터랙티브 요소를 탐지해 회귀 방지.
 *   - <button>이 aria-label도, 내부 텍스트도 없는 경우 — 스크린리더가 읽을 수 없음.
 *   - <a>도 동일 규칙.
 *   - 장식용 aria-hidden="true"는 예외.
 *
 * 발견 시 spec 실패 — 신규 인터랙티브가 라벨 없이 들어오면 자동 감지.
 */

const ROUTES = [
  "/",
  "/login",
  "/signup",
  "/reset-password",
  "/project/aslan-maps/",
  "/admin/",
  "/admin/dashboard/",
];

test("접근성 없는 버튼·링크 탐지", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const findings: string[] = [];

  for (const url of ROUTES) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    const offenders = await page.evaluate(() => {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>('button, [role="button"], a'),
      );
      return els
        .filter((el) => {
          const hasLabel = Boolean(
            el.getAttribute("aria-label")?.trim() ||
              el.getAttribute("aria-labelledby"),
          );
          const text = (el.textContent ?? "").trim();
          if (hasLabel || text.length > 0) return false;
          if (el.getAttribute("aria-hidden") === "true") return false;
          return true;
        })
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          html: el.outerHTML.slice(0, 160),
        }));
    });
    if (offenders.length > 0) {
      for (const o of offenders) {
        findings.push(`${url} · <${o.tag}> ${o.html}`);
      }
    }
  }

  console.log(`[A11Y-AUDIT] findings=${findings.length}`);
  for (const f of findings.slice(0, 20)) console.log(`[A11Y-AUDIT]   ${f}`);
  expect(
    findings,
    `접근성 라벨 없는 인터랙티브 요소 ${findings.length}건:\n${findings.slice(0, 10).join("\n")}`,
  ).toHaveLength(0);
});
