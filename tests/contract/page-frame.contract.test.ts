import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  PAGE_FRAME,
  PAGE_HEADER_ROW,
  PAGE_LEDE,
  PAGE_TITLE,
  PAGE_TITLE_ROW,
  PAGE_COLUMN_FORM,
  PAGE_FRAME_FORM,
  PAGE_TOP_PAD,
} from "@/shared/ui/tokens/page-frame";
import * as pageFrame from "@/shared/ui/tokens/page-frame";
import { readGlobalCss } from '../../scripts/lib/global-css.mjs';
import { blankComments } from '../../scripts/quality/source-language/inventory.mjs';

/**
 * The page frame is defined in one place. The e2e spec only checks that screens agree with each other,
 * so a wholesale change passes; pinning the spec strings here forces the judgement into the diff.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/** Screens wearing this frame — an `mx-auto` document column in the shell's scroll slot with an `h1` as the first content. */
/** Screens using the form/edit column: the same top spacing as the list screens, only narrower. */
const FORM_MEMBERS = [
  "src/views/project-editor/ui/ProjectEditorPage.tsx",
  /*
   * Agents and MCP are text-and-settings screens: a row read across gets worse the wider it is, so they
   * use the 960 centred column. The frame file records the rule so the next screen decides by it.
   */
  // `McpPage` is not listed: it is the Agents page's second tab body, drawn inside that page's frame.
  "src/views/agents/ui/AgentsPage.tsx",
] as const;

/** Screens that must own their horizontal inset (safe-area) — only the top spacing follows the spec. */
const TOP_PAD_MEMBERS = ["src/views/project-detail/ui/ProjectDetailPage.tsx"] as const;

const MEMBERS = [
  "src/views/project-selector/ui/ProjectSelectorPage.tsx",
  "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
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
    const css = readGlobalCss();
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
   * The frame owns the bottom at `lg`; below it the tab bar reservation is a different quantity, so the
   * page pays it. `scroll-end-gap.spec.ts` opens routes with no folder, where these pages are shorter
   * than the viewport and its measurement is skipped, so a class assertion is needed.
   */
  it("바닥 여백은 lg 에서 틀이 낸다 — 화면마다 다시 정하지 않는다", () => {
    expect(PAGE_FRAME, "틀이 lg 바닥 여백을 안 낸다").toContain(
      "lg:pb-[var(--page-bottom-breath)]",
    );
    const css = readGlobalCss();
    expect(css, "`--page-bottom-breath` 가 정의돼 있지 않다 — 없는 값을 가리킨다").toMatch(
      /--page-bottom-breath:\s*\S+/,
    );
    // Below `lg` the frame stays silent: a plain `pb-*` here would fight the per-surface tab-bar
    // reserve, which is the half that genuinely differs per screen.
    expect(PAGE_FRAME, "틀이 lg 아래 바닥까지 정하면 화면별 탭바 예약과 싸운다").not.toMatch(
      /(^|\s)pb-/,
    );
  });

  /**
   * The form column carries the desktop bottom breath itself, so it has one definition site and a
   * member that restates it is caught below.
   */
  it("폼 틀이 lg 바닥 여백을 스스로 낸다", () => {
    expect(PAGE_FRAME_FORM).toContain("lg:pb-[var(--page-bottom-breath)]");
  });

  it("멤버가 lg 바닥 여백을 두 번째로 다시 적지 않는다", () => {
    for (const member of [...MEMBERS, ...FORM_MEMBERS]) {
      const source = read(member);
      expect(
        source,
        `${member} 가 lg 바닥 여백을 다시 적는다 — 값이 두 곳에 있으면 그날부터 갈라진다`,
      ).not.toContain("lg:pb-[var(--page-bottom-breath)]");
    }
  });

  it("멤버 세 화면이 전부 이 틀을 입는다", () => {
    // The floor exists so an empty list cannot pass as a green run; it is not a claim about how many
    // screens the wide frame deserves.
    expect(MEMBERS.length, "멤버가 비면 이 시험 전체가 공회전한다").toBeGreaterThan(1);
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
   * 960 is written once and both constants read the same value. They are bound rather than merged
   * because they are different roles (page column vs. row column inside a card).
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
    // The floor exists so an empty list cannot pass as a green run.
    expect(FORM_MEMBERS.length, "폼 멤버가 비면 공회전이다").toBeGreaterThanOrEqual(2);
    for (const member of FORM_MEMBERS) {
      const source = read(member);
      expect(source, `${member} 가 PAGE_FRAME_FORM 을 안 쓴다`).toContain("PAGE_FRAME_FORM");
      // The 1600 column is the thing they left; wearing both is how a screen ends up in neither.
      expect(source, `${member} 가 넓은 틀도 같이 입었다`).not.toMatch(/PAGE_FRAME(?!_FORM)/);
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
  const DOCS_BODY = "src/widgets/docs-vault/ui/DocsVaultViewer.tsx";

  it("the docs body wears the named reading column", () => {
    expect(blankComments(DOCS_BODY, read(DOCS_BODY)), `${DOCS_BODY} no longer sizes its body with --measure-doc-column`).toContain(
      "max-w-[var(--measure-doc-column)]",
    );
  });

  it("문서함이 페이지 틀을 입지 않는다 — 세 칸 작업대라 상단 48px 이 틀리다", () => {
    const rendered = [
      DOCS_PAGE,
      ...readdirSync("src/views/docs-vault/ui")
        .filter((name) => /^DocsVault\w+\.tsx$/.test(name) && !name.includes(".test."))
        .map((name) => `src/views/docs-vault/ui/${name}`),
    ];
    for (const file of new Set(rendered)) {
      expect(read(file), `${file} 가 PAGE_FRAME 을 입었다 — 트리와 본문이 같은 높이에서 시작해야 한다`).not.toContain(
        "PAGE_FRAME",
      );
    }
  });

  it("no page-frame constant claims the reading column", () => {
    const frames = Object.entries(pageFrame).filter(([, value]) => typeof value === "string");
    expect(frames.length, "no frame constants were read").toBeGreaterThan(3);
    for (const [name, value] of frames) {
      expect(value, `${name} claims the docs reading column`).not.toContain("--measure-doc-column");
    }
  });
});

const TITLE_MEMBERS = [
  "src/views/agents/ui/AgentsPage.tsx",
  "src/views/automations/ui/AutomationsPage.tsx",
  "src/views/architecture/ui/HarnessPage.tsx",
  "src/views/project-detail/ui/ProjectDetailPage.tsx",
  "src/views/project-editor/ui/ProjectEditorPage.tsx",
  "src/views/project-selector/ui/ProjectSelectorPage.tsx",
  "src/widgets/atlas-git-panel/ui/SetupMode.tsx",
  "src/views/library/ui/parts/LibraryStartStage.tsx",
  "src/views/library/ui/LibraryRounds.tsx",
  "src/views/library/ui/LibraryConstellations.tsx",
  "src/views/library/ui/library-page/LibraryNoFolderStage.tsx",
  "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
  "src/views/ontology-insights/ui/InsightsLoadingView.tsx",
] as const;

function openingTagAt(source: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== "\\") quote = null;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (c === ">" && depth === 0) return source.slice(from, i);
  }
  return source.slice(from);
}

function headingTags(source: string): string[] {
  const tags = [...source.matchAll(/<h1\b/g)].map((hit) => openingTagAt(source, hit.index!));
  for (const hit of source.matchAll(/\bas="h1"/g)) {
    tags.push(openingTagAt(source, source.lastIndexOf("<", hit.index!)));
  }
  return tags;
}

const typeStep = (spec: string) => spec.match(/(?:^|\s)text-(caption|label|body-lg|body|title|display|hero)(?=\s|$)/)?.[1];
const leadingStep = (spec: string) => spec.match(/(?:^|\s)leading-([a-z-]+)(?=\s|$)/)?.[1];

describe("page title and lede", () => {
  it("the title and lede constants match the ledger", () => {
    expect(PAGE_TITLE).toBe(
      "text-display leading-display font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]",
    );
    expect(PAGE_LEDE).toBe("text-body-lg leading-body-lg break-keep text-[color:var(--color-text-tertiary)]");
  });

  it("each constant pairs one type step with that step's own leading", () => {
    for (const spec of [PAGE_TITLE, PAGE_LEDE]) {
      const step = typeStep(spec);
      expect(step, `${spec} names no type step`).toBeDefined();
      expect(leadingStep(spec), `${spec} pairs ${step} with another step's leading`).toBe(step);
    }
  });

  it("every page h1 in a member file wears PAGE_TITLE and restates none of it", () => {
    let measured = 0;
    for (const member of TITLE_MEMBERS) {
      const tags = headingTags(blankComments(member, read(member))).filter(
        (tag) => !/className="sr-only"/.test(tag),
      );
      expect(tags.length, `${member} has no h1 to judge`).toBeGreaterThan(0);
      for (const tag of tags) {
        measured += 1;
        expect(tag, `${member}: an h1 does not wear PAGE_TITLE`).toContain("PAGE_TITLE");
        expect(tag, `${member}: an h1 restates a type, leading, weight or tracking value`).not.toMatch(
          /(?:^|[\s"'`])(?:text-(?:caption|label|body|body-lg|title|display|hero)|leading-[a-z-]+|font-\[|tracking-)/,
        );
      }
    }
    expect(measured, "the heading scan read nothing").toBeGreaterThan(TITLE_MEMBERS.length);
  });
});
