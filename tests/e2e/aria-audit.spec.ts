import { expect, test } from "@playwright/test";

/**
 * T-09. 라우트별로 접근성 적합하지 않은 인터랙티브 요소를 탐지해 회귀 방지.
 *   - <button>이 aria-label도, 내부 텍스트도 없는 경우 — 스크린리더가 읽을 수 없음.
 *   - <a>도 동일 규칙.
 *   - 장식용 aria-hidden="true"는 예외.
 *
 * 발견 시 spec 실패 — 신규 인터랙티브가 라벨 없이 들어오면 자동 감지.
 */

/*
 * ⚠️ **마지막 줄의 슬러그는 실재해야 한다** (2026-08-17 검사 전수조사).
 *
 * 종전 값 `capability:agent-config-onboarding` 은 이 볼트에도 샘플에도 **없는**
 * 이름이었다(저장소 전체에서 이 줄에만 있었다). 초점 화면을 감사하려고 넣은
 * 줄인데 초점이 서지 않았으니, 이 검사는 **그 화면을 한 번도 본 적이 없다.**
 *
 * 실재하는 이름으로 바꾸고, 아래에서 「초점이 실제로 섰나」를 함께 단언한다 —
 * 이름이 또 사라지면 조용히 넘어가지 않고 여기서 터진다.
 *
 * ⚠️ **볼트를 안 고른 이 화면이 그리는 것은 「샘플」 볼트다** — 이 저장소의
 * 도그푸드 볼트가 아니다. 그래서 `capability:mcp-server` 같은 도그푸드 이름을
 * 쓰면 여기서도 초점이 안 선다(실측). 계기로 읽은 실제 노드 이름을 쓴다.
 */
const FOCUS_NODE_ID = "capability:cart";

const ROUTES = [
  "/en/",
  "/en/project/ontology-atlas/",
  "/en/docs/",
  "/en/topology/",
  `/ko/topology/?mode=focus&p=${encodeURIComponent(FOCUS_NODE_ID)}`,
];

/**
 * 각 화면에서 **최소 이만큼은 훑었어야** 한다.
 *
 * 이 검사의 판정은 「위반 목록이 비었나」인데, 하이드레이션 전이거나 화면이
 * 안 떴으면 버튼이 0개라 목록도 비고 **자동으로 통과**한다. 실제로 이 검사는
 * 고정 600ms 대기 뒤에 훑고 있었다 — 느린 기계에서는 아무것도 못 본 채
 * 초록이었다는 뜻이다. 그래서 「몇 개를 봤나」를 함께 단언한다.
 */
const MIN_SCANNED_PER_ROUTE = 5;

test("접근성 없는 버튼·링크 탐지", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const findings: string[] = [];
  /** 화면마다 몇 개를 훑었나 — 「0개를 보고 통과」를 막는 분모. */
  const scannedPerRoute: string[] = [];

  for (const url of ROUTES) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    /*
     * 고정 대기 대신 **볼 것이 생겼는지**로 기다린다 — 600ms 는 빠른 기계의
     * 값이고, 느린 기계에서는 훑을 것이 0개라 위반 목록도 비어 통과했다.
     */
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.querySelectorAll('button, [role="button"], a').length,
          ),
        { timeout: 20_000, message: `${url} 에서 훑을 컨트롤이 안 나타났다` },
      )
      .toBeGreaterThanOrEqual(MIN_SCANNED_PER_ROUTE);

    const scanned = await page.evaluate(
      () => document.querySelectorAll('button, [role="button"], a').length,
    );
    scannedPerRoute.push(`${url} → ${scanned}`);

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
    if (url.includes("/topology/")) {
      const hiddenInteractive = await page.evaluate(() => {
        const els = Array.from(
          document.querySelectorAll<HTMLElement>(
            [
              '[aria-hidden="true"] button',
              '[aria-hidden="true"] [role="button"]',
              '[aria-hidden="true"] a',
              '[aria-hidden="true"] [tabindex]:not([tabindex="-1"])',
            ].join(","),
          ),
        );
        return els.map((el) => ({
          tag: el.tagName.toLowerCase(),
          html: el.outerHTML.slice(0, 160),
        }));
      });
      if (hiddenInteractive.length > 0) {
        for (const o of hiddenInteractive) {
          findings.push(`${url} · aria-hidden subtree exposes <${o.tag}> ${o.html}`);
        }
      }
    }
  }

  /*
   * 초점 화면을 정말 열었나 — 이름이 또 사라지면 여기서 터진다.
   * 지도는 캔버스라 DOM 으로 물을 수 없어 계기(`__atlasMap`)를 쓰는데,
   * 그 창구는 `?e2e=1` 이 붙은 페이지에서만 열린다(`atlas-map-probe.ts`).
   * 그래서 감사용 주소가 아니라 계기용 주소로 한 번 더 연다.
   */
  await page.goto(`/ko/topology/?e2e=1&mode=focus&p=${encodeURIComponent(FOCUS_NODE_ID)}`, {
    waitUntil: "domcontentloaded",
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const map = (window as unknown as { __atlasMap?: { selection?: () => { nodeId: string | null } } }).__atlasMap;
          return map?.selection?.().nodeId ?? null;
        }),
      { timeout: 20_000, message: "초점 화면이 그 노드를 열지 않았다 — 감사 대상이 비어 있다" },
    )
    .toBe(FOCUS_NODE_ID);

  console.log(`[A11Y-AUDIT] scanned=${scannedPerRoute.join(" · ")}`);
  console.log(`[A11Y-AUDIT] findings=${findings.length}`);
  for (const f of findings.slice(0, 20)) console.log(`[A11Y-AUDIT]   ${f}`);
  expect(
    findings,
    `접근성 라벨 없는 인터랙티브 요소 ${findings.length}건:\n${findings.slice(0, 10).join("\n")}`,
  ).toHaveLength(0);
});
