import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import type { VaultDocumentIssue, VaultIssueCode } from "@/shared/lib/vault-document/validate-vault-document";
import { mapVaultIssueCodeToPlainMessage } from "@/shared/lib/vault-document/vault-issue-plain-message";
import { controlClass } from "@/shared/ui";
import type { MisfiledRef } from "../../lib/doc-frontmatter/reference-checks";
import { useReferrerListName } from "../../model/use-doc-write-actions";

const DANGLING_NAMED_MAX = 3;

interface Props {
  validationIssues: VaultDocumentIssue[];
  danglingRefs: string[];
  misfiledRefs: MisfiledRef[];
  /** Where the folder warning's one-press move would send the document, or null. */
  kindFolderTarget: string | null;
  editing: boolean;
  onMoveToKindFolder?: (target: string) => void;
}

/** The warnings under the frontmatter: validator issues, dangling references, misfiled entries. */
export function ValidationIssueRows({
  validationIssues,
  danglingRefs,
  misfiledRefs,
  kindFolderTarget,
  editing,
  onMoveToKindFolder,
}: Props) {
  const t = useTranslations("docsVault.frontmatterBlock");
  const kindLabel = useOntologyKindLabel();
  const listName = useReferrerListName();
  const issueMessageDict = useMemo<Partial<Record<VaultIssueCode, string>>>(
    () => ({
      "unclosed-frontmatter": t("validatorIssues.unclosedFrontmatter"),
      "empty-kind": t("validatorIssues.emptyKind"),
      "missing-kind": t("validatorIssues.missingKind"),
      "unknown-kind": t("validatorIssues.unknownKind"),
      "missing-expected-field": t("validatorIssues.missingExpectedField"),
      "non-canonical-graph-array": t("validatorIssues.nonCanonicalGraphArray"),
      "parse-zero-keys": t("validatorIssues.parseZeroKeys"),
      "missing-uid": t("validatorIssues.missingUid"),
      "invalid-uid": t("validatorIssues.invalidUid"),
      "duplicate-uid": t("validatorIssues.duplicateUid"),
      "invalid-merged-uids": t("validatorIssues.invalidMergedUids"),
      "non-canonical-merged-uids": t("validatorIssues.nonCanonicalMergedUids"),
      "malformed-frontmatter-line": t("validatorIssues.malformedFrontmatterLine"),
      "malformed-quoted-scalar": t("validatorIssues.malformedQuotedScalar"),
      "definition-missing": t("validatorIssues.definitionMissing"),
      "boundary-missing": t("validatorIssues.boundaryMissing"),
      "uncertainty-missing": t("validatorIssues.uncertaintyMissing"),
      "epistemic-exclusion": t("validatorIssues.epistemicExclusion"),
      "slug-outside-kind-folder": t("validatorIssues.slugOutsideKindFolder"),
      "folder-only-evidence": t("validatorIssues.folderOnlyEvidence"),
      "dependency-unwitnessed": t("validatorIssues.dependencyUnwitnessed"),
    }),
    [t],
  );

  const issueRowClass = (severity: VaultDocumentIssue["severity"]) =>
    // Only the tone varies by severity; duplicating the class raises the utility ratchet.
    `flex items-start gap-2 rounded-micro border px-2 py-1.5 text-label leading-label ${
      severity === "error"
        ? "border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] text-[color:var(--color-status-danger)]"
        : "border-[color:var(--color-amber-docs-a18)] bg-[color:var(--color-amber-source-a08)] text-[color:var(--color-amber-docs-a92)]"
    }`;
  const severityTag = (severity: VaultDocumentIssue["severity"]) => (
    <span className="mr-1.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-08)]">
      {severity === "error" ? t("issueSeverityError") : t("issueSeverityWarning")}
    </span>
  );
  if (validationIssues.length === 0 && danglingRefs.length === 0 && misfiledRefs.length === 0) return null;
  return (
    <div
      data-testid="doc-frontmatter-validator-warnings"
      aria-label={t("validatorWarningsAriaLabel")}
      className="mt-2 flex flex-col gap-1 font-sans"
    >
      {validationIssues.map((issue, index) => (
        <div
          key={`${issue.code}-${index}`}
          data-testid="doc-frontmatter-issue"
          data-severity={issue.severity}
          data-issue-code={issue.code}
          className={issueRowClass(issue.severity)}
        >
          <p className="min-w-0 flex-1">
            {severityTag(issue.severity)}
            {mapVaultIssueCodeToPlainMessage(issue.code, issueMessageDict)}
          </p>
          {issue.code === "slug-outside-kind-folder" && kindFolderTarget && !editing ? (
            <button
              type="button"
              onClick={() => onMoveToKindFolder?.(kindFolderTarget)}
              data-testid="doc-frontmatter-move-to-kind-folder"
              className={controlClass({
                shape: "link",
                hoverInk: "strong",
                className:
                  "flex-none font-[var(--font-weight-signature)] text-[color:var(--color-amber-docs-a92)] underline decoration-[color:var(--color-amber-docs-a18)] underline-offset-2",
              })}
            >
              {t("moveToKindFolder", {
                folder: `${kindFolderTarget.slice(0, kindFolderTarget.lastIndexOf("/") + 1)}`,
              })}
            </button>
          ) : null}
        </div>
      ))}
      {danglingRefs.length > 0 ? (
        <div
          data-testid="doc-frontmatter-issue"
          data-severity="warning"
          data-issue-code="dangling-graph-reference"
          className={issueRowClass("warning")}
        >
          <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            {severityTag("warning")}
            {t("danglingRefs", {
              count: danglingRefs.length,
              names: danglingRefs.slice(0, DANGLING_NAMED_MAX).join(", "),
              more:
                danglingRefs.length > DANGLING_NAMED_MAX
                  ? t("danglingRefsMore", { count: danglingRefs.length - DANGLING_NAMED_MAX })
                  : "",
            })}
          </p>
        </div>
      ) : null}
      {misfiledRefs.length > 0 ? (
        <div
          data-testid="doc-frontmatter-issue"
          data-severity="warning"
          data-issue-code="kind-list-mismatch"
          className={issueRowClass("warning")}
        >
          <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            {severityTag("warning")}
            {t("misfiledRefs", {
              count: misfiledRefs.length,
              names: misfiledRefs
                .slice(0, DANGLING_NAMED_MAX)
                .map((ref) =>
                  t("misfiledRefName", {
                    ref: ref.token,
                    kind: kindLabel(ref.kind),
                    list: listName(ref.key),
                  }),
                )
                .join(", "),
              more:
                misfiledRefs.length > DANGLING_NAMED_MAX
                  ? t("danglingRefsMore", { count: misfiledRefs.length - DANGLING_NAMED_MAX })
                  : "",
            })}
          </p>
        </div>
      ) : null}
    </div>
  );
}
