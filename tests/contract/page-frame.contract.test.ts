import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PAGE_FRAME,
  PAGE_HEADER_ROW,
  PAGE_TITLE_ROW,
  PAGE_COLUMN_FORM,
  PAGE_FRAME_FORM,
  PAGE_TOP_PAD,
} from "@/shared/ui/page-frame";

/**
 * **The page frame is defined in one place.**
 *
 * **What happened** (2026-08-09, owner):
 *
 * > *"Insights, projects, and skills should all have the same top spacing — isn't
 * > there a design system? why are they all different?"*
 * > (insights, projects, and skills should all have the same top spacing — isn't
 * > there a design system? why are they all different?)
 *
 * Measured: **32 / 48 / 20px** to the title. And the top was not the only axis out
 * of step — the horizontal insets (40/40/32) and max widths
 * (1600/1600/**1400**) differed across the three as well, and the same 1600 was
 * written in **two places**, a CSS token (`--page-max`) and a JS constant
 * (`PAGE_MAX_WIDTH`).
 *
 * **Why e2e alone is not enough.** `page-frame.spec.ts` measures **whether the three
 * agree with each other**, so it catches one screen leaving the frame (probe: setting
 * skills back to 20px turns it red) but **passes when the shared value is changed
 * wholesale, because the three still agree** (probe: 48→32 stays green).
 *
 * That hole is closed here by pinning the spec strings themselves as a ledger. The
 * values can change freely, but **this file must change with them, so the judgement
 * lands in the diff** (the same method the map panel ink ledger uses).
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/** Screens wearing this frame — an `mx-auto` document column in the shell's scroll slot with an `h1` as the first content. */
/**
 * Screens using the form/edit column (2026-08-11) — **the same top spacing as the
 * list screens, only narrower**.
 */
const FORM_MEMBERS = ["src/views/project-editor/ui/ProjectEditorPage.tsx"] as const;

/** Screens that must own their horizontal inset (safe-area) — only the top spacing follows the spec. */
const TOP_PAD_MEMBERS = ["src/views/project-detail/ui/ProjectDetailPage.tsx"] as const;

const MEMBERS = [
  "src/views/project-selector/ui/ProjectSelectorPage.tsx",
  "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
  "src/views/agents/ui/AgentsPage.tsx",
  // MCP joined the family on 2026-09-05. A member missing from this list is a screen free to
  // eyeball the frame again, which is the whole defect this file exists for.
  "src/views/mcp/ui/McpPage.tsx",
] as const;

const read = (relative: string) => readFileSync(join(REPO_ROOT, relative), "utf8");

describe("페이지 틀 규격", () => {
  it("값이 장부와 같다 — 바꾸려면 이 줄도 같이 고쳐라", () => {
    expect(PAGE_FRAME).toBe(
      "mx-auto w-full max-w-[var(--page-max)] px-5 pt-6 md:px-10 md:pt-12 lg:pb-[var(--page-bottom-breath)]",
    );
    expect(PAGE_HEADER_ROW).toBe("flex flex-wrap items-start justify-between gap-x-4 gap-y-2");
    expect(PAGE_TITLE_ROW).toBe("flex flex-wrap items-baseline gap-x-3 gap-y-1");
  });

  it("최대 폭은 실재하는 토큰을 가리킨다 — 두 곳에 적지 않는다", () => {
    expect(PAGE_FRAME).toContain("max-w-[var(--page-max)]");
    const css = read("app/globals.css");
    expect(css, "`--page-max` 가 정의돼 있지 않다 — 틀이 없는 값을 가리킨다").toMatch(
      /--page-max:\s*\S+/,
    );
  });

  /**
   * **The title's y must not be pushed around by the controls on the right.**
   *
   * The first spec made the whole header `items-end`, which lets the tallest thing on
   * the row decide the title's y — measured at 1280px: projects 56 (button 36),
   * insights 48 (no button), skills 52 (button 32). That was the real reason the three
   * differed while wearing the same frame.
   */
  it("헤더는 위를 맞추고, 바닥선 정렬은 제목 블록 안으로 내린다", () => {
    expect(PAGE_HEADER_ROW).toContain("items-start");
    expect(PAGE_HEADER_ROW).not.toContain("items-end");
    expect(PAGE_TITLE_ROW).toContain("items-baseline");
  });

  /**
   * **The bottom belongs to the frame at `lg`, and to the page below it** (2026-09-05).
   *
   * The frame owned three of four dimensions and left the bottom to each screen, so the four
   * members answered it four ways: `lg:pb-[var(--page-bottom-breath)]`, a literal `md:pb-10`, and
   * **nothing at all** on two of them. With a folder open, `/mcp` is several screens tall and its
   * last card sat flush against the bottom edge of the installed app's window.
   *
   * ⚠️ **Why a class assertion and not only the rendered gate.** `scroll-end-gap.spec.ts` measures
   * the pixels, and it did not catch this — not through a defect of its own, but because it opens
   * every route **with no folder**, and in that state these two are shorter than the viewport, so
   * its measurement is skipped before it begins. A gate that cannot reach the state cannot judge
   * it. The pixel layer stays; this is the prescription layer beside it, the same pairing the
   * frame file's own header describes.
   *
   * Below `lg` the reservation is a **different quantity** (the bottom tab bar stands there and
   * how much to reserve depends on the surface), so the frame deliberately says nothing there and
   * the page keeps paying that half.
   */
  it("바닥 여백은 lg 에서 틀이 낸다 — 화면마다 다시 정하지 않는다", () => {
    expect(PAGE_FRAME, "틀이 lg 바닥 여백을 안 낸다").toContain(
      "lg:pb-[var(--page-bottom-breath)]",
    );
    const css = read("app/globals.css");
    expect(css, "`--page-bottom-breath` 가 정의돼 있지 않다 — 없는 값을 가리킨다").toMatch(
      /--page-bottom-breath:\s*\S+/,
    );
    // Below `lg` the frame stays silent: a plain `pb-*` here would fight the per-surface tab-bar
    // reserve, which is the half that genuinely differs per screen.
    expect(PAGE_FRAME, "틀이 lg 아래 바닥까지 정하면 화면별 탭바 예약과 싸운다").not.toMatch(
      /(^|\s)pb-/,
    );
  });

  it("멤버가 lg 바닥 여백을 두 번째로 다시 적지 않는다", () => {
    for (const member of MEMBERS) {
      const source = read(member);
      expect(
        source,
        `${member} 가 lg 바닥 여백을 다시 적는다 — 값이 두 곳에 있으면 그날부터 갈라진다`,
      ).not.toContain("lg:pb-[var(--page-bottom-breath)]");
    }
  });

  it("멤버 세 화면이 전부 이 틀을 입는다", () => {
    expect(MEMBERS.length, "멤버가 비면 이 시험 전체가 공회전한다").toBeGreaterThan(2);
    for (const member of MEMBERS) {
      const source = read(member);
      expect(source, `${member} 가 PAGE_FRAME 을 안 쓴다`).toContain("PAGE_FRAME");
      expect(source, `${member} 가 PAGE_HEADER_ROW 를 안 쓴다`).toContain("PAGE_HEADER_ROW");
      expect(source, `${member} 가 PAGE_TITLE_ROW 를 안 쓴다`).toContain("PAGE_TITLE_ROW");
    }
  });

  /**
   * Stops a local width constant reappearing — that is how this defect started
   * (`PAGE_MAX_WIDTH = 1600` living alongside `--page-max`).
   */
  it("멤버 안에 폭을 다시 정하는 값이 없다", () => {
    for (const member of MEMBERS) {
      const source = read(member);
      expect(source, `${member} 에 지역 폭 상수가 있다`).not.toMatch(/PAGE_MAX_WIDTH/);
      // ⚠️ A **measure width** such as `max-w-[720px]` is legitimate — the project
      // description paragraph uses one. What is blocked is **rebuilding the page column by
      // hand**, so it is caught only when `mx-auto` and a literal max width appear **in the
      // same class string**. Cast wider and legitimate measure widths get caught, and then
      // the next person deletes the gate instead.
      const columnLike = [...source.matchAll(/className=\{?["`][^"`]*["`]/g)]
        .map((hit) => hit[0])
        .filter((chunk) => chunk.includes("mx-auto") && /max-w-\[\d+px\]/.test(chunk));
      expect(columnLike, `${member} 가 페이지 컬럼을 손으로 다시 만들었다`).toEqual([]);
    }
  });
});

describe("페이지 틀 — 둘째 컬럼과 상단 여백 (2026-08-11)", () => {
  /**
   * ⚠️ **This property is the whole of this extension.** Forcing 1600 onto form
   * screens was not the answer (longer input lines are worse to read and to fill in).
   * So the widths stay separate and only **the top spacing is bound together** — titles
   * jumping vertically when moving between routes is why this spec exists at all, and a
   * different width is no reason for a different title height.
   */
  it("세 상수의 상단 여백이 같다 — 폭이 달라도 제목 y 는 같다", () => {
    const topPad = (spec: string) => spec.match(/\bpt-\S+|\bmd:pt-\S+/g)?.sort().join(" ") ?? "";
    expect(topPad(PAGE_FRAME)).toBe(topPad(PAGE_FRAME_FORM));
    expect(topPad(PAGE_FRAME)).toBe(topPad(`x ${PAGE_TOP_PAD}`));
    expect(topPad(PAGE_FRAME), "상단 여백을 못 읽었다 — 이 시험이 공회전한다").not.toBe("");
  });

  /**
   * **960 is written once, and both constants read the same one** (PO council, 2026-09-05).
   *
   * `PAGE_COLUMN_FORM` arrived carrying its own `max-w-[960px]`, which is the second copy this
   * file's header promises there will not be ("this file is the single definition site so no
   * screen restates 960"). The two are bound rather than merged, because they are different
   * roles — one is the page column, the other the column of rows inside a page-width card — and
   * merging them would be the drift in the other direction. Binding them means a re-decided 960
   * cannot move on one and stay on the other.
   */
  it("폼 폭 960 은 한 번만 정해진다 — 두 상수가 같은 값을 본다", () => {
    const width = (spec: string) => spec.match(/max-w-\[\d+px\]/)?.[0] ?? "";
    expect(width(PAGE_FRAME_FORM), "폼 프레임에서 폭을 못 읽었다 — 이 시험이 공회전한다").not.toBe(
      "",
    );
    expect(width(PAGE_COLUMN_FORM), "행 컬럼에서 폭을 못 읽었다").toBe(width(PAGE_FRAME_FORM));
  });

  it("폼 컬럼은 좁고, 폭을 한 곳에서만 정한다", () => {
    expect(PAGE_FRAME_FORM).toContain("max-w-[960px]");
    expect(PAGE_FRAME_FORM).not.toContain("--page-max");
    for (const member of FORM_MEMBERS) {
      const source = read(member);
      expect(source, `${member} 가 PAGE_FRAME_FORM 을 안 쓴다`).toContain("PAGE_FRAME_FORM");
      expect(source, `${member} 가 폭을 다시 적었다`).not.toMatch(/max-w-\[9[0-9]{2}px\]/);
    }
  });

  it("safe-area 화면도 상단은 규격을 따른다 — 여기만 8px 아래였다", () => {
    expect(TOP_PAD_MEMBERS.length, "멤버가 비면 공회전이다").toBeGreaterThan(0);
    for (const member of TOP_PAD_MEMBERS) {
      const source = read(member).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(source, `${member} 가 아직 md:pt-14 다 — 제목이 8px 아래 있다`).not.toMatch(/md:pt-14\b/);
      expect(source, `${member} 의 md 상단이 규격(48px)이 아니다`).toMatch(/md:pt-12\b/);
    }
  });
});

describe("읽기 컬럼은 문서함이 소유한다 (2026-08-11 판정)", () => {
  /**
   * What this test locks is **the character of the width, not its value**: the docs
   * body must be a measure width (a named conventional value), not a hand-written px.
   * Changing the value is a design decision and is not blocked — what is blocked is
   * **leaking outside the spec**.
   */
  const DOCS_PAGE = "src/views/docs-vault/ui/DocsVaultPage.tsx";

  it("문서함 본문은 이름 있는 읽기 폭을 쓴다", () => {
    const source = read(DOCS_PAGE).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(source, `${DOCS_PAGE} 가 읽기 폭을 안 쓴다`).toMatch(/max-w-(?:2xl|3xl|4xl|prose)/);
  });

  it("문서함이 페이지 틀을 입지 않는다 — 세 칸 작업대라 상단 48px 이 틀리다", () => {
    const source = read(DOCS_PAGE);
    expect(source, `${DOCS_PAGE} 가 PAGE_FRAME 을 입었다 — 트리와 본문이 같은 높이에서 시작해야 한다`).not.toContain(
      "PAGE_FRAME",
    );
  });

  it("판정이 규격 파일에 적혀 있다 — 다음 감사가 다시 논쟁하지 않게", () => {
    const spec = read("src/shared/ui/page-frame.ts");
    expect(spec, "읽기 컬럼 판정이 규격에 없다").toContain("max-w-3xl");
    // Who owns each column is the durable half of the record — the table names the
    // two frame constants and hands the reading column to docs itself.
    expect(spec, "컬럼 소유자 표가 규격에 없다").toContain("PAGE_FRAME_FORM");
  });
});
