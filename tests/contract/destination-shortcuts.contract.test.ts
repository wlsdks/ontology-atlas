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
   * **Seven is the ceiling** (owner decision, 2026-08-21).
   *
   * At the minimum window (`minHeight: 720`) the rail stacks logo + destination tiles
   * + the utility layer vertically. Measured at the workbench seat: an eighth tile
   * fits with **8px** to spare above the utility layer. Above 2400px wide the UI scale
   * rises to 1.1, so eight require **761px** and exceed that minimum window by 41px —
   * which is why scroll handling lands in the rail together with this ceiling.
   *
   * What this check blocks is an eighth arriving quietly. Needing eight means
   * **naming what to remove first** — the path the owner chose (the alternative,
   * raising the minimum window height to 780, was rejected).
   */
  it("목적지는 여섯을 넘지 않는다 — 일곱째는 무엇을 뺄지 먼저 정한다", () => {
    expect(
      DESTINATION_IDS.length,
      `레일 목적지가 ${DESTINATION_IDS.length}개다 — ` +
        `일곱째를 넣으려면 무엇을 뺄지 먼저 정하고 이 상한을 같이 고쳐라`,
    ).toBeLessThanOrEqual(6);
  });

  it("상한이 헐겁지 않다 — 여유를 무료로 두지 않는다", () => {
    /*
     * The same grammar the 체계 seat used on other ratchets: a ceiling with the
     * measurement far below it turns that slack into a free pass for whatever arrives
     * next. Seven exist today, so the floor is six.
     */
    expect(
      DESTINATION_IDS.length,
      "목적지가 줄었다 — 위 상한도 같이 내려라",
    ).toBe(6);
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
