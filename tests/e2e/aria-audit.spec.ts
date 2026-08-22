import { expect, test } from "@playwright/test";

/**
 * Detects interactive elements that are not accessible, per route.
 *   - A <button> with neither an aria-label nor inner text — a screen reader cannot
 *     announce it.
 *   - The same rule for <a>.
 *   - Decorative aria-hidden="true" is exempt.
 *
 * A find fails the spec, so a new interactive element arriving unlabelled is caught
 * automatically.
 */

/*
 * ⚠️ **The slug on the last row must exist** (found in the 2026-08-17 audit of the
 * checks themselves).
 *
 * The previous value, `capability:agent-config-onboarding`, was a name present in
 * **neither** this vault nor the sample (it appeared nowhere in the repository except
 * this line). The row was added to audit the focused screen, and since focus never
 * engaged, this check **had never once seen that screen.**
 *
 * It now uses a real name, and the assertion below also checks whether focus actually
 * engaged — so if the name disappears again this breaks here instead of passing
 * quietly.
 *
 * ⚠️ **With no vault chosen, this screen renders the *sample* vault**, not this
 * repository's dogfood vault. So a dogfood name like `capability:mcp-server` also
 * fails to focus here (measured). Use a real node name read from the instrument.
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
 * The minimum each screen must have scanned.
 *
 * This check's verdict is "is the violation list empty", and before hydration or on a
 * screen that never mounted there are 0 buttons, so the list is empty and it **passes
 * automatically**. This check really did scan after a fixed 600 ms wait — meaning on a
 * slow machine it was green having seen nothing. So "how many were seen" is asserted
 * alongside.
 */
const MIN_SCANNED_PER_ROUTE = 5;

test("접근성 없는 버튼·링크 탐지", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const findings: string[] = [];
  /** How many were scanned per screen — the denominator that blocks "passed having seen 0". */
  const scannedPerRoute: string[] = [];

  for (const url of ROUTES) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    /*
     * Wait on **something existing to look at** rather than a fixed delay — 600 ms is a
     * fast machine's number, and on a slow one there was nothing to scan, so the
     * violation list was empty and it passed.
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
   * Did the focused screen really open? If the name disappears again this breaks here.
   * The map is a canvas so the DOM cannot be asked, and the instrument (`__atlasMap`) is
   * used instead — but that window opens only on pages carrying `?e2e=1`
   * (`atlas-map-probe.ts`). So the page is opened once more at the instrument address
   * rather than the audit address.
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
