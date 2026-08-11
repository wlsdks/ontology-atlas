import { expect, test } from "@playwright/test";

import { seedFirstRunSeen } from "./first-run-seed";

/**
 * **공방에서 도착하는 것만 움직인다** (2026-08-12).
 *
 * ## 왜 이 spec 이 생겼나
 *
 * 소유자: *"공방쪽은 2D인데 좀 움직이고 그런 모션좀 넣어달랬는데 안해주더라고"*.
 *
 * 재 보니 공방은 **움직이고 있었다** — 방위를 채우면 지지대가 흐르고
 * (`studioStrutFlow`) 도착 표시가 뜬다(`studioFillArrive`). 문제는 그 반대였다:
 * 채우는 순간을 프레임으로 재니 입장 애니메이션(`studioStageIn`)이 **중앙 카드와
 * 나머지 세 소켓, 추가 버튼에까지** 다시 붙었다. 채운 것은 아래 방위 하나인데
 * 화면 전체가 다시 들어온 것이다.
 *
 * 그래서 「안 움직인다」로 느껴졌다 — **모든 것이 같이 움직이면 아무것도 도착하지
 * 않는다.** 이 저장소의 모션 규칙이 「움직임은 무엇이 어디서 어디로 갔는지 설명해야
 * 한다」고 정해 둔 그 지점이고, 규칙이 금지하는 「인과 없는 움직임」이다.
 *
 * 원인은 CSS 가 아니라 **정체성**이었다: 관계가 landing 하면 React 가 나침 무대를
 * 다시 마운트하고, CSS 입장 애니메이션은 마운트마다 재생된다.
 *
 * ## 잠그는 성질
 *
 * ① 채울 때 **입장이 다시 재생되지 않는다** ② 그러면서 **도착은 움직인다**
 * ③ 무대가 처음 열릴 때는 입장이 재생된다 ④ 그리고 **피커는 나가는 길을 갖는다**.
 *
 * ## ⚠️ ③ 이 없어서 이 게이트가 자기가 지킨다던 것을 놓쳤다 (2026-08-12)
 *
 * 처음에는 ①②만 잠갔다. ①만으로는 「전부 끄기」가 통과한다는 것을 알고 ②를 넣었는데,
 * ②가 보는 것은 **채우는 순간의 도착 애니메이션**이라 입장과는 다른 애니메이션이다.
 * 그래서 **입장을 통째로 죽여도 이 게이트는 초록이었다** — 실제로 그렇게 됐다:
 * 억제 창을 페이지 시간에 걸어 놨더니 사람이 카드를 누르기 전에 창이 지나가 버려서,
 * 무대가 `animation-name: none` · 첫 프레임 `opacity: 1` 로 마운트됐다(하드컷).
 *
 * 「억제가 제때 켜지는가」와 「억제가 항상 켜져 있는가」는 화면에서 서로 다른데
 * ①②만 보는 게이트에서는 **똑같이 초록**이다. 그래서 ③ 을 같이 잠근다 —
 * 억제를 잠그는 게이트는 그 반대편도 같이 잠가야 한다.
 */

test("공방 · 방위를 채우면 도착한 것만 움직인다", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/ontology/studio/?guides=off", { waitUntil: "domcontentloaded" });

  const entry = page.getByTestId("studio-entry-create");
  await expect(entry).toBeVisible({ timeout: 30_000 });
  /*
   * ⚠️ **하이드레이션을 기다린다.** 카드가 보이는 것과 그 카드가 눌리는 것은 다른
   * 순간이다 — 기다리지 않고 누른 판은 DOM 클릭이 나갔는데도 무대가 열리지 않았다
   * (React 가 아직 핸들러를 붙이지 않았다). 「보인다」로 「누를 수 있다」를 갈음하지 않는다.
   */
  await page.waitForTimeout(1_500);
  await entry.click();
  const name = page.getByTestId("studio-create-name");
  await expect(name, "무대에 이름 입력 자리가 없다").toBeVisible({ timeout: 30_000 });
  await name.fill("결제 승인");
  await page.getByTestId("studio-socket-down").click();
  await expect(page.getByTestId("studio-picker")).toBeVisible({ timeout: 10_000 });

  /*
   * 입장 창(520ms)이 지난 뒤에 채운다 — 사용자도 무대가 들어온 뒤에 누른다.
   * 그 전에 누르면 입장이 아직 정당하게 돌고 있어 이 판정이 뜻을 잃는다.
   */
  await page.waitForTimeout(700);

  const running = await page.evaluate(async () => {
    const row = document.querySelector('[data-testid^="studio-picker-row-"]') as HTMLElement | null;
    if (!row) return null;
    const seen = new Set<string>();
    let stop = false;
    const tick = () => {
      if (stop) return;
      for (const animation of document.getAnimations?.() ?? []) {
        const name = (animation as unknown as { animationName?: string }).animationName ?? "";
        const target = (animation.effect as unknown as { target?: Element })?.target;
        const id = (target as HTMLElement | undefined)?.dataset?.testid ?? target?.tagName ?? "?";
        if (name) seen.add(`${name}@${id}`);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    row.click();
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    stop = true;
    return [...seen];
  });

  expect(running, "피커 행을 못 찾았다 — 이 시험이 공회전한다").not.toBeNull();
  const names = running!;
  console.log(`[studio-motion] 채울 때 도는 애니메이션: ${names.join(" · ") || "(없음)"}`);

  // ① 이미 있던 것이 다시 들어오지 않는다.
  const reentered = names.filter((entry) => entry.startsWith("studioStageIn@"));
  expect(
    reentered,
    `방위 하나를 채웠는데 무대가 다시 입장했다 — 무엇이 도착했는지 읽히지 않는다: ${reentered.join(", ")}`,
  ).toEqual([]);

  // ② 그러면서 도착은 움직인다 — ①만 잠그면 「전부 끄기」도 통과한다.
  expect(
    names.some((entry) => entry.startsWith("studioFillArrive@") || entry.startsWith("studioStrutFlow@")),
    `채웠는데 아무것도 도착하지 않았다: ${names.join(", ") || "(애니메이션 0)"}`,
  ).toBe(true);
});

test("공방 · 무대가 처음 열릴 때는 입장이 재생된다", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/ontology/studio/?guides=off", { waitUntil: "domcontentloaded" });

  const entry = page.getByTestId("studio-entry-create");
  await expect(entry).toBeVisible({ timeout: 30_000 });
  /*
   * 하이드레이션 + **입장 창이 지나가기를 기다린다.** 이 기다림이 이 시험의 요점이다 —
   * 사람은 카드를 보고 읽은 뒤에 누르므로 창은 이미 지나가 있다. 창을 페이지 시간에
   * 걸면 여기서 죽는다.
   */
  await page.waitForTimeout(2_500);

  const frames = await page.evaluate(async () => {
    const button = document.querySelector('[data-testid="studio-entry-create"]') as HTMLElement | null;
    if (!button) return null;
    button.click();
    const out: { name: string; opacity: number }[] = [];
    for (let i = 0; i < 6; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const card = document.querySelector('[data-testid="studio-center-card"]') as HTMLElement | null;
      if (!card) continue;
      const style = getComputedStyle(card);
      out.push({ name: style.animationName, opacity: Number(style.opacity) });
    }
    return out;
  });

  expect(frames, "생성 카드를 못 찾았다 — 이 시험이 공회전한다").not.toBeNull();
  const samples = frames!;
  expect(samples.length, "무대가 열리지 않았다 — 중앙 카드가 없다").toBeGreaterThan(2);
  console.log(
    `[studio-entrance] ${samples.map((s) => `${s.name}/${s.opacity.toFixed(2)}`).join(" · ")}`,
  );

  // ③ 입장이 실제로 재생된다.
  expect(
    samples.every((s) => s.name === "studioStageIn"),
    `무대가 열리는데 입장 애니메이션이 없다 — 하드컷이다: ${samples.map((s) => s.name).join(", ")}`,
  ).toBe(true);

  /*
   * 그리고 **첫 프레임에 끝나 있지 않다.** 이름만 보면 「0.01ms 짜리 입장」도 통과한다.
   * 잠글 성질은 기계와 무관한 쪽이다 — 첫 프레임이 아직 투명한가.
   * (밀리초나 프레임 수를 못박지 않는다: 기계마다 다르다.)
   */
  expect(
    samples[0].opacity,
    `입장이 첫 프레임에 이미 끝나 있다(opacity ${samples[0].opacity}) — 이름만 있고 움직임이 없다`,
  ).toBeLessThan(0.5);
});

/**
 * ⑤ **앵커된 임시 표면 셋이 한 문법을 쓴다** (2026-08-12).
 *
 * 피커에 나가는 길을 놓은 다음 나머지 둘을 재 보니 둘 다 하드컷이었다 —
 * 접힘 목록은 `+35ms 있음/none/1.00`(등장·퇴장 둘 다) 게다가 **Esc 로도 안 닫혔고**,
 * 관계 편집 카드는 `+33ms` 등장 · Esc 뒤 한 프레임에 소멸. 같은 무대 같은 자리의
 * 같은 종류 표면 셋이 **서로 다른 문법**을 쓰고 있었던 것이다.
 *
 * 그래서 이 시험은 표면마다 따로 쓰지 않고 **표를 돌린다** — 넷째 표면이 생기면
 * 여기 한 줄을 더하는 것이 그 표면에 문법을 붙이는 것과 같은 일이 된다.
 */
const ANCHORED = [
  { id: "studio-picker", label: "소켓 피커" },
  { id: "studio-lane-list", label: "접힘 목록" },
  { id: "studio-edit-card", label: "관계 편집 카드" },
  /*
   * 작업중 패널은 **초안이 하나라도 있을 때만** 트리거가 뜨고, 초안은 현재 그래프에
   * 있는 노드로만 열린다 — 얇은 볼트에서는 열 수 없어 아래 표가 「건너뜀」으로
   * 남긴다(조용히 통과하지 않는다). 배선은 단위 시험이 잠근다:
   * 「작업중 패널이 앵커된 표면 문법으로 들어오고 나간다」.
   */
  { id: "studio-drafts-panel", label: "작업중 패널", openWith: "studio-drafts-open" },
] as const;

test("공방 · 앵커된 임시 표면 셋이 같은 문법으로 나간다", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/ontology/studio/?guides=off", { waitUntil: "domcontentloaded" });

  // 강화 모드 — 이미 채워진 방위가 있어야 접힘 목록·편집 카드가 존재한다.
  const enhance = page.getByTestId("studio-entry-enhance");
  await expect(page.getByTestId("studio-entry-create")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1_500);
  if (await enhance.count()) await enhance.click();
  else await page.getByTestId("studio-entry-create").click();
  await page.waitForTimeout(2_000);

  /** 열었다 Esc 로 닫으며 그 표면의 프레임을 잡는다. */
  const trace = async (selector: string, open: () => Promise<void>) => {
    await page.evaluate(([sel]: [string]) => {
      const w = window as unknown as { __rec?: unknown[]; __stop?: () => void };
      w.__rec = [];
      let stop = false;
      const tick = () => {
        if (stop) return;
        const el = document.querySelector(sel) as HTMLElement | null;
        if (el) {
          const cs = getComputedStyle(el);
          (w.__rec as unknown[]).push({
            a: cs.animationName,
            o: Number(cs.opacity),
            inert: el.hasAttribute("inert"),
          });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      w.__stop = () => {
        stop = true;
      };
    }, [selector] as [string]);
    await open();
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    return (await page.evaluate(() => {
      const w = window as unknown as { __rec: { a: string; o: number; inert: boolean }[]; __stop: () => void };
      w.__stop();
      return w.__rec;
    })) as { a: string; o: number; inert: boolean }[];
  };

  let measured = 0;
  for (const surface of ANCHORED) {
    const openers: Record<string, () => Promise<void>> = {
      "studio-picker": async () => {
        const socket = page.locator('[data-testid^="studio-socket-"]').first();
        if (await socket.count()) await socket.click();
      },
      "studio-lane-list": async () => {
        const more = page.locator('[data-testid^="studio-lane-more-"]').first();
        if (await more.count()) await more.click();
      },
      "studio-edit-card": async () => {
        const edit = page.locator('[data-testid^="studio-edit-"]').first();
        if (await edit.count()) await edit.click();
      },
      "studio-drafts-panel": async () => {
        const chip = page.getByTestId("studio-drafts-open");
        if (await chip.count()) await chip.click();
      },
    };
    // 접힘 목록은 방위마다 testid 가 다르다 — 접두사로 잡는다.
    const selector =
      surface.id === "studio-lane-list"
        ? '[data-testid^="studio-lane-list-"]'
        : `[data-testid="${surface.id}"]`;

    const rows = await trace(selector, openers[surface.id]);
    if (rows.length === 0) {
      console.log(`[anchored] ${surface.label}: 이 볼트에서 열 수 없어 건너뜀`);
      continue;
    }
    measured += 1;
    const entering = rows.filter((r) => r.a === "studioAnchoredIn");
    const leaving = rows.filter((r) => r.a === "studioAnchoredOut");
    console.log(
      `[anchored] ${surface.label}: 등장 ${entering.length}프레임 ` +
        `${entering.length ? `${entering[0].o.toFixed(2)}→${entering[entering.length - 1].o.toFixed(2)}` : ""} · ` +
        `퇴장 ${leaving.length}프레임 ` +
        `${leaving.length ? `${leaving[0].o.toFixed(2)}→${leaving[leaving.length - 1].o.toFixed(2)}` : ""}`,
    );

    expect(
      entering.length,
      `${surface.label}가 등장 애니메이션 없이 나타났다 — 하드컷이다: ${[...new Set(rows.map((r) => r.a))].join(", ")}`,
    ).toBeGreaterThan(1);
    expect(entering[0].o, `${surface.label} 등장 첫 프레임이 이미 불투명하다`).toBeLessThan(0.5);

    /*
     * 퇴장은 **Esc 로** 재는 것이 요점이다. 접힘 목록은 Esc 핸들러가 아예 없어서
     * 「닫히지 않는다」와 「하드컷으로 닫힌다」가 여기서 같은 실패로 잡힌다.
     */
    expect(
      leaving.length,
      `${surface.label}가 Esc 로 부드럽게 나가지 않았다 — 핸들러가 없거나 하드컷이다: ${[...new Set(rows.map((r) => r.a))].join(", ")}`,
    ).toBeGreaterThan(1);
    expect(leaving[0].o, `${surface.label} 퇴장 첫 프레임이 이미 투명하다`).toBeGreaterThan(0.5);
    expect(
      leaving[leaving.length - 1].o,
      `${surface.label} 퇴장이 배어 나가지 않고 잘렸다`,
    ).toBeLessThan(0.5);
    expect(leaving.every((r) => r.inert), `나가는 ${surface.label}가 여전히 조작을 받는다`).toBe(true);
  }

  // 공회전 차단: 하나도 못 열었으면 이 시험은 아무것도 재지 않았다.
  expect(measured, "앵커된 표면을 하나도 열지 못했다").toBeGreaterThan(2);
});

test("공방 · 피커는 나가는 길을 갖는다", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/ontology/studio/?guides=off", { waitUntil: "domcontentloaded" });

  const entry = page.getByTestId("studio-entry-create");
  await expect(entry).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1_500);
  await entry.click();
  await expect(page.getByTestId("studio-create-name")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("studio-socket-down").click();
  await expect(page.getByTestId("studio-picker")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(700);

  /*
   * **닫는 순간부터 프레임을 잡는다.** 그 전까지 피커는 나가는 길이 없었다 —
   * Escape 는 +2ms(한 프레임), 행 선택은 +39ms 에 `opacity: 1.00` 그대로
   * 소멸했다. 그동안 결과 쪽(소켓 색 전이 130ms · 도착 표시 240ms)은 제대로
   * 움직였으니 **사용자가 누른 그것만 0프레임**을 받은 것이다.
   */
  const frames = await page.evaluate(async () => {
    const out: { name: string; opacity: number; inert: boolean }[] = [];
    let stop = false;
    const tick = () => {
      if (stop) return;
      const el = document.querySelector('[data-testid="studio-picker"]') as HTMLElement | null;
      if (el) {
        const style = getComputedStyle(el);
        out.push({
          name: style.animationName,
          opacity: Number(style.opacity),
          inert: el.hasAttribute("inert"),
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 600));
    stop = true;
    return out;
  });

  const dismissing = frames.filter((f) => f.name === "studioAnchoredOut");
  console.log(
    `[studio-dismiss] 살아 있던 프레임 ${frames.length} · 퇴장 프레임 ${dismissing.length} · ` +
      `불투명도 ${dismissing.map((f) => f.opacity.toFixed(2)).join("→") || "(없음)"}`,
  );

  // 공회전 차단: 피커를 한 프레임도 못 봤으면 이 시험은 아무것도 안 쟀다.
  expect(frames.length, "닫기 직후 피커를 한 프레임도 못 봤다").toBeGreaterThan(0);

  /*
   * ④-a **자기 이름으로 정방향 재생된다.** 되감기(`reverse`)는 같은 원소에서
   * 클래스만 바뀌는 자리에서 아예 재생되지 않는다(`exit-motion-restart` 계약).
   */
  expect(
    dismissing.length,
    `피커가 퇴장 애니메이션 없이 사라졌다 — 하드컷이다: ${frames.map((f) => f.name).join(", ") || "(프레임 0)"}`,
  ).toBeGreaterThan(1);

  /*
   * ④-b **실제로 배어 나간다.** 이름만 보면 「0.01ms 짜리 퇴장」도 통과한다.
   * 프레임 수·밀리초는 못박지 않는다(기계마다 다르다) — 잠글 성질은 처음이
   * 불투명하고 끝이 투명한가다.
   */
  expect(dismissing[0].opacity, "퇴장 첫 프레임이 이미 투명하다").toBeGreaterThan(0.5);
  expect(
    dismissing[dismissing.length - 1].opacity,
    "퇴장이 끝났는데 아직 불투명하다 — 배어 나가지 않고 잘렸다",
  ).toBeLessThan(0.5);

  // ④-c 나가는 동안 조작을 받지 않는다 — 착지하는 소켓을 가로막지 않게.
  expect(
    dismissing.every((f) => f.inert),
    "나가는 피커가 여전히 조작을 받는다",
  ).toBe(true);
});
