import { expect, test, type Page } from "@playwright/test";
import { parseFrontmatter } from "../../src/shared/lib/parse-frontmatter";
import "./atlas-cosmos-probe";
import { installDesktopRailRuntime } from "./desktop-rail-arrival-harness";
import { FIXTURE_VAULT } from "./fixture-vault";
import { seedFirstRunSeen } from "./first-run-seed";
import { dogfoodEvidenceVault } from "./hex-board-vaults";
import { waitForAnimationsDone } from "./settle";
import { stubDirectoryPicker } from "./vault-picker-stub";

async function galaxyOn(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("atlas.appearance.galaxy", "on"));
}

async function ensureGalaxy(page: Page) {
  await expect(page.getByTestId("topology-view-3d")).toBeVisible({ timeout: 90_000 });
  if ((await page.getByTestId("topology-map-view").getAttribute("data-map-view")) !== "galaxy") {
    await page.getByTestId("topology-view-3d").click();
    await waitForAnimationsDone(page.getByTestId("topology-view-3d-menu"));
    await page.getByTestId("topology-view-3d-choice-galaxy").click();
  }
  await expect(page.getByTestId("topology-map-view")).toHaveAttribute("data-map-view", "galaxy");
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.layout()?.galaxies.length ?? 0), { timeout: 60_000 }).toBeGreaterThan(0);
}

const tail = (id: string) => id.slice(Math.max(id.lastIndexOf(":"), id.lastIndexOf("/")) + 1);

test("a path lens lights both ends in Galaxy and recedes the rest to the path rest alpha", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await galaxyOn(page);
  await page.goto("/en/topology/?e2e=1&guides=off&mode=path&pathFrom=domain:order&pathTo=domain:fulfillment", { waitUntil: "domcontentloaded" });
  await ensureGalaxy(page);
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.stats()?.lens.kind ?? null), { timeout: 30_000 }).toBe("path");
  await page.evaluate(() => window.__atlasCosmos?.armPaint(true));
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.painted().length ?? 0)).toBeGreaterThan(0);
  const read = await page.evaluate(() => {
    const probe = window.__atlasCosmos!;
    const stats = probe.stats()!;
    const lit = new Set(probe.painted().map((p) => p.id));
    const rest = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--map-path-rest-alpha"));
    return { lit: [...lit], rows: stats.relations.filter((r) => r.role === "path"), restAlpha: stats.lens.restAlpha, rest };
  });
  expect(read.lit).toEqual(expect.arrayContaining(["domain:order", "domain:fulfillment"]));
  for (const row of read.rows) {
    expect(read.lit).toContain(row.source);
    expect(read.lit).toContain(row.target);
  }
  expect(read.restAlpha).toBeCloseTo(read.rest, 6);
});

test("a selected capability draws exactly its dependency neighbours from the real vault", async ({ page }) => {
  test.setTimeout(240_000);
  const vault = dogfoodEvidenceVault();
  const neighbours = new Map<string, Set<string>>();
  const titles = new Map<string, string>();
  const link = (a: string, b: string) => {
    if (!neighbours.has(a)) neighbours.set(a, new Set());
    neighbours.get(a)!.add(b);
  };
  for (const text of Object.values(vault.files)) {
    const data = parseFrontmatter(text).frontmatter;
    if (typeof data.slug !== "string") continue;
    if (typeof data.title === "string") titles.set(data.slug, data.title);
    for (const key of ["depends_on", "dependencies", "relates"]) {
      const list = data[key];
      if (!Array.isArray(list)) continue;
      for (const other of list) {
        if (typeof other !== "string" || other === data.slug) continue;
        link(data.slug, other);
        link(other, data.slug);
      }
    }
  }
  const [slug, oracle] = [...neighbours.entries()]
    .filter(([s]) => s.startsWith("capabilities/") && titles.has(s))
    .sort((a, b) => b[1].size - a[1].size || (a[0] < b[0] ? -1 : 1))[0]!;

  await page.setViewportSize({ width: 1512, height: 982 });
  await galaxyOn(page);
  await installDesktopRailRuntime(page, vault.files, undefined, { replaceFixture: true, gitPathChanges: vault.changes });
  await page.goto("/en/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-open").click();
  await ensureGalaxy(page);

  await page.getByTestId("topology-concept-search").click();
  await page.keyboard.type(titles.get(slug)!);
  await expect(page.locator('[role="option"][aria-selected="true"]').first()).toContainText(titles.get(slug)!);
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.selection().nodeId ?? null), { timeout: 30_000 }).not.toBeNull();
  const selected = await page.evaluate(() => window.__atlasCosmos!.selection().nodeId!);
  expect(tail(selected)).toBe(tail(slug));
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.stats()?.relations.filter((r) => r.role === "selected").length ?? 0)).toBeGreaterThan(0);
  const others = await page.evaluate((sel) => {
    const rows = window.__atlasCosmos!.stats()!.relations.filter((r) => r.role === "selected");
    return rows.map((r) => (r.source === sel ? r.target : r.source));
  }, selected);
  const expected = [...oracle].map(tail).sort().slice(0, 80);
  expect(new Set(others.map(tail)).size).toBe(others.length);
  expect(others.map(tail).sort()).toEqual(expected);
});

test("a three-member constellation lights three stars that the lens fit keeps inside the room", async ({ page }) => {
  test.setTimeout(180_000);
  const folderId = "55555555-5555-4555-8555-555555555555";
  const slugs = ["checkout", "cart-pricing", "order-history"];
  const uids = slugs.map((s) => /uid: (\S+)/.exec(FIXTURE_VAULT[`capabilities/${s}.md`]!)![1]!);
  await page.setViewportSize({ width: 1512, height: 982 });
  await galaxyOn(page);
  await stubDirectoryPicker(page, {
    ...FIXTURE_VAULT,
    ".ontology-atlas/library-collections.json": JSON.stringify({
      schema: "ontology-atlas/library-collections/v1",
      folders: [{ id: folderId, name: "Checkout path", parentId: null, order: 0, presentation: "constellation", purpose: "Lens proof.",
        createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z" }],
      items: uids.map((uid, i) => ({ id: `6666666${i}-6666-4666-8666-666666666666`, folderId, order: i, label: slugs[i],
        target: { kind: "ontology", uid, lastKnownPath: `capabilities/${slugs[i]}.md` } })),
    }),
  });
  await page.goto("/en/topology/?guides=off&e2e=1", { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter")).toBeHidden();
  await page.goto(`/en/topology/?guides=off&e2e=1&constellation=${folderId}`, { waitUntil: "domcontentloaded" });
  await ensureGalaxy(page);
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.stats()?.lens.kind ?? null), { timeout: 30_000 }).toBe("constellation");
  await expect.poll(() => page.evaluate(() => window.__atlasCosmos?.stats()?.lens.lit ?? 0)).toBe(3);
  await page.evaluate(() => window.__atlasCosmos?.armPaint(true));
  await expect
    .poll(() =>
      page.evaluate((want) => {
        const probe = window.__atlasCosmos!;
        const room = probe.room();
        const tailOf = (s: string) => s.slice(Math.max(s.lastIndexOf(":"), s.lastIndexOf("/")) + 1);
        const members = probe.painted().filter((p) => want.includes(tailOf(p.id)));
        const inside = members.filter((p) => p.x >= room.x && p.x <= room.x + room.width && p.y >= room.y && p.y <= room.y + room.height);
        return new Set(inside.map((p) => p.id)).size;
      }, slugs),
    )
    .toBe(3);
});

test("the trail lens lights the walked stars in Galaxy while its popover is open, and draws no walk line", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1512, height: 982 });
  await seedFirstRunSeen(page);
  await galaxyOn(page);
  await page.goto("/en/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await ensureGalaxy(page);
  const walked = await page.evaluate(() => window.__atlasCosmos!.layout()!.galaxies.slice(0, 2).map((g) => g.id));
  for (const id of walked) {
    await page.locator(`[data-testid="cosmos-galaxy-list"] [data-cosmos-id="${id}"]`).dispatchEvent("click");
    await expect.poll(() => page.evaluate(() => window.__atlasCosmos!.selection().nodeId)).toBe(id);
  }
  const lens = () => page.evaluate(() => window.__atlasCosmos!.stats()!.lens);
  expect((await lens()).kind).toBeNull();
  await page.getByText(/Trail · 2/).click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.trailLens ?? null)).toBe("on");
  await expect.poll(lens).toMatchObject({ kind: "trail", lit: 2 });
  const read = await page.evaluate(() => {
    const stats = window.__atlasCosmos!.stats()!;
    const rest = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--map-spotlight-rest-alpha"));
    return { restAlpha: stats.lens.restAlpha, rest, rows: stats.relations.filter((r) => r.role !== "selected").length };
  });
  expect(read.restAlpha).toBeCloseTo(read.rest, 6);
  expect(read.rows).toBe(0);
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.trailLens ?? null)).toBeNull();
  await expect.poll(async () => (await lens()).kind).toBeNull();
});
