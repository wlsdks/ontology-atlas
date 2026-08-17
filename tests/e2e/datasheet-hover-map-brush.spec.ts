import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import type {} from "./atlas-map-probe";

/**
 * **데이터시트의 줄에 마우스를 올리면 옆 지도가 그 노드를 가리킨다.**
 *
 * 2026-08-17 소유자 지시: *"이부분들 각각 마우스 올리면 옆에 지도에서
 * 반짝이면서 표시되면 좋겠는데 가능할까? 지금은 아무 반응이 없어서.."*
 *
 * ## 왜 「상태」와 「픽셀」을 둘 다 재나
 *
 * 이 기능은 **둘 중 하나만 재면 초록인 채로 죽는다**. 실제로 그렇게 죽어 있던
 * 것을 이 스펙을 쓰다가 찾았다:
 *
 * | 재는 것 | 못 잡는 것 |
 * |---|---|
 * | 상태만(`__atlasMap.hover()`) | 값은 맞는데 **화면엔 아무것도 안 그려지는** 상태. 노드를 고른 동안에는 emphasis 램프가 0 이라 호버 링의 알파도 0 이었다 — 실측 **0픽셀** |
 * | 픽셀만 | 「뭔가 바뀌었다」만 말한다. **엉뚱한 노드**를 가리켜도 초록이다 |
 *
 * 그래서 상태(`hover()` 가 그 노드인가)와 화면(캔버스 픽셀이 실제로 바뀌는가)을
 * 같은 걸음에서 잰다.
 *
 * ## 계기가 헛돌지 않는지
 *
 * 매 걸음 앞에 **소음 측정**(아무것도 안 하고 두 번 찍어 비교)이 있다. 소음이
 * 0 이 아니면 「호버로 N픽셀 바뀌었다」는 주장이 성립하지 않으므로, 그때는
 * 소음의 몇 배를 넘어야 통과한다. 감속 모션(`reducedMotion`)을 켜서 재는
 * 이유도 같다 — 지도의 상시 애니메이션(혜성·숨쉬기)이 꺼져야 「호버 때문에
 * 바뀐 픽셀」을 분리할 수 있고, 동시에 **이 강조가 움직임에 기대지 않는다는
 * 것**(이 저장소는 깜빡임·glow 를 금지한다)도 같이 증명된다.
 */
test("데이터시트 줄 호버 — 지도가 그 노드를 가리키고, 떼면 되돌아온다", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.setViewportSize({ width: 1512, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?e2e=1&guides=off", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);

  // 노드 하나를 골라 데이터시트를 연다(캔버스 좌표 클릭 — `map-trail.spec.ts` 와 같은 방식).
  const target = await page.evaluate(() => {
    const probe = window.__atlasMap;
    const box = document
      .querySelector('[data-testid="topology-map-v2-canvas"]')
      ?.getBoundingClientRect();
    const node = probe?.nodes().find((n) => !n.hidden && n.label === "주문");
    return node && box ? { px: box.left + node.x, py: box.top + node.y } : null;
  });
  expect(target, "주문 도메인을 못 찾았다 — 공회전").not.toBeNull();
  await page.mouse.click(target!.px, target!.py);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__atlasMap!.selection().nodeId)).toBe("domain:order");

  const hover = () => page.evaluate(() => window.__atlasMap!.hover());
  /** 캔버스 픽셀 원본 — 화면에 실제로 무엇이 그려졌는지의 유일한 증거. */
  const pixels = () =>
    page.evaluate(() => {
      const canvas = document.querySelector(
        '[data-testid="topology-map-v2-canvas"]',
      ) as HTMLCanvasElement;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      return Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    });
  const changed = (a: number[], b: number[]) => {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3])
        n += 1;
    }
    return n;
  };
  /** 커서를 지도 밖 빈 자리로 — 캔버스 호버도 패널 호버도 아닌 상태. */
  const parkCursor = async () => {
    await page.mouse.move(20, 20);
    await page.waitForTimeout(900);
  };

  // 데이터시트의 관계 행 중 **지금 지도에 그려져 있는** 노드를 고른다.
  // (밀도 게이트로 접혀 있는 자식은 그릴 노드 자체가 없어서 아무것도 안 바뀐다 —
  //  기능의 한계이지 이 계약의 위반이 아니라 여기서 재지 않는다.)
  const rows = await page.evaluate(() => {
    const byId = new Map(window.__atlasMap!.nodes().map((n) => [n.id, n]));
    return [...document.querySelectorAll("[data-datasheet-connection]")].map((el) => {
      const id = el.getAttribute("data-datasheet-connection")!;
      return { id, drawn: byId.get(id)?.hidden === false };
    });
  });
  const drawnRow = rows.find((r) => r.drawn);
  expect(drawnRow, "지도에 그려진 이웃이 한 줄도 없다 — 이 스펙은 아무것도 못 잰다").toBeTruthy();

  // 소음 — 아무것도 안 한 두 프레임의 차이. 0 이어야 아래 수치가 뜻을 갖는다.
  const base = await pixels();
  await page.waitForTimeout(700);
  const noise = changed(base, await pixels());

  // ① 줄에 올리면 — 상태도 그 노드고, 화면도 실제로 바뀐다.
  await page.locator(`[data-datasheet-connection="${drawnRow!.id}"]`).hover();
  await page.waitForTimeout(900);
  expect(await hover(), "지도가 그 노드를 가리키지 않는다").toBe(drawnRow!.id);
  const hoveredPixels = changed(base, await pixels());
  expect(
    hoveredPixels,
    `호버 상태는 맞는데 화면은 그대로다 (바뀐 픽셀 ${hoveredPixels}, 소음 ${noise})`,
  ).toBeGreaterThan(Math.max(200, noise * 4));

  // ② 떼면 원래대로 — 강조가 지도에 남으면 그건 새 결함이다.
  await parkCursor();
  expect(await hover()).toBeNull();
  expect(changed(base, await pixels()), "커서를 뗐는데 화면이 안 돌아온다").toBeLessThanOrEqual(
    noise,
  );

  // ③ 근거 문서 행 — 넘어오는 이름이 **볼트 slug** 라 표를 거쳐야 지도 id 가 된다.
  //    두 이름 공간이 만나는 자리이고, 예전에 여기서 기능이 죽은 적이 있다
  //    (`src/entities/knowledge-graph/lib/chat-node-index.ts`).
  const evidenceSlug = await page.evaluate(
    () =>
      document.querySelector("[data-datasheet-evidence]")?.getAttribute("data-datasheet-evidence") ??
      null,
  );
  if (evidenceSlug !== null) {
    await page.locator(`[data-datasheet-evidence="${evidenceSlug}"]`).hover();
    await page.waitForTimeout(700);
    const resolved = await hover();
    const mapIds = await page.evaluate(() => window.__atlasMap!.nodes().map((n) => n.id));
    expect(resolved, "근거 문서 행이 지도 이름 공간으로 안 옮겨졌다").not.toBe(evidenceSlug);
    expect(mapIds, "근거 문서 행이 지도에 없는 이름을 가리킨다").toContain(resolved);
    await parkCursor();
    expect(await hover()).toBeNull();
  }

  // ④ 노드가 아닌 자리(그룹 머리글)에 올려도 지도는 가만히 있다 — 강조는
  //    「줄」에 묶인 것이지 「패널」에 묶인 것이 아니다.
  await page.locator('[data-datasheet-group-total="contains"]').hover();
  await page.waitForTimeout(700);
  expect(await hover(), "패널 아무 데나 올려도 지도가 반응한다").toBeNull();

  expect(pageErrors, "호버 도중 콘솔 예외").toEqual([]);
});
