import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import ko from "../../../../../messages/ko.json";
import en from "../../../../../messages/en.json";
import {
  WikiTemplateProblems,
  type WikiProblemDoors,
  type WikiProblemFix,
  type WikiTemplateProblem,
} from "./WikiTemplateProblems";

/**
 * **What this panel says about a page must be the same thing the header counts, and it
 * must be addressed to the person reading it.**
 *
 * Measured 2026-09-09 on a four-page folder that fit the template perfectly: the status
 * strip printed no off-template clause, and this panel simultaneously headed every
 * finding *This page does not fit the wiki template*. The findings were folder findings —
 * about how the pages link each other, not about any page's shape — and the heading in
 * the larger type was the wrong one.
 *
 * The second thing measured that day: a Korean reader was handed `dangling-wikilink:15`
 * followed by an English paragraph, because the sentence shipped from the validator,
 * where it is written once for machines.
 *
 * ⚠️ **The third, 2026-09-12** (owner, on a page their agent had just written): *"I
 * cannot tell what this is saying from a person's side — it just looks like alien
 * script."* The codes, the line anchors, the citation grammar and the CLI/tool names were
 * the loudest things on the card. They are all still here — behind one disclosure — and
 * what leads is one sentence per finding plus what to do about it.
 */

/** The panel takes `t` from its parent, so the harness is the only thing that calls the hook. */
function Harness({
  problems,
  doors,
  fix,
  file,
}: {
  problems: WikiTemplateProblem[];
  doors?: WikiProblemDoors;
  fix?: WikiProblemFix | null;
  file?: string;
}) {
  const t = useTranslations("library");
  return (
    <WikiTemplateProblems
      problems={problems}
      doors={doors}
      fix={fix}
      file={file}
      context={{ pageTitle: (slug) => (slug === "wiki/payments-01" ? "Payments, January" : undefined) }}
      t={t}
    />
  );
}

function renderPanel(
  problems: WikiTemplateProblem[],
  locale: "ko" | "en" = "ko",
  extra: { doors?: WikiProblemDoors; fix?: WikiProblemFix | null; file?: string } = {},
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "ko" ? ko : en}>
      <Harness problems={problems} doors={extra.doors} fix={extra.fix} file={extra.file} />
    </NextIntlClientProvider>,
  );
}

const TEMPLATE_PROBLEM: WikiTemplateProblem = {
  code: "missing-field:title",
  message: "`title:` is missing. The page name a person reads.",
  detail: { key: "missing-field", values: { field: "title" } },
};

const LINK_PROBLEM: WikiTemplateProblem = {
  code: "dangling-wikilink",
  message: "`[[wiki/gone]]` names a page that is not in this folder.",
  line: 15,
  detail: { key: "dangling-wikilink", values: { target: "wiki/gone" } },
};

/** The owner's own case: a bullet under `## Facts` with nothing behind it. */
const UNCITED: WikiTemplateProblem = {
  code: "uncited-fact",
  message: "Every bullet under `## Facts` ends in at least one citation.",
  line: 31,
  detail: { key: "uncited-fact" },
};

/** The other folder finding the owner read: two write-ups of one original, unlinked. */
const SHARED_SOURCE: WikiTemplateProblem = {
  code: "shared-source-unlinked",
  message: "`wiki/payments-01.md` also lists `sources/payments-ledger-01.html`.",
  detail: {
    key: "shared-source-unlinked",
    values: { other: "wiki/payments-01.md", sources: "`sources/payments-ledger-01.html`" },
  },
};

describe("WikiTemplateProblems — a folder finding is not an off-template verdict", () => {
  it("a page whose only finding is a link keeps the off-template heading off the screen", () => {
    renderPanel([LINK_PROBLEM]);
    expect(screen.queryByTestId("library-wiki-problems")).toBeNull();
    expect(screen.getByTestId("library-wiki-link-findings")).toBeInTheDocument();
    expect(screen.queryByText(ko.library.wiki.offTemplateBody)).toBeNull();
  });

  it("a page whose only finding is its own shape keeps the link heading off the screen", () => {
    renderPanel([TEMPLATE_PROBLEM]);
    expect(screen.getByTestId("library-wiki-problems")).toBeInTheDocument();
    expect(screen.queryByTestId("library-wiki-link-findings")).toBeNull();
  });

  it("a page carrying both gets both headings, each over its own findings", () => {
    renderPanel([TEMPLATE_PROBLEM, LINK_PROBLEM]);
    const shape = screen.getByTestId("library-wiki-problems");
    const folder = screen.getByTestId("library-wiki-link-findings");
    expect(shape.textContent).toContain("missing-field:title");
    expect(shape.textContent).not.toContain("dangling-wikilink");
    expect(folder.textContent).toContain("dangling-wikilink");
    expect(folder.textContent).not.toContain("missing-field:title");
  });

  it("renders nothing at all when the page is clean", () => {
    const { container } = renderPanel([]);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("WikiTemplateProblems — the card title counts, in words", () => {
  it("says how many there are and what kind they are, without a code", () => {
    renderPanel([UNCITED, LINK_PROBLEM]);
    /*
     * The Korean counter word is not decoration. Two of three walkers (2026-09-12) read
     * the bare digit in the Korean title as an ordinal — *"the title implies a first one
     * exists"* — so the number has to carry a counter and read as a count.
     */
    expect(screen.getByTestId("library-wiki-problems").textContent).toContain("고칠 곳 1개 · 서식");
    expect(screen.getByTestId("library-wiki-link-findings").textContent).toContain("확인할 연결 1개");
  });

  it("counts each card's own findings, not the page's total", () => {
    renderPanel([UNCITED, TEMPLATE_PROBLEM, LINK_PROBLEM]);
    expect(screen.getByTestId("library-wiki-problems").textContent).toContain("고칠 곳 2개");
    expect(screen.getByTestId("library-wiki-link-findings").textContent).toContain("확인할 연결 1개");
  });
});

describe("WikiTemplateProblems — the sentence is in the reader's language", () => {
  it("retells a finding from its detail rather than shipping the validator's English", () => {
    renderPanel([LINK_PROBLEM]);
    const row = screen.getByTestId("library-wiki-problem");
    expect(row.textContent).toContain("이 폴더에 그 문서가 없어요");
    expect(row.textContent).not.toContain("names a page that is not in this folder");
  });

  it("names the link as a page name, not as link syntax", () => {
    renderPanel([LINK_PROBLEM]);
    const row = screen.getByTestId("library-wiki-problem");
    expect(row.textContent).toContain("gone");
    expect(row.textContent).not.toContain("[[");
  });

  /** The owner's own sentence: the place, the problem, and what to do, in that order. */
  it("says where the claim is and what to do about it", () => {
    renderPanel([UNCITED]);
    const row = screen.getByTestId("library-wiki-problem");
    expect(row.textContent).toContain("Facts의 31번째 줄에 근거가 없어요.");
    /*
     * All three walkers asked what "Not in sources" was — a section, a tag, a file?
     * It is a section the template always carries, so the sentence says where it is;
     * translating the heading would send them to a section their file does not have.
     */
    expect(row.textContent).toContain(
      "원문 한 곳을 달거나, 확인할 수 없으면 문서 끝에 있는 Not in sources 구획으로 옮기세요.",
    );
  });

  it("carries no backtick, no finding code and no tool name in the finding itself", () => {
    renderPanel([UNCITED, SHARED_SOURCE, TEMPLATE_PROBLEM]);
    for (const row of screen.getAllByTestId("library-wiki-problem")) {
      const text = row.textContent ?? "";
      expect(text).not.toContain("`");
      expect(text).not.toContain("uncited-fact");
      expect(text).not.toContain("shared-source-unlinked");
      expect(text).not.toContain("wiki-validate");
      expect(text).not.toContain("validate_wiki");
    }
  });

  it("names another page by its title and its original by its file name", () => {
    renderPanel([SHARED_SOURCE]);
    const row = screen.getByTestId("library-wiki-problem");
    expect(row.textContent).toContain("Payments, January");
    expect(row.textContent).toContain("payments-ledger-01.html");
    // Neither an address nor a folder path reaches the sentence.
    expect(row.textContent).not.toContain("wiki/payments-01.md");
    expect(row.textContent).not.toContain("sources/payments-ledger-01.html");
  });

  it("English reads the same finding from the same detail", () => {
    renderPanel([UNCITED], "en");
    const row = screen.getByTestId("library-wiki-problem");
    expect(row.textContent).toContain("line 31 under Facts");
    expect(row.textContent).toContain("move it into the Not in sources section at the end of the page");
  });

  /*
   * A finding the validator grows before this file learns about it must degrade to the
   * English sentence, never to a raw `library.wiki.problem.…` lookup path on screen.
   */
  it("falls back to the validator's message when the finding has no localised retelling", () => {
    renderPanel([
      { code: "future-code", message: "Something new the validator found.", detail: { key: "not-translated-yet" } },
    ]);
    const row = screen.getByTestId("library-wiki-problem");
    expect(row.textContent).toContain("Something new the validator found.");
    expect(row.textContent).not.toContain("wiki.problem");
  });

  it("falls back the same way when a finding carries no detail at all", () => {
    renderPanel([{ code: "legacy", message: "An older finding with no pieces." }]);
    expect(screen.getByTestId("library-wiki-problem").textContent).toContain(
      "An older finding with no pieces.",
    );
  });
});

describe("WikiTemplateProblems — every name in the sentence is a door", () => {
  it("opens the page a finding names", () => {
    const onOpenPage = vi.fn();
    renderPanel([SHARED_SOURCE], "ko", { doors: { onOpenPage } });
    const door = screen
      .getAllByTestId("library-wiki-problem-target")
      .find((node) => node.getAttribute("data-target-kind") === "page")!;
    fireEvent.click(door);
    expect(onOpenPage).toHaveBeenCalledWith("wiki/payments-01");
  });

  it("opens the original a finding names", () => {
    const onOpenSource = vi.fn();
    renderPanel([SHARED_SOURCE], "ko", { doors: { onOpenSource } });
    const door = screen
      .getAllByTestId("library-wiki-problem-target")
      .find((node) => node.getAttribute("data-target-kind") === "source")!;
    fireEvent.click(door);
    expect(onOpenSource).toHaveBeenCalledWith("sources/payments-ledger-01.html");
  });

  it("travels to the section a finding names", () => {
    const onOpenPlace = vi.fn();
    renderPanel([UNCITED], "ko", { doors: { onOpenPlace } });
    fireEvent.click(screen.getByTestId("library-wiki-problem-place"));
    expect(onOpenPlace).toHaveBeenCalledWith(
      expect.objectContaining({ section: "Facts", line: 31 }),
    );
  });

  /*
   * A name with nowhere to go is words. This is the whole degradation story on the web,
   * where there is no absolute path and no local agent — the card still reads correctly.
   */
  it("leaves a name as plain words when this surface cannot open it", () => {
    renderPanel([SHARED_SOURCE]);
    expect(screen.queryByTestId("library-wiki-problem-target")).toBeNull();
    expect(screen.getByTestId("library-wiki-problem").textContent).toContain("Payments, January");
  });

  /** A page that does not exist is not a thing, so it never becomes a press. */
  it("never makes a door out of a page nobody wrote", () => {
    const onOpenPage = vi.fn();
    renderPanel([LINK_PROBLEM], "ko", { doors: { onOpenPage } });
    expect(screen.queryByTestId("library-wiki-problem-target")).toBeNull();
  });

  /** A line alone is not a destination on a rendered page; only a section is. */
  it("never makes a door out of a bare line number", () => {
    const onOpenPlace = vi.fn();
    renderPanel([LINK_PROBLEM], "ko", { doors: { onOpenPlace } });
    expect(screen.queryByTestId("library-wiki-problem-place")).toBeNull();
    expect(screen.getByTestId("library-wiki-problem").textContent).toContain("15번째 줄");
  });
});

describe("WikiTemplateProblems — one action per card, or none", () => {
  it("offers the agent the repair when one is connected", () => {
    const onPress = vi.fn();
    renderPanel([UNCITED], "ko", { fix: { mode: "agent", onPress } });
    const button = screen.getByTestId("library-wiki-fix");
    expect(button.textContent).toContain(ko.library.wiki.fixWithAgent);
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("offers the person the file when no agent is connected", () => {
    renderPanel([UNCITED], "ko", { fix: { mode: "self", onPress: vi.fn() } });
    expect(screen.getByTestId("library-wiki-fix").textContent).toContain(ko.library.wiki.fixMyself);
  });

  /*
   * On the web there is neither a local agent nor an absolute path to reveal. A control
   * that cannot act teaches people to stop pressing controls, so there is none — and the
   * findings still name their own places.
   */
  it("draws no control at all where nothing can act", () => {
    renderPanel([UNCITED], "ko", { fix: null });
    expect(screen.queryByTestId("library-wiki-fix")).toBeNull();
  });

  it("gives the action to the card about this page's own bytes, and to that card only", () => {
    renderPanel([UNCITED, TEMPLATE_PROBLEM, LINK_PROBLEM], "ko", {
      fix: { mode: "agent", onPress: vi.fn() },
    });
    /*
     * ⚠️ **The folder card has no action** (po-evidence, 2026-09-12). Its findings are
     * repaired by editing *another* page, which the repair brief's single-file constraint
     * forbids, and the self action would open the wrong file. Its findings' own doors —
     * the other page's title — are the way.
     */
    const buttons = screen.getAllByTestId("library-wiki-fix");
    expect(buttons).toHaveLength(1);
    expect(
      screen.getByTestId("library-wiki-problems").contains(buttons[0]!),
    ).toBe(true);
    expect(
      screen.getByTestId("library-wiki-link-findings").contains(buttons[0]!),
    ).toBe(false);
  });

  /*
   * ⚠️ **A control may not promise a checkpoint the default removes.** The shipped default
   * write mode is `auto`, and a repaired page that passes the validator is written without
   * a permission card — which is exactly the success case of this repair. It may not deny
   * one either, for a person who switched `ask` on (po-evidence and po-steward, 2026-09-12).
   */
  it("promises a permission card only where every write gets one", () => {
    const { unmount } = renderPanel([UNCITED], "en", {
      fix: { mode: "agent", onPress: vi.fn(), askEveryWrite: true },
    });
    expect(en.library.wiki.fixWithAgentTooltipAsk).toContain("Writing stops at the permission card");
    unmount();
    renderPanel([UNCITED], "en", { fix: { mode: "agent", onPress: vi.fn() } });
    expect(en.library.wiki.fixWithAgentTooltip).not.toContain("Writing stops at the permission card");
    expect(en.library.wiki.fixWithAgentTooltip).toContain("is saved as it is");
  });
});

describe("WikiTemplateProblems — the machine's vocabulary is one press away, not deleted", () => {
  it("keeps every code, its line and the validator's own sentence behind the disclosure", () => {
    renderPanel([LINK_PROBLEM]);
    const technical = screen.getByTestId("library-wiki-link-findings-technical");
    expect(technical.textContent).toContain(ko.library.wiki.technical);
    const codes = screen.getAllByTestId("library-wiki-problem-code");
    expect(codes[0]!.textContent).toContain("dangling-wikilink:15");
    expect(codes[0]!.textContent).toContain("names a page that is not in this folder");
  });

  it("says there that the command and the tool report the same codes", () => {
    renderPanel([LINK_PROBLEM]);
    const card = screen.getByTestId("library-wiki-link-findings");
    expect(card.textContent).toContain("ontology-atlas wiki-validate");
    expect(card.textContent).toContain("validate_wiki");
    // …and the card's own explanation no longer does.
    expect(screen.getByText(ko.library.wiki.linkFindingsBody).textContent).not.toContain(
      "wiki-validate",
    );
  });

  /*
   * ⚠️ For `uncited-fact`, `missing-field`, `section-order-*`, `kind-present` and
   * `describes-needs-approval` the validator's message never names the path either, so
   * without this line nothing on the card says which file on disk holds the claim — and on
   * the web there is no Finder reveal to answer it by action (po-steward, 2026-09-12).
   */
  it("names the file on disk the findings are about", () => {
    renderPanel([UNCITED], "ko", { file: "wiki/merchant-onboarding.md" });
    expect(screen.getByTestId("library-wiki-problems-file").textContent).toContain(
      "wiki/merchant-onboarding.md",
    );
  });

  it("starts closed — the disclosure is a fold, not a second list", () => {
    renderPanel([LINK_PROBLEM]);
    const details = screen
      .getByTestId("library-wiki-link-findings-technical")
      .closest("details")!;
    expect(details.open).toBe(false);
  });
});
