import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Clipboard, Pencil } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useTranslations } from "next-intl";
import { buildNewNodeDoc, type VaultDoc } from "@/entities/docs-vault";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import type { AgentActivityStatus } from "@/features/docs-vault-local";
import { computeEditAge } from "@/shared/lib/edit-age";
import { looksLikeCodePath } from "@/shared/lib/humanize-code-path-title";
import { truncateMiddlePath } from "@/shared/lib/truncate-middle-path";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import {
  validateVaultDocFrontmatter,
  type VaultDocumentIssue,
  type VaultIssueCode,
} from "@/shared/lib/validate-vault-document";
import { mapVaultIssueCodeToPlainMessage } from "@/shared/lib/vault-issue-plain-message";
import {
  CompactCopyButton,
  IconButton,
  LastEditSubjectRow,
  MtimeConflictBadge,
  controlClass,
} from "@/shared/ui";
import { hasDocMtimeConflict, resolveDocLastEditSubject } from "../../lib/resolve-doc-edit-subject";
import { fieldClass, fieldLabel } from '@/shared/ui/control-class';

/**
 * Engraved frontmatter visualization — "the frontmatter is the graph" made literal
 * in the editor. Renders the ontology-shaped subset of `doc.frontmatter`
 * (kind/slug/title/domain/depends_on/relates_to/contains/belongs_to/evidence)
 * as a machined mono block, mirroring exactly what `deriveOntologyFromVault`
 * reads to build the topology graph.
 *
 * Collapsed by default (`<details open={false}>`) — on long documents this block
 * used to push the H1 below the first screen. Frontmatter is the graph source, so
 * it is never deleted or hidden from the DOM, only collapsed; the summary line
 * still surfaces `kind` / `slug` / field count so the reader knows what is inside
 * before expanding. The caller mounts this with `key={doc.slug}`, so switching
 * documents remounts it and resets the collapse state — no cross-document memory,
 * no URL or session pollution.
 *
 * Quick-patch action: when a writable local vault is loaded (`canEdit` plus
 * `onPatch`) and the doc's kind is one the vault schema recognizes, an inline edit
 * affordance lets the reader fix kind/domain/title in place — a typed field gets a
 * typed (select) tool instead of hand-edited raw YAML. Saves go through the same
 * conflict-guarded `updateFrontmatter` write path the map's contextual editor uses
 * for its relation writes — one write path, shared.
 */

// A stable empty Map reference, so a render without the prop does not build a new
// Map each time (keeping `useMemo` deps stable).
const EMPTY_SELF_EDIT_TIMESTAMPS: ReadonlyMap<string, number> = new Map();

const GRAPH_KEYS = [
  "kind",
  "slug",
  "title",
  "domain",
  "category",
  "status",
  "depends_on",
  "relates_to",
  "contains",
  "belongs_to",
  "evidence",
] as const;

// Only the kinds the vault frontmatter schema treats as editable — sentinel kinds
// such as vault-readme and unknown are not touched by this select.
const EDITABLE_KINDS = ["project", "domain", "capability", "element", "document"] as const;
type EditableKind = (typeof EDITABLE_KINDS)[number];

function isEditableKind(kind: string): kind is EditableKind {
  return (EDITABLE_KINDS as readonly string[]).includes(kind);
}

// Reference keys that point at another vault node by slug — in read mode a resolvable
// token gets click navigation. `evidence` (file paths), `category`, and `status` (enums)
// are not node references and are excluded.
const REFERENCE_KEYS = new Set<string>([
  "domain",
  "depends_on",
  "relates_to",
  "contains",
  "belongs_to",
]);

function toRefTokens(value: unknown): { tokens: string[]; isArray: boolean } {
  if (Array.isArray(value)) {
    return {
      tokens: value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean),
      isArray: true,
    };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return { tokens: trimmed ? [trimmed] : [], isArray: false };
  }
  return { tokens: [], isArray: false };
}

function formatValue(value: unknown): string | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return `[${value.join(", ")}]`;
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

export interface DocFrontmatterPatch {
  kind?: string;
  domain?: string | null;
  title?: string;
}

export interface DocFrontmatterBlockProps {
  doc: VaultDoc;
  /** True only when a writable local vault is loaded — read-only on server/sample vaults. */
  canEdit?: boolean;
  /** Domain candidates for a capability or element — the vault's `kind: domain` documents. */
  domainOptions?: Array<{ slug: string; title: string }>;
  /** Called with confirmed fields only. Saving is the caller's responsibility, through the
   *  conflict-guarded `updateFrontmatter`. */
  onPatch?: (patch: DocFrontmatterPatch) => Promise<void>;
  /** Navigates to a reference slug when clicked — without it, references stay plain text. */
  onNavigate?: (slug: string) => void;
  /** Resolves a bare slug (the frontmatter reference spelling) to a real navigation slug.
   *  Null means the reference is not in the vault, so it is not rendered as a link. */
  resolveRef?: (token: string) => string | null;
  /** The real data behind the "last edited · AI agent" fact. Without it (a server or sample
   *  vault) the AI subject row is never rendered. */
  agentActivityStatus?: AgentActivityStatus | null;
  /** The real data behind "last edited · me" and the conflict badge — the record of slugs
   *  this browser session actually wrote through the vault write API
   *  (`useLocalVault().selfEditTimestamps`). Without it (a server or sample vault) neither
   *  is ever rendered. */
  selfEditTimestamps?: ReadonlyMap<string, number>;
}

export function DocFrontmatterBlock({
  doc,
  canEdit = false,
  domainOptions = [],
  onPatch,
  onNavigate,
  resolveRef,
  agentActivityStatus = null,
  selfEditTimestamps,
}: DocFrontmatterBlockProps) {
  const t = useTranslations("docsVault.frontmatterBlock");
  const tProvenance = useTranslations("editProvenance");
  const kindLabel = useOntologyKindLabel();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The mtime baseline at the moment this document was "opened", plus a "now" snapshot.
  // The lazy `useState(() => Date.now())` matches this app's existing `updatedAgoNowMs`
  // contract — `Date.now()` is never called during render. The caller remounts this
  // component per document via `key={doc.slug}` (see the file docstring), so both reset to
  // a fresh baseline for each new document.
  const openedMtimeRef = useRef(doc.mtime);
  const [viewOpenedAtMs] = useState(() => Date.now());
  const resolvedSelfEditTimestamps = selfEditTimestamps ?? EMPTY_SELF_EDIT_TIMESTAMPS;
  // Only two real-data candidates go in: a heartbeat match, and a self-write this session.
  // With neither, this is null and the subject row is not rendered at all — no recycled
  // marketing chip.
  const lastEditSubjectFact = useMemo(
    () =>
      resolveDocLastEditSubject({
        doc: { slug: doc.slug, path: doc.path },
        agentActivityStatus,
        selfEditTimestamps: resolvedSelfEditTimestamps,
      }),
    [doc.slug, doc.path, agentActivityStatus, resolvedSelfEditTimestamps],
  );
  const lastEditSubjectRow = (() => {
    if (!lastEditSubjectFact) return null;
    const age = computeEditAge(lastEditSubjectFact.atMs, viewOpenedAtMs);
    return {
      kind: lastEditSubjectFact.kind,
      prefixLabel: tProvenance("prefix"),
      subjectLabel: tProvenance(
        lastEditSubjectFact.kind === "agent" ? "subjectAgent" : "subjectHuman",
      ),
      ageLabel: tProvenance(`age.${age.key}`, { count: age.count }),
    };
  })();
  // True only on a real mtime mismatch — no signal inflation.
  const mtimeConflict = hasDocMtimeConflict({
    doc: { slug: doc.slug, mtime: doc.mtime },
    baselineMtime: openedMtimeRef.current,
    baselineCapturedAtMs: viewOpenedAtMs,
    selfEditTimestamps: resolvedSelfEditTimestamps,
  });
  const currentKind = formatValue(doc.frontmatter?.kind);
  const currentDomain = formatValue(doc.frontmatter?.domain) ?? "";
  const currentTitle = formatValue(doc.frontmatter?.title) ?? doc.title;
  const [draftKind, setDraftKind] = useState(currentKind ?? "");
  const [draftDomain, setDraftDomain] = useState(currentDomain);
  const [draftTitle, setDraftTitle] = useState(currentTitle);

  // Inline validator diagnostics — while editing, the draft (kind/domain) is validated;
  // otherwise the saved frontmatter is, after a 400ms debounce.
  //
  // **Errors are shown too** (corrected 2026-08-04). It used to filter on
  // `severity === "warning"`, so **errors were hidden and only warnings shown** —
  // exactly backwards. Measured: in a folder with 5 errors, all that appeared beside the
  // files were 3 warnings, and the errors that actually remove a node from the map were
  // nowhere on screen.
  const activeKind = editing ? draftKind : currentKind ?? "";
  const activeDomain = editing ? draftDomain : currentDomain;
  const [debouncedValidation, setDebouncedValidation] = useState({
    kind: activeKind,
    domain: activeDomain,
  });
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedValidation({ kind: activeKind, domain: activeDomain });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [activeKind, activeDomain]);

  const validationIssues = useMemo<VaultDocumentIssue[]>(() => {
    const stored = doc.frontmatter ?? {};
    // With no kind yet, **the saved frontmatter is validated as-is**. It used to bail out
    // with `if (!kind) return []`, so the screen went silent in exactly the two most common
    // ways a node disappears: a missing kind and an empty one.
    const frontmatterForValidation: Record<string, unknown> = debouncedValidation.kind
      ? { ...stored, kind: debouncedValidation.kind, domain: debouncedValidation.domain }
      : stored;
    const issues = validateVaultDocFrontmatter(frontmatterForValidation).issues;
    // Errors first — reading order is repair order.
    return [
      ...issues.filter((issue) => issue.severity === "error"),
      ...issues.filter((issue) => issue.severity !== "error"),
    ];
  }, [doc.frontmatter, debouncedValidation]);

  const issueMessageDict = useMemo<Partial<Record<VaultIssueCode, string>>>(
    () => ({
      "unclosed-frontmatter": t("validatorIssues.unclosedFrontmatter"),
      "empty-kind": t("validatorIssues.emptyKind"),
      "missing-kind": t("validatorIssues.missingKind"),
      "unknown-kind": t("validatorIssues.unknownKind"),
      "missing-expected-field": t("validatorIssues.missingExpectedField"),
      "non-canonical-graph-array": t("validatorIssues.nonCanonicalGraphArray"),
      "parse-zero-keys": t("validatorIssues.parseZeroKeys"),
    // The four error codes had no entries in this dictionary before. The screen was
    // filtering errors out, so no plain-language text was needed — which measures the size
    // of that defect.
      "missing-uid": t("validatorIssues.missingUid"),
      "invalid-uid": t("validatorIssues.invalidUid"),
      "duplicate-uid": t("validatorIssues.duplicateUid"),
      "invalid-merged-uids": t("validatorIssues.invalidMergedUids"),
      "non-canonical-merged-uids": t("validatorIssues.nonCanonicalMergedUids"),
    }),
    [t],
  );

  // "See a spec example" — a complete example for the current document's kind, derived from
  // the same schema starter new-document creation already uses (NewDocKindDialog →
  // buildNewNodeDoc → buildVaultMarkdown). No duplicate; the same source reused.
  const [exampleOpen, setExampleOpen] = useState(false);
  const { state: exampleCopyState, copy: copyExample } = useCopyFeedback();
  const exampleDoc = useMemo(() => {
    if (!currentKind) return null;
    try {
      const exampleTitle = t("exampleTitleFor", { kind: kindLabel(currentKind) });
      const needsDomain = currentKind === "capability" || currentKind === "element";
      const domain = needsDomain ? domainOptions[0]?.slug ?? "example-domain" : undefined;
      return buildNewNodeDoc({ title: exampleTitle, kind: currentKind, domain }).markdown;
    } catch {
      return null;
    }
  }, [currentKind, domainOptions, kindLabel, t]);

  const fields = GRAPH_KEYS.map((key) => {
    const raw = doc.frontmatter?.[key];
    const ref = REFERENCE_KEYS.has(key) ? toRefTokens(raw) : null;
    return {
      key: key as string,
      value: formatValue(raw),
      refTokens: ref?.tokens ?? null,
      refIsArray: ref?.isArray ?? false,
    };
  }).filter(
    (f): f is {
      key: string;
      value: string;
      refTokens: string[] | null;
      refIsArray: boolean;
    } => f.value !== null,
  );

  // The code-location section — the REAL code evidence: raw file paths from frontmatter
  // `elements: [...]`. `elements` isn't in `GRAPH_KEYS` above (it's not a
  // single-line key:value fact, and its entries need a distinct visual
  // treatment — raw code paths are NOT vault-node references, so they must
  // not read as clickable like the `REFERENCE_KEYS` tokens above). Filtered
  // through `looksLikeCodePath` so a folder-prefixed vault ref accidentally
  // placed in `elements:` doesn't masquerade as a code path.
  const codeLocations: string[] = [];
  {
    const raw = doc.frontmatter?.elements;
    const seen = new Set<string>();
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (typeof entry !== "string") continue;
        const trimmed = entry.trim();
        if (!trimmed || seen.has(trimmed) || !looksLikeCodePath(trimmed)) continue;
        seen.add(trimmed);
        codeLocations.push(trimmed);
      }
    }
  }

  // The CREATE writer stores a node's meaning in a `definition:` frontmatter key. It is not
  // in GRAPH_KEYS, so it used to be invisible in the read view (a hidden typed fact violates
  // the charter). It is surfaced as a plain, always-visible lede at the top of the block, so
  // the reader sees the node's meaning without expanding the frontmatter or hunting the body.
  const definitionValue = formatValue(doc.frontmatter?.definition);

  const kindValue = currentKind;

  // **A document with no kind states its own problem** (2026-08-04).
  //
  // The call site (`DocsVaultPage`) used to gate on `typeof kind === 'string' && kind` and
  // not draw the block at all. But a missing or empty kind is **the two most common ways a
  // node disappears from the map** — so the screen went silent in exactly the two cases that
  // most needed explaining.
  //
  // It is still not drawn on just any document. The verdict borrows the heuristic the
  // validator already has: `validateVaultDocFrontmatter` raises no issue at all for a
  // document with no ontology intent (no kind and no signal key such as domain or
  // capabilities). So «there are issues» means «this document tried to be a node and
  // failed». The verdict is borrowed rather than duplicated.
  const diagnosticOnly = !kindValue;
  if (diagnosticOnly && validationIssues.length === 0) return null;
  if (!diagnosticOnly && fields.length === 0 && codeLocations.length === 0 && !definitionValue) {
    return null;
  }

  const slugValue = formatValue(doc.frontmatter?.slug) ?? doc.slug;
  // It must be fixable even when kind is empty — a diagnosis with no way to act on it is a
  // dead end.
  const canQuickPatch =
    canEdit && Boolean(onPatch) && (kindValue == null || isEditableKind(kindValue));

  function startEditing() {
    setDraftKind(currentKind ?? "");
    setDraftDomain(currentDomain);
    setDraftTitle(currentTitle);
    setError(null);
    setEditing(true);
    setOpen(true);
  }

  async function handleSave() {
    if (!onPatch) return;
    setSaving(true);
    setError(null);
    try {
      const patch: DocFrontmatterPatch = {};
      if (draftKind && draftKind !== currentKind) patch.kind = draftKind;
      if (draftTitle.trim() && draftTitle.trim() !== currentTitle) {
        patch.title = draftTitle.trim();
      }
      const nextDomain = draftDomain.trim();
      if (nextDomain !== currentDomain) {
        patch.domain = nextDomain || null;
      }
      if (Object.keys(patch).length > 0) {
        await onPatch(patch);
      }
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  /**
   * A diagnostic row — severity comes through **both colour and a data attribute**.
   *
   * Splitting on colour alone would make colour the only distinguishing channel (a charter
   * violation), so an error row also carries a `!` in the icon slot and a label.
   */
  const issueRows =
    validationIssues.length > 0 ? (
      <div
        data-testid="doc-frontmatter-validator-warnings"
        aria-label={t("validatorWarningsAriaLabel")}
        className="mt-2 flex flex-col gap-1 font-sans"
      >
        {validationIssues.map((issue, index) => (
          <p
            key={`${issue.code}-${index}`}
            data-testid="doc-frontmatter-issue"
            data-severity={issue.severity}
            // Shared geometry stays on one line — **only the tone** varies by severity.
            // (Copying the whole class string per branch raises the off-ramp utility ratchet.)
            className={`rounded-micro border px-2 py-1.5 text-label leading-label ${
              issue.severity === "error"
                ? "border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] text-[color:var(--color-status-danger)]"
                : "border-[color:var(--color-amber-docs-a18)] bg-[color:var(--color-amber-source-a08)] text-[color:var(--color-amber-docs-a92)]"
            }`}
          >
            <span className="mr-1.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-08)]">
              {issue.severity === "error" ? t("issueSeverityError") : t("issueSeverityWarning")}
            </span>
            {mapVaultIssueCodeToPlainMessage(issue.code, issueMessageDict)}
          </p>
        ))}
      </div>
    ) : null;

  const quickPatchSection = canQuickPatch ? (
    editing ? (
      <div className="mt-3 flex flex-col gap-2 border-t border-[color:var(--color-divider)] pt-3 font-sans">
        <label className={fieldLabel({ className: "flex flex-col gap-1" })}>
          {t("editKindLabel")}
          <select
            value={draftKind}
            onChange={(event) => setDraftKind(event.target.value)}
            disabled={saving}
            data-testid="doc-frontmatter-kind-select"
            className={fieldClass({ size: "xs" })}
          >
            {/* A document with no kind has an empty draft too. Without a placeholder the
                browser appears to have selected the first option, which lies that a kind is
                already decided. */}
            {draftKind === "" ? <option value="">{t("editKindUnset")}</option> : null}
            {EDITABLE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kindLabel(kind)}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldLabel({ className: "flex flex-col gap-1" })}>
          {t("editDomainLabel")}
          <select
            value={draftDomain}
            onChange={(event) => setDraftDomain(event.target.value)}
            disabled={saving}
            className={fieldClass({ size: "xs" })}
          >
            <option value="">{t("editDomainNone")}</option>
            {domainOptions.map((option) => (
              <option key={option.slug} value={option.slug}>
                {option.title}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldLabel({ className: "flex flex-col gap-1" })}>
          {t("editTitleLabel")}
          <input
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            disabled={saving}
            className={fieldClass({ size: "xs" })}
          />
        </label>
        {error ? (
          <p role="alert" className="text-label text-[color:var(--color-status-danger)]">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className={controlClass({
              shape: "chip",
              tone: "accentOnTint",
              className: "hover:bg-[color:var(--color-indigo-a16)]",
            })}
          >
            {saving ? t("editSaving") : t("editSave")}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className={controlClass({
              shape: "link",
              tone: "muted",
              className: "hover:text-[color:var(--color-text-secondary)]",
            })}
          >
            {t("editCancel")}
          </button>
        </div>
      </div>
    ) : (
      <button
        type="button"
        onClick={startEditing}
        data-testid="doc-frontmatter-edit-action"
        className={controlClass({
          shape: "link",
          className: "touch-hit-expand mt-2 font-sans hover:text-[color:var(--color-text-primary)]",
        })}
      >
        <Pencil size={ICON_SIZE.sm} aria-hidden />
        {diagnosticOnly ? t("setKindAction") : t("editAction")}
      </button>
    )
  ) : null;

  // The short diagnostic block — the engraved frontmatter is not drawn whole. This document
  // is not a node yet, so there are no graph facts to show; what is needed is one line of
  // «why it is not on the map» and one place to fix it.
  if (diagnosticOnly) {
    return (
      <section
        aria-label={t("diagnosticAriaLabel")}
        data-testid="doc-frontmatter-block"
        data-variant="diagnostic"
        className="mx-auto mt-4 max-w-[760px] px-6 md:px-10"
      >
        <div className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-4 py-3">
          <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {t("notOnMapTitle")}
          </p>
          {/* No `leading-*` — `text-label` carries its own line height. */}
          <p className="mt-1 text-label text-[color:var(--color-text-tertiary)]">
            {t("notOnMapBody")}
          </p>
          {issueRows}
          {quickPatchSection}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={t("ariaLabel")}
      data-testid="doc-frontmatter-block"
      data-variant="full"
      className="mx-auto mt-4 max-w-[760px] px-6 md:px-10"
    >
      {definitionValue ? (
        <div
          data-testid="doc-frontmatter-definition"
          className="mb-3 border-l-2 border-[color:var(--color-border-strong)] pl-3"
        >
          <div className="text-label text-[color:var(--color-text-quaternary)]">
            {t("definitionLabel")}
          </div>
          <p className="mt-0.5 text-body leading-body text-[color:var(--color-text-secondary)]">
            {definitionValue}
          </p>
        </div>
      ) : null}
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="group rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-4 py-3 font-mono text-body leading-prose text-[color:var(--color-text-tertiary)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]"
      >
        <summary
          data-testid="doc-frontmatter-summary"
          aria-label={open ? t("collapseAria") : t("expandAria")}
          className="flex list-none items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]"
        >
          <ChevronRight
            size={ICON_SIZE.sm}
            aria-hidden
            className="flex-none text-[color:var(--color-text-quaternary)] transition-transform group-open:rotate-90"
          />
          <span aria-hidden>---</span>
          {kindValue ? (
            <>
              <span className="text-[color:var(--color-text-quaternary)]">kind:</span>
              <span className="font-[var(--font-weight-emphasis)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
                {kindValue}
              </span>
            </>
          ) : null}
          <span className="min-w-0 truncate text-[color:var(--color-text-quaternary)]">
            slug: <span className="text-[color:var(--color-text-secondary)]">{slugValue}</span>
          </span>
          <span className="ml-auto flex-none text-[color:var(--color-text-quaternary)]">
            {t("collapsedSummary", { count: fields.length })}
          </span>
        </summary>
        <div className="mt-2 border-t border-[color:var(--color-divider)] pt-2">
          <div className="text-[color:var(--color-text-quaternary)]" aria-hidden>
            ---
          </div>
          {fields.map(({ key, value, refTokens }) => {
            const linkable =
              refTokens != null &&
              refTokens.length > 0 &&
              onNavigate != null &&
              refTokens.some((tok) => resolveRef?.(tok) != null);
            return (
              <div key={key} className="flex min-w-0 flex-wrap gap-x-1.5">
                <span className="text-[color:var(--color-text-quaternary)]">{key}:</span>
                {linkable ? (
                  <span className="min-w-0 break-words text-[color:var(--color-text-secondary)]">
                    {refTokens!.map((tok, index) => {
                      const target = resolveRef?.(tok) ?? null;
                      return (
                        <Fragment key={`${tok}-${index}`}>
                          {index > 0 ? <span aria-hidden>, </span> : null}
                          {target != null ? (
                            <button
                              type="button"
                              onClick={() => onNavigate!(target)}
                              data-testid={`doc-frontmatter-ref-${tok}`}
                              // A reference control inside a line of text. An earlier comment
                              // called 44 "WCAG 2.5.8", but that is the 2.5.5 (AAA) / HIG value
                              // (floor reset 2026-08-04, ledger "link floor 24"). 2.5.8 (AA)'s
                              // floor of 24 is set with `min-h-6`, which raises a wrapped
                              // reference row's pitch from 21 to 24 and clears the 24px overlap
                              // measured at runtime. It cannot move into the value layer because
                              // of type inheritance: the link ramp forces `text-label` while this
                              // reference must inherit the parent font size.
                              className={controlClass({ shape: "link", className: "min-h-6 rounded-chip text-[color:var(--color-indigo-pale-a90)] underline decoration-[color:var(--color-indigo-line-a35)] underline-offset-2 hover:text-[color:var(--color-text-primary)] hover:decoration-[color:var(--color-indigo-line-a45)]" })}
                            >
                              {tok}
                            </button>
                          ) : (
                            <span>{tok}</span>
                          )}
                        </Fragment>
                      );
                    })}
                  </span>
                ) : (
                  <span
                    className={
                      key === "kind"
                        ? "font-[var(--font-weight-emphasis)] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
                        : "min-w-0 truncate text-[color:var(--color-text-secondary)]"
                    }
                  >
                    {value}
                  </span>
                )}
              </div>
            );
          })}
          <div className="text-[color:var(--color-text-quaternary)]" aria-hidden>
            ---
          </div>
        </div>
        {codeLocations.length > 0 ? (
          <div
            data-testid="doc-frontmatter-code-locations"
            className="mt-2 flex flex-col gap-1 border-t border-[color:var(--color-divider)] pt-2 font-sans"
          >
            <div className="flex items-center gap-1.5 text-label text-[color:var(--color-text-quaternary)]">
              <span>{t("codeLocationsHeading")}</span>
              <span className="font-mono">{codeLocations.length}</span>
            </div>
            <ul className="flex flex-col gap-0.5">
              {codeLocations.map((path) => (
                <CodeLocationRow
                  key={path}
                  path={path}
                  copyLabel={t("codeLocationsCopy")}
                  copiedLabel={t("codeLocationsCopied")}
                  copyAriaLabel={t("codeLocationsCopyAriaLabel", { path })}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {quickPatchSection}
        <p
          data-testid="doc-frontmatter-note" className="mt-2 flex items-center gap-1.5 text-label text-[color:var(--color-text-quaternary)]">
          <svg width="16" height="6" viewBox="0 0 16 6" aria-hidden="true" className="shrink-0">
            <line
              x1="1"
              y1="3"
              x2="15"
              y2="3"
              stroke="var(--topology-v2-edge-contains-mark, var(--color-border-strong))"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          {t("note")}
        </p>
        {/* The spec example earns its place **when the properties are expanded** (2026-08-08).
            A teaching line that does not vary per document was sitting above 112 documents —
            noise costing a line to someone who came to read, while the moment it is actually
            wanted (finding out what a property accepts) is the moment this block is opened.
            So it moved to that moment. */}
        {exampleDoc ? (
          <div className="mt-2 font-sans">
            <button
              type="button"
              onClick={() => setExampleOpen((v) => !v)}
              aria-expanded={exampleOpen}
              aria-controls="doc-frontmatter-example"
              data-testid="doc-frontmatter-example-toggle"
              className={controlClass({
                shape: "link",
                tone: "muted",
                className: "touch-hit-expand hover:text-[color:var(--color-text-secondary)]",
              })}
            >
              <ChevronRight
                size={ICON_SIZE.sm}
                aria-hidden
                className={`transition-transform motion-reduce:transition-none ${
                  exampleOpen ? "rotate-90" : ""
                }`}
              />
              {t("exampleToggle")}
            </button>
            {exampleOpen ? (
              <div
                id="doc-frontmatter-example"
                data-testid="doc-frontmatter-example"
                className="mt-2 flex items-start gap-2 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2"
              >
                <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-label leading-label text-[color:var(--color-text-secondary)]">
                  {exampleDoc}
                </pre>
                <CompactCopyButton
                  copied={exampleCopyState === "copied"}
                  label={exampleCopyState === "copied" ? t("exampleCopied") : t("exampleCopy")}
                  ariaLabel={t("exampleCopyAriaLabel")}
                  onClick={() => void copyExample(exampleDoc)}
                  data-testid="doc-frontmatter-example-copy"
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </details>
      {lastEditSubjectRow ? (
        <div className="mt-2 font-sans">
          <LastEditSubjectRow
            kind={lastEditSubjectRow.kind}
            prefixLabel={lastEditSubjectRow.prefixLabel}
            subjectLabel={lastEditSubjectRow.subjectLabel}
            ageLabel={lastEditSubjectRow.ageLabel}
          />
        </div>
      ) : null}
      {mtimeConflict ? (
        <div className="mt-2 font-sans">
          <MtimeConflictBadge message={tProvenance("conflictMessage")} />
        </div>
      ) : null}
      {issueRows}
    </section>
  );
}

/**
 * One code-location row — a raw code path (truncated in the middle, full path on
 * hover) plus a per-row copy button. Deliberately plain text, not a `Link` or
 * button like the `REFERENCE_KEYS` tokens above — a code path is not a vault node,
 * so it must not visually promise navigation it cannot deliver.
 */
function CodeLocationRow({
  path,
  copyLabel,
  copiedLabel,
  copyAriaLabel,
}: {
  path: string;
  copyLabel: string;
  copiedLabel: string;
  copyAriaLabel: string;
}) {
  const { state, copy } = useCopyFeedback();
  return (
    <li className="flex items-center gap-2 py-0.5">
      <span
        title={path}
        className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-tertiary)]"
      >
        {truncateMiddlePath(path)}
      </span>
      <IconButton
        label={copyAriaLabel}
        size="sm"
        tone="muted"
        onClick={() => void copy(path)}
        title={state === "copied" ? copiedLabel : copyLabel}
        data-testid="doc-frontmatter-code-location-copy"
        className="hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)]"
      >
        {state === "copied" ? <Check size={ICON_SIZE.sm} aria-hidden /> : <Clipboard size={ICON_SIZE.sm} aria-hidden />}
      </IconButton>
    </li>
  );
}
