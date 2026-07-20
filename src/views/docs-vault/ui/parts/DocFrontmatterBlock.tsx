import { useState } from "react";
import { ChevronRight, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import type { VaultDoc } from "@/entities/docs-vault";
import { useOntologyKindLabel } from "@/entities/ontology-class";

/**
 * Engraved frontmatter visualization — "frontmatter 가 곧 그래프" made literal
 * in the editor. Renders the ontology-shaped subset of `doc.frontmatter`
 * (kind/slug/title/domain/depends_on/relates_to/contains/belongs_to/evidence)
 * as a machined mono block, mirroring exactly what `deriveOntologyFromVault`
 * reads to build the topology graph.
 *
 * Only rendered when `frontmatter.kind` is present — plain guide docs (no
 * ontology kind) don't get an (empty, confusing) block.
 *
 * Collapsed by default (`<details open={false}>`) — long documents used to
 * have this block push the H1 below the first screen. Frontmatter is the
 * graph source so it's never deleted/hidden from the DOM, only collapsed;
 * the summary line still surfaces `kind` / `slug` / field count so the
 * reader knows what's inside before expanding. Caller mounts this component
 * with `key={doc.slug}` so switching documents remounts it and resets the
 * collapse state — no cross-document memory, no URL/session pollution.
 *
 * P5b — quick-patch action (.qa-scratch/docs-identity-2026-07/verdict.md
 * 더하기①, "문서함 = 의미 편집실"). When a writable local vault is loaded
 * (`canEdit` + `onPatch` supplied) and the doc's kind is one the vault
 * schema recognizes, an inline edit affordance lets the reader fix
 * kind/domain/title in place — typed fields get a typed (select) tool
 * instead of raw YAML hand-editing. Saves go through the same
 * `updateFrontmatter` conflict-guarded path the builder's relation preflight
 * already uses (`OntologyEditPage.tsx`) — one write path, two surfaces.
 */

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

// vault frontmatter schema 가 인식하는 편집 가능 kind 만 — vault-readme /
// unknown 같은 sentinel kind 는 이 select 로 건드리지 않는다.
const EDITABLE_KINDS = ["project", "domain", "capability", "element", "document"] as const;
type EditableKind = (typeof EDITABLE_KINDS)[number];

function isEditableKind(kind: string): kind is EditableKind {
  return (EDITABLE_KINDS as readonly string[]).includes(kind);
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
  /** local vault 가 쓰기 가능할 때만 true — 서버/샘플 볼트에선 읽기 전용. */
  canEdit?: boolean;
  /** capability/element 의 domain select 후보 — vault 의 `kind: domain` 문서들. */
  domainOptions?: Array<{ slug: string; title: string }>;
  /** 확정된 필드만 담아 호출 — 저장은 caller (updateFrontmatter conflict
   *  guard 경유) 책임. */
  onPatch?: (patch: DocFrontmatterPatch) => Promise<void>;
}

export function DocFrontmatterBlock({
  doc,
  canEdit = false,
  domainOptions = [],
  onPatch,
}: DocFrontmatterBlockProps) {
  const t = useTranslations("docsVault.frontmatterBlock");
  const kindLabel = useOntologyKindLabel();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentKind = formatValue(doc.frontmatter?.kind);
  const currentDomain = formatValue(doc.frontmatter?.domain) ?? "";
  const currentTitle = formatValue(doc.frontmatter?.title) ?? doc.title;
  const [draftKind, setDraftKind] = useState(currentKind ?? "");
  const [draftDomain, setDraftDomain] = useState(currentDomain);
  const [draftTitle, setDraftTitle] = useState(currentTitle);

  const fields = GRAPH_KEYS.map((key) => ({
    key: key as string,
    value: formatValue(doc.frontmatter?.[key]),
  })).filter((f): f is { key: string; value: string } => f.value !== null);

  if (fields.length === 0) return null;

  const kindValue = currentKind;
  const slugValue = formatValue(doc.frontmatter?.slug) ?? doc.slug;
  const canQuickPatch =
    canEdit && Boolean(onPatch) && kindValue != null && isEditableKind(kindValue);

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

  return (
    <section
      aria-label={t("ariaLabel")}
      data-testid="doc-frontmatter-block"
      className="mx-auto mt-4 max-w-[760px] px-6 md:px-10"
    >
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="group rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-4 py-3 font-mono text-[12px] leading-[1.85] text-[color:var(--color-text-tertiary)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]"
      >
        <summary
          data-testid="doc-frontmatter-summary"
          aria-label={open ? t("collapseAria") : t("expandAria")}
          className="flex cursor-pointer list-none items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-line-a45)]"
        >
          <ChevronRight
            size={11}
            aria-hidden
            className="flex-none text-[color:var(--color-text-quaternary)] transition-transform group-open:rotate-90"
          />
          <span aria-hidden>---</span>
          {kindValue ? (
            <>
              <span className="text-[color:var(--color-text-quaternary)]">kind:</span>
              <span className="font-semibold text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]">
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
          {fields.map(({ key, value }) => (
            <div key={key} className="flex min-w-0 flex-wrap gap-x-1.5">
              <span className="text-[color:var(--color-text-quaternary)]">{key}:</span>
              <span
                className={
                  key === "kind"
                    ? "font-semibold text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
                    : "min-w-0 truncate text-[color:var(--color-text-secondary)]"
                }
              >
                {value}
              </span>
            </div>
          ))}
          <div className="text-[color:var(--color-text-quaternary)]" aria-hidden>
            ---
          </div>
        </div>
        {canQuickPatch ? (
          editing ? (
            <div className="mt-3 flex flex-col gap-2 border-t border-[color:var(--color-divider)] pt-3 font-sans">
              <label className="flex flex-col gap-1 text-[11px] text-[color:var(--color-text-tertiary)]">
                {t("editKindLabel")}
                <select
                  value={draftKind}
                  onChange={(event) => setDraftKind(event.target.value)}
                  disabled={saving}
                  className="rounded-sm border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[12px] text-[color:var(--color-text-primary)]"
                >
                  {EDITABLE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kindLabel(kind)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-[color:var(--color-text-tertiary)]">
                {t("editDomainLabel")}
                <select
                  value={draftDomain}
                  onChange={(event) => setDraftDomain(event.target.value)}
                  disabled={saving}
                  className="rounded-sm border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[12px] text-[color:var(--color-text-primary)]"
                >
                  <option value="">{t("editDomainNone")}</option>
                  {domainOptions.map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {option.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-[color:var(--color-text-tertiary)]">
                {t("editTitleLabel")}
                <input
                  type="text"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  disabled={saving}
                  className="rounded-sm border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[12px] text-[color:var(--color-text-primary)]"
                />
              </label>
              {error ? (
                <p role="alert" className="text-[11px] text-[color:var(--color-status-danger)]">
                  {error}
                </p>
              ) : null}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="rounded-sm border border-[color:var(--color-indigo-a42)] bg-[color:var(--color-indigo-a10)] px-2.5 py-1 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-indigo-a16)] disabled:opacity-60"
                >
                  {saving ? t("editSaving") : t("editSave")}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="text-[11px] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
                >
                  {t("editCancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={startEditing}
              className="mt-2 inline-flex items-center gap-1.5 font-sans text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              <Pencil size={11} aria-hidden />
              {t("editAction")}
            </button>
          )
        ) : null}
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[color:var(--color-text-quaternary)]">
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
      </details>
    </section>
  );
}
