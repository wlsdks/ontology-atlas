import { expect, test } from "@playwright/test";

import { AUDITED_ROUTES } from "./audited-routes";

/**
 * **No dead-end CTAs — the folder edition.** Anywhere that says "open a folder and
 * …" must have a path that opens that folder, and that path must **actually invoke
 * the picker**.
 *
 * **Why exhaustive rather than one route.** This disease was fixed once on
 * `/project/new` on 2026-08-06, with a gate to match (`screen-hierarchy.spec.ts`).
 * That gate was hard-coded to **one route and one testid**, and the 2026-08-07
 * exhaustive measurement found the same disease alive in **two more places** — the
 * read-only bundle header in insights (0 of 25 on-screen controls opened a folder)
 * and the "view only" badge on project detail.
 *
 * This is a failure shape the repository has already paid for
 * (.claude/rules/design-gates.md): **a check built from an allowlist fails on what is
 * not on the list, and what is not on the list is always the newly built thing.** So
 * this gate **covers every audited route and subtracts only exceptions**.
 *
 * **Why it measures "invokes", not "exists".** The old gate pressed the CTA and
 * checked only whether **the URL changed**. A real defect walked through that gap:
 * the destination was `/`, and for a web visitor with no vault `/` is the **gateway**
 * (the download screen), where the number of controls that open a folder is **0**.
 * The URL changed cleanly, the gate was green, and the person arrived at a dead end
 * one hop later. In the installed app `/` is the map, so it was correct there —
 * **a defect invisible if you only verify in the app**.
 */

/** Sentences that say "open a folder" or "you can open one". */
const PROMISE = /폴더[를을]? ?(열|여|고르|골라)|볼트[를을]? ?(열|고르)/;
/** The path that does it — a control that opens a folder, or a link to where one is. */
const PATH = /폴더|볼트|문서함|앱 받기|앱에서 열기|내 데이터/;

/**
 * Exceptions — **one site at a time, with a reason.** Never subtract by directory or
 * regex.
 *
 * **The gateway's exception is not "pending" — it moved to a different contract**
 * (council, 2026-08-08).
 *
 * On 2026-08-07 two rows sat here, `/ko/` and `/ko/download/`, with the reason
 * *"awaiting the 위계 verdict"*. That verdict landed: **no folder-opening path is
 * placed on the gateway.** `/topology`'s first-run panel is already the real
 * first-run surface, so duplicating it would leave two first-run surfaces to
 * maintain, and when two paths do the same job one of them is guaranteed to become a
 * lie (2026-07-30, "two links doing the same job").
 *
 * So this sweep cannot run on the gateway — what the sweep requires (a control beside
 * the sentence) is precisely what that decision **chose not to do**. But **leaving it
 * here with the reason "pending" means no layer of this file runs on that screen at
 * all**: it would stay green forever even if the in-page web CTA disappeared or the
 * landing point became a dead end (raised by the 체계 seat).
 *
 * So the exception's cost was **repaid** — the `관문은 폴더를 여는 화면이 아니다`
 * describe below measures, per width, that ① a hop to the map is rendered above the
 * fold ② pressing it arrives ③ the landing point **really invokes the picker** by way
 * of the sheet. The same check pins "0 folder controls on the gateway", so reversing
 * the decision means returning to the ledger.
 *
 * ⚠️ Adding a row to this list switches the rule off for that screen. To extend it,
 * write the reason here and also write what measures that site instead.
 */
const EXEMPT: ReadonlyArray<{ route: string; why: string }> = [
  {
    route: "/ko/",
    why: "관문 — 「놓지 않는다」 판정 확정(2026-08-08 원장). 대신 아래 도달 계약이 잰다",
  },
  { route: "/ko/download/", why: "관문과 같은 뷰 — 같은 도달 계약이 잰다" },
  { route: "/ko/changelog/", why: "지난 결정을 인용하는 산문 — 지시가 아니다" },
];
const EXEMPT_ROUTES = new Set(EXEMPT.map((e) => e.route));

/**
 * **Waits until the DOM goes quiet** — the only honest wait before a scan.
 *
 * **Why this file's waits were hard to decide (audit of every wait, 2026-08-17).**
 * Most fixed waits in this file sat right before a line that **sweeps the whole DOM**
 * with `page.evaluate`. Playwright's auto-waiting attaches to locators only, so
 * nothing here waits for anything, and "what to wait for" differs per route — on some
 * routes zero folder sentences is correct, so "until it appears" is unusable too.
 *
 * So the thing waited for becomes **"is anything else going to appear"**: if a
 * MutationObserver sees no change for `quietMs`, that screen is finished rendering.
 *
 * ⚠️ **`attributes` is not observed.** Measured: with it on, `/ko/topology/` burns the
 * entire 8 s ceiling (the map edits attributes every frame). With it off it settles at
 * 746ms, and all 16 audited routes land at 280–750ms — usually faster than a fixed
 * 900ms, and more patient than 900ms on a slow machine. Nothing is lost, because this
 * scanner reads text and elements, not attributes.
 */
async function settleDom(page: import("@playwright/test").Page, quietMs = 250, capMs = 5_000) {
  await page.evaluate(
    ([quiet, cap]) =>
      new Promise<void>((resolve) => {
        let quietTimer = 0;
        const finish = () => {
          observer.disconnect();
          window.clearTimeout(quietTimer);
          window.clearTimeout(capTimer);
          resolve();
        };
        const observer = new MutationObserver(() => {
          window.clearTimeout(quietTimer);
          quietTimer = window.setTimeout(finish, quiet);
        });
        const capTimer = window.setTimeout(finish, cap);
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: false,
        });
        quietTimer = window.setTimeout(finish, quiet);
      }),
    [quietMs, capMs] as [number, number],
  );
}

/** Was the stub picker actually invoked? Reading once without retry misses a late call. */
const pickerCalls = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __picked?: number }).__picked ?? 0);

/**
 * **Picks only what is rendered** — filters out the 0×0 ghost copy present during dev
 * hydration.
 *
 * ⚠️ Measured 2026-08-17: opening `/ko/project/storefront/` produces two elements with
 * the same `data-testid` **only between +100 and +250ms** — one normal (93×32) and one
 * **0×0**. By +300ms there is one again. It is the dev (Turbopack) double-mount
 * artifact `playwright.config.ts` documents, and it does not exist in a static export.
 * But a plain `getByTestId` landing in that window dies **immediately** on a strict
 * mode violation (auto-waiting does not rescue it).
 *
 * The previous revision was merely missing that window by luck, and removing one fixed
 * wait above exposed it — once again, something a fixed wait had been doing by
 * accident.
 *
 * **The gate is unchanged**: two genuinely *rendered* copies still fail on strict
 * mode. Only ghosts that render nothing are filtered out.
 */
const paintedTestId = (page: import("@playwright/test").Page, testId: string) =>
  page.getByTestId(testId).filter({ visible: true });

test.describe("막다른 CTA 금지 — 폴더를 열라고 말한 자리", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  test("말한 자리마다 여는 길이 있다 (감사 대상 전 라우트)", async ({ page }) => {
    test.setTimeout(180_000);

    const unpaired: string[] = [];
    let sentences = 0;
    let paired = 0;

    for (const route of AUDITED_ROUTES) {
      if (route.includes("this-route-does-not-exist")) continue;
      await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      await settleDom(page);

      const found = await page.evaluate(
        ({ promise, path }) => {
          const say = new RegExp(promise);
          const act = new RegExp(path);
          const painted = (el: Element) => {
            const c = getComputedStyle(el);
            const b = el.getBoundingClientRect();
            if (b.width < 2 || b.height < 2) return false;
            if (c.visibility === "hidden" || c.display === "none" || Number(c.opacity) < 0.05) {
              return false;
            }
            return !el.closest("details:not([open])");
          };
          const out: { text: string; ok: boolean }[] = [];
          for (const el of document.querySelectorAll("p,span,div,h1,h2,h3,li")) {
            // Leaf nodes only — counting ancestors reports the same sentence several times.
            if (el.childElementCount > 0) continue;
            const text = (el.textContent || "").trim();
            if (!text || !say.test(text) || !painted(el)) continue;
            let box: Element | null = el;
            let ok = false;
            for (let i = 0; i < 4 && box; i += 1) {
              box = box.parentElement;
              if (!box) break;
              const near = [...box.querySelectorAll('button,a[href],[role="button"]')]
                .filter(painted)
                .some(
                  (c) =>
                    c.hasAttribute("data-open-vault-cta") ||
                    act.test((c.textContent || c.getAttribute("aria-label") || "").trim()),
                );
              if (near) {
                ok = true;
                break;
              }
            }
            out.push({ text: text.slice(0, 60), ok });
          }
          return out;
        },
        { promise: PROMISE.source, path: PATH.source },
      );

      for (const f of found) {
        sentences += 1;
        if (f.ok) paired += 1;
        else if (!EXEMPT_ROUTES.has(route)) unpaired.push(`${route} → ${f.text}`);
      }
    }

    // Two idling guards; one is not enough. Finding no sentences at all reads as
    // "nothing mismatched", and **never matching a pair** is equally green (in that case
    // the "path exists" predicate is dead, which should make this check permanently red —
    // except the exception list would hide it).
    expect(sentences, "폴더 문장을 하나도 못 찾았다 — 스캐너가 죽었다").toBeGreaterThan(4);
    expect(paired, "짝을 한 번도 못 맞췄다 — 「길 있음」 판정기가 죽었다").toBeGreaterThan(2);

    expect(
      unpaired,
      "「폴더를 열면 …」이라 말하면서 그 자리에 여는 길이 없다 — 막다른 CTA 다. " +
        "`OpenVaultCta` 를 그 상자 안에 놓아라",
    ).toEqual([]);
  });

  /**
   * **Existing ≠ doing.** Without this layer, a button that is merely visible and does
   * nothing passes — exactly the state of the old gate, which watched only the URL.
   */
  test("그 길은 실제로 폴더 선택기를 부른다", async ({ page, context }) => {
    const SITES = [
      { route: "/ko/ontology/insights/", testId: "do-next-open-vault" },
      { route: "/ko/project/storefront/", testId: "project-detail-open-vault" },
      { route: "/ko/project/new/", testId: "project-write-disabled-open-folder" },
    ];

    await context.addInitScript(() => {
      const w = window as unknown as { __picked?: number; showDirectoryPicker?: () => Promise<never> };
      w.__picked = 0;
      // Throw as if cancelled — the app treats it as a normal cancel, so screen state does
      // not change and the next site can be measured under the same conditions.
      w.showDirectoryPicker = async () => {
        w.__picked = (w.__picked ?? 0) + 1;
        throw new DOMException("stub", "AbortError");
      };
    });

    for (const site of SITES) {
      await page.goto(`${site.route}?guides=off`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      // The assertion just below waits on its own — the fixed wait was waste (audit
      // 2026-08-17).

      const cta = paintedTestId(page, site.testId);
      await expect(cta, `${site.route}: 폴더 여는 길이 안 보인다`).toBeVisible();
      await expect(
        cta,
        `${site.route}: FSA 를 지원하는데 내려받기로 강등됐다 — 능력 판정이 틀렸다`,
      ).toHaveAttribute("data-open-vault-cta", "picker");

      await cta.click();
      // This used to read once after a fixed 400ms **with no retry**, so on a slow machine
      // "not open yet" read as "does not open". It now waits until the value arrives (audit
      // 2026-08-17).
      await expect
        .poll(() => pickerCalls(page), {
          timeout: 10_000,
          message: `${site.route}: 눌러도 폴더 선택기가 안 열렸다`,
        })
        .toBeGreaterThan(0);
    }
  });

  /**
   * **If it cannot be written, say so before the press — create and edit must agree.**
   *
   * Measured 2026-08-07: `/project/new` locks the save button and says so up front in a
   * banner, while `/project/[slug]/edit` kept the button enabled with no vault. Only on
   * pressing did *"데모 모드에서는 저장할 수 없습니다"* appear, and at 390×844 that
   * notice measured **top 802, bottom 872** — clipped at both ends against the 844
   * viewport and stuck behind the bottom tab bar. On the presser's screen it is
   * indistinguishable from nothing happening.
   *
   * Two screens were stating the same fact at different moments. The capability flag
   * (`canEdit`) had existed from the start, its comment saying it was for pre-gating the
   * UI, and this one form simply was not using it.
   */
  test("쓸 수 없으면 누르기 전에 말한다 — 만들기와 편집이 같다", async ({ page }) => {
    for (const route of ["/ko/project/new/", "/ko/project/storefront/edit/"]) {
      await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      // The assertion just below waits on its own — the fixed wait was waste (audit
      // 2026-08-17).

      await expect(
        page.getByTestId("project-write-disabled-banner").first(),
        `${route}: 쓰기 잠금을 미리 말하지 않는다`,
      ).toBeVisible();

      const submits = await page.evaluate(() =>
        [...document.querySelectorAll("button[type=submit]")]
          .filter((b) => b.getBoundingClientRect().width > 2)
          .map((b) => ({
            label: (b.textContent ?? "").trim().slice(0, 20),
            disabled: (b as HTMLButtonElement).disabled,
          })),
      );

      // Idling guard — finding no buttons makes "all locked" trivially true.
      expect(submits.length, `${route}: 저장 버튼을 하나도 못 찾았다`).toBeGreaterThan(0);
      expect(
        submits.filter((b) => !b.disabled),
        `${route}: 저장할 수 없는데 저장 버튼이 열려 있다 — 눌러야 거절을 알게 된다`,
      ).toEqual([]);
    }
  });

  /**
   * On a browser without FSA (Firefox and so on) it degrades to **why + where to**.
   * "Coming soon" is not used (.claude/rules/surfaces.md).
   */
  test("FSA 미지원이면 앱 내려받기로 강등된다", async ({ page, context }) => {
    await context.addInitScript(() => {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    });
    await page.goto("/ko/ontology/insights/?guides=off", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    // The assertion just below waits on its own — the fixed wait was waste (audit
      // 2026-08-17).

    const cta = paintedTestId(page, "do-next-open-vault");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("data-open-vault-cta", "download");
    // The destination must really open — zero buttons that go nowhere when pressed.
    // `waitForLoadState` cannot measure it: with client-side routing it returns
    // immediately as "already loaded" before navigation even starts (the first attempt
    // passed vacuously that way).
    await cta.click();
    await page.waitForURL(/\/download/, { timeout: 15_000 });
    await expect(page.getByTestId("download-bottom-band")).toBeVisible();
  });
});

/**
 * **The gateway is not a folder-opening screen — so measure whether it is reachable**
 * (council, 2026-08-08).
 *
 * The sweep's rule above (a control beside the sentence) cannot apply to the gateway,
 * because that is precisely what the verdict **chose not to do**: `/topology`'s
 * first-run panel is already the real first-run surface, and two paths doing the same
 * job guarantee that one becomes a lie (2026-07-30). So the gateway gets a different
 * contract.
 *
 * **Three criteria for "a path exists" — click count is not one of them.** ① the first
 * hop is rendered **above the fold at that width** ② pressing it arrives ③ the landing
 * point really does the job. The first-run sheet is legitimate guidance on the landing
 * surface rather than a barrier, so hops are not counted.
 *
 * **Why it is measured per width.** Measured 2026-08-08 on the static export: the
 * in-page web CTA sits at `y 638` at 1512×900 (above the fold) but at **`y 1136` at
 * 390×844** — below it. What satisfies criterion ① at 390 is the bottom tab bar's
 * "map" (`y 788`, viewport bottom 844). Measuring one width hides that fact, and would
 * stay green if the tab bar ever disappeared.
 *
 * **⚠️ Measuring "one hop" makes a permanently red gate.** The first probe did exactly
 * that. `first-run-starter-open` does **not** invoke the picker directly — it opens
 * `VaultOpenGuideSheet`, and only `vault-guide-pick-existing` there invokes it.
 * Measuring without knowing that produced a false red of "0 invocations". Confusing
 * the fact you are guarding with how it happens to be implemented makes the gate wrong
 * in both directions (`/gate-probe` §0).
 */
test.describe("관문은 폴더를 여는 화면이 아니다 — 대신 그 화면에 닿는다", () => {
  const REACH_WIDTHS = [
    { width: 1512, height: 900 },
    { width: 390, height: 844 },
  ] as const;

  for (const viewport of REACH_WIDTHS) {
    test(`${viewport.width}: 접힘 안 홉 → 지도 → 시트 → 선택기 호출`, async ({ page, context }) => {
      await context.addInitScript(() => {
        const w = window as unknown as {
          __picked?: number;
          showDirectoryPicker?: () => Promise<never>;
        };
        w.__picked = 0;
        w.showDirectoryPicker = async () => {
          w.__picked = (w.__picked ?? 0) + 1;
          throw new DOMException("stub", "AbortError");
        };
      });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/ko/?guides=off", { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);

      // ① A hop to the map is **rendered** above the fold at that width.
      const readHops = () =>
        page.evaluate(() => {
          const painted = (el: Element) => {
            const c = getComputedStyle(el);
            const b = el.getBoundingClientRect();
            return (
              b.width > 2 &&
              b.height > 2 &&
              c.visibility !== "hidden" &&
              c.display !== "none" &&
              Number(c.opacity) >= 0.05
            );
          };
          return [...document.querySelectorAll("a[href]")]
            .filter(painted)
            .filter((a) =>
              /\/topology\/?$/.test(new URL((a as HTMLAnchorElement).href, location.href).pathname),
            )
            .map((a, i) => {
              const b = a.getBoundingClientRect();
              a.setAttribute("data-reach-hop", String(i));
              return {
                index: i,
                label: (a.textContent ?? "").trim().slice(0, 24),
                top: Math.round(b.top),
                bottom: Math.round(b.bottom),
                // A fixed bottom tab bar's bottom equals the viewport exactly, so allow 1px.
                inFold: b.top >= 0 && b.bottom <= innerHeight + 1,
              };
            });
        });

      /*
       * ⚠️ **The order changed here** (audit of every wait, 2026-08-17).
       *
       * This used to read ① once after a fixed 1200ms. Switching it to "until the DOM goes
       * quiet" **broke under 6× throttling** — hydration on a slow machine can pause for
       * more than 250ms and then continue, so a quiet stretch is misread as "finished
       * rendering". Quiet is the fallback for *when you do not know what will appear*, not a
       * predicate to use where you do.
       *
       * Here we know what to wait for: **the hop above the fold**. Wait until it appears,
       * and put the assertion that counts absences after it — because ① is the strongest
       * evidence that the gateway has finished rendering.
       */
      let hops = await readHops();
      await expect
        .poll(
          async () => {
            hops = await readHops();
            return hops.filter((h) => h.inFold).length;
          },
          {
            timeout: 25_000,
            message: `${viewport.width}: 관문 접힘 안에 지도로 가는 길이 없다 — 폴더를 열 수 있는 화면에 닿지 못한다`,
          },
        )
        .toBeGreaterThan(0);
      const inFold = hops.filter((h) => h.inFold);

      /**
       * **The check carries the decision itself.** A folder control appearing on the gateway
       * turns this red and sends a person back to the ledger — the only place that stops a
       * second first-run surface growing quietly.
       *
       * An absence cannot be waited for, so after confirming above that the gateway has
       * finished rendering, it waits once more for the DOM to go quiet and then counts.
       */
      await settleDom(page);
      const folderControls = await page.evaluate(
        () =>
          [...document.querySelectorAll("[data-open-vault-cta]")].filter((el) => {
            const b = el.getBoundingClientRect();
            return b.width > 2 && b.height > 2;
          }).length,
      );
      expect(
        folderControls,
        "관문에 폴더 여는 컨트롤이 생겼다 — 첫 실행 표면이 둘이 된다. 되돌리려면 원장부터",
      ).toBe(0);

      // ② Pressing it arrives.
      await page.locator(`[data-reach-hop="${inFold[0].index}"]`).click();
      await page.waitForURL(/\/topology/, { timeout: 15_000 });
      // The assertion just below waits on its own — the fixed wait was waste (audit
      // 2026-08-17).

      // ③ The landing point's primary action is the job — via the sheet, it **really**
      // invokes the picker.
      const starter = page.getByTestId("first-run-starter-open");
      await expect(
        starter,
        `${viewport.width}: 착지점에 폴더 여는 주 행동이 안 보인다`,
      ).toBeVisible();
      /*
       * **Visible ≠ pressable.** This screen was just navigated to, so hydration may not be
       * finished and the click lands nowhere. What used to be a fixed 500ms is now retrying
       * the press until it opens (audit of every wait, 2026-08-17).
       */
      const sheet = page.getByTestId("vault-guide-sheet");
      await expect
        .poll(
          async () => {
            if (await sheet.isVisible().catch(() => false)) return true;
            await starter.click({ timeout: 5_000 }).catch(() => {});
            await page.waitForTimeout(250);
            return sheet.isVisible().catch(() => false);
          },
          {
            timeout: 25_000,
            message: `${viewport.width}: 안내 시트가 안 열렸다 — 착지점의 경로가 바뀌었다`,
          },
        )
        .toBe(true);

      await page.getByTestId("vault-guide-pick-existing").click();
      await expect
        .poll(() => pickerCalls(page), {
          timeout: 10_000,
          message: `${viewport.width}: 착지점까지 갔는데 폴더 선택기가 안 열렸다 — 한 홉 뒤 막다른 길`,
        })
        .toBeGreaterThan(0);
    });
  }
});
