import { expect, test } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";

/**
 * **지도는 어떤 딥링크로 들어와도 읽을 수 있어야 한다** (2026-08-17 소유자 보고).
 *
 * ## 무엇이 있었나
 *
 * 문서함에서 프로젝트 문서의 「지도에서 열기」를 누르면 지도의 **모든 노드가
 * 사라진 것처럼** 보였다. 소유자: *"이건 또 뭐지?"* · *"로딩속도도 느리고"*.
 *
 * 흐린 것이 아니라 **전부 흐리게 처리된 것**이었다. 그 버튼이 만드는 주소는
 * `?p=<프로젝트 슬러그>`(예: `project`)인데 지도의 노드 이름은 `종류:슬러그`
 * (`project:project`)다 — 프로젝트 슬러그는 접두사가 없고 노드 이름은 있어서
 * 둘은 **구조적으로 절대 안 맞는다**. 지도는 「하나를 골랐다」고 판단하면 고른
 * 것과 그 이웃만 남기고 나머지를 가라앉히는데, 맞는 노드가 하나도 없으니
 * **전부가 「나머지」** 가 됐다.
 *
 * 실측(문서 7개 볼트, 배경 `#0a0a0d`): 화면에서 가장 밝은 노드가 배경 대비
 * **1.40:1**. UI 도형의 최저 기준선은 3:1 이다. 125개짜리 샘플 볼트에서는
 * 휘도 60을 넘는 픽셀이 **0개**였다.
 *
 * ## 이 검사가 왜 픽셀을 세나
 *
 * 이 결함은 **lint 도 타입도 계약 검사도 못 본다** — 쓰인 값은 전부 정당한
 * 토큰(`--topology-v2-node-stroke-dim`)이고, 틀린 것은 「누구에게 그 토큰을
 * 발랐는가」다. 게다가 지도는 캔버스라 DOM 이 없어서 셀렉터로 물을 것이 없다.
 * 그래서 남는 수단은 **그려진 픽셀을 직접 세는 것**뿐이다.
 *
 * 판정은 「밝은 픽셀이 몇 개」가 아니라 **「읽을 수 있는 픽셀이 하나라도 있나」**
 * 다 — 노드 수·배치·줌은 볼트마다 다르지만, *무엇을 그리든 사람이 볼 수 있어야
 * 한다*는 것은 어느 볼트에서나 참이다.
 */

const VAULT = {
  "project.md": `---\nuid: 11111111-1111-4111-8111-111111111111\nslug: project\nkind: project\ntitle: My project\ncontains:\n  - domains/example-domain\n---\n\n# My project\n`,
  "domains/example-domain.md": `---\nuid: 22222222-2222-4222-8222-222222222222\nslug: domains/example-domain\nkind: domain\ntitle: Example domain\ncapabilities:\n  - capabilities/example-capability\n---\n\n# Example domain\n`,
  "capabilities/example-capability.md": `---\nuid: 33333333-3333-4333-8333-333333333333\nslug: capabilities/example-capability\nkind: capability\ntitle: Example capability\ndomain: domains/example-domain\n---\n\n# Example capability\n`,
};

/** 배경보다 확실히 밝은 픽셀 수 — 노드 윤곽·라벨이 여기에 잡힌다. */
async function readablePixelCount(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    /*
     * ⚠️ 캔버스가 **둘일 수 있다** — 표면이 바뀌는 동안 나가는 것과 들어오는
     * 것이 함께 있다(`use-presence`). 첫 번째를 집으면 나가는 쪽(이미 비어
     * 가는 화면)을 재게 되므로, **가장 밝은 쪽**을 고른다.
     */
    const canvases = [
      ...document.querySelectorAll<HTMLCanvasElement>('[data-testid="topology-map-v2-canvas"]'),
    ].filter((c) => c.width > 0 && c.height > 0);
    if (canvases.length === 0) return -1;
    const canvas = canvases[canvases.length - 1];
    const ctx = canvas.getContext("2d");
    if (!ctx) return -1;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let readable = 0;
    // 4픽셀마다 표본 — 전수는 느리고, 노드 윤곽은 몇 픽셀 두께라 충분히 잡힌다.
    for (let i = 0; i < data.length; i += 4 * 4) {
      const luminance = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      // 배경은 #0a0a0d(휘도 ≈ 10). 60이면 배경 대비 3:1 을 확실히 넘는다.
      if (luminance > 60) readable += 1;
    }
    return readable;
  });
}

async function openVault(page: import("@playwright/test").Page, query: string) {
  await page.setViewportSize({ width: 1512, height: 900 });
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, VAULT);
  await page.goto(`/ko/topology/?e2e=1&guides=off`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("first-run-starter-open").click();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("topology-map-v2-canvas").first()).toBeVisible({ timeout: 30_000 });
  if (query) {
    await page.goto(`/ko/topology/?e2e=1&guides=off&${query}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("topology-map-v2-canvas").first()).toBeVisible({ timeout: 30_000 });
  }
  // 배치가 그려질 때까지 — 값으로 판정한다(고정 대기는 기계 속도를 탄다).
  await expect
    .poll(() => readablePixelCount(page), { timeout: 30_000, message: "지도가 아무것도 안 그렸다" })
    .toBeGreaterThan(-1);
}

test("문서함이 보내는 프로젝트 딥링크로 들어와도 지도가 읽힌다", async ({ page }) => {
  test.setTimeout(120_000);

  // 기준선 — 파라미터 없이 열었을 때 얼마나 밝은가.
  await openVault(page, "");
  const plain = await expect
    .poll(() => readablePixelCount(page), { timeout: 30_000 })
    .toBeGreaterThan(0)
    .then(() => readablePixelCount(page));

  // 문제의 경로 — 프로젝트 문서의 「지도에서 열기」가 실제로 만드는 주소다
  // (`topology-href.ts`: kind: project → `/topology/?p=<슬러그>`).
  await page.goto("/ko/topology/?e2e=1&guides=off&p=project", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("topology-map-v2-canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => readablePixelCount(page), {
      timeout: 30_000,
      message:
        "프로젝트 딥링크로 들어오니 지도에 읽을 수 있는 픽셀이 없다 — " +
        "맞는 노드가 없는 선택이 「전부 흐리게」로 번역된 것이다",
    })
    .toBeGreaterThan(0);

  const viaProjectLink = await readablePixelCount(page);
  // 기준선의 절반은 나와야 한다 — 「한 픽셀이라도 있으면 통과」로 두면
  // 라벨 하나만 남고 노드가 전부 가라앉은 상태도 초록이 된다.
  expect(
    viaProjectLink,
    `프로젝트 딥링크(${viaProjectLink})가 파라미터 없는 화면(${plain})보다 크게 어둡다`,
  ).toBeGreaterThan(plain / 2);
});

test("지도에 없는 노드를 가리키는 딥링크는 아무것도 안 고른 것으로 떨어진다", async ({ page }) => {
  test.setTimeout(120_000);

  await openVault(page, "");
  const plain = await readablePixelCount(page);

  /*
   * 안전망 그 자체를 잰다. 위 시험은 **원인 하나**(프로젝트 슬러그↔노드 이름
   * 불일치)를 막지만, 「없는 노드를 골랐다」가 「전부 흐리게」로 번역되는 규칙이
   * 남아 있는 한 다른 경로에서 같은 사고가 난다. 그래서 아예 존재할 수 없는
   * 이름으로도 지도가 읽히는지 본다.
   */
  await page.goto("/ko/topology/?e2e=1&guides=off&p=element:this-node-does-not-exist", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("topology-map-v2-canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => readablePixelCount(page), {
      timeout: 30_000,
      message: "없는 노드를 가리키는 딥링크가 지도를 통째로 가라앉혔다",
    })
    .toBeGreaterThan(plain / 2);
});
