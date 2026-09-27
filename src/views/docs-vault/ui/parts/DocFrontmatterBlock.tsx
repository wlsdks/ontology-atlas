import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Clipboard, Pencil } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { OntologyMapKindGlyph } from "@/shared/ui/map-kind-glyph";
import { useLocale, useTranslations } from "next-intl";
import {
  buildNewNodeDoc,
  isWikiPage,
  type KindChangeReferrer,
  type VaultDoc,
} from "@/entities/docs-vault";
import {
  CONTAINMENT_KEYS,
  containmentKeyForKind,
  kindForContainmentKey,
} from "@/shared/lib/containment-keys";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { VaultConflictError, type AgentActivityStatus } from "@/entities/vault-session";
import { routing } from "@/i18n/routing";
import { computeEditAge } from "@/shared/lib/edit-age";
import { looksLikeCodePath } from "@/shared/lib/humanize-code-path-title";
import { truncateMiddlePath } from "@/shared/lib/truncate-middle-path";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { useFailureSentence, type FailureCopy } from "@/shared/lib/use-failure-sentence";
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
import { Input } from "@/shared/ui/input";
import { kindFolderAddress, reclassifyMoveTarget } from "../../lib/kind-folder-move";
import { hasDocMtimeConflict, resolveDocLastEditSubject } from "../../lib/resolve-doc-edit-subject";
import { fieldClass, fieldLabel } from '@/shared/ui/control-class';

// Stable empty Map keeps `useMemo` deps stable.
const EMPTY_SELF_EDIT_TIMESTAMPS: ReadonlyMap<string, number> = new Map();

const GRAPH_KEYS = [
  "kind",
  "slug",
  "title",
  // `display_<locale>` keys are listed right after `title` — see `graphFieldKeys`.
  "domain",
  "category",
  "status",
  "depends_on",
  "relates_to",
  "contains",
  "belongs_to",
  "evidence",
] as const;

/** Per-language names are graph facts: screens show `display_<locale>` before `title`. */
const DISPLAY_NAME_KEY = /^display_[a-z]{2}$/;

function graphFieldKeys(frontmatter: Record<string, unknown> | undefined): string[] {
  const displayKeys = Object.keys(frontmatter ?? {})
    .filter((key) => DISPLAY_NAME_KEY.test(key))
    .sort();
  const titleAt = GRAPH_KEYS.indexOf("title") + 1;
  return [...GRAPH_KEYS.slice(0, titleAt), ...displayKeys, ...GRAPH_KEYS.slice(titleAt)];
}

/** Reader's locale first, the order the "create concept" form asks in. */
function nameLocalesFor(current: string): string[] {
  const all: readonly string[] = routing.locales;
  return all.includes(current) ? [current, ...all.filter((code) => code !== current)] : [...all];
}

/**
 * Keys whose value names another node (the MCP neighbour-key family); `elements:` also
 * carries code paths, which are evidence.
 */
const DANGLING_CHECK_KEYS = [
  "domain",
  "domains",
  "capabilities",
  "elements",
  "dependencies",
  "depends_on",
  "relates",
  "relates_to",
  "contains",
  "describes",
  "broader",
  "belongs_to",
] as const;

/**
 * References nothing in the folder answers to (the compiler's `dangling-graph-reference`).
 * The page resolver never resolves less than the compiler, so every name here is also unplaced there.
 */
function collectDanglingRefs(
  frontmatter: Record<string, unknown> | undefined,
  resolveRef: (token: string) => string | null,
): string[] {
  const dangling = new Set<string>();
  for (const key of DANGLING_CHECK_KEYS) {
    const { tokens } = toRefTokens(frontmatter?.[key]);
    for (const token of tokens) {
      if (key === "elements" && looksLikeCodePath(token)) continue;
      if (resolveRef(token) == null) dangling.add(token);
    }
  }
  return [...dangling];
}

/** How many missing names the warning spells out before it counts the rest. */
const DANGLING_NAMED_MAX = 3;

/**
 * Entries in a list named for a kind whose document is another kind; they resolve, so the
 * dangling warning misses them, but the map counts them by their list.
 */
function collectMisfiledRefs(
  frontmatter: Record<string, unknown> | undefined,
  resolveRef: (token: string) => string | null,
  kindOf: (slug: string) => string | null,
): Array<{ token: string; key: string; kind: string }> {
  const misfiled: Array<{ token: string; key: string; kind: string }> = [];
  const seen = new Set<string>();
  for (const key of [...CONTAINMENT_KEYS, "domain"]) {
    const expected = key === "domain" ? "domain" : kindForContainmentKey(key);
    const { tokens } = toRefTokens(frontmatter?.[key]);
    for (const token of tokens) {
      if (key === "elements" && looksLikeCodePath(token)) continue;
      const target = resolveRef(token);
      const kind = target ? kindOf(target) : null;
      if (!kind || kind === expected || seen.has(`${key}\0${token}`)) continue;
      seen.add(`${key}\0${token}`);
      misfiled.push({ token, key, kind });
    }
  }
  return misfiled;
}

/** One document a kind change touches, as the page names it (`planKindChangeReferrers`). */
export interface KindChangeReferrerRow extends KindChangeReferrer {
  name: string;
}

/** How many referrers the quick patch names before Save, before it counts the rest. */
const KIND_CHANGE_ROWS_MAX = 4;

/** The reader's word for a kind-named list key; shared with the page's receipt. */
export function useReferrerListName(): (key: string) => string {
  const t = useTranslations("docsVault.frontmatterBlock.referrerLists.listName");
  return useCallback(
    (key: string) => {
      switch (key) {
        case "domains":
          return t("domains");
        case "capabilities":
          return t("capabilities");
        case "elements":
          return t("elements");
        case "domain":
          return t("domain");
        default:
          return key;
      }
    },
    [t],
  );
}

// Sentinel kinds such as vault-readme are not editable here.
const EDITABLE_KINDS = ["project", "domain", "capability", "element", "document"] as const;
type EditableKind = (typeof EDITABLE_KINDS)[number];

function isEditableKind(kind: string): kind is EditableKind {
  return (EDITABLE_KINDS as readonly string[]).includes(kind);
}

// Keys that reference another node by slug; `evidence`, `category` and `status` are not references.
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
  /** A per-language name (`display_ko`, `display_en`, …); null removes the key. */
  [displayName: `display_${string}`]: string | null | undefined;
}

export interface DocFrontmatterBlockProps {
  doc: VaultDoc;
  /** Read-only on server and sample vaults. */
  canEdit?: boolean;
  /** Domain candidates for a capability or element — the vault's `kind: domain` documents. */
  domainOptions?: Array<{ slug: string; title: string }>;
  /**
   * Confirmed fields only. The caller saves through the conflict-guarded `updateFrontmatter`,
   * or the guarded rename when the kind change moves the file; rejections show in the form.
   */
  onPatch?: (patch: DocFrontmatterPatch) => Promise<void>;
  /** The remedy beside the `slug-outside-kind-folder` warning. */
  onMoveToKindFolder?: (target: string) => void;
  /** Previews, before Save, what changing to `newKind` at `newSlug` does to each referrer's list. */
  kindChangeReferrers?: (newKind: string, newSlug: string) => KindChangeReferrerRow[];
  onNavigate?: (slug: string) => void;
  /** Null means the reference is not in the vault and is not a link. */
  resolveRef?: (token: string) => string | null;
  /** Without it (sample or server vault) nothing is judged misfiled. */
  kindOf?: (slug: string) => string | null;
  /** Without it (sample or server vault) the AI subject row is not rendered. */
  agentActivityStatus?: AgentActivityStatus | null;
  /**
   * Slugs this session wrote (`useLocalVault().selfEditTimestamps`); without it neither the
   * "me" row nor the conflict badge renders.
   */
  selfEditTimestamps?: ReadonlyMap<string, number>;
}

/**
 * The ontology subset of `doc.frontmatter` that `deriveOntologyFromVault` reads, as a mono block.
 * Collapsed by default but never removed from the DOM; the caller remounts it per document
 * with `key={doc.slug}`.
 */
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
  const listName = useReferrerListName();
  const tProvenance = useTranslations("editProvenance");
  const tLocale = useTranslations("locale");
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
  // Only real data: a heartbeat match or a self-write this session; otherwise no row.
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
  const nameLocales = nameLocalesFor(locale);
  const currentNames = Object.fromEntries(
    nameLocales.map((code) => [code, formatValue(doc.frontmatter?.[`display_${code}`]) ?? ""]),
  );
  const [draftKind, setDraftKind] = useState(currentKind ?? "");
  const [draftDomain, setDraftDomain] = useState(currentDomain);
  const [draftTitle, setDraftTitle] = useState(currentTitle);
  const [draftNames, setDraftNames] = useState<Record<string, string>>(currentNames);
  // Where a kind change's Save moves the file, stated before Save.
  const moveTarget = editing ? reclassifyMoveTarget(doc.slug, currentKind, draftKind) : null;
  const kindChangeRows = useMemo(
    () =>
      editing && currentKind && draftKind && draftKind !== currentKind && kindChangeReferrers
        ? kindChangeReferrers(draftKind, moveTarget ?? doc.slug)
        : [],
    [editing, currentKind, draftKind, kindChangeReferrers, moveTarget, doc.slug],
  );

  // The draft is validated while editing, otherwise the saved frontmatter after 400ms.
  // Errors are shown as well as warnings.
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

  const validationIssues = useMemo<VaultDocumentIssue[]>(() => {
    const stored = doc.frontmatter ?? {};
    // A document without a kind is still validated. A moving kind change is validated at its new
    // address; `slug:` follows only when it mirrors the address (`rewriteMovedDocSelf`).
    const movedSlug =
      debouncedValidation.moveTarget && stored.slug === doc.slug
        ? { slug: debouncedValidation.moveTarget }
        : {};
    const frontmatterForValidation: Record<string, unknown> = debouncedValidation.kind
      ? { ...stored, kind: debouncedValidation.kind, domain: debouncedValidation.domain, ...movedSlug }
      : stored;
    // Parser diagnostics travel with the doc so an unreadable line is shown, not dropped.
    const issues = validateVaultDocFrontmatter(
      frontmatterForValidation,
      doc.diagnostics,
    ).issues;
    // Errors first: reading order is repair order.
    return [
      ...issues.filter((issue) => issue.severity === "error"),
      ...issues.filter((issue) => issue.severity !== "error"),
    ];
  }, [doc.frontmatter, doc.diagnostics, doc.slug, debouncedValidation]);

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
      // Without an entry here the strip shows the raw code.
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

  // A complete example for the current kind from the new-document starter (`buildNewNodeDoc`).
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

  // Raw code paths from `elements:` are evidence, not node references, so they are not links;
  // a misplaced vault ref is kept out by `looksLikeCodePath`.
  const hasReferenceField = fields.some((f) => REFERENCE_KEYS.has(f.key));

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

  // A `definition:` key is shown as an always-visible lede.
  const definitionValue = formatValue(doc.frontmatter?.definition);

  const kindValue = currentKind;
  // Only with a resolver that knows the folder; sample and server vaults are never accused.
  const danglingRefs = kindValue && resolveRef ? collectDanglingRefs(doc.frontmatter, resolveRef) : [];
  const danglingSet = new Set(danglingRefs);
  const misfiledRefs =
    kindValue && resolveRef && kindOf ? collectMisfiledRefs(doc.frontmatter, resolveRef, kindOf) : [];
  const kindFolderTarget =
    kindValue && canEdit && onMoveToKindFolder ? kindFolderAddress(doc.slug, kindValue) : null;

  // A document with no kind states its own problem, but only when it shows ontology intent,
  // matching the validator's heuristic.
  const diagnosticOnly = !kindValue;
  // A wiki page has no `kind:` by contract (`validateWikiPage` flags one), so no diagnosis.
  if (isWikiPage(doc)) return null;
  if (diagnosticOnly && validationIssues.length === 0) return null;
  if (!diagnosticOnly && fields.length === 0 && codeLocations.length === 0 && !definitionValue) {
    return null;
  }

  // Fixable even when kind is empty.
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
      const patch: DocFrontmatterPatch = {};
      if (draftKind && draftKind !== currentKind) patch.kind = draftKind;
      if (draftTitle.trim() && draftTitle.trim() !== currentTitle) {
        patch.title = draftTitle.trim();
      }
      const nextDomain = draftDomain.trim();
      if (nextDomain !== currentDomain) {
        patch.domain = nextDomain || null;
      }
      // An emptied name is removed; screens then fall back to `title`.
      for (const code of nameLocales) {
        const nextName = (draftNames[code] ?? "").trim();
        if (nextName !== currentNames[code]) patch[`display_${code}`] = nextName || null;
      }
      if (Object.keys(patch).length > 0) {
        await onPatch(patch);
      }
      setEditing(false);
    } catch (err) {
      setError(
        err instanceof VaultConflictError
          ? { sentence: t("saveConflict"), detail: err.message }
          : failureSentence(err, t("saveFailed")),
      );
    } finally {
      setSaving(false);
    }
  }

  /** Severity comes through colour, a data attribute, and an error `!`, never colour alone. */
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
  const issueRows =
    validationIssues.length > 0 || danglingRefs.length > 0 || misfiledRefs.length > 0 ? (
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
            {/* The file keeps its name and every referrer is rewritten. */}
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
    ) : null;

  function kindChangeSentence(row: KindChangeReferrerRow): string {
    const move = row.moved[0];
    if (move) {
      return t("referrerLists.movedPreview", {
        name: row.name,
        from: listName(move.from),
        to: listName(move.to),
      });
    }
    const kept = row.kept[0];
    if (!kept) return "";
    if (kept.key === "domain") return t("referrerLists.keptDomainPreview", { name: row.name });
    const newList = containmentKeyForKind(draftKind);
    return newList
      ? t("referrerLists.keptPreview", { name: row.name, list: listName(kept.key), to: listName(newList) })
      : t("referrerLists.keptNoListPreview", { name: row.name, list: listName(kept.key) });
  }

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
            aria-describedby={
              [
                moveTarget ? `doc-frontmatter-move-hint-${doc.slug}` : null,
                kindChangeRows.length > 0 ? `doc-frontmatter-kind-referrers-${doc.slug}` : null,
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
            className={fieldClass({ size: "xs" })}
          >
            {/* Without a placeholder the browser shows the first option as if a kind were chosen. */}
            {draftKind === "" ? <option value="">{t("editKindUnset")}</option> : null}
            {EDITABLE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kindLabel(kind)}
              </option>
            ))}
          </select>
        </label>
        {moveTarget ? (
          <p
            id={`doc-frontmatter-move-hint-${doc.slug}`}
            data-testid="doc-frontmatter-move-hint"
            className="text-label leading-label text-[color:var(--color-text-tertiary)]"
          >
            {t("editKindMoveHint", { path: `${moveTarget}.md` })}
          </p>
        ) : null}
        {kindChangeRows.length > 0 ? (
          <ul
            id={`doc-frontmatter-kind-referrers-${doc.slug}`}
            data-testid="doc-frontmatter-kind-referrers"
            className="flex flex-col gap-1 text-label leading-label text-[color:var(--color-text-tertiary)]"
          >
            {kindChangeRows.slice(0, KIND_CHANGE_ROWS_MAX).map((row) => (
              <li
                key={row.slug}
                data-testid="doc-frontmatter-kind-referrer"
                data-referrer={row.slug}
                data-outcome={row.kept.length > 0 ? "kept" : "moved"}
                className={row.kept.length > 0 ? "text-[color:var(--color-amber-docs-a92)]" : undefined}
              >
                {kindChangeSentence(row)}
              </li>
            ))}
            {kindChangeRows.length > KIND_CHANGE_ROWS_MAX ? (
              <li>
                {t("referrerLists.previewMore", {
                  count: kindChangeRows.length - KIND_CHANGE_ROWS_MAX,
                })}
              </li>
            ) : null}
          </ul>
        ) : null}
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
        {nameLocales.map((code, index) => (
          <Input
            key={code}
            size="xs"
            label={t("editDisplayNameLabel", {
              language: code === "ko" ? tLocale("korean") : code === "en" ? tLocale("english") : code,
            })}
            value={draftNames[code] ?? ""}
            onChange={(event) =>
              setDraftNames((previous) => ({ ...previous, [code]: event.target.value }))
            }
            disabled={saving}
            data-testid={`doc-frontmatter-display-name-${code}`}
            hint={index === nameLocales.length - 1 ? t("editDisplayNameHint") : undefined}
          />
        ))}
        {error ? (
          <p
            role="alert"
            data-testid="doc-frontmatter-save-error"
            data-failure-detail={error.detail ?? undefined}
            className="text-label leading-label text-[color:var(--color-status-danger)]"
          >
            {error.sentence}
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

  // Not a node yet: one line of why it is not on the map and one place to fix it.
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
          {/* `text-label` carries its own line height. */}
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
          className="flex list-none items-center gap-2 font-sans text-body leading-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]"
        >
          <ChevronRight
            size={ICON_SIZE.sm}
            aria-hidden
            className="flex-none text-[color:var(--color-text-quaternary)] transition-transform group-open:rotate-90"
          />
          {/* The collapsed line names the kind with the map's glyph and a field count; the YAML is one press away. */}
          {kindValue ? (
            <span data-testid="doc-frontmatter-summary-kind" data-kind={kindValue} className="inline-flex min-w-0 items-center gap-1.5 text-[color:var(--color-text-secondary)]">
              <OntologyMapKindGlyph kind={kindValue} size={12} className="flex-none" />
              <span className="truncate font-[var(--font-weight-emphasis)]">{kindLabel(kindValue)}</span>
            </span>
          ) : null}
          <span className="ml-auto flex-none text-label leading-label text-[color:var(--color-text-tertiary)]">
            {t("collapsedSummary", { count: fields.length })}
          </span>
        </summary>
        <div className="mt-2 border-t border-[color:var(--color-divider)] pt-2">
          <div className="text-[color:var(--color-text-quaternary)]" aria-hidden>
            ---
          </div>
          {fields.map(({ key, value, refTokens }) => {
            // Tokenize when a token resolves or is missing, so the missing name is marked too.
            const linkable =
              refTokens != null &&
              refTokens.length > 0 &&
              onNavigate != null &&
              refTokens.some((tok) => resolveRef?.(tok) != null || danglingSet.has(tok));
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
                              // `min-h-6` meets WCAG 2.5.8's 24px floor; the link ramp would force `text-label`,
                              // but a reference inherits the parent font size.
                              className={controlClass({ shape: "link", className: "min-h-6 rounded-chip text-[color:var(--color-indigo-pale-a90)] underline decoration-[color:var(--color-indigo-line-a35)] underline-offset-2 hover:text-[color:var(--color-text-primary)] hover:decoration-[color:var(--color-indigo-line-a45)]" })}
                            >
                              {tok}
                            </button>
                          ) : danglingSet.has(tok) ? (
                            <span
                              data-testid={`doc-frontmatter-dangling-${tok}`}
                              title={t("danglingRefTitle")}
                              className="text-[color:var(--color-amber-docs-a92)] underline decoration-dotted decoration-[color:var(--color-amber-docs-a18)] underline-offset-2"
                            >
                              {tok}
                            </span>
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
          {/* One consumer reads all relation keys: the compiler, which reports, never refuses, an
             unresolved entry (`tests/contract/field-help-consumers.contract.test.ts`). */}
          {hasReferenceField ? (
            <p
              data-testid="doc-frontmatter-relations-help"
              className="mt-2 border-t border-[color:var(--color-divider)] pt-2 font-sans text-label leading-label text-[color:var(--color-text-quaternary)]"
            >
              {t("relationsConsumerHelp")}
            </p>
          ) : null}
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
            {/* `deriveProjectSourceWitnessesFromDocs` turns each path into a witness; a missing one
               turns the receipt to `review_required`. */}
            <p
              data-testid="doc-frontmatter-code-locations-help"
              className="text-label leading-label text-[color:var(--color-text-quaternary)]"
            >
              {t("codeLocationsConsumerHelp")}
            </p>
          </div>
        ) : null}
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
        {/* The spec example appears only when the properties are expanded. */}
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

/** Plain text, not a link: a code path is not a vault node. */
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
