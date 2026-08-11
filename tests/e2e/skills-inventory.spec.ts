import { expect, test } from "@playwright/test";

import { stubSkillFolder } from "./skills-folder-stub";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * 스킬 화면이 **실제 폴더를 읽어 실제 결과를 그리는지** 잰다.
 *
 * 단위 시험은 인벤토리 계산이 맞는지만 본다. 여기서 재는 것은 그 위의 두 층이다:
 * 폴더 고르기가 실제 파일에 닿는가 · 그 결과가 화면에 그려지는가.
 *
 * ## 폴더 고르기를 어떻게 자동화하나
 *
 * `showDirectoryPicker()` 는 사용자가 손으로 눌러야 열리는 OS 대화상자라 자동화가
 * 안 된다. 그래서 **OPFS**(브라우저가 사이트마다 주는 사설 파일 시스템)에 가짜
 * 스킬 폴더를 만들고 피커를 그 핸들로 스텁한다 — 앱 코드는 표준
 * `FileSystemDirectoryHandle` 만 보므로 **읽는 경로는 진짜 그대로** 돈다.
 * (이 저장소가 볼트 여정을 자동 검증할 때 확립한 기법.)
 */

const SKILL = (name: string, description: string, body = "") =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`;


test.describe("스킬 인벤토리", () => {
  /**
   * **아무것도 없을 때도 화면이 완성돼 보여야 한다** (2026-08-12 소유자 지적).
   *
   * 소유자: *"스킬은 아무것도 없을때 너무 횡하고 뭔가 벽에 다 딱 붙어있고 그런
   * 느낌인데.. 인사이트나 프로젝트는 좀 나은데"*.
   *
   * 실측이 그 말을 그대로 확인했다(1512×900): 스킬의 빈 상태는 **글이 16개**인데
   * 목록형 칸(1448px)을 그대로 써서 세 질문이 벽까지 펼쳐지고(가장 오른쪽 1472),
   * 아래로 **524px = 화면의 58%** 가 비어 있었다. 같은 폭을 쓰는 인사이트·프로젝트는
   * 글이 **48·80개**라 그 폭이 정당했다 — 즉 문제는 폭 값이 아니라 **적은 내용에 같은
   * 폭을 쓴 것**이다.
   *
   * ⚠️ **첫 처방은 화면이 반박했다.** 남는 높이를 위아래로 나눠 봤더니 숫자(아래
   * 공백 524 → 286)는 좋아졌는데 제목만 위에 떠 있고 그 아래 320px 공백이 생겼다 —
   * 공백을 옮긴 것뿐이었다. 그래서 「한 덩어리로 끝낸다」로 바꿨고, 이 시험이 잠그는
   * 것은 그 성질이다: **좁은 칸 + 제목 바로 아래 + 눈에 보이는 면**.
   */
  /**
   * **빈 상태는 화면 가운데에 세워진다** (2026-08-12, 소유자 지적으로 두 번째 개정).
   *
   * 이 시험이 잠그던 성질은 원래 「제목 바로 아래」였다 — 그건 그 전 회차에 내가
   * 내린 결론이고, **소유자가 화면을 보고 뒤집었다**: *"우측/하단 공백이 너무
   * 심하고? … 이렇게 조립대같은 전략을 쓰던지"*.
   *
   * 실측이 그 지적과 같았다(1512×900, 잎 요소만 잰 잉크 상자):
   *
   * | | 잉크 | 좌/우 | 상/하 |
   * |---|---|---|---|
   * | 종전 스킬 | 1368×313 | 104 / 40 | 56 / **531** |
   * | 조립대 입구 | 482×318 | 489 / 541 | 291 / 291 |
   *
   * 조립대는 **가운데에 세워져** 있고 스킬은 위에 붙어 벽까지 퍼져 있었다. 그래서
   * 열 것이 아직 없을 때는 머리 행을 쓰지 않고 이 화면 전체가 무대가 된다.
   *
   * ⚠️ **잠글 것은 픽셀이 아니라 균형이다.** 좌우·상하 공백의 절대값을 못박으면
   * 문구 한 줄이 길어지는 날 제품은 멀쩡한데 빨개진다. 그래서 「가운데에서 얼마나
   * 벗어났나」를 뷰포트 비율로 잰다.
   */
  test("빈 상태는 화면 가운데에 세워진다", async ({ page }) => {
    await page.goto("/ko/skills/?guides=off", { waitUntil: "domcontentloaded" });
    const empty = page.getByTestId("skills-empty");
    await expect(empty).toBeVisible({ timeout: 20_000 });

    const box = await page.evaluate(() => {
      const cardEl = document.querySelector('[data-testid="skills-empty"]')!;
      const stageEl = document.querySelector('[data-testid="skills-stage"]')!;
      const card = cardEl.getBoundingClientRect();
      const stage = stageEl.getBoundingClientRect();
      const style = getComputedStyle(cardEl);
      /*
       * ⚠️ **세로는 카드 하나가 아니라 무대 덩어리로 잰다.** 카드 위에 제목과 한 줄
       * 설명이 같이 서 있으므로, 카드만 기준으로 재면 위쪽 여백이 늘 더 커서
       * 「치우쳤다」로 오판한다 — 첫 판이 215/118 로 그렇게 빨개졌고, 화면은 맞는데
       * 계기가 틀린 것이었다. 잠글 성질은 **그 덩어리가 가운데 있는가**다.
       *
       * 무대의 첫 잉크(제목)와 마지막 잉크(카드 아래)를 양 끝으로 삼는다.
       */
      const first = stageEl.firstElementChild!.getBoundingClientRect();
      return {
        width: Math.round(card.width),
        // 가로는 카드로 잰다 — 벽에 붙었는지는 카드가 말한다.
        leftGap: Math.round(card.left - stage.left),
        rightGap: Math.round(stage.right - card.right),
        // 세로는 덩어리로 잰다.
        topGap: Math.round(first.top - stage.top),
        bottomGap: Math.round(stage.bottom - card.bottom),
        hostW: Math.round(stage.width),
        hostH: Math.round(stage.height),
        surfaced:
          style.borderTopWidth !== "0px" ||
          (style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent"),
      };
    });

    console.log(
      `[skills-empty] 칸 ${box.width} · 좌 ${box.leftGap} 우 ${box.rightGap} · ` +
        `상 ${box.topGap} 하 ${box.bottomGap} · 셸 ${box.hostW}×${box.hostH}`,
    );

    // ① 좁은 칸 — 글 16개를 목록형 폭(1448)에 펼치지 않는다.
    expect(box.width, `빈 상태가 ${box.width}px 로 펼쳐졌다 — 글 16개에 목록형 폭이다`).toBeLessThanOrEqual(1_000);

    // ② 가로로 가운데 — 벽에 붙지 않는다. 셸 폭의 10% 안쪽으로 균형.
    const xOff = Math.abs(box.leftGap - box.rightGap);
    expect(
      xOff,
      `가로가 ${box.leftGap}/${box.rightGap} 로 치우쳤다 — 한쪽 벽에 붙어 있다`,
    ).toBeLessThan(box.hostW * 0.1);

    // ③ 세로로 가운데 — 아래에 구멍을 남기지 않는다. 셸 높이의 12% 안쪽.
    const yOff = Math.abs(box.topGap - box.bottomGap);
    expect(
      yOff,
      `세로가 ${box.topGap}/${box.bottomGap} 로 치우쳤다 — 남는 높이가 한쪽에 구멍으로 남는다`,
    ).toBeLessThan(box.hostH * 0.12);

    // ④ 눈에 보이는 면 — 면이 없으면 글이 아무 데도 묶이지 않아 「횡하다」로 읽힌다.
    expect(box.surfaced, "빈 상태에 면(테두리·배경)이 없다 — 글이 허공에 떠 있다").toBe(true);
  });

  test("폴더를 열면 스킬과 겹침을 그리고, 호출 사슬을 펼쳐 보인다", async ({ page }) => {
    await stubSkillFolder(page, {
      // 이름이 같고 설명이 다른 둘 — 경쟁하는 발동 조건.
      "packA/skills/report/SKILL.md": SKILL("report", "Build a quarterly revenue report"),
      "packB/skills/report/SKILL.md": SKILL("report", "Draft an incident postmortem writeup"),
      // 이름은 다른데 트리거가 겹치는 둘.
      "packA/skills/invoice/SKILL.md": SKILL("invoice", "invoice pdf export ledger accounting"),
      "packA/skills/billing/SKILL.md": SKILL("billing", "invoice pdf export accounting statement"),
      // 딸린 파일과 실행 파일이 있는 하나 — 사슬을 펼쳐 확인할 대상.
      "packA/skills/chartkit/SKILL.md": SKILL(
        "chartkit",
        "Render dashboards from telemetry snapshots",
        "Read references/palette.md first, then run scripts/render.py to draw it.",
      ),
      "packA/skills/chartkit/references/palette.md": "# palette",
      "packA/skills/chartkit/scripts/render.py": "print('x')",
    });

    await seedFirstRunSeen(page);
    await page.goto("/ko/skills/?guides=off");
    await expect(page.getByTestId("agent-skills-page")).toBeVisible();

    await page.getByTestId("skills-empty-open").click();

    const census = page.getByTestId("skills-census");
    await expect(census).toBeVisible({ timeout: 15_000 });
    // 스킬 5개 · 실행 1개 — 수는 머리가 진다(2026-08-09 머리 문법 통일).
    await expect(census).toContainText("5");

    const rows = page.getByTestId("skill-row-toggle");
    await expect(rows).toHaveCount(5);

    // 이름 충돌 — 설명까지 다르니 "경쟁" 표시가 있어야 한다.
    await expect(page.getByText("report", { exact: false }).first()).toBeVisible();

    // 호출 사슬 — 펼치기 전에는 없다(그래야 이 단언이 무언가를 증명한다).
    await expect(page.getByTestId("skill-invocation-chain")).toHaveCount(0);
    await rows.filter({ hasText: "chartkit" }).click();
    const chain = page.getByTestId("skill-invocation-chain");
    await expect(chain).toBeVisible();
    await expect(chain).toContainText("references/palette.md");
    await expect(chain).toContainText("scripts/render.py");
    // **읽는 것과 돌아가는 것을 가른다** — 이 화면의 요점.
    await expect(page.getByTestId("skill-executable-mark")).toHaveCount(1);
  });

  test("아무것도 없는 폴더를 열어도 화면이 살아 있다", async ({ page }) => {
    await stubSkillFolder(page, { "notes/readme.md": "# 스킬이 아니다" });
    await seedFirstRunSeen(page);
    await page.goto("/ko/skills/?guides=off");
    await page.getByTestId("skills-empty-open").click();
    await expect(page.getByTestId("skills-census")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("skill-row-toggle")).toHaveCount(0);
  });

  /**
   * **반복 세트의 높이를 내용이 정하지 못한다** — 헌장의 「치수 규칙성」.
   *
   * `line-clamp-2` 만으로는 **상한**만 정해진다. 폭이 좁아지면 어떤 행은 한 줄,
   * 어떤 행은 두 줄이 되어 격자가 흐트러진다 — 실측 768px 에서 64.69 / 83.38 로
   * 갈렸다. 설명 칸이 항상 두 줄 자리를 차지하게 해서 고쳤고, 이 시험이 그 성질을
   * 잠근다. **밀리초가 아니라 픽셀 동일성**이라 어느 기계에서나 같다.
   */
  test("설명 길이가 달라도 행 높이는 폭마다 한 값이다", async ({ page }) => {
    await stubSkillFolder(page, {
      "skills/a/SKILL.md": SKILL("aaa", "Short one."),
      "skills/b/SKILL.md": SKILL(
        "bbb",
        "A much longer description that will certainly wrap onto two full lines even on a wide viewport because it keeps going and going with many clauses.",
      ),
      "skills/c/SKILL.md": SKILL("ccc", "Medium length description that may wrap once."),
    });
    await seedFirstRunSeen(page);

    for (const width of [1440, 1024, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/ko/skills/?guides=off");
      await page.getByTestId("skills-empty-open").click();
      await expect(page.getByTestId("skills-census")).toBeVisible({ timeout: 15_000 });

      const heights = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="skill-row-toggle"]')].map((el) =>
          Number(el.getBoundingClientRect().height.toFixed(2)),
        ),
      );
      expect(heights.length, `${width}px 에서 행을 하나도 못 재면 이 시험은 헛돈다`).toBe(3);
      expect(new Set(heights).size, `${width}px 에서 행 높이가 갈렸다: ${heights.join(" / ")}`).toBe(
        1,
      );
    }
  });

  /**
   * **예시 뭉치가 실제로 채워진 화면을 낸다.**
   *
   * 소유자 요청: *"스킬 탭에서는 뭔가 데이터 있을때는 어떻게 보이는지 한번
   * 세팅해놔줄래?"* — 폴더를 고르기 전에는 설명문만 보이던 화면에, 볼트가 이미
   * 쓰는 「예시 둘러보기」와 같은 길을 냈다. 디스크를 안 읽으므로 폴더 고르기를
   * 지원하지 않는 브라우저에서도 된다.
   *
   * 예시 뭉치는 이 화면이 짚어야 하는 상황을 일부러 다 담았다 — 그래서 여기서
   * **그 셋이 실제로 화면에 나오는지**를 잰다. 하나라도 안 나오면 예시가
   * 「채워진 화면」이 아니라 그냥 목록이 된다.
   */
  test("예시 둘러보기가 채워진 화면을 낸다 — 겹침·실행·깨진 참조가 다 보인다", async ({ page }) => {
    await seedFirstRunSeen(page);
    await page.goto("/ko/skills/?guides=off");
    await page.getByTestId("skills-open-sample").click();

    await expect(page.getByTestId("skills-census")).toBeVisible({ timeout: 15_000 });
    const rows = page.getByTestId("skill-row-toggle");
    await expect(rows).toHaveCount(9);

    // ① 이름 충돌이 목록에 표시된다 (`changelog` × 2).
    await expect(page.getByTestId("skill-row-collision-mark")).toHaveCount(2);

    // ② 아무것도 안 골랐을 때 오른쪽이 비지 않는다 — 세 질문의 답이 뜬다.
    await expect(page.getByTestId("skills-findings")).toBeVisible();

    // ③ 실행되는 파일이 사슬에 표시된다.
    await rows.filter({ hasText: "csv-report" }).click();
    await expect(page.getByTestId("skill-executable-mark")).toHaveCount(1);

    // ④ 깨진 자기 폴더 참조가 보인다 — 예시가 그 상황을 일부러 담고 있다.
    await rows.filter({ hasText: "api-docs" }).click();
    await expect(page.getByTestId("skill-invocation-chain")).toContainText("openapi.md");

    // ⑤ 예시라는 사실을 화면이 말한다 — 내 폴더로 착각하면 안 된다.
    await expect(page.getByTestId("skills-scan-note")).toContainText("예시");
  });
});
