import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DESTINATION_BY_KEY,
  DESTINATION_HREF,
  DESTINATION_IDS,
  DESTINATION_KEY,
  MOBILE_DESTINATION_IDS,
  NAV_LEADER_KEY,
  NAV_LEADER_WINDOW_MS,
} from "@/shared/config/destinations";

/**
 * Destination navigation shortcuts — **the list, the screen, and the help all come
 * from one table.**
 *
 * **What this gate blocks.** Shortcut help in this repository has already lied once.
 * The comment still in `ShortcutSheet`'s map section records it — *"the previous
 * rows described interactions
 * the v2 canvas never implemented — stale carryover from an earlier design that
 * never shipped"*. The sheet was documenting **features that did not exist** (Tab
 * to a neighbour, Shift+click for a path, …), and no check caught it.
 *
 * The cause was that the sheet was a **hand-written list**. So navigation shortcuts
 * now treat the table (`shared/config/destinations.ts`) as the source of truth and
 * the sheet builds its rows from it. This file measures that the wiring is alive.
 *
 * **Why "can it actually be pressed" is not measured here.** Whether pressing the
 * key really changes the screen needs a browser —
 * `tests/e2e/destination-shortcuts.spec.ee.ts` owns that. This contract watches the
 * **table and the wiring**. They are split because e2e is too slow to be worth
 * spending on table mistakes, and a contract alone cannot prove navigation
 * happens.
 */

const REPO = process.cwd();
const read = (path: string) => readFileSync(`${REPO}/${path}`, "utf8");

/**
 * Source with comments stripped. **Without stripping, a sentence explaining the
 * spec is itself caught as a violation** — which happened in this file: the hook's
 * comment said *"a single `querySelector(...)` is wrong"* and was judged as "that
 * code is still there". That creates the inverted incentive where writing the spec
 * down turns the gate red (the same lesson the settings-dialect gate left).
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
    // Does the reverse table say the same thing as the forward one?
    expect(Object.keys(DESTINATION_BY_KEY).length).toBe(keys.length);
    for (const id of DESTINATION_IDS) {
      expect(DESTINATION_BY_KEY[DESTINATION_KEY[id]]).toBe(id);
    }
  });

  it("목적지마다 주소가 있고 라우트 모양이다", () => {
    for (const id of DESTINATION_IDS) {
      const href = DESTINATION_HREF[id];
      expect(href, `${id} 의 주소가 없다`).toBeTruthy();
      // `@/i18n/navigation` adds the locale prefix — baking it into the table doubles it.
      expect(href, `${id}: 로케일을 표에 박지 않는다`).not.toMatch(/^\/(en|ko)\//);
      expect(href, `${id}: 슬래시로 시작하고 끝나야 한다(정적 export 규약)`).toMatch(/^\/.*\/$/);
    }
  });

  /**
   * Is the decision not to use ⌘1–⌘9 still present in the code? The leader is a
   * letter pressed with no modifier, and the hook must filter modifier presses
   * **first**.
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
   * No navigation while a blocking surface is open. Deciding **by `aria-modal`** is
   * the contract — making each caller remember `disabled` means a new modal forgets it
   * (the same family as #65, where per-page registration of the rail utility slot was
   * missed by one surface).
   */
  it("막는 표면이 열려 있으면 이동하지 않는다", () => {
    const hook = read("src/shared/lib/use-destination-shortcuts.ts");
    expect(hook, "aria-modal 로 막는 표면을 판정하지 않는다").toContain('[aria-modal="true"]');
  });

  /**
   * **Counting a hidden modal kills navigation permanently** (2026-08-09, caught by
   * e2e). The first implementation used a single `querySelector`, which returns the
   * document's first match — if a surface still in the DOM during its exit animation
   * matches first, every shortcut stops working with no clue on screen. So it scans
   * **all of them and counts only the rendered ones**.
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
  it("모바일 셸에서도 현재 아키텍처 목적지가 사라지지 않는다", () => {
    expect(MOBILE_DESTINATION_IDS).toContain("architecture");
    expect(new Set(MOBILE_DESTINATION_IDS).size).toBe(MOBILE_DESTINATION_IDS.length);
    for (const id of MOBILE_DESTINATION_IDS) expect(DESTINATION_IDS).toContain(id);

    const bottomTabs = read("src/widgets/bottom-tab-bar/ui/BottomTabBar.tsx");
    expect(bottomTabs).toContain("MOBILE_DESTINATION_IDS.map");
    expect(bottomTabs).toContain("DESTINATION_HREF[id]");
  });

  /**
   * **MCP's absence from the five mobile slots is a decision** (design council, 2026-09-05).
   *
   * Handing a coding tool a config and switching external servers on are both desk work with that
   * tool open beside you; 1024 is the width floor the seat named. Its contextual entry points
   * (the `/agents` runner row, and the address typed) still reach it below `lg`, so the route is
   * never a trap there. Without this line the next person reads the absence as an oversight and
   * "fixes" it.
   */
  it("MCP 는 모바일 다섯 자리에 일부러 없다 — 빠뜨린 것이 아니다", () => {
    expect(DESTINATION_IDS).toContain("mcp");
    expect(
      MOBILE_DESTINATION_IDS as readonly string[],
      "MCP 가 모바일 슬롯에 들어왔다 — 결정이 바뀐 것이라면 destinations.ts 의 주석부터 고쳐라",
    ).not.toContain("mcp");
    const table = read("src/shared/config/destinations.ts");
    expect(table, "폭 하한(1024)이 표에 적혀 있지 않다").toContain("1024");
  });

  /**
   * **The Library is absent from the five for a different reason than MCP, and it pays
   * for the absence with a link.**
   *
   * MCP is desk work. The Library is not — its route renders at 390 and a wiki page is
   * worth reading on a phone. It is simply not one of *five*, and the price of that is a
   * contextual entry point that exists at every width. Below `lg` the Docs sidebar's row
   * is the only way in, so this asserts the row rather than the absence: an absence with
   * no door is the dead pointer, not the decision.
   */
  it("자료실은 모바일 다섯 자리에 없는 대신 문 하나를 갖는다", () => {
    expect(DESTINATION_IDS).toContain("library");
    expect(
      MOBILE_DESTINATION_IDS as readonly string[],
      "자료실이 모바일 슬롯에 들어왔다 — 결정이 바뀐 것이라면 destinations.ts 의 주석부터 고쳐라",
    ).not.toContain("library");
    const sidebar = read("src/views/docs-vault/ui/parts/DocsSidebarBody.tsx");
    expect(sidebar, "문서 화면에서 자료실로 가는 줄이 없다 — lg 아래에서는 이게 유일한 문이다").toContain(
      'data-testid="docs-sidebar-library-link"',
    );
    expect(sidebar, "그 줄이 /library 를 가리키지 않는다").toMatch(
      /href="\/library\/"/,
    );
  });

  it("레일이 주소를 손으로 다시 적지 않는다", () => {
    const rail = read("src/widgets/app-nav-rail/ui/AppNavRail.tsx");
    expect(rail, "레일이 표를 import 하지 않는다").toContain("DESTINATION_HREF");
    /*
     * A literal address left inside the rail's destination array means two copies. Only
     * the array block is sliced — banning addresses elsewhere in the file (gateway links
     * and so on) would catch the wrong things.
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
    // Are the derived rows actually plugged into the navigation section?
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
   * Does it collide with a bare letter already in use? The leader grammar makes
   * collisions impossible in principle (`G` then `D` ≠ `D`), but if **the leader
   * itself** is bound as a bare letter, that feature cannot fire.
   */
  it("리더 글자가 다른 단독 단축키와 겹치지 않는다", () => {
    const SINGLE_KEY_SHORTCUTS = ["d", "f", "?", "/"];
    expect(
      SINGLE_KEY_SHORTCUTS,
      `리더(${NAV_LEADER_KEY})가 이미 단독으로 쓰이는 글자다`,
    ).not.toContain(NAV_LEADER_KEY);
  });

  /**
   * **Nine is the ceiling** (record of 2026-09-06, which amends the eight-cap of
   * 2026-09-05, itself overturning the seven-cap decision (91) of 2026-08-21).
   *
   * The number moved because the rail was measured again, and the tile's own padding
   * moved with it. At the app's minimum window (`minWidth: 1040`, `minHeight: 720`)
   * the destinations pane is 616px tall. Measured on the rendered rail, 2026-09-06:
   *
   * | tiles | button padding | pitch | stack | spare |
   * |---|---|---|---|---|
   * | 8 | `py-1.5` | 64px | 12–522 | 94px |
   * | 9 | `py-1.5` | 64px | 12–586 | 30px |
   * | 9 | `py-1`   | 60px | 12–550 | 66px |
   *
   * The gear is drawn 48px above the window edge in every one of those, and nothing
   * scrolls. The fixed tokens did not move — 38×32 tile, 20px icon, 11px label — so
   * what paid for the ninth tile is the one quantity in the tile carrying no
   * information. The pane still owns its own scroll (`min-h-0 overflow-y-auto
   * overscroll-contain`, asserted below) for zoom, longer translations and every
   * smaller effective viewport.
   *
   * What this check blocks is a tenth arriving quietly. It does not permit a new
   * destination to evict an existing one as an implementation shortcut.
   */
  it("목적지는 아홉을 넘지 않는다 — 열째는 별도 결정을 요구한다", () => {
    expect(
      DESTINATION_IDS.length,
      `레일 목적지가 ${DESTINATION_IDS.length}개다 — ` +
        `열째를 넣으려면 별도 결정을 남기고 이 상한을 같이 고쳐라`,
    ).toBeLessThanOrEqual(9);
  });

  it("상한이 헐겁지 않다 — 여유를 무료로 두지 않는다", () => {
    /*
     * The same grammar the system seat used on other ratchets: a ceiling with the
     * measurement far below it turns that slack into a free pass for whatever arrives
     * next. Nine exist today — the seven the owner required to remain, MCP from the
     * 2026-09-05 split, and the Library, which the 2026-09-06 record moved out of Docs
     * after the owner read that screen as cluttered.
     */
    expect(
      DESTINATION_IDS.length,
      "목적지가 줄었다 — 자료실 추가가 기존 목적지를 제거하면 안 된다",
    ).toBe(9);
  });

  /**
   * **The pitch is part of the cap, so it is asserted with it.**
   *
   * Nine tiles fit only because the button's padding fell from `py-1.5` to `py-1`.
   * Putting the padding back without touching this file would silently return the
   * stack to 12–586 of a 616px pane and leave 30px — a rail one translation away from
   * scrolling, with nothing red to say so.
   */
  it("아홉이 들어가게 한 타일 여백이 그대로다", () => {
    const rail = read("src/widgets/app-nav-rail/ui/AppNavRail.tsx");
    const block = rail.slice(rail.indexOf('shape: "card", className: "group relative w-full'));
    expect(block.slice(0, 200), "목적지 타일 버튼의 세로 여백이 py-1 이 아니다").toContain(
      "px-0 py-1 ",
    );
  });

  it("레일이 넘칠 때 스크롤할 수 있다 — 상한만으로는 배율을 못 막는다", () => {
    /*
     * The ceiling of seven only protects the nominal height of the default minimum
     * window; it guarantees nothing under zoom, longer translations, or a smaller
     * effective viewport. Without `overflow` handling there, the lower destinations and
     * the utility layer are **clipped and unreachable** — the same defect the responsive
     * seat measured as "the gear is lost at 200% zoom".
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
