import { expect, test } from "@playwright/test";

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

/** OPFS 에 스킬 폴더를 짓고 `showDirectoryPicker` 가 그것을 돌려주게 만든다. */
async function stubSkillFolder(
  page: import("@playwright/test").Page,
  files: Record<string, string>,
) {
  await page.addInitScript((seed: Record<string, string>) => {
    const build = async () => {
      const root = await navigator.storage.getDirectory();
      // 매 실행이 같은 상태에서 시작하도록 먼저 비운다.
      for await (const name of (
        root as unknown as { keys: () => AsyncIterableIterator<string> }
      ).keys()) {
        await root.removeEntry(name, { recursive: true }).catch(() => undefined);
      }
      const stage = await root.getDirectoryHandle("skills-fixture", { create: true });
      for (const [path, text] of Object.entries(seed)) {
        const parts = path.split("/");
        let dir = stage;
        for (const part of parts.slice(0, -1)) {
          dir = await dir.getDirectoryHandle(part, { create: true });
        }
        const file = await dir.getFileHandle(parts[parts.length - 1], { create: true });
        const writable = await file.createWritable();
        await writable.write(text);
        await writable.close();
      }
      return stage;
    };
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> })
      .showDirectoryPicker = build;
  }, files);
}

test.describe("스킬 인벤토리", () => {
  test("3개 스킬의 27단계를 원문 순서·줄 위치 그대로 복원하고 packet을 canonical bytes로 복사한다", async ({ page }) => {
    const processBody = (prefix: string) =>
      Array.from({ length: 9 }, (_, index) => `${index + 1}. ${prefix} exact step ${index + 1}.`).join("\n");
    await stubSkillFolder(page, {
      "skills/alpha/SKILL.md": SKILL("alpha", "Run alpha exact process", processBody("Alpha")),
      "skills/beta/SKILL.md": SKILL("beta", "Run beta exact process", processBody("Beta")),
      "skills/gamma/SKILL.md": SKILL("gamma", "Run gamma exact process", processBody("Gamma")),
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            (window as unknown as { __skillPacket?: string }).__skillPacket = value;
          },
        },
      });
    });
    await seedFirstRunSeen(page);
    await page.setViewportSize({ width: 1512, height: 900 });
    await page.goto("/ko/skills/?guides=off");
    await page.getByTestId("skills-empty-open").click();
    await expect(page.getByTestId("skill-row-toggle")).toHaveCount(3);

    let recovered = 0;
    for (const name of ["alpha", "beta", "gamma"]) {
      await page.getByTestId("skill-row-toggle").filter({ hasText: name }).click();
      const steps = page.getByTestId("skill-process-step");
      await expect(steps).toHaveCount(9);
      for (let index = 0; index < 9; index += 1) {
        await expect(steps.nth(index)).toHaveAttribute("data-ordinal", String(index + 1));
        await expect(steps.nth(index)).toHaveAttribute("data-source-start", String(index + 6));
        await expect(steps.nth(index)).toContainText(`${name[0].toUpperCase()}${name.slice(1)} exact step ${index + 1}.`);
        recovered += 1;
      }
      expect(await steps.locator("[data-process-edge]").count()).toBe(0);
    }
    expect(recovered).toBe(27);

    await page.getByTestId("skill-packet-copy").click();
    await expect(page.getByTestId("skill-packet-status")).toContainText("복사됨");
    const copied = await page.evaluate(() => (window as unknown as { __skillPacket?: string }).__skillPacket ?? "");
    expect(copied).toContain('"packetVersion":"skillProcessPacket:v1"');
    expect(copied).toContain('"packetDigest":"sha256:');
    expect(copied).toContain('"sourceDigest":"sha256:');
  });

  test("390·1023은 목록↔상세, 1024·1512는 split이며 상세가 0×0이 아니다", async ({ page }, testInfo) => {
    await stubSkillFolder(page, {
      "skills/flow/SKILL.md": SKILL("flow", "Run one exact flow", "1. Read source.\n2. Verify result."),
    });
    await seedFirstRunSeen(page);

    for (const width of [390, 1023, 1024, 1512]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/ko/skills/?guides=off");
      await page.getByTestId("skills-empty-open").click();
      const workbench = page.getByTestId("skills-workbench");
      await expect(workbench).toHaveAttribute("data-view", width < 1024 ? "list" : "split");
      await page.getByTestId("skill-row-toggle").click();
      await expect(workbench).toHaveAttribute("data-view", width < 1024 ? "detail" : "split");
      const rect = await page.getByTestId("skills-right").evaluate((element) => {
        const value = element.getBoundingClientRect();
        return { width: value.width, height: value.height };
      });
      expect(rect.width, `${width}px detail width`).toBeGreaterThan(0);
      expect(rect.height, `${width}px detail height`).toBeGreaterThan(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
        `${width}px horizontal overflow`,
      ).toBe(true);
      await page.getByTestId("skills-right").evaluate((element) => { element.scrollTop = element.scrollHeight; });
      expect(
        await page.getByTestId("skill-packet-copy").evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          return hit === element || element.contains(hit);
        }),
        `${width}px packet action must not be covered`,
      ).toBe(true);
      if (width === 390 || width === 1512) {
        await page.screenshot({ path: testInfo.outputPath(`skills-${width}.png`), fullPage: false });
      }
      if (width < 1024) {
        await expect(page.getByRole("heading", { name: "flow" })).toBeFocused();
        await page.getByTestId("skills-detail-back").click();
        await expect(page.getByTestId("skill-row-toggle")).toBeFocused();
      }
    }
  });

  test("명시 문법만 semantic label로 보이고 애매한 문장은 diagnostic으로 남는다", async ({ page }) => {
    await stubSkillFolder(page, {
      "skills/semantic/SKILL.md": SKILL(
        "semantic",
        "Show exact semantic labels only",
        "1. Run the check.\n2. Retry step 1 until the smoke test passes.\n3. Stop mutation after writing the receipt.",
      ),
    });
    await seedFirstRunSeen(page);
    await page.goto("/ko/skills/?guides=off");
    await page.getByTestId("skills-empty-open").click();
    await page.getByTestId("skill-row-toggle").click();

    const labels = page.getByTestId("skill-semantic-label");
    await expect(labels).toHaveCount(1);
    await expect(labels).toHaveAttribute("data-semantic-kind", "retry");
    await expect(labels).toContainText("1단계 재시도");
    await expect(page.getByTestId("skill-process-step").nth(2).getByTestId("skill-semantic-label")).toHaveCount(0);
    await page.getByTestId("skill-process-step").nth(2).getByTestId("skill-step-disclosure").click();
    await expect(page.getByTestId("skill-process-step").nth(2)).toContainText(
      "뜻이 여러 갈래라 라벨을 만들지 않았습니다.",
    );
    expect(await page.locator("[data-process-edge]").count()).toBe(0);
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
    // exact process와 3단 load chain은 서로 다른 정보다. load chain은 보조 disclosure.
    await page.getByTestId("skill-load-chain-toggle").click();
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
    await page.getByTestId("skill-load-chain-toggle").click();
    await expect(page.getByTestId("skill-executable-mark")).toHaveCount(1);

    // ④ 깨진 자기 폴더 참조가 보인다 — 예시가 그 상황을 일부러 담고 있다.
    await rows.filter({ hasText: "api-docs" }).click();
    await page.getByTestId("skill-load-chain-toggle").click();
    await expect(page.getByTestId("skill-invocation-chain")).toContainText("openapi.md");

    // ⑤ 예시라는 사실을 화면이 말한다 — 내 폴더로 착각하면 안 된다.
    await expect(page.getByTestId("skills-scan-note")).toContainText("예시");
  });
});
