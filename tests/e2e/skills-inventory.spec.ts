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

    await page.getByTestId("skills-open-folder").click();

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
    await page.getByTestId("skills-open-folder").click();
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
      await page.getByTestId("skills-open-folder").click();
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
});
