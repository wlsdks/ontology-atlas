import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { waitForPageSettled } from "./settle";

/*
 * No reference value is pinned: each arrival is compared with the first one, and the
 * list destinations are compared with each other.
 */

const DESTINATIONS = [
  { id: "library", url: /\/library\//, section: "ontology" },
  { id: "insights", url: /\/ontology\/insights\// },
  { id: "projects", url: /\/project\/fallback\/\?slug=/ },
  { id: "map", url: /\/topology\// },
] as const;

const OFF_RAIL_SURFACES = ["/ko/projects/", "/ko/git/", "/ko/architecture/"];

const FRAME_MEMBERS = [
  { route: "/ko/projects/", title: "프로젝트" },
  { route: "/ko/ontology/insights/", title: "그래프 인사이트" },
  { route: "/ko/agents/", title: "에이전트" },
  { route: "/ko/agents/?tab=mcp", title: "에이전트" },
  { route: "/ko/agents/?tab=models", title: "에이전트" },
] as const;

async function readIndicator(page: Page) {
  return page.evaluate(() => {
    const indicator = document.querySelector<HTMLElement>(
      '[data-testid="app-nav-rail-active-indicator"]',
    );
    if (!indicator) return null;
    const list = indicator.parentElement;
    const tile = list?.querySelector<HTMLElement>('[data-active="true"] > span');
    if (!tile) return null;
    const i = indicator.getBoundingClientRect();
    const t = tile.getBoundingClientRect();
    return {
      count: document.querySelectorAll('[data-testid="app-nav-rail-active-indicator"]').length,
      offsetY: Math.round(i.top - t.top),
      offsetHeight: Math.round(i.height - t.height),
      offsetX: Math.round(i.left - t.left),
      offsetWidth: Math.round(i.width - t.width),
    };
  });
}

async function readChrome(page: Page) {
  return page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const cs = h1 ? getComputedStyle(h1) : null;
    const tile = document.querySelector('[data-testid="app-nav-rail-get-app"]');
    return {
      h1Y: h1 ? Math.round(h1.getBoundingClientRect().top) : null,
      h1FocusVisible: h1 ? h1.matches(":focus-visible") : false,
      h1Focused: h1 ? document.activeElement === h1 : false,
      outline: cs ? `${cs.outlineStyle} ${cs.outlineWidth}` : "",
      getAppY: tile ? Math.round(tile.getBoundingClientRect().y) : null,
      titled: [...document.querySelectorAll('[data-testid^="app-nav-rail-item-"]')]
        .filter((el) => el.getAttribute("title"))
        .map((el) => `${el.getAttribute("data-testid")} title="${el.getAttribute("title")}"`),
      railItems: document.querySelectorAll('[data-testid^="app-nav-rail-item-"]').length,
    };
  });
}

async function measureHeader(page: Page, route: string) {
  await page.goto(`${route}${route.includes("?") ? "&" : "?"}guides=off`);
  const heading = page.locator("main h1").first();
  await expect(heading).toBeVisible({ timeout: 15_000 });
  return page.evaluate(() => {
    const main = document.querySelector("main")!;
    const h1 = main.querySelector("h1")!;
    // The frame is the ancestor carrying the maximum width; on some screens `main` itself is it.
    let column: HTMLElement | null = null;
    for (let node: HTMLElement | null = h1.parentElement; node; node = node.parentElement) {
      if (getComputedStyle(node).maxWidth !== "none") {
        column = node;
        break;
      }
      if (node === main) break;
    }
    const cs = column ? getComputedStyle(column) : null;
    return {
      titleY: column
        ? Math.round(h1.getBoundingClientRect().top - column.getBoundingClientRect().top)
        : null,
      padLeft: cs?.paddingLeft ?? null,
    };
  });
}

test.describe("rail destinations", () => {
  test("every rail destination keeps one indicator on its tile, the get-app tile and the title in place, and raises no tooltip or focus ring", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?guides=off", { waitUntil: "networkidle" });

    const start = await readIndicator(page);
    expect(start, "indicator not found; a rotten selector voids this gate").not.toBeNull();
    expect(start!.count, "several indicators make the 'it moves' claim false").toBe(1);
    expect(start!.offsetY).toBe(0);
    expect(start!.offsetHeight).toBe(0);
    expect(start!.offsetX).toBe(0);
    expect(start!.offsetWidth).toBe(0);

    const first = await readChrome(page);
    expect(first.railItems, "no rail destination found").toBeGreaterThan(3);
    expect(first.getAppY, "get-app tile missing on first arrival").not.toBeNull();
    expect(first.h1Y, "no h1 on first arrival").not.toBeNull();

    for (const destination of DESTINATIONS) {
      await page.getByTestId(`app-nav-rail-item-${destination.id}`).click();
      await page.waitForURL(destination.url);
      if ("section" in destination) {
        const tab = page.getByTestId(`library-workspace-${destination.section}`);
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
      }
      await waitForPageSettled(page);

      await expect
        .poll(async () => (await readIndicator(page))?.offsetY, { timeout: 5_000 })
        .toBe(0);
      const settled = await readIndicator(page);
      expect(settled!.count, `${destination.id}: indicator count grew`).toBe(1);
      expect(settled!.offsetHeight, `${destination.id}: height differs from tile`).toBe(0);
      expect(settled!.offsetX, `${destination.id}: shifted sideways`).toBe(0);
      expect(settled!.offsetWidth, `${destination.id}: width differs from tile`).toBe(0);

      const chrome = await readChrome(page);
      expect(chrome.getAppY, `${destination.id}: get-app tile moved`).toBe(first.getAppY);
      if (destination.id === "map") {
        expect(chrome.h1Y, "map: title moved after the round trip").toBe(first.h1Y);
      }
      expect(
        chrome.titled,
        `${destination.id}: a native tooltip covers the visible label`,
      ).toEqual([]);
      expect(chrome.h1FocusVisible, `${destination.id}: title shows a focus ring`).toBe(false);
      expect(chrome.outline, `${destination.id}: title keeps an outline`).toMatch(/none|0px/);
      if (destination.id === "insights") {
        expect(chrome.h1Focused, "route change did not move focus to the title").toBe(true);
      }
    }
  });

  test("the get-app tile links to the download page at one position on every web surface", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await seedFirstRunSeen(page);
    const surfaces = [
      "/ko/topology/",
      "/ko/library/?tab=ontology",
      "/ko/ontology/insights/",
      ...OFF_RAIL_SURFACES,
    ];
    const positions: number[] = [];

    for (const surface of surfaces) {
      await page.goto(`${surface}${surface.includes("?") ? "&" : "?"}guides=off`, {
        waitUntil: "networkidle",
      });
      if (surface.startsWith("/ko/library/")) {
        await expect(page).toHaveURL(
          (url) => url.pathname === "/ko/library/" && url.searchParams.get("tab") === "ontology",
        );
        await expect(
          page.locator("#library-workspace-tabpanel-ontology [data-docs-viewer]"),
        ).toBeVisible();
      }
      const tile = page.getByTestId("app-nav-rail-get-app");
      await expect(tile, `${surface}: tile missing`).toBeVisible({ timeout: 15_000 });
      await expect(tile).toHaveAttribute("href", /\/download\/$/);
      const box = await tile.boundingBox();
      expect(box, `${surface}: tile rect unreadable`).not.toBeNull();
      positions.push(Math.round(box!.y));
    }

    expect(new Set(positions).size, `position drifts: ${positions.join(", ")}`).toBe(1);
  });

  test("list destinations share one title y and side inset at 1280 and 1040", async ({
    page,
  }) => {
    await seedFirstRunSeen(page);
    for (const width of [1280, 1040]) {
      await page.setViewportSize({ width, height: 900 });
      const measured: { title: string; titleY: number | null; padLeft: string | null }[] = [];
      for (const member of FRAME_MEMBERS) {
        const m = await measureHeader(page, member.route);
        measured.push({ title: member.title, titleY: m.titleY, padLeft: m.padLeft });
      }
      expect(FRAME_MEMBERS.length, "an empty member list makes this test idle").toBeGreaterThan(2);
      expect(measured.length, "no route measured").toBe(FRAME_MEMBERS.length);
      expect(
        measured.filter((m) => m.titleY === null).map((m) => m.title),
        "a route without a frame element must not count as a pass",
      ).toEqual([]);

      const ys = new Set(measured.map((m) => m.titleY));
      expect(
        ys.size,
        `At ${width}px the title y differs: ` +
          measured.map((m) => `${m.title} ${m.titleY}`).join(" / "),
      ).toBe(1);
      const lefts = new Set(measured.map((m) => m.padLeft));
      expect(
        lefts.size,
        `At ${width}px the side insets differ: ` +
          measured.map((m) => `${m.title} ${m.padLeft}`).join(" / "),
      ).toBe(1);
    }
  });
});
