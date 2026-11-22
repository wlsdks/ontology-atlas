import type { VaultDoc } from "@/entities/docs-vault";
import {
  validateVaultDocFrontmatter,
  type VaultDocumentIssue,
} from "@/shared/lib/vault-document/validate-vault-document";

export interface ValidationDraft {
  kind: string;
  domain: string;
  /** Where a kind change would move the document, or null when it stays. */
  moveTarget: string | null;
}

/**
 * The issues a document has, errors first. A document without a kind is still validated. While a
 * kind change is being edited it is validated as it would be saved: at its new address, with
 * `slug:` following only when it mirrors the address (`rewriteMovedDocSelf`).
 */
export function validationIssuesFor(
  doc: Pick<VaultDoc, "frontmatter" | "diagnostics" | "slug">,
  draft: ValidationDraft,
): VaultDocumentIssue[] {
  const stored = doc.frontmatter ?? {};
  const movedSlug = draft.moveTarget && stored.slug === doc.slug ? { slug: draft.moveTarget } : {};
  const frontmatterForValidation: Record<string, unknown> = draft.kind
    ? { ...stored, kind: draft.kind, domain: draft.domain, ...movedSlug }
    : stored;
  const issues = validateVaultDocFrontmatter(frontmatterForValidation, doc.diagnostics).issues;
  return [
    ...issues.filter((issue) => issue.severity === "error"),
    ...issues.filter((issue) => issue.severity !== "error"),
  ];
}
