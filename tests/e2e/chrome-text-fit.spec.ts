import { test, expect } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";

/**
 * 크롬이 **자기가 쓴 문자열**을 자르면 실패한다.
 *
 * 2026-07-28 스윕이 잡은 결함: `/topology` INDEX 패널 바닥에서 EN
 * "Agent not connected" 가 104→89px 로 잘려 "Agent not conn…" 이 됐고, KO
 * 는 성장 신호가 92→29px 로 잘렸다. 폭 예산이 로케일 문자열 길이를 감당하지
 * 못한 것인데, `truncate` 가 있어서 화면은 조용히 멀쩡해 보였다 — 아무것도
 * 깨지지 않고, 아무도 실패하지 않고, 상태만 안 읽혔다.
 *
 * ## 왜 "모든 잘림 금지" 가 아닌가
 *
 * 잘림 자체는 결함이 아니다. **길이를 모르는 사용자 데이터**(노드 제목,
 * 문서 이름)는 잘라야 하고, `design.md` 「치수 규칙성」이 그렇게 정한다 —
 * 대신 hover/상세에서 전체 값을 준다. 결함은 **우리가 쓴, 값이 유한한
 * 문자열**이 잘릴 때다. 그건 우아한 축약이 아니라 폭 예산이 틀렸다는 뜻이고,
 * 전체 값을 주는 자리도 없다.
 *
 * 그래서 이 스펙은 vault 데이터가 한 글자도 섞이지 않는 크롬 영역만 잰다.
 * 지금은 INDEX 푸터 하나 — 결함이 났던 자리다. 같은 성격의 영역이 늘면
 * `MEASURED_REGIONS` 에 추가한다.
 *
 * jsdom 으로는 못 잰다(레이아웃이 없어 scrollWidth 가 항상 0) — 브라우저가
 * 있어야 하는 계약이라 e2e 에 산다.
 */

const MEASURED_REGIONS = [
  {
    testId: "topology-index-footer",
    why: "연결 상태 · 성장 신호 · 인계 메뉴 · 팔레트 힌트 — 전부 앱이 쓴 문자열",
  },
];

/** 좁은 쪽과 넓은 쪽 양끝. 패널은 고정 폭이라 중간값은 새 정보를 주지 않는다. */
const VIEWPORTS = [
  { label: "1512", w: 1512, h: 950 },
  { label: "768", w: 768, h: 1024 },
];

const LOCALES = ["en", "ko"];

test.describe("크롬 텍스트 맞춤 — 앱이 쓴 문자열은 잘리지 않는다", () => {
  for (const locale of LOCALES) {
    for (const vp of VIEWPORTS) {
      test(`INDEX 푸터 (${locale} · ${vp.label}px)`, async ({ page }) => {
        await seedFirstRunSeen(page);
        await page.setViewportSize({ width: vp.w, height: vp.h });

        // 푸터는 vault 가 열린 상태에서만 산다(첫 실행 스타터가 자리를
        // 차지한다). OPFS 를 폴더 피커로 세워 실제 여정 그대로 vault 를
        // 만든다 — 컨텍스트마다 새 OPFS 라 테스트끼리 섞이지 않는다.
        await page.addInitScript(() => {
          (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
            async () => navigator.storage.getDirectory();
        });

        await page.goto(`/${locale}/topology/`, { waitUntil: "domcontentloaded" });
        await page.getByTestId("first-run-starter-create").click();
        await page.getByTestId("vault-guide-create-new").click();

        /*
         * ⚠️ **볼트를 만들면 INDEX 는 접힌다** (2026-08-17 실측으로 정정).
         *
         * 이 설정은 「만들면 INDEX 가 펼쳐진 채로 있다」를 전제했는데, 지금은
         * 만든 직후 `collapsed` 로 간다. 그런데도 첫 줄이 통과했던 이유가
         * 고약하다 — 패널이 **접히는 애니메이션 동안** 잠깐 그려져서
         * `toBeVisible` 이 0ms 에 참이 되고, 0.5초 뒤에는 패널째 사라진다.
         * 그래서 그다음 줄이 15초를 꽉 기다리다 죽었다.
         *
         * 실측 대가: 이 spec 하나가 4조합 × (본 + 재시도 2) = 12회 × 18초를
         * 태웠고, `E2E smoke` 워크플로가 **매 실행 15분에 실패**하고 있었다.
         * main 에서도 같았다 — 내 변경이 만든 것이 아니라 이미 빨간 게이트였다.
         *
         * 그래서 상태가 **정착하기를 기다린 뒤** 접혀 있으면 펼친다. 재려는
         * 것은 「펼친 푸터의 글자가 잘리지 않는가」이지 「기본이 펼침인가」가
         * 아니므로, 기본값이 바뀌어도 이 게이트는 계속 자기 일을 한다.
         */
        /*
         * ⚠️ **「값이 둘 중 하나다」는 정착이 아니다.** 첫 시도는 상태가
         * `collapsed|expanded` 이기만 하면 통과시켰는데, 이 화면은 **처음부터**
         * `collapsed` 라 그 poll 이 즉시 끝났다. 그래서 볼트가 아직 로드되는
         * 중에 펼침을 눌렀고, 뒤늦게 도착한 상태 전이가 다시 접었다. 로컬
         * (빠른 dev)에서는 통과하고 CI(느린 러너)에서만 죽는 전형적인 경합이다.
         *
         * 정착은 **값이 머무는 것**으로 판정한다 — 같은 값이 연속으로 나올 때.
         */
        /*
         * 6× CPU 스로틀로 CI 를 흉내 내 잰 타임라인:
         *
         * ```
         *    0~1200ms  idx=expanded  패널 있음 · 푸터 없음   (볼트 로딩 중)
         *      1600ms  idx=collapsed 패널·푸터·탭 모두 있음  (접히는 한 프레임)
         *      2000ms~ idx=collapsed 탭만 남음               (여기서 끝)
         * ```
         *
         * 그래서 「값이 잠깐 머문다」로 정착을 판정하면 안 된다 — 로딩 중
         * `expanded` 가 1.2초나 유지되므로 그것을 정착으로 오해하고 일찍
         * 재게 된다. 그리고 푸터가 `toBeVisible` 을 통과하는 그 순간은
         * **접히는 애니메이션 한 프레임**이라 곧바로 사라진다.
         *
         * 그래서 「한 번 펼치고 믿는다」 대신 **펼쳐진 채 푸터가 있을 때까지
         * 다시 시도한다.** 늦게 온 전이가 다시 접어도 다음 회차가 되돌린다.
         */
        await expect
          .poll(
            async () => {
              const state = await page.evaluate(
                () => document.documentElement.dataset.topologyIndex ?? "",
              );
              if (state !== "expanded") {
                const tab = page.getByTestId("topology-index-tab");
                if ((await tab.count()) > 0) await tab.click().catch(() => {});
              }
              await page.waitForTimeout(300);
              return page.evaluate(
                () =>
                  document.documentElement.dataset.topologyIndex === "expanded" &&
                  Boolean(document.querySelector('[data-testid="topology-index-footer"]')),
              );
            },
            { timeout: 45_000, message: "INDEX 를 펼친 채로 붙들지 못했다" },
          )
          .toBe(true);

        await expect(page.getByTestId("topology-index-footer")).toBeVisible({ timeout: 30_000 });
        // 늘 있는 둘은 그대로 요구한다 — 이 둘이 없으면 푸터가 덜 그려진 것이다.
        await expect(page.getByTestId("topology-index-agent-connect")).toBeVisible();
        await expect(page.getByTestId("topology-index-agent-handoff")).toBeVisible();
        /*
         * ⚠️ **성장 신호는 요구하지 않는다** (2026-08-17 정정).
         *
         * 종전에는 이 줄도 `toBeVisible` 로 요구했다. 그런데 그 줄은 코드상
         * **원래 조건부**다 — `footerGrowthText` 는 `recentlyUpdatedCount > 0`
         * 일 때만 넘어가고(HomePage), 위젯은 `footerGrowthText ? … : null` 로
         * 그린다. 즉 「최근 7일 안에 바뀐 프로젝트가 있나」라는 **데이터·시각에
         * 따라 달라지는 조건**을 레이아웃 게이트가 필수로 걸고 있었다.
         *
         * 실측(갓 만든 OPFS 볼트): 그 줄은 안 그려진다. 그래서 게이트가 15초를
         * 기다리다 죽었고, 4조합 × (본 + 재시도 2) = 12회 × 18초를 태워
         * `E2E smoke` 가 **매 실행 15분에 실패**했다. main 에서도 같았다.
         *
         * 이 게이트가 재려는 것은 「푸터의 글자가 잘리는가」이지 「이번 주에
         * 뭔가 바뀌었는가」가 아니다. 그래서 **그려졌으면 그것도 함께 재고,
         * 없으면 없는 대로 나머지를 잰다** — 조건부 원소를 필수로 거는 것은
         * 게이트를 강하게 만드는 게 아니라 환경에 따라 무작위로 빨개지게 만든다.
         */
        const growth = page.getByTestId("topology-index-footer-growth");
        if ((await growth.count()) > 0) await expect(growth).toBeVisible();

        for (const region of MEASURED_REGIONS) {
          const clipped = await page.evaluate((testId) => {
            const root = document.querySelector(`[data-testid="${testId}"]`);
            if (!root) return [{ text: `region ${testId} not found`, scrollWidth: 1, clientWidth: 0 }];

            const out: { text: string; scrollWidth: number; clientWidth: number }[] = [];
            const visit = (el: Element) => {
              const text = (el.textContent ?? "").trim();
              // 텍스트 잎만 잰다 — 컨테이너의 scrollWidth 는 자식 배치까지
              // 섞여서 "글자가 잘렸는가" 를 말해주지 않는다.
              if (text && el.children.length === 0 && el.scrollWidth > el.clientWidth) {
                out.push({ text, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
              }
              for (const child of Array.from(el.children)) visit(child);
            };
            visit(root);
            return out;
          }, region.testId);

          expect(
            clipped,
            `${region.testId} 가 자기 문자열을 자른다 (${region.why}):\n` +
              clipped
                .map((c) => `  "${c.text}" ${c.scrollWidth}px → ${c.clientWidth}px`)
                .join("\n"),
          ).toEqual([]);
        }
      });
    }
  }
});

/**
 * **첫 실행 카드 — 방문자가 보는 첫 화면 전체가 앱이 쓴 문자열이다.**
 *
 * 2026-07-29 도그푸딩이 잡은 결함(영어 화면):
 *
 * - 샘플 토글의 「Example — online store」가 115.1px 인데 칸이 98px 이라
 *   「Example — online…」으로 잘렸다. 한국어(「예시 — 온라인 쇼핑몰」)는
 *   들어가서 조용히 통과했다.
 * - 용어 사전이 `flex-wrap` 이라 「Element」 줄만 정의가 다음 줄로 떨어져
 *   `용어 = 정의` 문법이 그 줄에서만 깨졌다.
 *
 * 둘 다 **기존 오버플로 스윕을 통과했다** — 뷰포트 밖으로 나간 것이 없기
 * 때문이다. `truncate` 는 시킨 일을 했고 `flex-wrap` 도 시킨 일을 했다.
 * 상자를 넘었는가와 상자 안에서 읽히는가는 다른 질문이고, 이 스펙이 뒤쪽을
 * 맡는다.
 *
 * vault 를 만들지 않는다 — 카드는 폴더를 고르기 **전에만** 사는 표면이라,
 * 위 블록(vault 생성 후 푸터)과 상태가 배타적이다.
 */
const FIRST_RUN_VIEWPORTS = [
  { label: "1512", w: 1512, h: 950 },
  { label: "1024", w: 1024, h: 800 },
];

test.describe("크롬 텍스트 맞춤 — 첫 실행 카드", () => {
  for (const locale of LOCALES) {
    for (const vp of FIRST_RUN_VIEWPORTS) {
      test(`첫 실행 카드 (${locale} · ${vp.label}px)`, async ({ page }) => {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        await page.goto(`/${locale}/topology/?guides=off`, { waitUntil: "domcontentloaded" });

        const card = page.getByTestId("first-run-starter");
        await expect(card).toBeVisible({ timeout: 30_000 });
        // 용어 사전까지 그려진 뒤에 잰다 — 카드는 census 가 붙기 전에 먼저 뜬다.
        await expect(page.getByTestId("first-run-starter-glossary")).toBeVisible();

        const clipped = await page.evaluate(() => {
          const root = document.querySelector('[data-testid="first-run-starter"]');
          if (!root) return [{ text: "first-run-starter not found", scrollWidth: 1, clientWidth: 0 }];
          const out: { text: string; scrollWidth: number; clientWidth: number }[] = [];
          const visit = (el: Element) => {
            const text = (el.textContent ?? "").trim();
            if (text && el.children.length === 0 && el.scrollWidth > el.clientWidth) {
              out.push({ text, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
            }
            for (const child of Array.from(el.children)) visit(child);
          };
          visit(root);
          return out;
        });

        expect(
          clipped,
          `첫 실행 카드가 자기 문자열을 자른다 — 이 카드는 전부 앱이 쓴 문구다:\n` +
            clipped.map((c) => `  "${c.text}" ${c.scrollWidth}px → ${c.clientWidth}px`).join("\n"),
        ).toEqual([]);

        /**
         * **용어 사전은 어느 언어에서도 `용어 = 정의` 한 줄로 읽힌다.**
         * 세 줄의 `=` 가 같은 x 에 서고, 정의도 같은 x 에서 시작해야 한다 —
         * 한 줄만 다르면 그 줄은 다른 문법이 된다.
         */
        const columns = await page.evaluate(() => {
          const dl = document.querySelector('[data-testid="first-run-starter-glossary"]')!;
          const rects = (sel: string) =>
            Array.from(dl.querySelectorAll(sel)).map((e) => {
              const b = e.getBoundingClientRect();
              return { x: Math.round(b.x), y: Math.round(b.y) };
            });
          return { terms: rects("dt"), equals: rects("span"), defs: rects("dd") };
        });

        // 열: 세 줄의 용어 / `=` / 정의가 각각 같은 x 에 선다.
        expect(new Set(columns.terms.map((r) => r.x)).size, `용어 열: ${JSON.stringify(columns.terms)}`).toBe(1);
        expect(new Set(columns.equals.map((r) => r.x)).size, `= 열: ${JSON.stringify(columns.equals)}`).toBe(1);
        expect(new Set(columns.defs.map((r) => r.x)).size, `정의 열: ${JSON.stringify(columns.defs)}`).toBe(1);

        /**
         * **행도 함께 재야 한다.** 열 검사만 두면 세 칸이 **한 열로 쌓인**
         * 상태도 통과한다 — 그때도 모든 x 가 같기 때문이다. 실제로 그렇게
         * 됐다: Tailwind 가 `grid-cols-[auto_auto_1fr]` 을 생성하지 않아
         * 화면은 단일 열 스택이 됐는데 이 검사가 초록으로 통과했다.
         * 계약은 "정렬돼 있다" 가 아니라 **"`용어 = 정의` 가 한 줄"** 이다.
         */
        for (let i = 0; i < columns.terms.length; i += 1) {
          const row = [columns.terms[i], columns.equals[i], columns.defs[i]];
          expect(
            new Set(row.map((r) => r.y)).size,
            `${i}번째 줄이 한 줄에 안 선다: ${JSON.stringify(row)}`,
          ).toBe(1);
        }
      });
    }
  }
});
