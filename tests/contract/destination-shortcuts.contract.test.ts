import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DESTINATION_BY_KEY,
  DESTINATION_HREF,
  DESTINATION_IDS,
  DESTINATION_KEY,
  NAV_LEADER_KEY,
  NAV_LEADER_WINDOW_MS,
} from "@/shared/config/destinations";

/**
 * 목적지 이동 단축키 — **목록 · 화면 · 안내가 한 표에서 나온다.**
 *
 * ## 이 게이트가 막으려는 것
 *
 * 이 저장소에서 단축키 안내는 이미 한 번 거짓말을 했다. `ShortcutSheet` 의 지도
 * 절에 남아 있는 주석이 그 기록이다 — *"the previous rows described interactions
 * the v2 canvas never implemented — stale carryover from an earlier design that
 * never shipped"*. 즉 시트가 **없는 기능**(Tab 이웃 이동 · Shift+클릭 경로 …)을
 * 안내하고 있었고, 아무 검사도 그것을 잡지 못했다.
 *
 * 원인은 시트가 **손으로 적은 목록**이라는 것이다. 그래서 이동 단축키는 표
 * (`shared/config/destinations.ts`)를 정본으로 두고, 시트가 그 표에서 줄을
 * 만든다. 이 파일은 그 배선이 살아 있는지 잰다.
 *
 * ## 왜 「누를 수 있나」는 여기서 못 재나
 *
 * 실제로 키를 눌러 화면이 바뀌는지는 브라우저가 있어야 한다 —
 * `tests/e2e/destination-shortcuts.spec.ee.ts` 가 그 몫이다. 이 계약은 **표와
 * 배선**을 본다. 둘을 갈라 두는 이유는 e2e 가 느려서 표 실수를 잡는 데 쓰기엔
 * 비싸고, 계약만으로는 「정말 이동하나」를 증명할 수 없어서다.
 */

const REPO = process.cwd();
const read = (path: string) => readFileSync(`${REPO}/${path}`, "utf8");

/**
 * 주석을 뺀 소스. **주석을 안 빼면 규격을 설명하는 문장 자체가 위반으로 잡힌다** —
 * 이 파일에서 실제로 밟았다: 훅의 주석이 *"`querySelector(...)` 하나로는 틀린다"*
 * 라고 적어 두었더니 「그 코드가 남았다」로 판정됐다. 그러면 규격을 적을수록
 * 게이트가 빨개지는 뒤집힌 유인이 생긴다(설정 방언 게이트가 남긴 교훈과 같다).
 */
const readCode = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("목적지 이동 단축키 — 표가 정본이다", () => {
  it("목적지마다 글자가 하나씩 있고 서로 겹치지 않는다", () => {
    const keys = DESTINATION_IDS.map((id) => DESTINATION_KEY[id]);
    expect(keys.length, "목적지가 비었다 — 표가 사라졌으면 이 시험 전체가 공회전한다").toBeGreaterThan(
      3,
    );
    expect(new Set(keys).size, `글자가 겹친다: ${keys.join(" ")}`).toBe(keys.length);
    for (const key of keys) {
      expect(key, `${key} 는 한 글자여야 한다`).toMatch(/^[a-z]$/);
    }
    // 역방향 표가 정방향과 같은 것을 말하는가.
    expect(Object.keys(DESTINATION_BY_KEY).length).toBe(keys.length);
    for (const id of DESTINATION_IDS) {
      expect(DESTINATION_BY_KEY[DESTINATION_KEY[id]]).toBe(id);
    }
  });

  it("목적지마다 주소가 있고 라우트 모양이다", () => {
    for (const id of DESTINATION_IDS) {
      const href = DESTINATION_HREF[id];
      expect(href, `${id} 의 주소가 없다`).toBeTruthy();
      // 로케일 접두사는 `@/i18n/navigation` 이 붙인다 — 표에 박으면 두 번 붙는다.
      expect(href, `${id}: 로케일을 표에 박지 않는다`).not.toMatch(/^\/(en|ko)\//);
      expect(href, `${id}: 슬래시로 시작하고 끝나야 한다(정적 export 규약)`).toMatch(/^\/.*\/$/);
    }
  });

  /**
   * ⌘1~⌘9 를 쓰지 않는다는 결정이 코드에 남아 있는가. 리더는 조합키 없이 눌린
   * 글자이고, 훅이 조합키가 눌린 경우를 **먼저** 걸러야 한다.
   */
  it("조합키가 눌린 입력은 우리 것이 아니다", () => {
    const hook = read("src/shared/lib/use-destination-shortcuts.ts");
    expect(hook, "메타/컨트롤/알트가 눌린 사건을 안 걸러낸다").toMatch(
      /if\s*\(event\.metaKey\s*\|\|\s*event\.ctrlKey\s*\|\|\s*event\.altKey\)\s*return/,
    );
  });

  it("입력 중에는 이동하지 않는다", () => {
    const hook = read("src/shared/lib/use-destination-shortcuts.ts");
    expect(hook).toContain("INPUT");
    expect(hook).toContain("TEXTAREA");
    expect(hook).toContain("isContentEditable");
  });

  /**
   * 막는 표면이 떠 있으면 이동하지 않는다. **`aria-modal` 로 판정**하는 것이
   * 계약이다 — 호출자마다 `disabled` 를 기억하게 하면 새 모달이 그것을 빠뜨린다
   * (레일 유틸 슬롯을 페이지마다 등록하다 공방이 빠뜨린 #65 와 같은 계열).
   */
  it("막는 표면이 열려 있으면 이동하지 않는다", () => {
    const hook = read("src/shared/lib/use-destination-shortcuts.ts");
    expect(hook, "aria-modal 로 막는 표면을 판정하지 않는다").toContain('[aria-modal="true"]');
  });

  /**
   * **숨은 모달을 세면 이동이 영구히 죽는다** (2026-08-09, e2e 가 잡았다).
   * 처음 구현은 `querySelector` 한 번이었고, 그것은 문서의 첫 일치를 돌려준다 —
   * 퇴장 애니메이션 동안 DOM 에 남은 표면이 먼저 걸리면 화면에는 아무 단서 없이
   * 단축키 전체가 먹지 않는다. 그래서 **모두 훑고 그려진 것만** 센다.
   */
  it("숨은 모달을 막는 표면으로 세지 않는다", () => {
    const hook = read("src/shared/lib/use-destination-shortcuts.ts");
    expect(hook, "첫 일치만 보면 숨은 모달에 걸린다").toContain("querySelectorAll");
    expect(hook, "화면에 그려졌는지 재지 않는다").toContain("getClientRects");
    expect(hook, "aria-hidden 조상을 건너뛰지 않는다").toContain('aria-hidden="true"');
    expect(readCode("src/shared/lib/use-destination-shortcuts.ts"), "querySelector 한 번으로 판정하는 코드가 남았다").not.toMatch(
      /querySelector\(\s*'\[aria-modal/,
    );
  });

  it("리더를 누른 뒤 기다리는 시간이 있다", () => {
    expect(NAV_LEADER_WINDOW_MS).toBeGreaterThan(300);
    expect(NAV_LEADER_WINDOW_MS).toBeLessThanOrEqual(3000);
    expect(read("src/shared/lib/use-destination-shortcuts.ts")).toContain("NAV_LEADER_WINDOW_MS");
  });
});

describe("레일 · 시트 · 셸이 같은 표를 본다", () => {
  it("레일이 주소를 손으로 다시 적지 않는다", () => {
    const rail = read("src/widgets/app-nav-rail/ui/AppNavRail.tsx");
    expect(rail, "레일이 표를 import 하지 않는다").toContain("DESTINATION_HREF");
    /*
     * 레일의 목적지 배열 안에 리터럴 주소가 남아 있으면 사본이 둘이다. 배열
     * 블록만 잘라 본다 — 파일 다른 곳의 주소(관문 링크 등)까지 금지하면 엉뚱하게
     * 걸린다.
     */
    const block = rail.slice(
      rail.indexOf("const destinations"),
      rail.indexOf("];", rail.indexOf("const destinations")),
    );
    expect(block.length, "목적지 배열을 못 찾았다 — 이 단언이 공회전한다").toBeGreaterThan(120);
    const literals = block.match(/href:\s*["'][^"']+["']/g) ?? [];
    expect(literals, `레일에 리터럴 주소가 남았다: ${literals.join(", ")}`).toEqual([]);
  });

  it("셸이 훅을 배선한다", () => {
    const shell = read("src/app/providers/AppShell.tsx");
    expect(shell, "셸이 이동 단축키를 마운트하지 않는다").toContain("useDestinationShortcuts");
  });

  it("시트가 표에서 줄을 만든다 — 손으로 적지 않는다", () => {
    const sheet = read("src/widgets/shortcut-sheet/ui/ShortcutSheet.tsx");
    expect(sheet, "시트가 표를 import 하지 않는다").toContain("DESTINATION_IDS");
    expect(sheet, "시트가 표에서 줄을 파생시키지 않는다").toMatch(
      /DESTINATION_IDS\.map\(/,
    );
    // 파생 줄이 이동 절에 실제로 꽂혔는가.
    expect(sheet).toMatch(/rows:\s*\[\s*\.\.\.DESTINATION_ROWS/);
  });

  it("두 로케일 모두 목적지마다 문구가 있다", () => {
    for (const locale of ["ko", "en"] as const) {
      const messages = JSON.parse(read(`messages/${locale}.json`));
      const rows = messages.searchWidgets?.shortcuts?.rows ?? {};
      for (const id of DESTINATION_IDS) {
        const key = `goTo_${id}`;
        expect(rows[key], `${locale}: ${key} 문구가 없다`).toBeTruthy();
      }
    }
  });

  /**
   * 이미 쓰이는 단독 글자와 부딪히지 않는가. 리더 문법이라 원리적으로는 충돌이
   * 없지만(`G` 다음 `D` ≠ `D`), **리더 자신**이 단독 글자로 쓰이고 있으면
   * 그 기능이 못 발동한다.
   */
  it("리더 글자가 다른 단독 단축키와 겹치지 않는다", () => {
    const SINGLE_KEY_SHORTCUTS = ["d", "f", "?", "/"];
    expect(
      SINGLE_KEY_SHORTCUTS,
      `리더(${NAV_LEADER_KEY})가 이미 단독으로 쓰이는 글자다`,
    ).not.toContain(NAV_LEADER_KEY);
  });

  /**
   * **일곱이 상한이다** (소유자 확정 2026-08-21).
   *
   * 레일은 최소 창(`minHeight: 720`)에서 로고 + 목적지 타일 + 유틸리티 층이
   * 세로로 쌓인다. 작업대 자리 실측: 여덟 번째 타일이 유틸리티 층 위로 **8px**
   * 남기고 들어간다. 폭 2400 이상에서는 UI 배율이 1.1 로 올라가 여덟이
   * **761px** 를 요구하므로 그 최소 창을 41px 넘긴다 — 그래서 상한과 함께
   * 레일에 스크롤 처리가 같이 들어간다.
   *
   * 이 검사가 막는 것은 「여덟 번째가 조용히 들어오는 것」이다. 여덟이 필요하면
   * **무엇을 뺄지 먼저 대야 한다** — 소유자가 고른 길이 그것이다(대안이던
   * 「최소 창 높이를 780 으로 올린다」는 기각).
   */
  it("목적지는 일곱을 넘지 않는다 — 여덟째는 무엇을 뺄지 먼저 정한다", () => {
    expect(
      DESTINATION_IDS.length,
      `레일 목적지가 ${DESTINATION_IDS.length}개다 — ` +
        `여덟째를 넣으려면 무엇을 뺄지 먼저 정하고 이 상한을 같이 고쳐라`,
    ).toBeLessThanOrEqual(7);
  });

  it("상한이 헐겁지 않다 — 여유를 무료로 두지 않는다", () => {
    /*
     * 「체계」석이 다른 래칫에 쓴 문법과 같다: 상한만 있고 실측이 한참 아래면
     * 그 여유가 다음에 들어오는 것의 무료 통행증이 된다. 오늘 일곱이므로
     * 상한도 일곱이다.
     */
    expect(
      DESTINATION_IDS.length,
      "목적지가 줄었다 — 위 상한도 같이 내려라",
    ).toBe(7);
  });

  it("레일이 넘칠 때 스크롤할 수 있다 — 상한만으로는 배율을 못 막는다", () => {
    /*
     * 일곱이라는 상한은 기본 최소 창의 명목 높이를 지킬 뿐, 확대·긴 번역·더 작은
     * 유효 뷰포트까지 보장하지 않는다. 그때 `overflow` 를 처리하지 않으면 아래쪽
     * 목적지와 유틸리티가 **잘려서 닿을 수 없게 된다** — 반응형 자리가 「200%
     * 확대에서 톱니가 유실된다」고 잰 것과 같은 결함이다.
     */
    const rail = read("src/widgets/app-nav-rail/ui/AppNavRail.tsx");
    expect(rail, "목적지 nav 가 스크롤을 소유하지 않는다").toMatch(
      /<nav[\s\S]*?className="[^"]*min-h-0[^"]*overflow-y-auto[^"]*overscroll-contain[^"]*"/,
    );
    expect(rail, "유틸리티 층이 줄어들 수 있다 — 자기 className 에 shrink-0 이 필요하다").toMatch(
      /data-testid="app-nav-rail-utility-tier"[\s\S]{0,240}className="[^"]*shrink-0[^"]*"/,
    );
  });
});
