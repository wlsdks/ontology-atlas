import { expect, test, type Locator, type Page } from "@playwright/test";

import { judgeText } from "../../scripts/lib/contrast.mjs";
import { AUDITED_ROUTES } from "./audited-routes";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **WCAG does not exempt states** — 4.5:1 must hold during hover too.
 *
 * ## Why this gate exists (2026-08-05 audit)
 *
 * Both `measure-contrast.mjs` and `contrast-ratchet` sweep **only the resting DOM**.
 * In that blind spot the product's primary CTAs were breaking AA while hovered:
 *
 *   Download for Apple Silicon  4.70 → **3.51**
 *   Get the app                 4.70 → **3.17**
 *   Choose an existing folder   4.70 → **4.01**
 *   Copy the next action        4.61 → **4.41**
 *
 * Two causes, both **conventions**. ① Dark UI brightens on hover, but on a **filled
 * button** the ink is white, so brightening lowers contrast. ② Controls carrying a
 * tint used `accent` ink, and the tint went up one step on hover.
 *
 * ## What this instrument **does not** see (measured 2026-08-15 — the numbers
 * decided whether to switch it on)
 *
 * - **It does not judge non-text contrast (1.4.11).** Measuring every place where
 *   hover changes a border against 3:1 found **57 of 60 below** (1.12–2.92).
 *   Enabling that as an error means 57 items of noise, the exact shape this
 *   repository explicitly forbids (`design-gates.md`, on always measuring before
 *   enabling a rule — noise buries the existing signal). Besides, hover in this app
 *   never states its state through a border alone: surface, ink, and border change
 *   **together**, and it has already been measured separately that a 1px border
 *   cannot be separated by luminance on this dark ground whatever value is chosen.
 *   **Whether to require 3:1 of borders is a design verdict, not an instrument's
 *   question**, so it goes to that seat.
 * - **Child ink changed by `group-hover:`** — this instrument reads only the
 *   control's **own** colours (25 measured places are outside its view).
 * - **Controls that only render, and surfaces that only open, with a vault** (sheets,
 *   menus, popovers). The same blind spot recorded in ledger 2026-08-15 (6) —
 *   indicators that appear only conditionally may never enter a runtime
 *   instrument's view, which is why a computed contract at the source layer is
 *   needed as its partner.
 *
 * ## ⚠️ Never infer by reading the stylesheet
 *
 * The first version found `:hover` rules in `document.styleSheets` and computed from
 * them. **That instrument reported 0** — it picked "the last matching rule" rather
 * than the cascade winner, so hover backgrounds resolved to the panel colour.
 * Actually hovering and reading `getComputedStyle` produced 5. **Inference is not
 * measurement.**
 */
const VIEWPORT = { width: 1512, height: 900 };

/** Composites ancestors' translucent backgrounds into an opaque one (required in an app with many alpha tokens). */
const SOLID_FN = `(el) => {
  const stack = [];
  for (let n = el; n; n = n.parentElement) {
    const m = /rgba?\\(([^)]+)\\)/.exec(getComputedStyle(n).backgroundColor);
    if (!m) continue;
    const q = m[1].split(/[\\s,/]+/).filter(Boolean).map(Number);
    const a = q.length > 3 ? q[3] : 1;
    if (a <= 0) continue;
    stack.push([q[0], q[1], q[2], a]);
    if (a >= 1) break;
  }
  let base = [8, 9, 10];
  for (let i = stack.length - 1; i >= 0; i--) {
    const [r, g, bl, a] = stack[i];
    base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), bl * a + base[2] * (1 - a)];
  }
  return 'rgb(' + base.map(Math.round).join(', ') + ')';
}`;

type Sample = { fg: string; bg: string; fontSizePx: number; fontWeight: string; label: string; tag: string };

async function readState(el: Locator): Promise<Sample | null> {
  return el
    .evaluate((node, S) => {
      const solid = eval(S) as (n: Element) => string;
      const c = getComputedStyle(node);
      return {
        fg: c.color,
        bg: solid(node),
        fontSizePx: parseFloat(c.fontSize),
        fontWeight: c.fontWeight,
        label: (node.textContent || node.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 30),
        tag: node.tagName.toLowerCase(),
      };
    }, SOLID_FN)
    .catch(() => null);
}

/**
 * ⚠️ **Read every resting state first, in one pass.**
 *
 * The first version looped per control: read, hover, then move the mouse to (2,2).
 * That (2,2) sat **on the left rail**, and when the planted probe was placed at
 * (0,0) it sat there too — so the next control's "resting state" was read **while
 * already hovered**, making rest == hover, which classified as "hover does not
 * change the colour" and skipped silently. The self-verification probe failed in
 * exactly that hole and caught it.
 *
 * So resting states are collected in one pass **before anything is hovered.**
 */
/**
 * Moves the pointer somewhere with no control **before** collecting resting states.
 *
 * Without this, calling `auditRoute` twice on the same page reads the second sweep's
 * resting states **while the last control the first sweep hovered is still
 * hovered**. That control becomes rest == hover, classifies as "hover does not
 * change the colour", and drops out silently — and the self-verification test below
 * calls it exactly that way.
 *
 * ⚠️ **Never use a fixed coordinate.** The accident recorded in this file's preamble
 * was assuming (2,2) was safe when it was on the left rail. Candidates are probed to
 * find **a point that really has no control**, and if none is found that fact is
 * surfaced.
 */
async function parkPointer(page: Page): Promise<void> {
  const { width, height } = VIEWPORT;
  const candidates: Array<[number, number]> = [
    [Math.floor(width / 2), height - 2],
    [width - 2, Math.floor(height / 2)],
    [Math.floor(width / 2), 2],
    [2, height - 2],
  ];
  for (const [x, y] of candidates) {
    const clear = await page
      .evaluate(
        ([px, py]) => {
          const el = document.elementFromPoint(px, py);
          return !el || !el.closest("a[href],button,[role=button],summary");
        },
        [x, y],
      )
      .catch(() => false);
    if (clear) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(30);
      return;
    }
  }
  throw new Error("포인터를 치울 빈 지점을 못 찾았다 — 쉬는 상태가 호버된 채로 읽힐 수 있다");
}

/**
 * **Next's dev overlay is not our UI** (2026-08-18).
 *
 * Tooling UI that exists only on the dev server (the "N Issues" badge and "Collapse
 * issues badge") was caught by this audit and turned five routes red. That was
 * **not a false alarm in itself** — the badge appeared because of a hydration error
 * we had introduced, and fixing it made the badge disappear.
 * But **on one route it cannot disappear in principle**: the locale-less 404 is
 * fully client-rendered in dev, so for the inline boot script the layout renders,
 * React emits
 * *«scripts inside React components are never executed when rendering on the
 * In the production static export that page is baked to HTML at build time, so the
 * script runs normally and this warning **never reaches a user.**
 *
 * So it is excluded from the audit — not switching the rule off but **restoring its
 * reach to our own surface**. What this gate protects is the hover contrast of the
 * controls we ship, and tooling that exists only on the dev server is not shipped.
 *
 * ⚠️ Whether this exclusion also swallows our controls is measured by the
 * self-verification test below: it must still catch the planted failure, and the
 * number of controls compared must be at least 3 per route.
 */
const DEV_TOOLING_SELECTOR = "nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button]";

async function auditRoute(page: Page) {
  const offenders: string[] = [];
  let compared = 0;
  await parkPointer(page);
  const controls = page.locator("a[href],button,[role=button],summary");
  const n = await controls.count();
  const resting: (Sample | null)[] = [];
  for (let i = 0; i < n; i++) resting.push(await readState(controls.nth(i)));
  for (let i = 0; i < n; i++) {
    const el = controls.nth(i);
    const visible = await el
      .evaluate((node, devTooling) => {
        // Tooling UI that exists only on the dev server is not ours — see the constant's comment above.
        if (node.closest(devTooling)) return false;
        const c = getComputedStyle(node), r = node.getBoundingClientRect();
        /*
         * ⚠️ **The first-viewport constraint was removed** (2026-08-15). It used to measure
         * only controls inside the initially visible screen via
         * `r.top >= 0 && r.bottom <= innerHeight …`. That constraint was inertia, not a
         * technical limit — Playwright's `hover()` scrolls the target into view itself.
         * Measured: that one line left 25 controls unmeasured across the audited routes.
         *
         * Why resting states may be collected before scrolling: this instrument reads only
         * colours, and colours do not change with scroll (background compositing follows the
         * ancestor chain, which is position-independent).
         */
        return (
          r.width > 6 && r.height > 6 && c.visibility !== "hidden" && Number(c.opacity) > 0.05 &&
          !(node as HTMLButtonElement).disabled && node.getAttribute("aria-disabled") !== "true"
        );
      }, DEV_TOOLING_SELECTOR)
      .catch(() => false);
    if (!visible) continue;

    const rest = resting[i];
    if (!rest) continue;
    await el.hover({ timeout: 1500 }).catch(() => {});
    await page.waitForTimeout(50);
    const hover = await readState(el);
    if (!hover) continue;
    // A control whose colours do not change on hover is out of this check's scope.
    if (hover.fg === rest.fg && hover.bg === rest.bg) continue;

    compared++;
    const R = judgeText(rest);
    const H = judgeText({ ...hover, fontSizePx: rest.fontSizePx, fontWeight: rest.fontWeight });
    // A parse failure is not a pass but a non-measurement — never skipped silently.
    expect(R?.ratio, `쉬는 상태를 못 쟀다: ${rest.tag}«${rest.label}»`).toBeDefined();
    expect(H?.ratio, `호버 상태를 못 쟀다: ${rest.tag}«${rest.label}»`).toBeDefined();
    if (R!.passes && !H!.passes)
      offenders.push(`${rest.tag}«${rest.label}» ${R!.ratio} → ${H!.ratio} (필요 ${H!.required})`);
  }
  return { offenders, compared };
}

for (const route of AUDITED_ROUTES) {
  test(`호버 대비 — ${route}`, async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.setViewportSize(VIEWPORT);
    await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("main", { timeout: 20_000 });
    await page.waitForTimeout(800);
    const { offenders, compared } = await auditRoute(page);
    /*
     * **Each route has a floor** (2026-08-15). With only the assertion above, a route
     * could go green after comparing **0 items** — "no failures" and "nothing measured"
     * look identical on screen. The two sibling ratchets (`contrast-ratchet`,
     * `a11y-ratchet`) already use that grammar; only this instrument did not, and the
     * guard existed on **one route out of 19**.
     *
     * 3 is the measured minimum (2026-08-15, 1512×900), where the sparsest route had 4,
     * minus one for slack. If this number falls, either the screen got quieter or the
     * instrument broke, and either way it needs looking at.
     */
    expect(compared, `${route} 에서 호버로 색이 바뀌는 컨트롤을 거의 못 찾았다 — 미달 0 이 증거가 아니다`).toBeGreaterThanOrEqual(3);
    expect(offenders, "쉴 때는 통과하는데 호버에서 AA 를 깬다").toEqual([]);
  });
}

/**
 * Confirms the detector is **not running over an empty set** (`/gate-probe`).
 *
 * The checks above look only at controls whose colours change on hover. If that set
 * reaches 0, every one of them is a free green. It also confirms the predicate
 * really distinguishes a failure — the earlier stylesheet-inference instrument
 * failed silently exactly here.
 */
test("계기가 헛돌지 않는다 — 비교 대상이 있고, 심어 둔 미달을 잡는다", async ({ page }) => {
  await seedFirstRunSeen(page);
  await page.setViewportSize(VIEWPORT);
  await page.goto("/ko/?guides=off", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 20_000 });
  await page.waitForTimeout(800);

  const { compared } = await auditRoute(page);
  expect(compared, "호버로 색이 바뀌는 컨트롤이 하나도 없다 — 게이트가 헛돈다").toBeGreaterThan(5);

  // Plants a known failing pair (#5e6ad2 → #828fff with white ink) to confirm the predicate catches it.
  await page.addStyleTag({
    content: ".__hover_probe{background:rgb(94,106,210);color:#fff;font-size:14px;font-weight:600}.__hover_probe:hover{background:rgb(130,143,255)}",
  });
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.className = "__hover_probe";
    b.textContent = "probe";
    b.style.cssText += ";width:80px;height:24px;position:fixed;top:0;left:0;z-index:99999";
    document.body.prepend(b);
  });
  const after = await auditRoute(page);
  expect(
    after.offenders.some((o) => o.includes("probe")),
    "심어 둔 호버 미달을 못 잡는다 — 이 게이트의 0건은 증거가 아니다",
  ).toBe(true);
});
