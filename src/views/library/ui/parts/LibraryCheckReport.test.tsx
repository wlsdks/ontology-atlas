import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../messages/en.json";
import type { LintFinding, LintNodeCandidate } from "@/features/library";
import { aggregateWikiFindings } from "@/shared/lib/wiki-report.mjs";
import { LibraryCheckReport, findingKey, reportOutline } from "./LibraryCheckReport";

/**
 * The planted fixture, finding for finding: the nine `(code, page)` pairs
 * `node cli/src/index.mjs wiki-validate /Users/jinan/scratch/atlas-library-fixture-20260911/vault`
 * printed on 2026-09-12. Two of the six pages carry a finding in their own bytes; the
 * other four carry only advisory folder findings and therefore fit the template.
 */
const STRUCTURAL = aggregateWikiFindings({
  pages: [
    {
      path: "wiki/answers/how-long-do-we-keep-dispute-records.md",
      problems: [
        { code: "orphan-page", message: "No other page links here.", detail: { key: "orphan-page" } },
        {
          code: "shared-source-unlinked",
          message: "`wiki/disputes.md` also lists one source and neither links the other.",
          detail: { key: "shared-source-unlinked", values: { other: "wiki/disputes.md", sources: "`sources/a.md`" } },
        },
      ],
    },
    { path: "wiki/disputes.md", problems: [
      {
        code: "shared-source-unlinked",
        message: "The answer page also lists one source and neither links the other.",
        detail: { key: "shared-source-unlinked", values: { other: "wiki/answers/how-long-do-we-keep-dispute-records.md", sources: "`sources/a.md`" } },
      },
    ] },
    { path: "wiki/merchant-onboarding.md", problems: [
      { code: "uncited-fact", message: "Every bullet under `## Facts` ends in a citation.", line: 22, detail: { key: "uncited-fact" } },
      { code: "uncited-fact", message: "Every bullet under `## Facts` ends in a citation.", line: 23, detail: { key: "uncited-fact" } },
    ] },
    { path: "wiki/refund-timing.md", problems: [
      {
        code: "citation-target-missing",
        message: "`sources/refund-policy-2025.md` is cited but is not in this folder.",
        detail: { key: "citation-target-missing-folder", values: { path: "sources/refund-policy-2025.md" } },
      },
    ] },
    { path: "wiki/settlement.md", problems: [
      {
        code: "shared-source-unlinked",
        message: "`wiki/settlement-ko.md` also lists one source and neither links the other.",
        detail: { key: "shared-source-unlinked", values: { other: "wiki/settlement-ko.md", sources: "`sources/settlement-policy.md`" } },
      },
    ] },
    { path: "wiki/settlement-ko.md", problems: [
      { code: "orphan-page", message: "No other page links here.", detail: { key: "orphan-page" } },
      {
        code: "shared-source-unlinked",
        message: "`wiki/settlement.md` also lists one source and neither links the other.",
        detail: { key: "shared-source-unlinked", values: { other: "wiki/settlement.md", sources: "`sources/settlement-policy.md`" } },
      },
    ] },
  ],
});

const CANDIDATES: LintNodeCandidate[] = [
  { name: "Export Worker", kind: "element", pages: ["wiki/a", "wiki/b"], why: "named on three pages" },
  { name: "Teodor Vasquez", kind: "person", pages: ["wiki/a"], why: "" },
];

type Props = Partial<Parameters<typeof LibraryCheckReport>[0]>;

function Harness(props: Props) {
  const t = useTranslations("library");
  return (
    <LibraryCheckReport
      structural={null}
      findings={[]}
      candidates={[]}
      lastLint={{ at: "2026-09-07T06:10:32.356Z", summary: "disagreement 2 · superseded 2 · missing-link 2 · name-without-page 7" }}
      busy={false}
      onLint={null}
      onFix={null}
      onPropose={null}
      onOpenPage={() => {}}
      t={t}
      {...props}
    />
  );
}

function mount(node: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={enMessages}>{node}</NextIntlClientProvider>);
}

describe("the check's answer is a page in the pane", () => {
  it("heads with the app's own record of the last check", () => {
    mount(<Harness />);
    expect(screen.getByTestId("library-check-report-when").textContent).toContain("superseded 2");
  });

  it("does not call a reopened app clean: an empty page under a log that counts findings says they are gone", () => {
    mount(<Harness />);
    expect(screen.getByTestId("library-check-report").textContent).toContain("does not survive reopening");
    expect(screen.getByTestId("library-check-report").textContent).not.toContain("nothing to fix");
  });

  it("says the last check found nothing to fix only when its own counts are all zero", () => {
    mount(<Harness lastLint={{ at: "2026-09-07T06:10:32.356Z", summary: "disagreement 0 · superseded 0 · missing-link 0 · name-without-page 0" }} />);
    expect(screen.getByTestId("library-check-report").textContent).toContain("nothing to fix");
  });

  it("offers the check itself when the wiki was never checked, and says it writes nothing", () => {
    const onLint = vi.fn();
    mount(<Harness lastLint={null} onLint={onLint} />);
    expect(screen.getByTestId("library-check-report-when").textContent).toContain("has not read these pages yet");
    fireEvent.click(screen.getByTestId("library-check-report-lint"));
    expect(onLint).toHaveBeenCalledTimes(1);
  });

  it("groups findings by kind, keeps every summary whole, links the pages, and hands the finding to Fix", () => {
    const onFix = vi.fn();
    const onOpenPage = vi.fn();
    const findings: LintFinding[] = [
      { code: "disagreement", pages: ["wiki/a", "wiki/b"], summary: "Budget 240,000 vs 210,000." },
      { code: "missing-link", pages: ["wiki/a", "wiki/answers/x"], summary: "Both cite the charter and neither links the other." },
    ];
    mount(<Harness findings={findings} onFix={onFix} onOpenPage={onOpenPage} />);
    expect(screen.getByTestId("library-check-report-disagreement").textContent).toContain("Budget 240,000 vs 210,000.");
    expect(screen.getByTestId("library-check-report-missing-link").textContent).toContain("neither links the other");
    fireEvent.click(screen.getAllByTestId("library-finding-page")[1]!);
    expect(onOpenPage).toHaveBeenCalledWith("wiki/b");
    fireEvent.click(screen.getAllByTestId("library-finding-fix")[0]!);
    expect(onFix).toHaveBeenCalledWith(findings[0]);
  });

  it("marks a finding a Fix turn completed and takes its door away until the next check", () => {
    const findings: LintFinding[] = [
      { code: "disagreement", pages: ["wiki/a", "wiki/b"], summary: "Budget 240,000 vs 210,000." },
      { code: "superseded", pages: ["wiki/a"], summary: "Reopening moved." },
    ];
    mount(<Harness findings={findings} onFix={vi.fn()} fixedKeys={new Set([findingKey(findings[0]!)])} />);
    const rows = screen.getAllByTestId("library-finding");
    expect(rows[0]!.getAttribute("data-state")).toBe("fixed");
    expect(rows[0]!.textContent).toContain("Fixed");
    expect(rows[1]!.getAttribute("data-state")).toBeNull();
    expect(screen.getAllByTestId("library-finding-fix")).toHaveLength(1);
  });

  it("lists each name with its kind and page count, and a Propose chip only for a map kind", () => {
    const onPropose = vi.fn();
    mount(<Harness candidates={CANDIDATES} onPropose={onPropose} />);
    const rows = screen.getAllByTestId("library-candidate");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("Export Worker");
    expect(rows[0]!.textContent).toContain("element");
    expect(rows[0]!.textContent).toContain("on 2 pages");
    expect(rows[1]!.textContent).toContain("stays in the wiki");
    expect(screen.getAllByTestId("library-candidate-propose")).toHaveLength(1);
    fireEvent.click(screen.getAllByTestId("library-candidate-propose")[0]!);
    expect(onPropose).toHaveBeenCalledWith(CANDIDATES[0]);
  });

  it("shows five names with the map kinds first and folds the rest behind a count", () => {
    const many: LintNodeCandidate[] = [
      { name: "Ines", kind: "person", pages: ["wiki/a"], why: "" },
      { name: "Halden", kind: "organisation", pages: ["wiki/a"], why: "" },
      { name: "Platform lift", kind: "element", pages: ["wiki/a"], why: "" },
      { name: "Callum", kind: "person", pages: ["wiki/a"], why: "" },
      { name: "Brightwater", kind: "organisation", pages: ["wiki/a"], why: "" },
      { name: "Fire letter", kind: "other", pages: ["wiki/a"], why: "" },
      { name: "Consent", kind: "other", pages: ["wiki/a"], why: "" },
    ];
    mount(<Harness candidates={many} />);
    expect(screen.getAllByTestId("library-candidate")).toHaveLength(5);
    expect(screen.getAllByTestId("library-candidate")[0]!.textContent).toContain("Platform lift");
    const fold = screen.getByTestId("library-candidates-fold");
    expect(fold.textContent).toContain("2 more names");
    fireEvent.click(fold);
    expect(screen.getAllByTestId("library-candidate")).toHaveLength(7);
  });

  it("keeps the names visible on the web, where the chip cannot be offered", () => {
    mount(<Harness candidates={CANDIDATES} />);
    expect(screen.getAllByTestId("library-candidate")).toHaveLength(2);
    expect(screen.queryByTestId("library-candidate-propose")).toBeNull();
  });
});

describe("the computed half is the app's own, and it is the half that leads", () => {
  it("lists every structural finding with no press, no agent and no remembered check", () => {
    mount(<Harness structural={STRUCTURAL} lastLint={null} onLint={null} />);
    /*
     * All nine planted findings are still on this page; what changed is how many rows of
     * ink they take. The two blocking kinds are open — and `merchant-onboarding`'s two
     * uncited bullets share a page and a sentence, so they are one row carrying `:22` and
     * `:23`. The six advisory findings are behind the closed fold, which counts them.
     * Nothing here came from an agent, and `lastLint` is null so nothing was remembered.
     */
    expect(screen.getAllByTestId("library-structural-finding")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("library-advisory-fold"));
    const rows = screen.getAllByTestId("library-structural-finding");
    expect(rows).toHaveLength(8);
    const head = screen.getByTestId("library-check-structural-head").textContent ?? "";
    // Both totals, each saying what it counts: `wiki-validate` calls all six pages
    // off-template because it counts advisory findings too, and a frame that showed two
    // bare numbers for one folder is what the licensing record's falsifier describes.
    expect(head).toContain("6 pages");
    expect(head).toContain("2 off-template");
    expect(head).toContain("9 findings");
  });

  it("keeps the blocking kinds open and folds the advisory ones behind their own count", () => {
    mount(<Harness structural={STRUCTURAL} />);
    /*
     * The fold is closed in every state, including this one: the app's own copy says these
     * rows are expected of a young wiki, so they are never the page to fix first, and the
     * 413–473px they held put the agent's half below the fold at every width (council
     * 2026-09-12, unanimous). The blocking kinds are never collapsible.
     */
    expect(
      screen.getAllByTestId("library-structural-group").map((node) => node.getAttribute("data-code")),
    ).toEqual(["citation-target-missing", "uncited-fact"]);
    const fold = screen.getByTestId("library-advisory-fold");
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    // The count of what is inside, and the reason it is closed — on the control, not on a heading.
    expect(fold.textContent).toContain("6 advisory findings");
    expect(fold.textContent).toContain("young wiki");
    // The rail still lists the advisory codes, so their anchor has to resolve while closed.
    expect(document.getElementById("report-code-orphan-page")).not.toBeNull();
    fireEvent.click(fold);
    expect(
      screen.getAllByTestId("library-structural-group").map((node) => node.getAttribute("data-code")),
    ).toEqual(["citation-target-missing", "uncited-fact", "orphan-page", "shared-source-unlinked"]);
  });

  it("collapses two findings that share a page and a sentence into one row with both lines", () => {
    mount(<Harness structural={STRUCTURAL} />);
    const uncited = screen
      .getAllByTestId("library-structural-group")
      .find((node) => node.getAttribute("data-code") === "uncited-fact")!;
    expect(uncited.querySelectorAll('[data-testid="library-structural-finding"]')).toHaveLength(1);
    // The count on the heading still says two: one row of ink, two bullets to fix.
    expect(uncited.textContent).toContain(":22");
    expect(uncited.textContent).toContain(":23");
    expect(uncited.querySelectorAll('[data-testid="library-finding-page"]')).toHaveLength(1);
  });

  it("names the code the terminal prints, so one folder reads one vocabulary on both screens", () => {
    mount(<Harness structural={STRUCTURAL} />);
    expect(screen.getByTestId("library-check-report").textContent).toContain("uncited-fact");
    expect(screen.getByTestId("library-check-report").textContent).toContain("citation-target-missing");
  });

  it("retells each finding in the reader's language and opens the page it names", () => {
    const onOpenPage = vi.fn();
    mount(<Harness structural={STRUCTURAL} onOpenPage={onOpenPage} />);
    const rows = screen.getAllByTestId("library-structural-finding");
    expect(rows[0]!.textContent).toContain("is cited but that file is not in this folder");
    // The action is its own sentence beside the finding, from the same describer.
    expect(rows[0]!.textContent).toContain("put the file in this folder, or fix the citation");
    expect(rows[0]!.textContent).toContain("refund-timing");
    fireEvent.click(screen.getAllByTestId("library-finding-page")[0]!);
    expect(onOpenPage).toHaveBeenCalledWith("wiki/refund-timing");
  });

  it("carries the line number a person needs to find the bullet", () => {
    mount(<Harness structural={STRUCTURAL} />);
    const uncited = screen.getAllByTestId("library-structural-group").find((node) => node.getAttribute("data-code") === "uncited-fact")!;
    expect(uncited.textContent).toContain(":22");
    expect(uncited.textContent).toContain(":23");
  });

  it("never says 'not checked yet' above a live computed list", () => {
    mount(<Harness structural={STRUCTURAL} lastLint={null} />);
    const structuralText = screen.getByTestId("library-check-structural").textContent ?? "";
    expect(structuralText).not.toContain("has not read these pages yet");
    expect(structuralText).not.toContain("nothing to fix");
    // The agent's half may say it; the computed half above it may not.
    expect(screen.getByTestId("library-check-semantic").textContent).toContain("has not read these pages yet");
  });

  it("says how many pages it has not read yet instead of showing a short list as a complete one", () => {
    const partial = aggregateWikiFindings({
      pages: [{ path: "wiki/a.md", problems: [{ code: "uncited-fact", message: "x", detail: { key: "uncited-fact" } }] }],
      unmeasured: ["wiki/b.md", "wiki/c.md"],
    });
    mount(<Harness structural={partial} />);
    expect(screen.getByTestId("library-check-unmeasured").textContent).toContain("2 pages have not been read yet");
  });

  it("calls the folder clean only when it has read every page and found nothing", () => {
    const clean = aggregateWikiFindings({ pages: [{ path: "wiki/a.md", problems: [] }] });
    mount(<Harness structural={clean} />);
    expect(screen.getByTestId("library-check-structural").textContent).toContain("Every page fits the template");
    expect(screen.queryByTestId("library-check-unmeasured")).toBeNull();
  });

  it("gives a structural row one door and no write: no Fix, no Propose", () => {
    mount(<Harness structural={STRUCTURAL} onFix={vi.fn()} onPropose={vi.fn()} />);
    // Fix belongs to the agent's findings, and there are none here.
    expect(screen.queryByTestId("library-finding-fix")).toBeNull();
    expect(screen.queryByTestId("library-candidate-propose")).toBeNull();
  });

  it("draws the check disabled beside its reason where no agent can run it", () => {
    mount(<Harness structural={STRUCTURAL} onLint={null} lintBlockedReason="Needs a coding agent on this computer." />);
    const chip = screen.getByTestId("library-check-report-lint");
    expect(chip).toBeDisabled();
    expect(screen.getByTestId("library-check-report-lint-blocked").textContent).toContain("Needs a coding agent");
    expect(chip.getAttribute("aria-describedby")).toBe("library-check-report-lint-blocked");
  });

  it("gives the rail one head per ledger so the agent's half is one press away", () => {
    const TestOutline = () => {
      const t = useTranslations("library");
      const headings = reportOutline(STRUCTURAL, [{ code: "disagreement", pages: ["wiki/a"], summary: "x" }], 1, t);
      return <pre data-testid="outline">{JSON.stringify(headings.map((h) => [h.depth, h.slug]))}</pre>;
    };
    mount(<TestOutline />);
    const parsed = JSON.parse(screen.getByTestId("outline").textContent!) as Array<[number, string]>;
    expect(parsed.filter(([depth]) => depth === 1).map(([, slug]) => slug)).toEqual([
      "report-structural",
      "report-semantic",
    ]);
    expect(parsed).toContainEqual([2, "report-code-uncited-fact"]);
    expect(parsed).toContainEqual([2, "report-names"]);
  });
});
