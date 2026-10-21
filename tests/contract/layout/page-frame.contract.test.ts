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
import { PAGE_HEADER_FRAMES } from "@/shared/ui/layout/page-header-bar";
import { readGlobalCss } from '../../../scripts/lib/design/global-css.mjs';
import { blankComments } from '../../../scripts/quality/source-language/inventory.mjs';

/**
 * The page frame is defined in one place. The e2e spec only checks that screens agree with each other,
 * so a wholesale change passes; pinning the spec strings here forces the judgement into the diff.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");

/** Screens wearing this frame — an `mx-auto` document column in the shell's scroll slot with an `h1` as the first content. */
/** Screens using the form/edit column: the same top spacing as the list screens, only narrower. */
const FORM_MEMBERS = [
  "src/views/project-editor/ui/ProjectEditorPage.tsx",
  // Rows read worse the wider they run.
  "src/views/agents/ui/AgentsPage.tsx",
  "src/views/automations/ui/AutomationsPage.tsx",
] as const;

/** Screens that must own their horizontal inset (safe-area) — only the top spacing follows the spec. */
const TOP_PAD_MEMBERS = ["src/views/project-detail/ui/ProjectDetailPage.tsx"] as const;

const MEMBERS = [
  "src/views/project-selector/ui/ProjectSelectorPage.tsx",
  "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
] as const;

const read = (relative: string) => readFileSync(join(REPO_ROOT, relative), "utf8");

describe("page frame spec", () => {
  it("the values equal the ledger — to change them, fix this line too", () => {
    expect(PAGE_FRAME).toBe(
      "mx-auto w-full max-w-[var(--page-max)] px-5 pt-6 md:px-10 md:pt-12 lg:pb-[var(--page-bottom-breath)]",
    );
    expect(PAGE_HEADER_ROW).toBe("flex flex-wrap items-start justify-between gap-x-4 gap-y-2");
    expect(PAGE_TITLE_ROW).toBe("flex flex-wrap items-baseline gap-x-3 gap-y-1");
  });

  it("the max width points at an existing token — it is not written in two places", () => {
    expect(PAGE_FRAME).toContain("max-w-[var(--page-max)]");
    const css = readGlobalCss();
    expect(css, "`--page-max` is not defined — the frame points at a missing value").toMatch(
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
  it("the header aligns the top, and baseline alignment moves down into the title block", () => {
    expect(PAGE_HEADER_ROW).toContain("items-start");
    expect(PAGE_HEADER_ROW).not.toContain("items-end");
    expect(PAGE_TITLE_ROW).toContain("items-baseline");
  });

  /**
   * The frame owns the bottom at `lg`; below it the tab bar reservation is a different quantity, so the
   * page pays it. `scroll-end-gap.spec.ts` opens routes with no folder, where these pages are shorter
   * than the viewport and its measurement is skipped, so a class assertion is needed.
   */
  it("the bottom margin at lg comes from the frame — screens do not decide it again", () => {
    expect(PAGE_FRAME, "the frame does not emit the lg bottom margin").toContain(
      "lg:pb-[var(--page-bottom-breath)]",
    );
    const css = readGlobalCss();
    expect(css, "`--page-bottom-breath` is not defined — it points at a missing value").toMatch(
      /--page-bottom-breath:\s*\S+/,
    );
    // Below `lg` the frame stays silent: a plain `pb-*` here would fight the per-surface tab-bar
    // reserve, which is the half that genuinely differs per screen.
    expect(PAGE_FRAME, "if the frame also fixes the bottom below lg it fights each screen's tab bar reservation").not.toMatch(
      /(^|\s)pb-/,
    );
  });

  /**
   * The form column carries the desktop bottom breath itself, so it has one definition site and a
   * member that restates it is caught below.
   */
  it("the form frame emits the lg bottom margin itself", () => {
    expect(PAGE_FRAME_FORM).toContain("lg:pb-[var(--page-bottom-breath)]");
  });

  it("members do not write the lg bottom margin a second time", () => {
    for (const member of [...MEMBERS, ...FORM_MEMBERS]) {
      const source = read(member);
      expect(
        source,
        `${member} writes the lg bottom margin again — with the value in two places they diverge from that day`,
      ).not.toContain("lg:pb-[var(--page-bottom-breath)]");
    }
  });

  it("every member screen wears this frame", () => {
    // The floor exists so an empty list cannot pass as a green run; it is not a claim about how many
    // screens the wide frame deserves.
    expect(MEMBERS.length, "with no members this whole test idles").toBeGreaterThan(1);
    for (const member of MEMBERS) {
      const source = read(member);
      expect(source, `${member} does not use PAGE_FRAME`).toContain("PAGE_FRAME");
      if (/<PageHeaderBar\b/.test(source)) continue;
      expect(source, `${member} does not use PAGE_HEADER_ROW`).toContain("PAGE_HEADER_ROW");
      expect(source, `${member} does not use PAGE_TITLE_ROW`).toContain("PAGE_TITLE_ROW");
    }
  });

  /**
   * Stops a local width constant reappearing — that is how this defect started
   * (`PAGE_MAX_WIDTH = 1600` living alongside `--page-max`).
   */
  it("no member re-decides the width", () => {
    for (const member of MEMBERS) {
      const source = read(member);
      expect(source, `${member} has a local width constant`).not.toMatch(/PAGE_MAX_WIDTH/);
      // ⚠️ A **measure width** such as `max-w-[720px]` is legitimate — the project
      // description paragraph uses one. What is blocked is **rebuilding the page column by
      // hand**, so it is caught only when `mx-auto` and a literal max width appear **in the
      // same class string**. Cast wider and legitimate measure widths get caught, and then
      // the next person deletes the gate instead.
      const columnLike = [...source.matchAll(/className=\{?["`][^"`]*["`]/g)]
        .map((hit) => hit[0])
        .filter((chunk) => chunk.includes("mx-auto") && /max-w-\[\d+px\]/.test(chunk));
      expect(columnLike, `${member} rebuilt the page column by hand`).toEqual([]);
    }
  });
});

describe("page frame — second column and top margin (2026-08-11)", () => {
  /**
   * ⚠️ **This property is the whole of this extension.** Forcing 1600 onto form
   * screens was not the answer (longer input lines are worse to read and to fill in).
   * So the widths stay separate and only **the top spacing is bound together** — titles
   * jumping vertically when moving between routes is why this spec exists at all, and a
   * different width is no reason for a different title height.
   */
  it("the three constants share the same top margin — the title y is the same whatever the width", () => {
    const topPad = (spec: string) => spec.match(/\bpt-\S+|\bmd:pt-\S+/g)?.sort().join(" ") ?? "";
    expect(topPad(PAGE_FRAME)).toBe(topPad(PAGE_FRAME_FORM));
    expect(topPad(PAGE_FRAME)).toBe(topPad(`x ${PAGE_TOP_PAD}`));
    expect(topPad(PAGE_FRAME), "could not read the top margin — this test idles").not.toBe("");
  });

  /**
   * 960 is written once and both constants read the same value. They are bound rather than merged
   * because they are different roles (page column vs. row column inside a card).
   */
  it("the form width 960 is decided once — both constants see the same value", () => {
    const width = (spec: string) => spec.match(/max-w-\[\d+px\]/)?.[0] ?? "";
    expect(width(PAGE_FRAME_FORM), "could not read the width from the form frame — this test idles").not.toBe(
      "",
    );
    expect(width(PAGE_COLUMN_FORM), "could not read the width from the row column").toBe(width(PAGE_FRAME_FORM));
  });

  it("the header bar pays the page frame's width and inset as its gutter, so they cannot drift apart", () => {
    const gutter = (width: string, inset: string) =>
      `px-5 md:px-[max(${inset},calc((100%_-_${width})/2_+_${inset}))]`;
    const widthOf = (spec: string) => spec.match(/max-w-\[([^\]]+)\]/)?.[1] ?? "";
    const insetOf = (spec: string) => `${Number(spec.match(/md:px-(\d+)/)?.[1]) / 4}rem`;
    for (const [frame, spec] of [["page", PAGE_FRAME]] as const) {
      expect(widthOf(spec), `could not read the ${frame} frame width — this test idles`).not.toBe("");
      expect(PAGE_HEADER_FRAMES[frame], `the bar's ${frame} gutter no longer matches the body frame`).toBe(
        gutter(widthOf(spec), insetOf(spec)),
      );
    }
  });

  it("the form column is narrow and decides the width in one place only", () => {
    expect(PAGE_FRAME_FORM).toContain("max-w-[960px]");
    expect(PAGE_FRAME_FORM).not.toContain("--page-max");
    // The floor exists so an empty list cannot pass as a green run.
    expect(FORM_MEMBERS.length, "with no form members this idles").toBeGreaterThan(0);
    for (const member of FORM_MEMBERS) {
      const source = read(member);
      expect(source, `${member} does not use PAGE_FRAME_FORM`).toContain("PAGE_FRAME_FORM");
      // The 1600 column is the thing they left; wearing both is how a screen ends up in neither.
      expect(source, `${member} also wears the wide frame`).not.toMatch(/PAGE_FRAME(?!_FORM)/);
      expect(source, `${member} wrote the width again`).not.toMatch(/max-w-\[9[0-9]{2}px\]/);
    }
  });

  it("safe-area screens also follow the spec at the top — only here it was 8px lower", () => {
    expect(TOP_PAD_MEMBERS.length, "with no members this idles").toBeGreaterThan(0);
    for (const member of TOP_PAD_MEMBERS) {
      const source = read(member).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(source, `${member} is still md:pt-14 — the title sits 8px low`).not.toMatch(/md:pt-14\b/);
      expect(source, `the md top of ${member} is not the spec (48px)`).toMatch(/md:pt-12\b/);
    }
  });
});

describe("the reading column is owned by the document library (ruling of 2026-08-11)", () => {
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

  it("the document library does not wear the page frame — it is a three-pane workbench so a 48px top is wrong", () => {
    const rendered = [
      DOCS_PAGE,
      ...readdirSync("src/views/docs-vault/ui")
        .filter((name) => /^DocsVault\w+\.tsx$/.test(name) && !name.includes(".test."))
        .map((name) => `src/views/docs-vault/ui/${name}`),
    ];
    for (const file of new Set(rendered)) {
      expect(read(file), `${file} wore PAGE_FRAME — the tree and the body must start at the same height`).not.toContain(
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
  "src/views/project-detail/ui/ProjectDetailPage.tsx",
  "src/views/project-editor/ui/ProjectEditorPage.tsx",
  "src/widgets/atlas-git-panel/ui/SetupMode.tsx",
  "src/views/library/ui/parts/first-run/LibraryStartStage.tsx",
  "src/views/library/ui/LibraryRounds.tsx",
  "src/views/library/ui/LibraryConstellations.tsx",
  "src/views/library/ui/library-page/LibraryNoFolderStage.tsx",
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

  it("the page header bar's title wears PAGE_TITLE, so a page using it needs no h1 of its own", () => {
    const bar = blankComments("bar", read("src/shared/ui/layout/page-header-bar.tsx"));
    expect(bar).toContain("PAGE_TITLE");
    expect(bar).not.toMatch(/(?:^|[\s"'`])(?:text-(?:caption|label|body|body-lg|title|display|hero)|leading-[a-z-]+|tracking-)/);
  });

  it("a page that migrated onto the bar carries no raw h1 unless it wears PAGE_TITLE", () => {
    for (const member of [
      "src/views/agents/ui/AgentsPage.tsx",
      "src/views/automations/ui/AutomationsPage.tsx",
      "src/views/architecture/ui/HarnessPage.tsx",
      "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
      "src/views/ontology-insights/ui/InsightsLoadingView.tsx",
      "src/app/library-workspace/index.tsx",
      "src/views/project-selector/ui/ProjectSelectorPage.tsx",
      "src/widgets/atlas-git-panel/ui/AtlasGitPanel.tsx",
    ]) {
      const source = blankComments(member, read(member));
      expect(source, `${member} no longer uses the header bar`).toMatch(/<PageHeaderBar\b/);
      for (const tag of headingTags(source)) {
        expect(tag, `${member}: a raw h1 beside the bar must wear PAGE_TITLE`).toContain("PAGE_TITLE");
      }
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

describe("a wait under the header bar", () => {
  it("a wait under the header bar centres on the slot", () => {
    const members = [
      "src/views/automations/ui/AutomationsPage.tsx",
      "src/widgets/atlas-git-panel/ui/AtlasGitPanel.tsx",
      "src/views/project-selector/ui/ProjectSelectorPage.tsx",
      "src/views/ontology-insights/ui/InsightsLoadingView.tsx",
      "src/views/architecture/ui/HarnessScanProgressPanel.tsx",
    ];
    for (const member of members) {
      const source = blankComments(member, read(member));
      const tags = [...source.matchAll(/<WaitStage\b/g)].map((hit) => openingTagAt(source, hit.index!));
      expect(tags.length, `${member} has no WaitStage to judge`).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag, `${member}: a WaitStage under the bar lacks PAGE_WAIT_LIFT`).toContain("PAGE_WAIT_LIFT");
      }
    }
  });
});
