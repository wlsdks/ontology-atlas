import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";
import { BROKEN_VAULT, HEALTHY_VAULT } from "./fixtures/broken-vault";

/**
 * 화면이 검사 결과에 대해 **거짓을 말하지 않는가** — 결함 볼트로 재는 게이트.
 *
 * ## 왜 결함 볼트여야 하나
 *
 * dogfood 볼트도 샘플 볼트도 이슈가 0 이다. 그래서 "검사 결과가 화면에 보이는가"
 * 를 묻는 게이트는 **볼 것이 없는 채로** 영원히 초록이었다. 2026-08-04 실측에서
 * 오류 5개짜리 폴더를 열자 네 자리가 동시에 거짓을 말했다:
 *
 *   ① 준비도 미터가 100% 인디고(위험 세그먼트 실측 0px)
 *   ② 파일 옆 진단이 경고만 보여 주고 **오류는 감춤**
 *   ③ `kind` 없는 문서는 진단 블록 자체가 안 그려짐
 *   ④ 지도에 없는 문서가 「지도 근거」라고 말함
 *
 * 넷 다 정상 볼트에서는 재현 자체가 불가능하다. 그래서 이 스펙은 결함을
 * **데이터로 재현한 다음** 화면을 잰다 — 그리고 같은 측정을 정상 볼트에도
 * 돌려 탐지기가 항상-빨강이 아님을 확인한다.
 */

const READINESS_MIN_SEGMENT_PX = 4;

async function loadVault(page: Page, seed: Record<string, string>) {
  await stubDirectoryPicker(page, seed);
  await seedFirstRunSeen(page);
  await page.goto("/ko/topology/?guides=off");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("first-run-starter-open").click();
  await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
  await page.getByTestId("vault-guide-pick-existing").click();
  await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 20_000 });
}

/** 미터 세그먼트의 실측 폭 + 배경색. 「0이 아닌데 0px」 를 잡는 유일한 방법. */
async function measureMeter(page: Page) {
  await page.goto("/ko/ontology/insights/?tab=do-next&guides=off");
  await page.waitForLoadState("networkidle");
  const meter = page.getByTestId("insights-agent-readiness-meter");
  await expect(meter).toBeVisible({ timeout: 20_000 });
  return page.evaluate(() => {
    const meterEl = document.querySelector('[data-testid="insights-agent-readiness-meter"]');
    const card = document.querySelector('[data-testid="insights-agent-readiness"]');
    const segments = Array.from(meterEl?.children ?? []).map((el) => ({
      width: Math.round(el.getBoundingClientRect().width * 100) / 100,
      background: getComputedStyle(el).backgroundColor,
    }));
    return {
      segments,
      caption: (card?.textContent ?? "").replace(/\s+/g, " ").trim(),
      ariaLabel: card?.getAttribute("aria-label") ?? "",
    };
  });
}

/**
 * 문서함을 열고 폴더를 전부 펼친다.
 *
 * ⚠️ **`?slug=` 딥링크로 고르지 않는다.** 로컬 볼트에서 그 파라미터는 첫 선택을
 * 못 이긴다(실측 2026-08-04: 어느 슬러그를 넣어도 알파벳 첫 문서가 열렸다).
 * 이 스펙의 대상은 그 결함이 아니므로 사람이 실제로 하는 동작 — 트리 클릭 —
 * 으로 고른다. 계측이 자기가 재려는 화면을 열었는지는 아래 `openedFile` 이
 * 매번 확인한다.
 */
async function openDocsTree(page: Page) {
  await page.goto("/ko/docs/?guides=off");
  await page.waitForLoadState("networkidle");
  for (const folder of ["capabilities", "domains", "elements", "notes"]) {
    await page.getByRole("button", { name: new RegExp(folder) }).first().click();
    await page.waitForTimeout(120);
  }
}

/** 한 문서를 열고 "이 파일이 자기 문제를 말하는가" 를 잰다. */
async function measureDoc(page: Page, title: string, expectFile: string) {
  await page.getByRole("button", { name: title, exact: false }).first().click();
  // validator 는 400ms debounce 뒤에 돈다.
  await page.waitForTimeout(700);
  const measured = await page.evaluate(() => {
    const block = document.querySelector('[data-testid="doc-frontmatter-block"]');
    const diagnostics = Array.from(
      document.querySelectorAll('[data-testid="doc-frontmatter-issue"]'),
    ).map((el) => ({
      severity: el.getAttribute("data-severity") ?? "",
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
    }));
    const proof = document.querySelector('[data-testid="doc-map-evidence"]');
    const mapLink = document.querySelector<HTMLAnchorElement>('[data-testid="doc-map-open"]');
    const stripLink = document.querySelector<HTMLAnchorElement>(
      '[data-testid="docs-backlinks-open-in-map"]',
    );
    const header = document.querySelector("main .truncate.font-mono.text-caption");
    return {
      openedFile: (header?.textContent ?? "").trim(),
      hasBlock: Boolean(block),
      blockVariant: block?.getAttribute("data-variant") ?? "",
      diagnostics,
      proofLabel: (proof?.textContent ?? "").replace(/\s+/g, " ").trim(),
      proofState: proof?.getAttribute("data-in-graph") ?? "",
      mapHref: mapLink?.getAttribute("href") ?? null,
      stripMapHref: stripLink?.getAttribute("href") ?? null,
    };
  });
  // 계측이 자기가 재려던 화면을 실제로 열었는지 — 이 한 줄이 없으면 이 스펙은
  // 엉뚱한 문서를 여덟 번 재고 초록일 수 있다(실제로 그럴 뻔했다).
  expect(measured.openedFile, "계측 대상 문서가 열렸는가").toBe(expectFile);
  return measured;
}

test.describe("결함 볼트 — 화면이 검사 결과를 말하는가", () => {
  test("① 준비도 미터: 오류가 있으면 위험 세그먼트가 보인다", async ({ page }) => {
    await loadVault(page, BROKEN_VAULT);
    const broken = await measureMeter(page);
    console.log("[meter/broken]", JSON.stringify(broken));

    const danger = broken.segments.at(-1);
    expect(danger, "미터에 위험 세그먼트가 있어야 한다").toBeTruthy();
    // 0 이 아닌 값이 0px 로 렌더되면 안 된다 — 390px 폭에서 오류1/준비200 이면
    // flexGrow 만으로는 3px 가 되어 소멸한다.
    expect(
      danger!.width,
      `오류 5건인데 위험 세그먼트 폭이 ${danger!.width}px — 가장 강한 요소가 반대로 말한다`,
    ).toBeGreaterThanOrEqual(READINESS_MIN_SEGMENT_PX);
    expect(broken.caption, "캡션이 막힌 수를 말해야 한다").toContain("5");
  });

  test("① 대조군 — 정상 볼트는 위험 세그먼트가 0px 다", async ({ page }) => {
    await loadVault(page, HEALTHY_VAULT);
    const healthy = await measureMeter(page);
    console.log("[meter/healthy]", JSON.stringify(healthy));
    const danger = healthy.segments.at(-1);
    expect(
      danger!.width,
      "정상 볼트에서까지 빨간 세그먼트가 뜨면 이 계기는 항상-빨강이라 쓸모없다",
    ).toBe(0);
  });

  test("② 오류가 파일 옆에서 보인다 (경고만 보여 주지 않는다)", async ({ page }) => {
    await loadVault(page, BROKEN_VAULT);
    await openDocsTree(page);
    const checkout = await measureDoc(page, "결제하기", "capabilities/checkout.md");
    console.log("[doc/checkout]", JSON.stringify(checkout));
    expect(checkout.hasBlock).toBe(true);
    const severities = checkout.diagnostics.map((d) => d.severity);
    expect(severities, "missing-uid 는 오류다 — 경고만 보이면 정확히 거꾸로다").toContain(
      "error",
    );
    expect(severities, "같은 문서의 경고도 계속 보여야 한다").toContain("warning");
  });

  test("③ kind 없는 문서가 자기 문제를 말한다", async ({ page }) => {
    await loadVault(page, BROKEN_VAULT);
    await openDocsTree(page);
    const note = await measureDoc(page, "인수인계 메모", "notes/handover.md");
    console.log("[doc/handover]", JSON.stringify(note));
    expect(
      note.hasBlock,
      "kind 가 없으면 블록 자체가 안 그려졌다 — 사라지는 가장 흔한 경로가 침묵한다",
    ).toBe(true);
    expect(note.diagnostics.length).toBeGreaterThan(0);

    const ghost = await measureDoc(page, "유령 모듈", "elements/ghost.md");
    console.log("[doc/ghost]", JSON.stringify(ghost));
    expect(ghost.hasBlock, "kind 가 비었을 때도 같다").toBe(true);
    expect(ghost.diagnostics.map((d) => d.severity)).toContain("error");
  });

  test("④ 지도에 없는 문서는 「지도 근거」라고 말하지 않고, 죽은 CTA 도 없다", async ({
    page,
  }) => {
    await loadVault(page, BROKEN_VAULT);
    await openDocsTree(page);
    // `notes/handover` 는 kind 가 없어 그래프 노드가 아니다.
    const note = await measureDoc(page, "인수인계 메모", "notes/handover.md");
    console.log("[doc/handover-map]", JSON.stringify(note));
    expect(note.proofState, "그래프에 없는 문서다").toBe("false");
    expect(note.mapHref, "?p= 를 못 만들면 「지도에서 열기」 자체를 렌더하지 않는다").toBeNull();
    // 하단 백링크 스트립의 「지도에서 열기」가 **원본 실측 결함**이다:
    // `?? '/topology/'` 폴백 때문에 `?p=` 없는 주소로 렌더돼 눌러도 아무것도
    // 안 잡혔다.
    expect(
      note.stripMapHref,
      "하단 스트립도 같은 규칙 — 잡을 노드가 없으면 링크가 없다",
    ).toBeNull();

    // 그래프에 실재하는 노드는 반대로 말해야 한다.
    const domain = await measureDoc(page, "주문", "domains/orders.md");
    console.log("[doc/orders]", JSON.stringify(domain));
    expect(domain.proofState).toBe("true");
    expect(domain.mapHref ?? "").toContain("p=");
    expect(domain.stripMapHref ?? "", "노드가 있으면 스트립 링크는 그대로 산다").toContain("p=");
  });
});
