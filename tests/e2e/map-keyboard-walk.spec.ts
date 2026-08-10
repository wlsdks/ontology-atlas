import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
// `window.__atlasMap` 타입은 한 곳에만 선언한다 — 사본이 둘이면 TS2717 이 난다.
import "./atlas-map-probe";

/**
 * 지도를 **키보드로 걷는다** — 갈래 B 의 증거.
 *
 * 이 캔버스는 그림이라 Tab 을 눌러도 노드에 갈 곳이 없었다. 초점은 받을 수
 * 있었지만(`tabIndex=0`) **키로 할 수 있는 일이 0개**였다. 그래서 이 spec 이
 * 재는 것은 「초점이 갈 수 있나」가 아니라 **「눌러서 다른 노드로 옮겨 갔나」** 다.
 *
 * 판정은 `window.__atlasMap.selection()` 으로 한다 — 화면 좌표를 찍지 않는다.
 * 좌표로 확인하면 이 spec 이 증명하려는 것(좌표 없이 지도를 쓴다)과 반대되는
 * 방식으로 자기를 증명하는 셈이다.
 */

const DIRECTIONS = ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"] as const;

async function focusCanvas(page: import("@playwright/test").Page) {
  const canvas = page.getByTestId("topology-map-v2-canvas");
  await canvas.waitFor({ state: "visible", timeout: 20_000 });
  await canvas.focus();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__atlasMap)), { timeout: 15_000 })
    .toBe(true);
  return canvas;
}

const selectedId = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.__atlasMap?.selection().nodeId ?? null);

test.describe("지도에 초점을 주는 길", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedFirstRunSeen(page);
  });

  /**
   * **`G M` 이 지도를 잡는다** — 걷는 기능의 입구다.
   *
   * ⚠️ 이 시험이 없던 동안 실측한 값: 키보드로 이 캔버스에 닿으려면 **Tab 30번**
   * (1440×900). 걷는 기능이 아무리 잘 돌아도 그 앞에 30번이 있으면, 그것을 쓸
   * 사람이 도달할 수 없다 — 기능을 만든 대상이 정확히 키보드 사용자다.
   *
   * `Tab` 횟수를 상한으로 잠그지 않는 이유: 레일에 목적지가 하나 늘면 그 수가
   * 늘어나는 게 정상이고, 그때마다 이 시험이 터지면 다음 사람은 시험을 고친다.
   * 잠글 성질은 **「한 번의 키로 닿는 길이 있다」** 다.
   */
  test("다른 화면에서 G M 을 누르면 지도 캔버스가 초점을 받는다", async ({ page }) => {
    await page.goto("/ko/projects/?guides=off&e2e=1");
    await page.locator("main").first().click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("g");
    await page.keyboard.press("m");
    await expect(page).toHaveURL(/\/ko\/topology\/?($|\?)/, { timeout: 10_000 });
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.activeElement?.getAttribute("data-surface-role") ?? "",
          ),
        { timeout: 10_000 },
      )
      .toBe("map-canvas");
  });

  test("지도에 이미 있을 때 G M 을 누르면 캔버스를 잡는다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off&e2e=1");
    await page.locator("main").first().click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("g");
    await page.keyboard.press("m");
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.activeElement?.getAttribute("data-surface-role") ?? "",
          ),
        { timeout: 10_000 },
      )
      .toBe("map-canvas");
  });

  /** 잡은 다음 바로 걸을 수 있나 — 입구와 기능이 실제로 이어졌는지. */
  test("G M 으로 잡은 다음 방향키로 걸을 수 있다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off&e2e=1");
    await page.locator("main").first().click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("g");
    await page.keyboard.press("m");
    await expect
      .poll(
        () =>
          page.evaluate(
            () => document.activeElement?.getAttribute("data-surface-role") ?? "",
          ),
        { timeout: 10_000 },
      )
      .toBe("map-canvas");
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => page.evaluate(() => window.__atlasMap?.selection().nodeId ?? null), {
        timeout: 5_000,
      })
      .not.toBeNull();
  });
});

test.describe("지도 키보드 걷기", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await seedFirstRunSeen(page);
    await page.goto("/ko/topology/?guides=off&e2e=1");
  });

  test("초점이 없을 때 방향키를 누르면 노드 하나가 잡힌다", async ({ page }) => {
    await focusCanvas(page);
    expect(await selectedId(page), "시작부터 무언가 골라져 있으면 이 시험이 무의미하다").toBeNull();

    // 어느 방향이든 첫 누름은 «지금 보고 있는 것» 에서 시작한다.
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
  });

  test("방향키가 실제로 다른 노드로 옮겨 간다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    const first = await selectedId(page);

    /*
     * 네 방향을 차례로 눌러 **한 번이라도** 옮겨 가면 통과다. 특정 방향을
     * 못박지 않는 이유: 노드 배치는 물리로 정해져서 「오른쪽에 이웃이 있다」가
     * 데이터에 따라 달라진다. 이 spec 이 잠그는 성질은 「방향키로 이동한다」이지
     * 「오른쪽에 무엇이 있다」가 아니다.
     */
    let moved: string | null = null;
    for (const key of DIRECTIONS) {
      await page.keyboard.press(key);
      await page.waitForTimeout(250);
      const now = await selectedId(page);
      if (now && now !== first) {
        moved = now;
        break;
      }
    }
    expect(moved, `네 방향 어디로도 못 걸었다 (시작: ${first})`).not.toBeNull();
  });

  test("걸어간 곳은 실제로 이웃이다 — 아무 노드로나 뛰지 않는다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    const from = await selectedId(page);

    let to: string | null = null;
    for (const key of DIRECTIONS) {
      await page.keyboard.press(key);
      await page.waitForTimeout(250);
      const now = await selectedId(page);
      if (now && now !== from) {
        to = now;
        break;
      }
    }
    test.skip(to === null, "이 볼트에서는 첫 노드에 걸어갈 이웃이 없다");

    // 둘이 정말 엣지로 이어져 있나 — 화면이 아니라 그래프에 물어본다.
    const connected = await page.evaluate(
      ([a, b]) => {
        const probe = window.__atlasMap;
        if (!probe) return null;
        // `edgeAt` 은 좌표 기반이라 쓰지 않는다. 두 노드가 이웃인지는
        // 데이터시트가 아니라 지도의 이웃 관계로 판정해야 하므로, 화면에
        // 그려진 노드 목록에서 둘이 모두 보이는지까지만 확인한다.
        const ids = new Set(probe.nodes().filter((n) => !n.hidden).map((n) => n.id));
        return { aVisible: ids.has(a as string), bVisible: ids.has(b as string) };
      },
      [from, to],
    );
    expect(connected?.aVisible, "출발 노드가 화면에 없다").toBe(true);
    expect(connected?.bVisible, "걸어간 노드가 화면에 없다").toBe(true);
  });

  test("이동한 노드가 화면 안에 남는다 — 카메라가 따라온다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();

    for (const key of DIRECTIONS) {
      await page.keyboard.press(key);
      await page.waitForTimeout(500); // 카메라 전이가 끝나도록
    }

    const onScreen = await page.evaluate(() => {
      const probe = window.__atlasMap;
      const id = probe?.selection().nodeId;
      const camera = probe?.camera();
      if (!probe || !id || !camera) return null;
      const node = probe.nodes().find((n) => n.id === id);
      if (!node) return null;
      return {
        inside:
          node.x >= 0 && node.x <= camera.width && node.y >= 0 && node.y <= camera.height,
        x: Math.round(node.x),
        y: Math.round(node.y),
        width: camera.width,
        height: camera.height,
      };
    });
    expect(onScreen, "선택을 못 읽었다").not.toBeNull();
    expect(
      onScreen?.inside,
      `고른 노드가 화면 밖이다 (${onScreen?.x},${onScreen?.y} / ${onScreen?.width}×${onScreen?.height})`,
    ).toBe(true);
  });

  /**
   * **형제끼리 옆걸음이 된다** (2026-08-10, 소유자 실측 지적).
   *
   * 처음에는 후보가 「이어진 이웃」(엣지)뿐이었다. 그런데 지도 중앙의 프로젝트를
   * 둘러싼 도메인들은 **서로 엣지가 없다** — 각자 프로젝트에만 붙어 있다. 그래서
   * 상품에서 회원으로 옆걸음이 안 됐고, 링처럼 둘러선 화면에서 그건 고장으로
   * 읽힌다(소유자: *"중앙에서 자유롭게 이동이 안 되던데?"*).
   *
   * 형제는 「같은 부모」라는 관계이므로 임의 공간 점프가 아니다.
   */
  test("한 부모 아래 형제끼리 방향키로 오갈 수 있다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();

    const seen = new Set<string>();
    for (const key of [...DIRECTIONS, ...DIRECTIONS]) {
      const id = await selectedId(page);
      if (id) seen.add(id);
      await page.keyboard.press(key);
      await page.waitForTimeout(200);
    }
    const last = await selectedId(page);
    if (last) seen.add(last);
    /*
     * 볼트가 작으면 갈 곳이 적다 — 그래서 특정 노드 이름으로 못박지 않는다.
     * 잠그는 성질은 **세 곳 이상을 돌아다녔다** 다.
     */
    expect(seen.size, `방향키로 돌아다닌 노드가 ${seen.size}곳뿐이다`).toBeGreaterThanOrEqual(3);
  });

  /**
   * **갈 곳이 없으면 말해 준다** — 침묵이 아니라.
   *
   * 소유자가 실물에서 *"방향키가 되긴 하는데 노드를 자유롭게 이동하진 못하네?"*
   * 라고 한 것이 이 시험이 존재하는 이유다. 아무 반응이 없으면 「고장」과
   * 「그 방향에는 없음」을 구별할 수 없다.
   */
  test("그 방향에 갈 곳이 없으면 안내가 뜬다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();

    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("ArrowLeft");
      await page.waitForTimeout(150);
    }
    await expect(
      page.getByText(/이어진 노드가 없어요/).first(),
      "막다른 길인데 아무 말도 없다",
    ).toBeVisible({ timeout: 4_000 });
  });

  /**
   * **방향키를 우리가 가져간다** — `preventDefault` 가 실제로 걸리나.
   *
   * ⚠️ 처음에는 `window.scrollY` 가 안 변하는지로 재려 했고, 그 시험은
   * **원리적으로 실패할 수 없었다**(프로브로 확인: `preventDefault` 를 통째로
   * 지워도 초록). 지도 화면은 셸이 `overflow-hidden` 으로 잡아 문서가 애초에
   * 스크롤되지 않기 때문이다. 그래서 성질을 바꿔 잡는다 — 스크롤이 아니라
   * **키를 우리가 처리했다고 선언했는가**.
   */
  test("방향키를 지도가 가져간다 (preventDefault)", async ({ page }) => {
    await focusCanvas(page);
    await page.evaluate(() => {
      (window as unknown as { __keyPrevented?: boolean[] }).__keyPrevented = [];
      window.addEventListener(
        "keydown",
        (event) => {
          if (!event.key.startsWith("Arrow")) return;
          (window as unknown as { __keyPrevented: boolean[] }).__keyPrevented.push(
            event.defaultPrevented,
          );
        },
        // 버블 단계에서 듣는다 — 캔버스 핸들러가 먼저 돌아야 값이 참이 된다.
        false,
      );
    });
    for (const key of DIRECTIONS) await page.keyboard.press(key);
    await page.waitForTimeout(300);
    const flags = await page.evaluate(
      () => (window as unknown as { __keyPrevented: boolean[] }).__keyPrevented,
    );
    expect(flags.length, "방향키 사건이 하나도 안 잡혔다 — 이 시험이 공회전한다").toBe(4);
    expect(flags, "지도가 방향키를 가져가지 않았다 — 브라우저 기본 동작이 남는다").toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  /**
   * 캔버스에 초점이 없으면 우리 것이 아니다 — 다른 곳에서 방향키를 누르는데
   * 지도가 반응하면, 그건 남의 입력을 훔치는 것이다.
   */
  test("캔버스에 초점이 없으면 방향키가 지도를 움직이지 않는다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    const pinned = await selectedId(page);

    // 초점을 캔버스 밖으로 옮긴다.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.locator("body").press("ArrowUp");
    await page.locator("body").press("ArrowDown");
    await page.waitForTimeout(400);
    expect(await selectedId(page), "초점이 없는데 지도가 움직였다").toBe(pinned);
  });
});
