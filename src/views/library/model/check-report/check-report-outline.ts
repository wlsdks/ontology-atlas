import type { useTranslations } from "next-intl";

import type { LintFinding } from "@/features/library";
import type { WikiReport } from "@/shared/lib/library/wiki-report.mjs";

type Translate = ReturnType<typeof useTranslations<"library">>;
/** `t` is typed against the catalogue, and a finding kind is data the validator chooses. */
type RulePath = "report.rule.orphan-page";

export interface ReportOutlineEntry {
  slug: string;
  text: string;
  depth: number;
  occurrence: number;
  duplicate: boolean;
}

export const FINDING_ORDER: ReadonlyArray<LintFinding["code"]> = ["disagreement", "superseded", "missing-link"];

export function findingKindKey(code: LintFinding["code"]): "disagreement" | "superseded" | "missingLink" {
  return code === "missing-link" ? "missingLink" : code;
}

/** A finding kind said as a sentence; an unknown kind falls back to the code, not a raw path. */
export function reportRuleTitle(code: string, t: Translate): string {
  const path = `report.rule.${code}` as RulePath;
  return t.has(path) ? t(path) : code;
}

/** The anchors the outline rail holds for kinds that live behind the advisory fold. */
export function advisoryReportSlugs(structural: WikiReport | null): ReadonlySet<string> {
  return new Set(
    (structural?.groups ?? []).filter((group) => group.advisory).map((group) => `report-code-${group.code}`),
  );
}

function outlineEntry(slug: string, text: string, depth: number): ReportOutlineEntry {
  return { slug, text, depth, occurrence: 1, duplicate: false };
}

/**
 * The report's sections in reading order, as the outline rail lists them: two depth-1 heads, the
 * app's ledger and the agent's, with each ledger's kinds at depth 2. The page and the rail share
 * this list, so they cannot disagree about what is on the page.
 */
export function reportOutline(
  structural: WikiReport | null,
  findings: readonly LintFinding[],
  candidateCount: number,
  t: Translate,
): ReportOutlineEntry[] {
  const out: ReportOutlineEntry[] = [];
  if (structural) {
    out.push(outlineEntry("report-structural", t("report.structuralTitle"), 1));
    for (const group of structural.groups) {
      out.push(outlineEntry(`report-code-${group.code}`, `${reportRuleTitle(group.code, t)} ${group.count}`, 2));
    }
  }
  out.push(outlineEntry("report-semantic", t("report.semanticTitle"), 1));
  for (const code of FINDING_ORDER) {
    const count = findings.filter((finding) => finding.code === code).length;
    if (count === 0) continue;
    out.push(outlineEntry(`report-${code}`, `${t(`wiki.findingKind.${findingKindKey(code)}`)} ${count}`, 2));
  }
  if (candidateCount > 0) {
    out.push(outlineEntry("report-names", `${t("report.namesTitle")} ${candidateCount}`, 2));
  }
  return out;
}

/** One finding's identity across a turn: its kind, its pages, its sentence. */
export function findingKey(finding: LintFinding): string {
  return `${finding.code}␟${finding.pages.join(",")}␟${finding.summary}`;
}
