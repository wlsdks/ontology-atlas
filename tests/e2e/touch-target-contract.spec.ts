import { test, expect } from "@playwright/test";

/**
 * 터치 타깃 계약 — `--touch-target-min`(44px) 이 **실제로 렌더에 닿는가**.
 *
 * ## 왜 이 층이어야 하나
 *
 * 계약은 `design.md` 가 이미 명문화했고 토큰도 있었다(`--touch-target-min: 44px`).
 * 그런데 2026-07-28 실측에서 coarse 포인터의 44px 미만 컨트롤이 19개 나왔다.
 * 원인은 값이 아니라 **사정거리**였다:
 *
 * - `@media (pointer: coarse)` 블록이 `--topology-chrome-control-height` 를
 *   44px 로 올렸는데, 상단 크롬을 그리는 공유 프리미티브 두 개(`ChromeTile`
 *   `ChromeChip`)는 그 토큰을 안 읽고 `--chrome-tile-size`(36px, src 사용처
 *   17곳)를 읽었다. **승격이 빈 방에 떨어지고 있었다.**
 * - 같은 블록이 `--topology-chrome-control-height-compact` 도 승격했는데
 *   그 토큰은 참조가 0곳인 죽은 토큰이었다.
 * - 첫 실행 패널의 텍스트형 버튼 넷은 높이 토큰이 아예 없어 16~18px 였다.
 *
 * lint 도 vitest 도 이걸 못 본다. lint 는 한 파일의 AST 만 보므로 "이 토큰이
 * 저 media 블록에서 승격되는가" 를 판정할 수 없고, jsdom 은 레이아웃이 없어
 * 높이가 늘 0이다. **포인터 종류가 독립 변수인 실제 브라우저**만 잴 수 있다.
 *
 * ## 히트 영역은 박스가 아니다
 *
 * 인라인 텍스트 컨트롤은 박스를 키우면 그 줄의 레이아웃이 통째로 바뀐다.
 * 그래서 `.touch-hit-expand` 가 의사요소로 히트만 넓힌다 — 이 검사는 보이는
 * rect 가 아니라 **유효 히트 박스**(자기 rect ∪ ::after rect)를 잰다.
 *
 * ## 두 층이다 — coarse 44 는 이 저장소의 터치 계약, fine 24 는 WCAG 2.5.8(AA)
 *
 * 2026-08-04 link 바닥 재설정(원장 「link 바닥 24」)이 fine 층을 추가했다.
 * 값 층이 44 를 fine 전면에 싣던 시절엔 fine 검사가 무의미했지만, 바닥이
 * 24 로 서면 **24 미만이 실제 결함**이 된다. 판정식:
 *
 *   PASS(a) := hitBox ≥ 24×24
 *           || INLINE_EXEMPT(a)   — display:inline && 비타깃 형제 글자 존재
 *           || SPACING_CLEAR(a)   — 24 원(사각 근사)이 다른 타깃과 안 겹침
 *
 * 인라인 면제가 계기에 **먼저** 들어간 이유: 없이 켜면 산문 링크(prose-link,
 * 줄 상자를 부모가 소유)가 거짓 빨강이 되고, 게이트가 틀리면 게이트를 끄는
 * 것이 기본값이 된다. 「문장 속인가」는 정적으로 판정 불가라(형제 글자 출처 ·
 * used display · reflow 전부 여는 태그 밖) 여기 런타임 계기가 정본이다 —
 * 삭제된 `inline` 축의 후임이다.
 */

const MIN = 44;

test.use({ hasTouch: true, isMobile: true, viewport: { width: 768, height: 1024 } });

test.describe("터치 타깃 계약 (pointer: coarse)", () => {
  test("첫 실행 패널의 모든 컨트롤이 44px 히트 영역을 갖는다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await expect(page.getByTestId("topology-index-panel")).toBeVisible();

    // 카드가 접혀 있으면 되돌아오기 1행으로 다시 연다.
    const reopen = page.getByTestId("first-run-starter-reopen");
    if (await reopen.isVisible().catch(() => false)) await reopen.click();
    await expect(page.getByTestId("first-run-starter")).toBeVisible();

    const short = await page.evaluate((min) => {
      const hit = (el: Element) => {
        const r = el.getBoundingClientRect();
        const a = getComputedStyle(el, "::after");
        if (a.content && a.content !== "none" && a.position === "absolute") {
          return {
            w: Math.max(r.width, parseFloat(a.width) || 0),
            h: Math.max(r.height, parseFloat(a.height) || 0),
          };
        }
        return { w: r.width, h: r.height };
      };
      const panel = document.querySelector('[data-testid="first-run-starter"]');
      if (!panel) return [{ id: "panel-missing", w: 0, h: 0 }];
      return Array.from(panel.querySelectorAll("button:not([disabled]), a[href]"))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== "hidden";
        })
        .map((el) => ({
          id:
            el.getAttribute("data-testid") ||
            (el.textContent || "").trim().slice(0, 24) ||
            el.tagName,
          ...hit(el),
        }))
        .filter((b) => b.w < min || b.h < min);
    }, MIN);

    expect(short, `44px 미만 히트 영역: ${JSON.stringify(short)}`).toEqual([]);
  });

  test("공유 크롬 프리미티브가 coarse 에서 44px 로 승격된다", async ({ page }) => {
    await page.goto("/ko/topology/?guides=off");
    await expect(page.getByTestId("topology-command-chrome")).toBeVisible();

    // 토큰 자체 — 승격이 도달했는가.
    const tile = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--chrome-tile-size").trim(),
    );
    expect(tile).not.toBe("36px");

    // 렌더된 높이 — 토큰이 실제로 컨트롤에 닿았는가. 토큰만 검사하면
    // "승격했지만 아무도 안 읽는" 상태(이 결함의 원형)를 그대로 통과시킨다.
    for (const id of ["topology-auto-arrange", "topology-concept-search"]) {
      const h = await page.getByTestId(id).evaluate((el) => el.getBoundingClientRect().height);
      expect(h, `${id} 높이`).toBeGreaterThanOrEqual(MIN);
    }
  });

  /**
   * 관문 표면도 같은 계약을 진다 (2026-07-28).
   *
   * `/download` GNB 는 **이 감사 중에 태어난 표면**인데 터치 계약 없이 태어났다
   * (실측: EN/KO 32×32 · 로고 116×24 · 링크 20/28/16px). 새 표면 체크리스트에
   * coarse 승격이 빠져 있다는 신호라, 등록부를 여기까지 넓힌다.
   */
  test("관문(/download)의 모든 컨트롤이 44px 히트 영역을 갖는다", async ({ page }) => {
    await page.goto("/ko/download/?guides=off");
    await expect(page.getByTestId("download-gnb")).toBeVisible();

    const short = await page.evaluate((min) => {
      const hit = (el: Element) => {
        const r = el.getBoundingClientRect();
        const a = getComputedStyle(el, "::after");
        if (a.content && a.content !== "none" && a.position === "absolute") {
          return {
            w: Math.max(r.width, parseFloat(a.width) || 0),
            h: Math.max(r.height, parseFloat(a.height) || 0),
          };
        }
        return { w: r.width, h: r.height };
      };
      return Array.from(document.querySelectorAll("button:not([disabled]), a[href]"))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return (
            r.width > 0 &&
            r.height > 0 &&
            cs.visibility !== "hidden" &&
            !el.closest(".sr-only")
          );
        })
        .map((el) => ({
          id:
            el.getAttribute("data-testid") ||
            (el.textContent || "").trim().slice(0, 24) ||
            el.tagName,
          ...hit(el),
        }))
        .filter((b) => b.w < min || b.h < min);
    }, MIN);

    expect(short, `44px 미만 히트 영역: ${JSON.stringify(short)}`).toEqual([]);
  });
});

interface Audit258Result {
  scanned: number;
  failures: { id: string; w: number; h: number }[];
}

/** fine-pointer 2.5.8 감사 — 브라우저 안에서 실행되는 판정기. */
const AUDIT_258 = `(() => {
  const MIN = 24;
  /*
   * 셀렉터에 **폼이 들어 있어야 한다** — 2026-08-05 까지 네 자리가 전부
   * \`button, a[href]\` 라서 \`<input>\`·\`<select>\`·\`<textarea>\` 는
   * 이 감사에 **원리적으로 존재하지 않았다**. 그 사각에서 네이티브 체크박스
   * 5곳이 전부 24px 미만이었고 게이트는 내내 초록이었다.
   */
  const RAW = 'button:not([disabled]), a[href], input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';
  /*
   * **체크박스는 자기 상자가 아니라 라벨이 타깃이다.** WCAG 는 타깃을
   * 「무엇이 클릭을 받나」로 정의하고(SC 2.5.5 Understanding), \`<label>\` 이
   * 감싸면 라벨 클릭이 곧 토글이라는 네이티브 동작 때문에 라벨 전체가 하나의
   * 타깃이 된다. 그러니 감싸는 라벨이 있으면 **라벨로 치환**한다 —
   * 안 그러면 16px 체크박스와 24px 라벨을 **두 개의 타깃으로 이중 계산**해서,
   * 고쳐 놓은 자리를 위반으로 부른다.
   */
  const seen = new Set();
  const targets = [];
  for (const el of Array.from(document.querySelectorAll(RAW))) {
    const type = (el.getAttribute('type') || '').toLowerCase();
    const merged = (type === 'checkbox' || type === 'radio') ? (el.closest('label') || el) : el;
    if (seen.has(merged)) continue;
    const r = merged.getBoundingClientRect();
    const cs = getComputedStyle(merged);
    if (!(r.width > 0 && r.height > 0)) continue;
    if (cs.visibility === 'hidden' || cs.opacity === '0') continue;
    if (merged.closest('.sr-only') || merged.closest('[aria-hidden="true"]')) continue;
    seen.add(merged);
    targets.push(merged);
  }
  const hit = (el) => {
    const r = el.getBoundingClientRect();
    const a = getComputedStyle(el, '::after');
    if (a.content && a.content !== 'none' && a.position === 'absolute') {
      return { w: Math.max(r.width, parseFloat(a.width) || 0), h: Math.max(r.height, parseFloat(a.height) || 0) };
    }
    return { w: r.width, h: r.height };
  };
  const inlineExempt = (el) => {
    if (getComputedStyle(el).display !== 'inline') return false;
    let p = el.parentElement;
    while (p && getComputedStyle(p).display === 'inline') p = p.parentElement;
    if (!p) return false;
    let targetChars = 0;
    p.querySelectorAll(RAW).forEach((t) => { targetChars += (t.textContent || '').length; });
    return (p.textContent || '').length - targetChars > 0;
  };
  const box24 = (el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return { l: cx - MIN / 2, r: cx + MIN / 2, t: cy - MIN / 2, b: cy + MIN / 2 };
  };
  const meets = (b) => b.w >= MIN && b.h >= MIN;
  const intersects = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const spacingClear = (el) => {
    const mine = box24(el);
    for (const other of targets) {
      if (other === el || el.contains(other) || other.contains(el)) continue;
      const or = other.getBoundingClientRect();
      const orect = { l: or.left, r: or.right, t: or.top, b: or.bottom };
      if (intersects(mine, meets(hit(other)) ? orect : box24(other))) return false;
    }
    return true;
  };
  const id = (el) => el.getAttribute('data-testid') || (el.textContent || '').trim().slice(0, 24) || el.tagName;
  const failures = [];
  for (const el of targets) {
    const b = hit(el);
    if (meets(b)) continue;
    if (inlineExempt(el)) continue;
    if (spacingClear(el)) continue;
    failures.push({ id: id(el), w: Math.round(b.w), h: Math.round(b.h) });
  }
  return { scanned: targets.length, failures };
})()`;

/**
 * WCAG 2.5.8(AA) — fine 포인터의 24×24 바닥.
 *
 * 사정거리는 아래 라우트 전수의 **모든** \`button\`/\`a[href]\` **와 폼
 * 컨트롤**(\`input\`·\`select\`·\`textarea\`)이다. 체크박스·라디오는 감싸는
 * \`<label>\` 로 치환해서 **하나의 타깃**으로 잰다. 라우트를
 * 더할 때는 먼저 위반을 전수 측정하고(게이트가 켜진 날부터 빨간 게이트는
 * 소음이다), 남는 위반은 고치거나 여기 주석에 측정치와 함께 남긴다.
 */
test.describe("최소 타깃 계약 (pointer: fine — WCAG 2.5.8 AA)", () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 860 } });

  for (const route of ["/ko/topology/?guides=off", "/ko/download/?guides=off", "/ko/docs/?guides=off", "/ko/guide/?guides=off"]) {
    test(`${route} 의 타깃이 24×24 미달이면 인라인 면제·간격 예외 중 하나를 증명해야 한다`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const { scanned, failures } = (await page.evaluate(AUDIT_258)) as Audit258Result;
      // 공회전 방지 — 타깃이 안 잡히면 셀렉터가 죽은 것이지 화면이 완벽한 게 아니다.
      expect(scanned, `${route} 에서 스캔된 타깃이 너무 적다(${scanned})`).toBeGreaterThan(5);
      expect(failures, `2.5.8 미달: ${JSON.stringify(failures)}`).toEqual([]);
    });
  }

  test("계기 프로브 — 24 미만 밀집 타깃을 실제로 잡고, 간격 확보 타깃은 지나보낸다", async ({ page }) => {
    await page.goto("/ko/download/?guides=off");
    await page.evaluate(() => {
      // 위반 프로브: 16px 타깃 둘이 8px 간격 — 24 원이 서로 겹친다.
      // 통과 프로브: 16px 타깃이지만 사방 12px 이상 비어 spacing 예외가 성립.
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div style="position:fixed;left:0;top:0;z-index:9999;background:#000;width:400px;height:200px">
           <button type="button" data-testid="probe-dense-a" style="position:absolute;left:20px;top:20px;width:60px;height:16px">a</button>
           <button type="button" data-testid="probe-dense-b" style="position:absolute;left:20px;top:40px;width:60px;height:16px">b</button>
           <button type="button" data-testid="probe-spaced" style="position:absolute;left:200px;top:90px;width:60px;height:16px">c</button>
         </div>`,
      );
    });
    const { failures } = (await page.evaluate(AUDIT_258)) as Audit258Result;
    const ids = failures.map((f: { id: string }) => f.id);
    expect(ids, "밀집 프로브를 못 잡았다 — 탐지기가 죽어 있다").toEqual(
      expect.arrayContaining(["probe-dense-a", "probe-dense-b"]),
    );
    expect(ids, "간격 확보 프로브를 오탐했다 — spacing 예외가 죽어 있다").not.toContain("probe-spaced");
  });

  /**
   * **폼 커버리지 프로브** — 이 감사가 2026-08-05 까지 폼을 못 보던 사각을 못박는다.
   *
   * 셀렉터가 `button, a[href]` 로 되돌아가면 아래 셋이 전부 통과해 버리고,
   * 그러면 「위반 0」은 깨끗해서가 아니라 **안 봐서** 0이 된다. 이 저장소가
   * 반복해서 밟은 그 결함이다.
   *
   * 세 프로브가 각기 다른 것을 증명한다:
   * - `probe-input-small` — 폼 컨트롤이 **셀렉터에 잡히는가**
   * - `probe-check-bare` — 라벨 없는 체크박스가 **자기 크기로 판정되는가**
   * - `probe-check-labelled` — 라벨이 감싸면 **라벨로 치환돼 통과하는가**
   *   (이게 없으면 고쳐 놓은 자리를 이중 계산해서 오탐한다)
   */
  test("폼 커버리지 프로브 — 인풋·체크박스를 실제로 재고, 라벨로 감싼 것은 라벨로 친다", async ({ page }) => {
    await page.goto("/ko/download/?guides=off");
    await page.evaluate(() => {
      document.body.insertAdjacentHTML(
        "beforeend",
        // 좌표는 **간격 예외가 성립하지 않도록** 밀집시킨다. 처음엔 넉넉히
        // 띄워 놨다가 셋 다 통과했는데, 그건 탐지기가 죽어서가 아니라 24px 원이
        // 안 겹쳐서 2.5.8 의 간격 예외가 **정당하게** 성립한 것이었다.
        `<div style="position:fixed;left:0;top:300px;z-index:9999;background:#000;width:400px;height:260px">
           <input data-testid="probe-input-small" style="position:absolute;left:20px;top:10px;width:60px;height:16px" />
           <input type="checkbox" data-testid="probe-check-bare" style="position:absolute;left:20px;top:30px;width:16px;height:16px" />
           <label style="position:absolute;left:20px;top:120px;width:200px;height:32px;display:flex;align-items:center">
             <input type="checkbox" data-testid="probe-check-labelled" style="width:16px;height:16px" />
             <span>라벨이 타깃이다</span>
           </label>
           <button type="button" data-testid="probe-label-neighbour" style="position:absolute;left:20px;top:140px;width:60px;height:16px">n</button>
         </div>`,
      );
    });
    const { failures } = (await page.evaluate(AUDIT_258)) as Audit258Result;
    const ids = failures.map((f: { id: string }) => f.id);
    expect(ids, "16px 인풋을 못 잡았다 — 셀렉터가 폼을 안 보고 있다").toContain("probe-input-small");
    expect(ids, "라벨 없는 16px 체크박스를 못 잡았다").toContain("probe-check-bare");
    /*
     * 이웃 버튼이 라벨 안 체크박스와 24px 원이 겹치도록 놓여 있다. 그래서
     * **라벨 치환이 죽으면** 안쪽 16px 체크박스가 간격 예외를 못 받고 걸린다 —
     * 이 단언이 헛돌지 않는 이유다.
     */
    expect(ids, "이웃 프로브가 안 걸렸다 — 이 자리의 밀집 기하가 성립하지 않는다").toContain(
      "probe-label-neighbour",
    );
    expect(
      ids,
      "라벨로 감싼 체크박스를 오탐했다 — 라벨 치환이 죽었다(고쳐 놓은 자리를 위반으로 부르게 된다)",
    ).not.toContain("probe-check-labelled");
  });
});
