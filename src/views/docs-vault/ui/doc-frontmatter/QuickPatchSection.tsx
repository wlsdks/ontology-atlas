import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Dispatch, SetStateAction } from "react";
import { containmentKeyForKind } from "@/shared/lib/vault-document/containment-keys";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import type { KindChangeReferrer } from "@/entities/docs-vault";
import { LOCALE_NAME_KEY } from "@/i18n/locales";
import { Select, controlClass } from "@/shared/ui";
import { Input } from "@/shared/ui/fields/input";
import { fieldClass, fieldLabel } from "@/shared/ui/control-class";
import { EDITABLE_KINDS } from "../../lib/doc-frontmatter/quick-patch";
import { useReferrerListName } from "../../model/use-doc-write-actions";
import type { FailureCopy } from "@/shared/lib/failures/use-failure-sentence";

const KIND_CHANGE_ROWS_MAX = 4;

export interface KindChangeReferrerRow extends KindChangeReferrer {
  name: string;
}

interface Props {
  docSlug: string;
  editing: boolean;
  saving: boolean;
  error: FailureCopy | null;
  /** The document has no `kind:`, so the action says "set kind". */
  diagnosticOnly: boolean;
  draftKind: string;
  onDraftKind: Dispatch<SetStateAction<string>>;
  draftDomain: string;
  onDraftDomain: Dispatch<SetStateAction<string>>;
  draftTitle: string;
  onDraftTitle: Dispatch<SetStateAction<string>>;
  draftNames: Record<string, string>;
  onDraftNames: Dispatch<SetStateAction<Record<string, string>>>;
  nameLocales: readonly string[];
  domainOptions: Array<{ slug: string; title: string }>;
  /** Where a kind change moves the document, or null when it stays. */
  moveTarget: string | null;
  kindChangeRows: KindChangeReferrerRow[];
  onStartEditing: () => void;
  onSave: () => void;
  onCancel: () => void;
}

/** The inline kind / domain / title / names edit: an action, then the form it opens. */
export function QuickPatchSection({
  docSlug,
  editing,
  saving,
  error,
  diagnosticOnly,
  draftKind,
  onDraftKind,
  draftDomain,
  onDraftDomain,
  draftTitle,
  onDraftTitle,
  draftNames,
  onDraftNames,
  nameLocales,
  domainOptions,
  moveTarget,
  kindChangeRows,
  onStartEditing,
  onSave,
  onCancel,
}: Props) {
  const t = useTranslations("docsVault.frontmatterBlock");
  const tLocale = useTranslations("locale");
  const kindLabel = useOntologyKindLabel();
  const listName = useReferrerListName();
  const localeNameOf = (code: string): string => {
    const nameKey = (LOCALE_NAME_KEY as Record<string, string>)[code];
    return nameKey && tLocale.has(nameKey) ? tLocale(nameKey) : code;
  };

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

  if (!editing) {
    return (
      <button
        type="button"
        onClick={onStartEditing}
        data-testid="doc-frontmatter-edit-action"
        className={controlClass({
          shape: "link",
          className: "touch-hit-expand mt-2 font-sans hover:text-[color:var(--color-text-primary)]",
        })}
      >
        <Pencil size={ICON_SIZE.sm} aria-hidden />
        {diagnosticOnly ? t("setKindAction") : t("editAction")}
      </button>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-[color:var(--color-divider)] pt-3 font-sans">
      <label className={fieldLabel({ className: "flex flex-col gap-1" })}>
        {t("editKindLabel")}
        <Select
          size="sm"
          value={draftKind}
          onChange={onDraftKind}
          disabled={saving}
          data-testid="doc-frontmatter-kind-select"
          ariaDescribedby={
            [
              moveTarget ? `doc-frontmatter-move-hint-${docSlug}` : null,
              kindChangeRows.length > 0 ? `doc-frontmatter-kind-referrers-${docSlug}` : null,
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
          placeholder={t("editKindUnset")}
          options={EDITABLE_KINDS.map((kind) => ({ value: kind, label: kindLabel(kind) }))}
        />
      </label>
      {moveTarget ? (
        <p
          id={`doc-frontmatter-move-hint-${docSlug}`}
          data-testid="doc-frontmatter-move-hint"
          className="text-label leading-label text-[color:var(--color-text-tertiary)]"
        >
          {t("editKindMoveHint", { path: `${moveTarget}.md` })}
        </p>
      ) : null}
      {kindChangeRows.length > 0 ? (
        <ul
          id={`doc-frontmatter-kind-referrers-${docSlug}`}
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
        <Select
          size="sm"
          value={draftDomain}
          onChange={onDraftDomain}
          disabled={saving}
          data-testid="doc-frontmatter-domain-select"
          options={[
            { value: "", label: t("editDomainNone") },
            ...domainOptions.map((option) => ({ value: option.slug, label: option.title })),
          ]}
        />
      </label>
      <label className={fieldLabel({ className: "flex flex-col gap-1" })}>
        {t("editTitleLabel")}
        <input
          type="text"
          value={draftTitle}
          onChange={(event) => onDraftTitle(event.target.value)}
          disabled={saving}
          className={fieldClass({ size: "xs" })}
        />
      </label>
      {nameLocales.map((code, index) => (
        <Input
          key={code}
          size="xs"
          label={t("editDisplayNameLabel", {
            language: localeNameOf(code),
          })}
          value={draftNames[code] ?? ""}
          onChange={(event) =>
            onDraftNames((previous) => ({ ...previous, [code]: event.target.value }))
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
          onClick={onSave}
          disabled={saving}
          className={controlClass({
            shape: "chip",
            tone: "accent",
            className: "hover:bg-[color:var(--color-indigo-a16)]",
          })}
        >
          {saving ? t("editSaving") : t("editSave")}
        </button>
        <button
          type="button"
          onClick={onCancel}
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
  );
}
