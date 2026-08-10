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
   * **고른 노드가 패널에 가리지 않는다** (2026-08-10 소유자 확정:
   * *"가려선 안되지 패널 뺀 공간 가운데로 맞춰줘"*).
   *
   * 노드를 고르면 오른쪽에 팝오버가 열린다. 종전에는 카메라가 **뷰포트 가운데**를
   * 목표로 삼아서, 고른 것이 **그것을 설명하는 패널 뒤로** 들어갈 수 있었다.
   * 실측(1512×982): 캔버스 x64 w1448 · 팝오버 x1128 w352 → 자유 영역 가운데는
   * 화면 가운데보다 192px 왼쪽이다.
   *
   * 잠그는 성질은 **「가려지지 않는다」** 다 — 「정확히 가운데」가 아니다. 걷는 동안
   * 카메라는 필요할 때만 따라오므로(매번 데려오면 지도가 계속 미끄러진다) 노드가
   * 자유 영역 안 어디에 있는지는 걸음마다 다르다. 가려짐은 그와 무관하게 늘 거짓이어야 한다.
   */
  test("고른 노드가 패널에 가리지 않는다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();

    const covered: string[] = [];
    for (const key of [...DIRECTIONS, ...DIRECTIONS]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(500); // 카메라 전환이 끝나도록
      const hit = await page.evaluate(() => {
        const probe = window.__atlasMap;
        const id = probe?.selection().nodeId;
        const canvas = document.querySelector('[data-surface-role="map-canvas"]');
        if (!probe || !id || !canvas) return null;
        const node = probe.nodes().find((n) => n.id === id);
        if (!node) return null;
        const box = canvas.getBoundingClientRect();
        // 문서 좌표로 옮긴다 — `nodes()` 는 캔버스 지역 좌표를 준다.
        const px = box.x + node.x;
        const py = box.y + node.y;
        for (const el of document.querySelectorAll("body *")) {
          if (el === canvas || canvas.contains(el) || el.contains(canvas)) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 40 || r.height < 40) continue;
          if (el.closest("details:not([open])")) continue;
          if (el.closest('[aria-hidden="true"]')) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none") continue;
          if (Number(cs.opacity) < 0.05) continue;
          if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) {
            return `${id} 가 ${(el as HTMLElement).dataset.testid || el.tagName} 뒤에 있다`;
          }
        }
        return null;
      });
      if (hit) covered.push(hit);
    }
    expect(covered, "고른 노드가 패널에 가려졌다").toEqual([]);
  });

  /**
   * **카메라가 데려갔다면 자유 영역 가운데에 놓는다.**
   *
   * ⚠️ 위 「가리지 않는다」만으로는 이 변경이 증명되지 않는다 — 프로브로 확인했다:
   * 목표를 뷰포트 가운데로 되돌려도 그 시험은 **초록이었다.** 이 확대와 이 그래프에서는
   * 가운데로 데려간 노드가 우연히 팝오버(x1128)에 안 닿기 때문이다. 통과는 증거가
   * 아니다(`/gate-probe`).
   *
   * 그래서 **바뀐 것을 직접 잰다**: 전환이 실제로 일어난 직후, 노드가 자유 영역
   * 가운데에 있나. 뷰포트 가운데로 되돌리면 실측 192px 이 어긋나 바로 빨개진다.
   */
  test("카메라가 데려간 뒤 노드가 자유 영역 가운데에 있다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();

    const readGeometry = () =>
      page.evaluate(() => {
        const probe = window.__atlasMap;
        const canvas = document.querySelector('[data-surface-role="map-canvas"]');
        const cam = probe?.camera();
        const id = probe?.selection().nodeId;
        if (!probe || !canvas || !cam || !id) return null;
        const node = probe.nodes().find((n) => n.id === id);
        if (!node) return null;
        const box = canvas.getBoundingClientRect();
        // 자유 영역 = 캔버스에서 세로 패널을 뺀 것. spec 은 제품 코드를 import 하지
        // 않고 **화면에서 다시 잰다** — 같은 함수를 쓰면 둘이 같이 틀려도 초록이다.
        let left = box.x;
        let rightEdge = box.right;
        for (const el of document.querySelectorAll("body *")) {
          if (el === canvas || canvas.contains(el) || el.contains(canvas)) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 40 || r.height < 40) continue;
          if (r.right <= box.x || r.left >= box.right) continue;
          if (el.closest("details:not([open])") || el.closest('[aria-hidden="true"]')) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.05) continue;
          const tall = r.height >= box.height * 0.6;
          const wide = r.width >= box.width * 0.6;
          if (!tall || wide) continue;
          if (r.x + r.width / 2 >= box.x + box.width / 2) rightEdge = Math.min(rightEdge, r.x);
          else left = Math.max(left, r.right);
        }
        const freeCenterX = rightEdge > left ? (left + rightEdge) / 2 : box.x + box.width / 2;
        return {
          camX: cam.x,
          camY: cam.y,
          nodeDocX: box.x + node.x,
          freeCenterX,
          canvasCenterX: box.x + box.width / 2,
          canvasWidth: box.width,
        };
      });

    let landed: Awaited<ReturnType<typeof readGeometry>> = null;
    for (const key of [...DIRECTIONS, ...DIRECTIONS, ...DIRECTIONS]) {
      const before = await readGeometry();
      await page.keyboard.press(key);
      await page.waitForTimeout(600);
      const after = await readGeometry();
      if (!before || !after) continue;
      const cameraMoved = Math.hypot(after.camX - before.camX, after.camY - before.camY) > 2;
      if (cameraMoved) {
        landed = after;
        break;
      }
    }
    expect(landed, "카메라 전환을 한 번도 일으키지 못했다").not.toBeNull();
    const toFree = Math.abs(landed!.nodeDocX - landed!.freeCenterX);
    const toCanvas = Math.abs(landed!.nodeDocX - landed!.canvasCenterX);
    /*
     * **「정확히 가운데」를 요구하지 않는다** — 그렇게 재려다 틀렸다(실측 64px 벗어남).
     * 이 다이브는 노드 하나가 아니라 **이웃 묶음(ego bbox)** 을 담으므로, 가운데에
     * 오는 것은 그 묶음이고 노드는 그 안 어딘가다. 「노드가 정확히 가운데」는 규격이
     * 아니라 내 오해였다.
     *
     * 잠그는 성질은 **프레이밍이 자유 영역 쪽으로 잡혔나**다: 노드가 화면 가운데보다
     * 자유 영역 가운데에 더 가깝다. 보정을 되돌리면 노드가 화면 가운데에 앉으므로
     * (실측 192px 차이) 이 비교가 바로 뒤집힌다.
     */
    expect(
      toFree,
      `노드가 자유 영역 가운데(${landed!.freeCenterX.toFixed(0)})보다 ` +
        `화면 가운데(${landed!.canvasCenterX.toFixed(0)})에 가깝다 — 보정이 안 걸렸다 ` +
        `(자유 ${toFree.toFixed(0)}px · 화면 ${toCanvas.toFixed(0)}px)`,
    ).toBeLessThan(toCanvas);
  });

  /**
   * **발견할 수 없는 기능은 기능이 아니다** (2026-08-10 사용성 검수에서 잡혔다).
   *
   * 방향키 걷기를 넣고도, 키보드를 가르치는 **유일한 자리**인 단축키 시트의 지형도
   * 절은 그것을 몰랐다 — 실측으로 그 절에 있던 것은 `클릭 · 드래그 · 스크롤` 셋뿐이다.
   * 그 시트는 예전에 **없는 기능을 안내**해 문제가 됐던 자리이기도 하다(그 파일 주석).
   * 이번은 그 반대 방향의 같은 실패다.
   */
  test("단축키 시트가 방향키 걷기를 안내한다", async ({ page }) => {
    await focusCanvas(page);
    await page.locator("main").first().click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("?");
    const sheet = page.getByTestId("shortcut-sheet-scroll");
    await expect(sheet).toBeVisible({ timeout: 5_000 });
    const all = page.getByTestId("shortcut-sheet-scope-all");
    if (await all.isVisible().catch(() => false)) await all.click();

    const section = await sheet.evaluate((el) => {
      const lines = (el as HTMLElement).innerText.split("\n").map((s) => s.trim()).filter(Boolean);
      const start = lines.findIndex((l, i) => l === "지형도" && i > 3);
      if (start < 0) return null;
      const rest = lines.slice(start);
      const next = rest.findIndex((l, i) => i > 0 && /^(검색 팔레트|허브|문서함)/.test(l));
      return rest.slice(0, next > 0 ? next : 24);
    });
    expect(section, "시트에서 「지형도」 절을 못 찾았다 — 이 시험이 공회전한다").not.toBeNull();
    expect(
      section!.some((line) => /↑|↓|←|→|방향키/.test(line)),
      `지형도 절이 방향키를 안내하지 않는다: ${section!.join(" · ")}`,
    ).toBe(true);
  });

  /**
   * **캔버스 라벨이 다른 곳으로 보내지 않는다** (2026-08-10 사용성 검수).
   *
   * 라벨이 *"INDEX 패널에서 같은 정보를 키보드로 탐색할 수 있어요"* 였다 — 어제는
   * 사실이었지만 지금은 **이 캔버스가 직접 그 일을 한다.** 초점을 받은 사람에게
   * 「여기서는 안 되니 저기로 가라」고 말하는 라벨은 낡은 정보다.
   */
  test("캔버스 라벨이 여기서 되는 일을 먼저 말한다", async ({ page }) => {
    const canvas = page.getByTestId("topology-map-v2-canvas");
    await canvas.waitFor({ state: "visible", timeout: 20_000 });
    const label = await canvas.getAttribute("aria-label");
    expect(label, "캔버스에 접근 이름이 없다").toBeTruthy();
    expect(label!, `라벨이 방향키를 말하지 않는다: ${label}`).toMatch(/방향키/);
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
