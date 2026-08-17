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

/**
 * **하이드레이션을 값으로 기다린다 — 「보인다」와 「눌린다」는 다른 순간이다.**
 *
 * ⚠️ 예전에는 고정 1.5초를 세고 한 번 눌렀다. 1.5초는 어느 기계의 값이라 느린
 * 러너에서는 DOM 클릭이 나갔는데도 React 가 아직 핸들러를 안 붙여 무대가 안
 * 열렸고, 빠른 기계에서는 1.5초를 그냥 버렸다. **열릴 때까지 다시 누른다**
 * (2026-08-17 검사 전수조사 — `keyboard-path` 가 같은 처방으로 살아났다).
 */
async function clickUntilOpen(
  page: import("@playwright/test").Page,
  trigger: import("@playwright/test").Locator,
  opened: import("@playwright/test").Locator,
  message: string,
) {
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      async () => {
        if (await opened.isVisible().catch(() => false)) return true;
        await trigger.click({ timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(250);
        return opened.isVisible().catch(() => false);
      },
      { timeout: 40_000, message },
    )
    .toBe(true);
}

/**
 * **무대가 「나 들어왔다」고 말할 때까지 기다린다 — 사용자도 그 뒤에 누른다.**
 *
 * ⚠️ 예전에는 «입장 창이 520ms 니까» 고정 700ms 였다. 잠글 성질은 밀리초가
 * 아니라 **제품이 세우는 표시**다 — 무대는 입장을 마치면 스스로
 * `data-studio-entered="true"` 를 세우고 그때부터 재입장을 끈다
 * (`OntologyStudioPage` · `globals.css`). 그 표시를 기다리면 그 창의 길이가
 * 바뀌어도 이 spec 은 따라온다 (2026-08-17 검사 전수조사).
 *
 * ⚠️ 애니메이션이 끝났는지로 갈음하면 **안 된다** — 실측: CSS 입장은 180ms 에
 * 끝나는데 억제 표시는 520ms 에 선다. 그 틈에 채우면 재입장이 정당하게 일어나
 * 아래 ① 이 거짓 빨강이 된다(이 처방의 첫 판이 그랬다).
 */
async function waitForStageEntered(page: import("@playwright/test").Page) {
  await expect(
    page.locator('[data-studio-entered="true"]'),
    "무대가 입장을 마쳤다고 말하지 않는다",
  ).toBeVisible({ timeout: 20_000 });
}

test("공방 · 방위를 채우면 도착한 것만 움직인다", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await page.goto("/ko/ontology/studio/?guides=off", { waitUntil: "domcontentloaded" });

  const name = page.getByTestId("studio-create-name");
  await clickUntilOpen(
    page,
    page.getByTestId("studio-entry-create"),
    name,
    "무대에 이름 입력 자리가 없다 — 진입 카드가 아직 안 눌린다",
  );
  await name.fill("결제 승인");
  await page.getByTestId("studio-socket-down").click();
  await expect(page.getByTestId("studio-picker")).toBeVisible({ timeout: 10_000 });

  await waitForStageEntered(page);

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

  /*
   * **카드가 붙은 프레임만 센다.** 예전에는 rAF 를 딱 6번 돌고 그중 카드가 없는
   * 프레임은 버렸다 — 느린 기계에서 React 가 3프레임 뒤에 커밋하면 표본이 3개만
   * 남았고, 더 늦으면 0개라 「무대가 열리지 않았다」는 거짓 빨강이 됐다. 표본
   * 개수를 목표로 삼고 프레임 예산을 넉넉히 준다. 그리고 클릭이 안 닿은 판
   * (하이드레이션 전)은 표본 0으로 구별되므로 다시 누른다.
   */
  const sampleEntrance = () =>
    page.evaluate(async () => {
      const button = document.querySelector(
        '[data-testid="studio-entry-create"]',
      ) as HTMLElement | null;
      if (button) button.click();
      const out: { name: string; opacity: number }[] = [];
      let durationMs: number | null = null;
      for (let i = 0; i < 40 && out.length < 8; i += 1) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        const card = document.querySelector(
          '[data-testid="studio-center-card"]',
        ) as HTMLElement | null;
        if (!card) continue;
        const style = getComputedStyle(card);
        out.push({ name: style.animationName, opacity: Number(style.opacity) });
        if (durationMs === null) {
          // 입장이 «얼마나 오래» 도는지는 브라우저에게 직접 묻는다 — 프레임을
          // 세어 추정하면 그 값이 곧 기계 속도다.
          const animation = card
            .getAnimations()
            .find(
              (candidate) =>
                (candidate as unknown as { animationName?: string }).animationName ===
                "studioStageIn",
            );
          const timing = animation?.effect?.getComputedTiming();
          if (timing) durationMs = Number(timing.duration) || 0;
        }
      }
      return { clicked: Boolean(button), frames: out, durationMs };
    });

  let samples: { name: string; opacity: number }[] = [];
  let durationMs: number | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const round = await sampleEntrance();
    if (round.frames.length > 0) {
      samples = round.frames;
      durationMs = round.durationMs;
      break;
    }
    // 진입 카드 자체가 없으면 다시 눌러 봐야 소용없다.
    if (!round.clicked) break;
    await page.waitForTimeout(300);
  }

  expect(samples.length, "무대가 열리지 않았다 — 중앙 카드가 없다").toBeGreaterThan(2);
  console.log(
    `[studio-entrance] ${durationMs}ms · ` +
      `${samples.map((s) => `${s.name}/${s.opacity.toFixed(2)}`).join(" · ")}`,
  );

  // ③ 입장이 실제로 재생된다 — 카드가 붙은 **첫 프레임**이 입장 중이다.
  expect(
    samples[0].name,
    `무대가 열리는데 입장 애니메이션이 없다 — 하드컷이다: ${samples.map((s) => s.name).join(", ")}`,
  ).toBe("studioStageIn");
  expect(
    samples.filter((s) => s.name === "studioStageIn").length,
    `입장이 한 프레임 만에 끝났다: ${samples.map((s) => s.name).join(", ")}`,
  ).toBeGreaterThan(1);

  /*
   * 그리고 **첫 프레임에 끝나 있지 않다.** 이름만 보면 「0.01ms 짜리 입장」도 통과한다.
   *
   * ⚠️ 예전에는 `samples[0].opacity < 0.5` 였다 — **첫 프레임이 언제 오는지가 곧
   * 기계 속도**라, 느린 러너에서 첫 표본이 입장 중반에 잡히면 제품과 무관하게
   * 터진다.
   *
   * ⚠️ 그런데 「프레임 사이에 올라가는가」로만 바꾸면 **부족하다** — 실측(프로브):
   * 입장을 `animation-duration: 0.01ms` 로 줄여 놓고 재니 프레임이
   * `0.00 · 0.00 · 1.00 · 1.00 …` 이라 **올라가긴 한다.** (`both` 라서 시작 전
   * 두 프레임이 `from` 값에 머문다.) 옛 단언(`[0] < 0.5`)도 같은 이유로 이걸
   * 통과시켰다 — 주석이 잡는다고 쓴 것을 실제로는 한 번도 안 잡고 있었다.
   *
   * 그래서 둘로 나눈다:
   *
   * - **얼마나 오래 도나** — 브라우저에게 직접 묻는다(`getComputedTiming`).
   *   기계 속도와 무관한 값이라 여기에 바닥을 건다. 「0.01ms 짜리 입장」이
   *   여기서 죽는다. 토큰을 손보는 여지를 남기려고 바닥은 낮게(50ms) 잡는다 —
   *   잡으려는 것은 «있는 척하는 0» 이지 «180 이 아닌 값» 이 아니다.
   * - **불투명도가 실제로 오르나** — 프레임에서 본다. 절대값이 아니라 처음보다
   *   끝이 진한가만 본다(6배 스로틀에서 셋째 프레임이 0.81 이었다 — 절대값을
   *   못박으면 그 기계에서 죽는다).
   *
   * (2026-08-17 검사 전수조사)
   */
  expect(
    durationMs,
    "입장 애니메이션의 길이를 읽지 못했다 — 이 판정이 공회전한다",
  ).not.toBeNull();
  expect(
    durationMs!,
    `입장이 이름만 있고 길이가 없다(${durationMs}ms) — 한 프레임 만에 끝난다`,
  ).toBeGreaterThan(50);

  const opacities = samples.map((s) => s.opacity);
  const rendered = opacities.map((o) => o.toFixed(2)).join("→");
  expect(
    opacities[opacities.length - 1],
    `입장이 배어 들어오지 않았다(${rendered}) — 끝이 처음보다 진해야 한다`,
  ).toBeGreaterThan(opacities[0]);
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
  const trigger = (await enhance.count())
    ? enhance
    : page.getByTestId("studio-entry-create");
  // 고정 1.5초(하이드레이션) + 2초(무대가 서기를)였다 — 둘 다 값으로 바꾼다:
  // 방위가 하나라도 그려지면 무대가 선 것이고, 입장은 스스로 끝났다고 말한다.
  await clickUntilOpen(
    page,
    trigger,
    page.locator('[data-testid^="studio-socket-"]').first(),
    "무대가 열리지 않았다 — 방위를 하나도 못 찾았다",
  );
  await waitForStageEntered(page);

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

  await clickUntilOpen(
    page,
    page.getByTestId("studio-entry-create"),
    page.getByTestId("studio-create-name"),
    "무대에 이름 입력 자리가 없다 — 진입 카드가 아직 안 눌린다",
  );
  await page.getByTestId("studio-socket-down").click();
  await expect(page.getByTestId("studio-picker")).toBeVisible({ timeout: 10_000 });
  await waitForStageEntered(page);

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
