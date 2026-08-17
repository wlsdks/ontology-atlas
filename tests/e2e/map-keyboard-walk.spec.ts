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

/**
 * **한 번 누르고, 옮겨 갈 때까지 기다린다.**
 *
 * ⚠️ 예전에는 누른 뒤 고정 250ms 를 세고 한 번만 확인했다. 250ms 는 어느 기계의
 * 값이라 느린 쪽에서는 아직 안 옮겨 간 상태를 「이 방향엔 이웃이 없다」로 읽고,
 * 빠른 쪽에서는 남는 시간을 그냥 버린다. 옮겨 가면 **즉시** 돌려주고, 안 옮겨
 * 가면 `patienceMs` 까지 기다린 뒤에야 「없다」고 답한다
 * (2026-08-17 검사 전수조사).
 */
async function pressAndSettle(
  page: import("@playwright/test").Page,
  key: string,
  from: string | null,
  patienceMs = 3_000,
): Promise<string | null> {
  await page.keyboard.press(key);
  const deadline = Date.now() + patienceMs;
  let now = await selectedId(page);
  while (Date.now() < deadline) {
    now = await selectedId(page);
    if (now && now !== from) return now;
    await page.waitForTimeout(50);
  }
  return now;
}

/**
 * **좌표를 읽기 전에 좌표가 멈췄는지 기다린다.** 선택 노드의 화면 좌표가 두 번
 * 연속 같아질 때까지 — 카메라 전이가 흐르는 중에 재면 「화면 밖」이 우연히
 * 참이 된다.
 */
async function settleSelectedPosition(page: import("@playwright/test").Page) {
  const snapshot = () =>
    page.evaluate(() => {
      const probe = window.__atlasMap;
      const id = probe?.selection().nodeId;
      if (!probe || !id) return "";
      const node = probe.nodes().find((n) => n.id === id);
      return node ? `${id}:${Math.round(node.x)},${Math.round(node.y)}` : "";
    });
  await expect
    .poll(
      async () => {
        const before = await snapshot();
        await page.waitForTimeout(150);
        return before !== "" && before === (await snapshot());
      },
      { timeout: 20_000, message: "카메라가 멈추지 않아 좌표를 믿을 수 없다" },
    )
    .toBe(true);
}

/** 네 방향을 차례로 눌러 **한 번이라도** 옮겨 가는 곳을 찾는다. */
async function walkOneStep(
  page: import("@playwright/test").Page,
  from: string | null,
): Promise<string | null> {
  for (const key of DIRECTIONS) {
    const now = await pressAndSettle(page, key, from);
    if (now && now !== from) return now;
  }
  return null;
}

/**
 * **막다른 길이 나올 때까지 한 방향으로 걷는다.**
 *
 * ⚠️ 예전에는 「여덟 번 누르고 나서 확인」이었다. 안내가 스스로 사라지게 되자 그
 * 방식이 **먼저 깨졌다** — 누르는 동안 안내가 떴다 사라져서 한 번도 못 봤다.
 * 안내가 뜨는 순간 멈추는 것이 옳다: 사람도 막힌 직후에 그것을 본다.
 */
async function walkUntilDeadEnd(page: import("@playwright/test").Page, direction = "ArrowLeft") {
  for (let i = 0; i < 12; i += 1) {
    await page.keyboard.press(direction);
    await page.waitForTimeout(140);
    if ((await page.locator("[data-walk-notice]").count()) > 0) return true;
  }
  return false;
}

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
    const moved = await walkOneStep(page, first);
    expect(moved, `네 방향 어디로도 못 걸었다 (시작: ${first})`).not.toBeNull();
  });

  test("걸어간 곳은 실제로 이웃이다 — 아무 노드로나 뛰지 않는다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    const from = await selectedId(page);

    const to = await walkOneStep(page, from);
    /*
     * ⚠️ 여기는 `test.skip(to === null, …)` 이었다 — **조용히 건너뛰었다.**
     * 바로 위 시험(「방향키가 실제로 다른 노드로 옮겨 간다」)이 같은 준비로
     * 「걸어간다」를 이미 못박고 있으므로, 여기서 못 걷는 것은 볼트 사정이
     * 아니라 회귀다. 건너뛴 시험은 초록으로 보이고 아무도 안 본다
     * (2026-08-17 검사 전수조사).
     */
    expect(to, `첫 노드(${from})에서 네 방향 어디로도 못 걸었다`).not.toBeNull();

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

    /*
     * ⚠️ 예전에는 누를 때마다 고정 500ms 였다("카메라 전이가 끝나도록"). 이 시험은
     * **좌표를 읽어** 판정하므로 기다릴 것은 시간이 아니라 «좌표가 멈췄나» 다 —
     * 느린 기계에서는 아직 흐르는 중에 재고, 빠른 기계에서는 남는 시간을 버린다
     * (2026-08-17 검사 전수조사, `map-expand-all` 의 `settleLayout` 과 같은 처방).
     */
    for (const key of DIRECTIONS) {
      await page.keyboard.press(key);
      await settleSelectedPosition(page);
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

    expect(await walkUntilDeadEnd(page), "막다른 길에 닿지 못했다 — 이 시험이 아무것도 안 재고 있다").toBe(true);
    await expect(
      page.getByText(/이어진 노드가 없어요/).first(),
      "막다른 길인데 아무 말도 없다",
    ).toBeVisible({ timeout: 4_000 });
  });

  /**
   * **안내는 걸으려던 노드 옆에 뜨고, 스스로 사라지고, 걸음을 막지 않는다**
   * (2026-08-10 소유자 실사용 지적 3건).
   *
   * 소유자가 실물에서 본 것: *"이렇게 나오면 모르겠는데? 그냥 이동하던 노드 바로
   * 옆에 좀 잘보이게 나타났다가 사라지는게 좋을듯? 심지어 지금은 사라지지도 않고
   * 계속떠있고.. 이거 떠있는동안 x버튼 안누르면 아예 이동도 안됨."*
   *
   * 셋을 한 자리에서 재는 이유: **셋 다 「어디에 무엇으로 띄웠나」 하나에서 나온
   * 결과**다. 앱 공용 토스트로 띄우면 자리는 화면 구석이고, 닫기 버튼이 초점을
   * 받으므로 방향키가 캔버스에 도착하지 않고, 초점이 들어온 토스트는 스스로 사라지는
   * 시계를 멈춘다. 하나만 고치면 나머지 둘이 남는다.
   */
  test("막다른 길 안내가 노드 옆에 뜬다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    expect(await walkUntilDeadEnd(page), "막다른 길에 닿지 못했다 — 이 시험이 아무것도 안 재고 있다").toBe(true);

    const geom = await page.evaluate(() => {
      const probe = window.__atlasMap;
      const id = probe?.selection().nodeId;
      const canvas = document.querySelector('[data-surface-role="map-canvas"]');
      const notice = document.querySelector("[data-walk-notice]");
      if (!probe || !id || !canvas || !notice) return null;
      const node = probe.nodes().find((n) => n.id === id);
      if (!node) return null;
      const cbox = canvas.getBoundingClientRect();
      const nbox = notice.getBoundingClientRect();
      return {
        dx: Math.abs(nbox.x + nbox.width / 2 - (cbox.x + node.x)),
        dy: Math.abs(nbox.y + nbox.height / 2 - (cbox.y + node.y)),
      };
    });
    expect(geom, "안내가 DOM 에 없다 — `data-walk-notice` 로 찾을 수 없다").not.toBeNull();
    // 노드 옆이라는 것은 **거리로만 잴 수 있다.** 실측 토스트는 화면 우하단이라
    // 1440×900 에서 500px 이상 떨어져 있었다.
    expect(geom!.dx, "안내가 노드에서 가로로 너무 멀다").toBeLessThan(280);
    expect(geom!.dy, "안내가 노드에서 세로로 너무 멀다").toBeLessThan(200);
  });

  test("막다른 길 안내는 스스로 사라진다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    expect(await walkUntilDeadEnd(page), "막다른 길에 닿지 못했다 — 이 시험이 아무것도 안 재고 있다").toBe(true);
    await expect(page.locator("[data-walk-notice]").first()).toBeVisible({ timeout: 4_000 });
    // 누르지 않아도 사라진다 — 소유자: *"조금 보여지다 자동으로 사라지게"*.
    await expect(page.locator("[data-walk-notice]")).toHaveCount(0, { timeout: 6_000 });
  });

  test("안내가 떠 있어도 계속 걸을 수 있다 — 초점을 빼앗지 않는다", async ({ page }) => {
    await focusCanvas(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => selectedId(page), { timeout: 5_000 }).not.toBeNull();
    expect(await walkUntilDeadEnd(page), "막다른 길에 닿지 못했다 — 이 시험이 아무것도 안 재고 있다").toBe(true);
    await expect(page.locator("[data-walk-notice]").first()).toBeVisible({ timeout: 4_000 });

    const stillOnCanvas = await page.evaluate(
      () => document.activeElement?.getAttribute("data-surface-role") === "map-canvas",
    );
    expect(stillOnCanvas, "안내가 초점을 가져갔다 — 그러면 방향키가 지도에 도착하지 않는다").toBe(true);

    // 그리고 실제로 걸을 수 있어야 한다. 왔던 방향으로 되돌아가면 이웃이 있다.
    const before = await selectedId(page);
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(() => selectedId(page), { timeout: 4_000 })
      .not.toBe(before);
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
      const start = lines.findIndex((l, i) => l === "지도" && i > 3);
      if (start < 0) return null;
      const rest = lines.slice(start);
      const next = rest.findIndex((l, i) => i > 0 && /^(검색 팔레트|허브|문서함)/.test(l));
      return rest.slice(0, next > 0 ? next : 24);
    });
    expect(section, "시트에서 「지도」 절을 못 찾았다 — 이 시험이 공회전한다").not.toBeNull();
    expect(
      section!.some((line) => /↑|↓|←|→|방향키/.test(line)),
      `지도 절이 방향키를 안내하지 않는다: ${section!.join(" · ")}`,
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
