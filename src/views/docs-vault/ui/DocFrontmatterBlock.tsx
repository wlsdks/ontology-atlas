import { useEffect, useMemo, useState } from "react";
import { OntologyMapKindGlyph } from "@/shared/ui/ontology-node/map-kind-glyph";
import { useLocale, useTranslations } from "use-intl";
import {
  buildNewNodeDoc,
  isWikiPage,
  type VaultDoc,
} from "@/entities/docs-vault";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { VaultConflictError, type AgentActivityStatus } from "@/entities/vault-session";
import { computeEditAge } from "@/shared/lib/edit-provenance/edit-age";
import { useCopyFeedback } from "@/shared/lib/clipboard/use-copy-feedback";
import { useFailureSentence, type FailureCopy } from "@/shared/lib/failures/use-failure-sentence";
import { CloseButton, Dialog, LastEditSubjectRow, MtimeConflictBadge } from "@/shared/ui";
import { kindFolderAddress, reclassifyMoveTarget } from "../lib/doc-actions/kind-folder-move";
import { hasDocMtimeConflict, resolveDocLastEditSubject } from "../lib/doc-actions/resolve-doc-edit-subject";
import { graphFieldKeys, REFERENCE_KEYS, toRefTokens, formatValue } from "../lib/doc-frontmatter/fields";
import { buildFrontmatterPatch, isEditableKind, nameLocalesFor } from "../lib/doc-frontmatter/quick-patch";
import { collectCodeLocations, collectDanglingRefs, collectMisfiledRefs } from "../lib/doc-frontmatter/reference-checks";
import { validationIssuesFor } from "../lib/doc-frontmatter/validation-issues";
import type { DocFrontmatterPatch } from "../model/use-doc-write-actions";
import { CodeLocationsList } from "./doc-frontmatter/CodeLocationsList";
import { FrontmatterExample } from "./doc-frontmatter/FrontmatterExample";
import { FrontmatterFieldRows } from "./doc-frontmatter/FrontmatterFieldRows";
import { QuickPatchSection, type KindChangeReferrerRow } from "./doc-frontmatter/QuickPatchSection";
import { ValidationIssueRows } from "./doc-frontmatter/ValidationIssueRows";

const EMPTY_SELF_EDIT_TIMESTAMPS: ReadonlyMap<string, number> = new Map();


export interface DocFrontmatterBlockProps {
  doc: VaultDoc;
  canEdit?: boolean;
  domainOptions?: Array<{ slug: string; title: string }>;
  onPatch?: (patch: DocFrontmatterPatch) => Promise<void>;
  onMoveToKindFolder?: (target: string) => void;
  kindChangeReferrers?: (newKind: string, newSlug: string) => KindChangeReferrerRow[];
  onNavigate?: (slug: string) => void;
  /** Null means the reference is not in the vault and is not a link. */
  resolveRef?: (token: string) => string | null;
  kindOf?: (slug: string) => string | null;
  agentActivityStatus?: AgentActivityStatus | null;
  selfEditTimestamps?: ReadonlyMap<string, number>;
}

export function DocFrontmatterBlock({
  doc,
  canEdit = false,
  domainOptions = [],
  onPatch,
  onMoveToKindFolder,
  kindChangeReferrers,
  onNavigate,
  resolveRef,
  kindOf,
  agentActivityStatus = null,
  selfEditTimestamps,
}: DocFrontmatterBlockProps) {
  const t = useTranslations("docsVault.frontmatterBlock");
  const tProvenance = useTranslations("editProvenance");
  const locale = useLocale();
  const kindLabel = useOntologyKindLabel();
  const failureSentence = useFailureSentence();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  // `sentence` is the reader's language and the only half on the page; `detail` is the
  // machine's English for `data-failure-detail` (`use-failure-sentence.ts`).
  const [error, setError] = useState<FailureCopy | null>(null);
  // Lazy initial state keeps `Date.now()` out of render; the per-document key resets both.
  const [openedMtime] = useState(() => doc.mtime);
  const [viewOpenedAtMs] = useState(() => Date.now());
  const resolvedSelfEditTimestamps = selfEditTimestamps ?? EMPTY_SELF_EDIT_TIMESTAMPS;
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
  const mtimeConflict = hasDocMtimeConflict({
    doc: { slug: doc.slug, mtime: doc.mtime },
    baselineMtime: openedMtime,
    baselineCapturedAtMs: viewOpenedAtMs,
    selfEditTimestamps: resolvedSelfEditTimestamps,
  });
  const currentKind = formatValue(doc.frontmatter?.kind);
  const currentDomain = formatValue(doc.frontmatter?.domain) ?? "";
  const currentTitle = formatValue(doc.frontmatter?.title) ?? doc.title;
  const nameLocales = nameLocalesFor(locale, doc.frontmatter);
  const currentNames = Object.fromEntries(
    nameLocales.map((code) => [code, formatValue(doc.frontmatter?.[`display_${code}`]) ?? ""]),
  );
  const [draftKind, setDraftKind] = useState(currentKind ?? "");
  const [draftDomain, setDraftDomain] = useState(currentDomain);
  const [draftTitle, setDraftTitle] = useState(currentTitle);
  const [draftNames, setDraftNames] = useState<Record<string, string>>(currentNames);
  const moveTarget = editing ? reclassifyMoveTarget(doc.slug, currentKind, draftKind) : null;
  const kindChangeRows = useMemo(
    () =>
      editing && currentKind && draftKind && draftKind !== currentKind && kindChangeReferrers
        ? kindChangeReferrers(draftKind, moveTarget ?? doc.slug)
        : [],
    [editing, currentKind, draftKind, kindChangeReferrers, moveTarget, doc.slug],
  );

  const activeKind = editing ? draftKind : currentKind ?? "";
  const activeDomain = editing ? draftDomain : currentDomain;
  const [debouncedValidation, setDebouncedValidation] = useState({
    kind: activeKind,
    domain: activeDomain,
    moveTarget: null as string | null,
  });
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedValidation({ kind: activeKind, domain: activeDomain, moveTarget });
    }, 400);
    return () => window.clearTimeout(handle);
  }, [activeKind, activeDomain, moveTarget]);

  const validationIssues = useMemo(
    () => validationIssuesFor(
      { frontmatter: doc.frontmatter, diagnostics: doc.diagnostics, slug: doc.slug },
      debouncedValidation,
    ),
    [doc.frontmatter, doc.diagnostics, doc.slug, debouncedValidation],
  );

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

  const fields = graphFieldKeys(doc.frontmatter).map((key) => {
    const raw = doc.frontmatter?.[key];
    const ref = REFERENCE_KEYS.has(key) ? toRefTokens(raw) : null;
    return {
      key: key as string,
      value: formatValue(raw, key),
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

  const hasReferenceField = fields.some((f) => REFERENCE_KEYS.has(f.key));
  const codeLocations = collectCodeLocations(doc.frontmatter?.elements);
  const definitionLede = formatValue(doc.frontmatter?.definition);

  const kindValue = currentKind;
  // Only with a resolver that knows the folder; sample and server vaults are never accused.
  const danglingRefs = kindValue && resolveRef ? collectDanglingRefs(doc.frontmatter, resolveRef) : [];
  const danglingSet = new Set(danglingRefs);
  const misfiledRefs =
    kindValue && resolveRef && kindOf ? collectMisfiledRefs(doc.frontmatter, resolveRef, kindOf) : [];
  const kindFolderTarget =
    kindValue && canEdit && onMoveToKindFolder ? kindFolderAddress(doc.slug, kindValue) : null;

  const diagnosticOnly = !kindValue;
  // A wiki page has no `kind:` by contract (`validateWikiPage` flags one), so no diagnosis.
  if (isWikiPage(doc)) return null;
  if (diagnosticOnly && validationIssues.length === 0) return null;
  if (!diagnosticOnly && fields.length === 0 && codeLocations.length === 0 && !definitionLede) {
    return null;
  }

  const canQuickPatch =
    canEdit && Boolean(onPatch) && (kindValue == null || isEditableKind(kindValue));

  function startEditing() {
    setDraftKind(currentKind ?? "");
    setDraftDomain(currentDomain);
    setDraftTitle(currentTitle);
    setDraftNames(currentNames);
    setError(null);
    setEditing(true);
    setOpen(true);
  }

  async function handleSave() {
    if (!onPatch) return;
    setSaving(true);
    setError(null);
    try {
      const patch = buildFrontmatterPatch(
        { kind: draftKind, domain: draftDomain, title: draftTitle, names: draftNames },
        { kind: currentKind, domain: currentDomain, title: currentTitle, names: currentNames },
        nameLocales,
      );
      if (Object.keys(patch).length > 0) {
        await onPatch(patch);
      }
      setEditing(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof VaultConflictError
          ? { sentence: t("saveConflict"), detail: caughtError.message }
          : failureSentence(caughtError, t("saveFailed")),
      );
    } finally {
      setSaving(false);
    }
  }

  const issueRows = (
    <ValidationIssueRows
      validationIssues={validationIssues}
      danglingRefs={danglingRefs}
      misfiledRefs={misfiledRefs}
      kindFolderTarget={kindFolderTarget}
      editing={editing}
      onMoveToKindFolder={onMoveToKindFolder}
    />
  );

  const quickPatchSection = canQuickPatch ? (
    <QuickPatchSection
      docSlug={doc.slug}
      editing={editing}
      saving={saving}
      error={error}
      diagnosticOnly={diagnosticOnly}
      draftKind={draftKind}
      onDraftKind={setDraftKind}
      draftDomain={draftDomain}
      onDraftDomain={setDraftDomain}
      draftTitle={draftTitle}
      onDraftTitle={setDraftTitle}
      draftNames={draftNames}
      onDraftNames={setDraftNames}
      nameLocales={nameLocales}
      domainOptions={domainOptions}
      moveTarget={moveTarget}
      kindChangeRows={kindChangeRows}
      onStartEditing={startEditing}
      onSave={() => void handleSave()}
      onCancel={() => setEditing(false)}
    />
  ) : null;

  if (diagnosticOnly) {
    return (
      <section
        aria-label={t("diagnosticAriaLabel")}
        data-testid="doc-frontmatter-block"
        data-variant="diagnostic"
        className="mx-auto mt-4 max-w-[var(--measure-doc-column)] px-6 md:px-10"
      >
        <div className="rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-4 py-3">
          <p className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {t("notOnMapTitle")}
          </p>
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
      className="mx-auto mt-4 max-w-[var(--measure-doc-column)] px-6 md:px-10"
    >
      {definitionLede ? (
        <div
          data-testid="doc-frontmatter-definition"
          className="mb-3 border-l-2 border-[color:var(--color-border-strong)] pl-3"
        >
          <div className="text-label text-[color:var(--color-text-quaternary)]">
            {t("definitionLabel")}
          </div>
          <p className="mt-0.5 text-body leading-body text-[color:var(--color-text-secondary)]">
            {definitionLede}
          </p>
        </div>
      ) : null}
      <button
        type="button"
        data-testid="doc-frontmatter-summary"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex min-h-10 w-full items-center gap-2 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-4 py-2.5 text-left font-sans text-body leading-body text-[color:var(--color-text-tertiary)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)] transition-colors hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-overlay-1)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]"
      >
          {kindValue ? (
            <span data-testid="doc-frontmatter-summary-kind" data-kind={kindValue} className="inline-flex min-w-0 items-center gap-1.5 text-[color:var(--color-text-secondary)]">
              <OntologyMapKindGlyph kind={kindValue} size={12} className="flex-none" />
              <span className="truncate font-[var(--font-weight-emphasis)]">{kindLabel(kindValue)}</span>
            </span>
          ) : null}
        <span className="ml-auto flex-none text-label leading-label">
          {t("collapsedSummary", { count: fields.length })}
        </span>
      </button>
      {/* The fields open in a centred sheet, not a disclosure that pushes the body down. */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        labelledBy="doc-frontmatter-dialog-title"
        testId="doc-frontmatter-dialog"
        className="flex max-h-[calc(100dvh-var(--chrome-inset)*2)] flex-col"
      >
        <div className="flex items-start gap-3">
        <h2 id="doc-frontmatter-dialog-title" className="flex min-w-0 flex-1 items-center gap-2 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
          {kindValue ? <OntologyMapKindGlyph kind={kindValue} size={14} className="flex-none" /> : null}
          <span className="truncate">{kindValue ? kindLabel(kindValue) : t("ariaLabel")}</span>
          <span className="ml-auto flex-none text-label font-normal leading-label text-[color:var(--color-text-tertiary)]">
            {t("collapsedSummary", { count: fields.length })}
          </span>
        </h2>
          <CloseButton label={t("close")} onClick={() => setOpen(false)} className="-mt-1 -mr-1 flex-none" />
        </div>
        <div className="-mx-4 mt-3 min-h-0 overflow-y-auto px-4 font-mono text-body leading-prose text-[color:var(--color-text-tertiary)]">
        <div className="border-t border-[color:var(--color-divider)] pt-2">
          <div className="text-[color:var(--color-text-quaternary)]" aria-hidden>
            ---
          </div>
          <FrontmatterFieldRows
            fields={fields}
            onNavigate={onNavigate}
            resolveRef={resolveRef}
            danglingSet={danglingSet}
          />
          <div className="text-[color:var(--color-text-quaternary)]" aria-hidden>
            ---
          </div>
          {/* One consumer reads all relation keys: the compiler, which reports, never refuses, an
             unresolved entry (`tests/contract/controls/field-help-consumers.contract.test.ts`). */}
          {hasReferenceField ? (
            <div className="mt-2 border-t border-[color:var(--color-divider)] pt-2">
              <p
                data-testid="doc-frontmatter-relations-help"
                className="max-w-[var(--measure-prose)] font-sans text-body leading-body text-[color:var(--color-text-tertiary)]"
              >
                {t("relationsConsumerHelp")}
              </p>
            </div>
          ) : null}
        </div>
        {codeLocations.length > 0 ? <CodeLocationsList codeLocations={codeLocations} /> : null}
        {quickPatchSection}
        <p
          data-testid="doc-frontmatter-note" className="mt-2 flex items-center gap-1.5 font-sans text-label text-[color:var(--color-text-quaternary)]">
          <svg width="16" height="6" viewBox="0 0 16 6" aria-hidden="true" className="shrink-0">
            <line
              x1="1"
              y1="3"
              x2="15"
              y2="3"
              stroke="var(--map-edge-contains-mark, var(--color-border-strong))"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          {t("note")}
        </p>
        {exampleDoc ? (
          <FrontmatterExample
            exampleDoc={exampleDoc}
            open={exampleOpen}
            onToggle={() => setExampleOpen((v) => !v)}
            copied={exampleCopyState === "copied"}
            onCopy={() => void copyExample(exampleDoc)}
          />
        ) : null}
        </div>
      </Dialog>
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
