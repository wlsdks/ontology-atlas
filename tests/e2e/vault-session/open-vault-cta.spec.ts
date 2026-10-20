import { expect, test } from "@playwright/test";

import { AUDITED_ROUTES } from "../audited-routes";

/**
 * No dead-end CTAs: anywhere that says "open a folder" needs a path that actually invokes the
 * picker, not merely one that changes the URL. Covers every audited route and subtracts only
 * exceptions (`.claude/rules/design-gates.md`).
 */

/** Sentences that say "open a folder" or "you can open one". */
const PROMISE = /폴더[를을]? ?(열|여|고르|골라)|볼트[를을]? ?(열|고르)/;
/** The path that does it — a control that opens a folder, or a link to where one is. */
const PATH = /폴더|볼트|문서함|앱 받기|앱에서 열기|내 데이터/;

/**
 * Exceptions, one site at a time with a reason; never subtract by directory or regex. The gateway
 * places no folder-opening path, so the reach describe below measures it instead. Adding a row
 * switches the rule off for that screen, so name what measures that site instead.
 */
const EXEMPT: ReadonlyArray<{ route: string; why: string }> = [
  {
    route: "/ko/",
    why: "Gateway: the verdict not to place one is settled (2026-08-08 ledger). The reach contract below measures instead",
  },
  { route: "/ko/download/", why: "the same view as the gateway, measured by the same reach contract" },
  { route: "/ko/changelog/", why: "prose quoting past decisions, not an instruction" },
];
const EXEMPT_ROUTES = new Set(EXEMPT.map((e) => e.route));

/**
 * Waits until the DOM goes quiet (no MutationObserver change for `quietMs`) before a scan.
 * `attributes` is not observed: the map edits attributes every frame and would burn the cap,
 * and this scanner reads text and elements only.
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
 * Picks only rendered copies: dev hydration briefly mounts a 0x0 ghost with the same
 * `data-testid`, which would fail Playwright's strict mode. Two rendered copies still fail.
 */
const paintedTestId = (page: import("@playwright/test").Page, testId: string) =>
  page.getByTestId(testId).filter({ visible: true });

test.describe("no dead-end CTA: every place that tells you to open a folder", () => {
  test.use({ viewport: { width: 1512, height: 900 } });

  test("each such place has a way to open it (every audited route)", async ({ page }) => {
    test.setTimeout(180_000);

    const unpaired: string[] = [];
    let sentences = 0;
    let paired = 0;

    for (const route of AUDITED_ROUTES) {
      if (route.includes("this-route-does-not-exist")) continue;
      const destination = route === "/ko/docs/" ? "/ko/library/?tab=ontology" : route;
      await page.goto(`${destination}${destination.includes("?") ? "&" : "?"}guides=off`, {
        waitUntil: "domcontentloaded",
      });
      if (route === "/ko/docs/") {
        await expect(page).toHaveURL(
          (current) =>
            current.pathname === "/ko/library/" && current.searchParams.get("tab") === "ontology",
        );
        await expect(
          page.locator('#library-workspace-tabpanel-ontology [data-docs-viewer]'),
        ).toBeVisible();
      }
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
    expect(sentences, "no folder sentence was found, so the scanner is dead").toBeGreaterThan(4);
    expect(paired, "no pair was ever matched, so the has-a-way judge is dead").toBeGreaterThan(2);

    expect(
      unpaired,
      "It says \"open a folder and …\" with no way to open one right there: a dead-end CTA. " +
        "Put `OpenVaultCta` inside that box",
    ).toEqual([]);
  });

  /**
   * **Existing ≠ doing.** Without this layer, a button that is merely visible and does
   * nothing passes — exactly the state of the old gate, which watched only the URL.
   */
  test("that way really invokes the folder picker", async ({ page, context }) => {
    const SITES = [
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
      // Preserve the named section when disabling guided tours.
      const url = `${site.route}${site.route.includes("?") ? "&" : "?"}guides=off`;
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      // The assertion below waits on its own.

      const cta = paintedTestId(page, site.testId);
      await expect(cta, `${url}: the way to open a folder is not visible`).toBeVisible();
      await expect(
        cta,
        `${site.route}: downgraded to download although FSA is supported, so the capability verdict is wrong`,
      ).toHaveAttribute("data-open-vault-cta", "picker");

      await cta.click();
      // Poll until the picker call arrives, so a slow machine's "not open yet" is not read as failure.
      await expect
        .poll(() => pickerCalls(page), {
          timeout: 10_000,
          message: `${site.route}: the folder picker did not open on press`,
        })
        .toBeGreaterThan(0);
    }
  });

  /**
   * If it cannot be written, say so before the press: create and edit must agree, driven by the
   * capability flag `canEdit`.
   */
  test("says so before pressing when unusable, the same for create and edit", async ({ page }) => {
    for (const route of ["/ko/project/new/", "/ko/project/storefront/edit/"]) {
      await page.goto(`${route}?guides=off`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.fonts.ready);
      // The assertion below waits on its own.

      await expect(
        page.getByTestId("project-write-disabled-banner").first(),
        `${route}: does not announce the write lock in advance`,
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
      expect(submits.length, `${route}: no save button was found`).toBeGreaterThan(0);
      expect(
        submits.filter((b) => !b.disabled),
        `${route}: the save button is enabled although saving is impossible, so refusal is learned only by pressing`,
      ).toEqual([]);
    }
  });

  /**
   * On a browser without FSA (Firefox and so on) it degrades to **why + where to**.
   * "Coming soon" is not used (.claude/rules/surfaces.md).
   */
  test("without FSA support it downgrades to the app download", async ({ page, context }) => {
    await context.addInitScript(() => {
      delete (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    });
    await page.goto("/ko/project/storefront/?guides=off", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => document.fonts.ready);
    // The assertion below waits on its own.

    const cta = paintedTestId(page, "project-detail-open-vault");
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
 * The gateway places no folder-opening control, so measure reachability per width: (1) the first
 * hop is above the fold, (2) pressing it arrives, (3) the landing point invokes the picker.
 * `first-run-starter-open` opens `VaultOpenGuideSheet`; only `vault-guide-pick-existing` invokes it.
 */
test.describe("the gateway is not a folder-opening screen but reaches that screen", () => {
  // Only the installed app's opening window is measured.
  const REACH_WIDTHS = [{ width: 1512, height: 900 }] as const;

  for (const viewport of REACH_WIDTHS) {
    test(`${viewport.width}: hop inside the fold, then map, sheet and picker invocation`, async ({ page, context }) => {
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
       * Wait for the hop above the fold, then assert absences: a DOM-quiet wait misreads a pause in
       * hydration under 6x throttling as finished rendering.
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
            message: `${viewport.width}: there is no way to the map inside the gateway fold, so the screen that can open a folder is unreachable`,
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
        "the gateway gained a folder-opening control, making two first-run surfaces. To reverse this, start with the ledger",
      ).toBe(0);

      // ② Pressing it arrives.
      await page.locator(`[data-reach-hop="${inFold[0].index}"]`).click();
      await page.waitForURL(/\/topology/, { timeout: 15_000 });
      // The assertion below waits on its own.

      // ③ The landing point's primary action is the job — via the sheet, it **really**
      // invokes the picker.
      const starter = page.getByTestId("first-run-starter-open");
      await expect(
        starter,
        `${viewport.width}: the primary folder-opening action is not visible at the landing point`,
      ).toBeVisible();
      /* Visible is not pressable: hydration may not be finished, so retry the press until the sheet opens. */
      const sheet = page.getByTestId("vault-guide-sheet");
      await expect(async () => {
        if (!(await sheet.isVisible())) await starter.click({ timeout: 5_000 });
        await expect(sheet).toBeVisible({ timeout: 1_000 });
      }, `${viewport.width}: the guide sheet did not open, so the path to the landing point changed`).toPass({ timeout: 25_000 });

      await page.getByTestId("vault-guide-pick-existing").click();
      await expect
        .poll(() => pickerCalls(page), {
          timeout: 10_000,
          message: `${viewport.width}: reached the landing point but the folder picker did not open, a dead end one hop later`,
        })
        .toBeGreaterThan(0);
    });
  }
});
