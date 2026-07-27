import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * 웹 표면 스모크 — 무인 표면의 유일한 눈.
 *
 * 왜 이 파일이 있는가 (2026-07-27 표면 분리 결정, `docs/DECISIONS.md`):
 * 웹과 앱은 더 이상 같은 화면을 약속하지 않는다. 데스크톱 능력이 웹 동등물
 * 없이 출하되고, 소유자는 앱만 쓴다. 그 결정의 **유일한 구조적 대가**가
 * 웹의 무인 부패다 — 아무도 안 보는 사이 조용히 썩고, 그런데 웹은 지금
 * 유일한 유입 경로(14일 순방문 35명 전원 웹)다.
 *
 * 그래서 이 파일은 "웹이 자기 두 가지 일을 아직 하는가" 만 본다. 픽셀
 * 동등성도, 앱과의 대조도 보지 않는다 (그 왕복 검증은 같은 결정으로
 * 폐지됐다).
 *
 *   ① 관문   — 볼트 없이 첫 화면이 쓸 만한 지도로 뜬다
 *   ② 차선   — 폴더를 골라 실제로 읽고, 못 고르는 브라우저는 정직히 강등된다
 *   ③ 강등   — 앱 전용 능력이 "왜 + 어디서" 를 말한다 (죽은 CTA 0)
 *
 * 이 셋 중 하나라도 빨개지면 웹은 관문 노릇을 못 하고 있는 것이다.
 */

// ── 공통 ────────────────────────────────────────────────────────────────────

/**
 * `next dev` 는 라우트 첫 진입을 온디맨드로 컴파일한다. 스위트를 연달아
 * 돌릴 때 하이드레이션이 늦게 끝나면 testid 가 한 프레임 늦게 붙는다 —
 * networkidle 까지 기다려 그 편차를 흡수한다(기존 스펙들과 같은 관례).
 */
async function gotoSettled(page: Page, url: string) {
  await seedFirstRunSeen(page);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

/**
 * `showDirectoryPicker` 를 OPFS 핸들로 스텁한다.
 *
 * File System Access API 는 OS 창을 열기 때문에 자동화가 클릭할 수 없다.
 * OPFS(`navigator.storage.getDirectory()`) 핸들은 **진짜**
 * `FileSystemDirectoryHandle` 이라 `createWritable` 을 포함한 앱의 볼트
 * 읽기/쓰기 경로가 그대로 돈다 — 즉 이 스텁은 픽커 창만 대신하고 그
 * 이후 여정은 전부 실제 코드로 검증된다.
 *
 * @param seed 폴더 안에 미리 넣어 둘 마크다운 (경로 → 내용)
 */
async function stubDirectoryPicker(page: Page, seed: Record<string, string>) {
  await page.addInitScript((files: Record<string, string>) => {
    const grant = async () => "granted" as const;
    // 픽커가 돌려주는 핸들과 그 하위 핸들 전부가 권한 질의에 답해야 한다 —
    // 앱은 IndexedDB 복원 경로에서 `queryPermission` 을 부른다.
    const patch = (handle: FileSystemDirectoryHandle): FileSystemDirectoryHandle => {
      const target = handle as FileSystemDirectoryHandle & {
        queryPermission?: () => Promise<"granted">;
        requestPermission?: () => Promise<"granted">;
      };
      target.queryPermission ??= grant;
      target.requestPermission ??= grant;
      const inner = target.getDirectoryHandle.bind(target);
      target.getDirectoryHandle = async (name: string, options?: FileSystemGetDirectoryOptions) =>
        patch(await inner(name, options));
      return target;
    };

    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> })
      .showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(`smoke-vault-${Date.now()}`, { create: true });
      for (const [path, body] of Object.entries(files)) {
        const segments = path.split("/");
        const name = segments.pop() as string;
        let cursor = dir;
        for (const segment of segments) {
          cursor = await cursor.getDirectoryHandle(segment, { create: true });
        }
        const file = await cursor.getFileHandle(name, { create: true });
        const writable = await file.createWritable();
        await writable.write(body);
        await writable.close();
      }
      return patch(dir);
    };
  }, seed);
}

/** 사람이 고를 법한 최소 볼트 — 프로젝트 하나 + 도메인 하나 + 역량 하나. */
const SEED_VAULT: Record<string, string> = {
  "project.md": [
    "---",
    "kind: project",
    "slug: smoke-shop",
    "title: Smoke Shop",
    "contains:",
    "  - smoke-orders",
    "---",
    "",
    "# Smoke Shop",
    "",
    "스모크용 최소 프로젝트.",
    "",
  ].join("\n"),
  "domains/orders.md": [
    "---",
    "kind: domain",
    "slug: smoke-orders",
    "title: Orders",
    "contains:",
    "  - smoke-checkout",
    "---",
    "",
    "# Orders",
    "",
    "주문 도메인.",
    "",
  ].join("\n"),
  "capabilities/checkout.md": [
    "---",
    "kind: capability",
    "slug: smoke-checkout",
    "title: Checkout",
    "domain: smoke-orders",
    "---",
    "",
    "# Checkout",
    "",
    "결제 역량.",
    "",
  ].join("\n"),
};

// ── ① 관문 — 볼트 없이도 첫 화면이 쓸 만하다 ────────────────────────────────

test.describe("웹 스모크 ① 관문", () => {
  test("볼트 없이 연 첫 화면이 실제 지도 + 읽을 수 있는 숫자로 뜬다", async ({ page }) => {
    await gotoSettled(page, "/ko/");

    // 지도가 실제 크기를 가진 캔버스로 존재한다.
    const canvas = page.getByTestId("topology-map-v2-canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const box = await canvas.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);

    // 지도 옆 INDEX 가 있고, 그 안에 첫 방문자가 읽을 시작 모듈이 있다.
    await expect(page.getByTestId("topology-index-panel")).toBeVisible();
    const starter = page.getByTestId("first-run-starter");
    await expect(starter).toBeVisible();

    // 그 숫자가 **실제 데이터에서 나온 값**이어야 한다. 0 이면 지도는 떴는데
    // 아무것도 안 그려진 상태 — 관문으로서는 죽은 화면이다.
    const counts = await starter.evaluate((node) =>
      [...node.querySelectorAll("span")]
        .map((span) => span.textContent?.trim() ?? "")
        .filter((text) => /^\d+$/.test(text))
        .map(Number),
    );
    expect(counts.some((value) => value > 0)).toBe(true);

    // 관문의 다음 행동 두 개가 살아 있다(비활성·부재는 관문 고장).
    await expect(page.getByTestId("first-run-starter-open")).toBeEnabled();
    await expect(page.getByTestId("first-run-starter-create")).toBeEnabled();
  });
});

// ── ② 차선 워크벤치 — 폴더를 실제로 읽는다 ─────────────────────────────────

test.describe("웹 스모크 ② 차선 워크벤치", () => {
  test("폴더를 고르면 웹이 그 폴더를 실제로 읽어 지도로 바꾼다", async ({ page }) => {
    await stubDirectoryPicker(page, SEED_VAULT);
    await gotoSettled(page, "/ko/");

    await page.getByTestId("first-run-starter-open").click();
    await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
    await page.getByTestId("vault-guide-pick-existing").click();

    // 성공 판정은 "고른 폴더 안의 내 노드가 화면에 있다" 로 한다. 시작
    // 모듈이 사라지는 것(샘플 → 내 데이터 전환)만으로는 부족하다 — 폴더를
    // 열기만 하고 파싱은 못 했어도 사라질 수 있다.
    await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 20_000 });

    const index = page.getByTestId("topology-index-panel");
    await expect(index).toContainText("Smoke Shop", { timeout: 20_000 });
    // 씨앗 폴더는 정확히 노드 3 · 관계 2 다. 숫자가 맞으면 프론트매터를
    // 실제로 읽고 관계까지 이었다는 뜻이다.
    await expect(index).toContainText("3 개념");
    await expect(index).toContainText("2 관계");
  });

  test("폴더를 못 여는 브라우저는 약속 대신 이유와 갈 곳을 준다", async ({ page }) => {
    // FSA 미지원 브라우저 재현 — 앱의 능력 판정은 `showDirectoryPicker` 가
    // **호출 가능한지**로 하므로 지우는 것으로 충분하다.
    await page.addInitScript(() => {
      try {
        delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
      } catch {
        /* non-configurable — 아래 단언이 알아서 실패한다 */
      }
    });
    await gotoSettled(page, "/ko/");

    const notice = page.getByTestId("first-run-starter-unsupported");
    await expect(notice).toBeVisible({ timeout: 15_000 });
    // 왜 안 되는지 + 어디서 되는지가 한 문장 안에 있다.
    await expect(notice).toContainText("지원하지 않아요");
    await expect(notice).toContainText("Chrome/Edge");

    const cta = page.getByTestId("first-run-starter-unsupported-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /\/download\//);

    // 갈 수 없는 곳을 가리키면 안내가 아니라 막다른 길이다.
    await cta.click();
    await expect(page).toHaveURL(/\/download\//, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

// ── ③ 정직한 강등 — 앱 전용 능력이 왜 + 어디서를 말한다 ────────────────────

/**
 * 웹에서 열리는 데스크톱 전용 표면 등록부.
 *
 * 목록이라서 값어치가 있다 — 데스크톱 능력을 새로 붙이는 사람이 여기 한 줄을
 * 더하지 않으면 그 능력의 웹 강등은 아무도 안 본다. 새 브리지를 만들면 이
 * 목록에도 넣는다(`.claude/rules/surfaces.md` 계약).
 */
// 이 등록부는 **웹↔앱 축** 전용이다 — 각 행이 "브라우저는 원리적으로 이걸 못
// 한다 → 유일한 목적지는 /download/" 를 주장한다. **뷰포트 폭 축**의 강등
// (같은 웹 빌드가 넓은 화면에서는 여는 표면 — 첫 사례: 공방 <lg)은 여기
// 넣지 않는다. 넣으면 그 행이 "웹은 못 한다" 는 거짓 주장을 하고 다음
// 감사자가 그대로 읽는다. 폭 축의 게이트는 폭이 독립 변수인
// `responsive-overflow-audit.spec.ts` 가 맡는다 (`.claude/rules/surfaces.md`
// 「강등에는 축이 둘이다」, 2026-07-28).
const DEGRADED_SURFACES = [
  {
    name: "기록(git) — 브라우저는 이 컴퓨터의 git 을 실행할 수 없다",
    url: "/ko/git/?focus=main",
    card: "atlas-git-panel",
    reason: /브라우저는[\s\S]*권한이 없어요/,
    destination: "atlas-git-web-get-app",
  },
  {
    name: "에이전트 연결 — 브라우저는 열어 둔 폴더의 실제 경로를 모른다",
    url: "/ko/topology/?agentConnect=1",
    card: "agent-server-unavailable",
    reason: /브라우저는[\s\S]*실제 위치를 알 수 없어서/,
    destination: "agent-connect-web-get-app",
  },
] as const;

test.describe("웹 스모크 ③ 정직한 강등", () => {
  for (const surface of DEGRADED_SURFACES) {
    test(`${surface.name} — 이유와 갈 곳이 함께 있다`, async ({ page }) => {
      await gotoSettled(page, surface.url);

      const card = page.getByTestId(surface.card);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card).toHaveText(surface.reason);

      const destination = page.getByTestId(surface.destination);
      await expect(destination).toBeVisible();
      await expect(destination).toHaveAttribute("href", /\/download\//);
    });
  }

  test("다운로드 화면이 웹의 두 번째 일을 숨기지 않는다 (Windows 방문자)", async ({ page }) => {
    // 강등의 반대 방향 결함 — 되는 것을 안 된다고 쓰는 것. 실측(2026-07-27)
    // 으로 이 화면은 "폴더를 직접 여는 일은 설치한 앱만 할 수 있습니다" 라고
    // 썼는데, 바로 위 스모크 ② 가 그게 거짓임을 증명했다. 앱이 없는 OS 의
    // 방문자를 빈손으로 돌려보내지 않는 것이 웹의 2번 일이다.
    await gotoSettled(page, "/ko/download/");

    const windowsSection = page.getByText("서명된 설치 파일").first();
    await expect(windowsSection).toBeVisible({ timeout: 15_000 });
    await expect(windowsSection).toContainText("Chrome·Edge");
  });

  test("설정의 AI 연결이 브라우저에서 키를 받지 않는 이유를 말한다", async ({ page }) => {
    await gotoSettled(page, "/ko/");

    // 설정 트리거는 레일과 지도 크롬 두 곳에 있다 — 레일 쪽 하나로 좁힌다.
    await page
      .getByTestId("app-nav-rail-utility-tier")
      .getByTestId("app-settings-trigger")
      .click();
    await page.getByTestId("app-settings-ai-drillin").click();

    const card = page.getByTestId("ai-connection-web-degraded");
    await expect(card).toBeVisible({ timeout: 15_000 });
    // 원리적 기각이라 "곧 됩니다" 가 아니라 이유가 서 있어야 한다.
    await expect(card).toContainText("XSS");
    await expect(page.getByTestId("ai-connection-download-link")).toHaveAttribute(
      "href",
      /\/download\//,
    );
  });
});
