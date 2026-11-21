"use client";

import { type KeyboardEvent, type Ref, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { isImeComposing } from "@/shared/lib/keyboard/ime-composition";
import { findSimilarNodeByTitle, type SimilarNodeCandidate } from "@/shared/lib/search-match/similar-node-title";
import { Button, CloseButton, RowButton, SimilarNodeWarning } from "@/shared/ui";
import { fieldLabel } from "@/shared/ui/control-class";
import { Input } from "@/shared/ui/fields/input";
import { SegmentedControl } from "@/shared/ui/fields/segmented-control";
import { OntologyMapKindGlyph } from "@/shared/ui/ontology-node/map-kind-glyph";
import { KINDS_WITH_PARENT } from "../../model/authoring/create-defaults";

export type CreateNodeKind = "project" | "domain" | "capability" | "element";

export interface CreateNodeInput {
  title: string;
  kind: CreateNodeKind;
  /** The domain document's address (`domains/billing`), for a capability or element. */
  domain?: string;
  /** `{ ko, en }` becomes `display_ko` / `display_en`. */
  localeLabels?: Record<string, string>;
  /** The body's first sentence. */
  description?: string;
}

// Ordered by containment; `vaultFolderForKind` supports every kind here.
const KINDS: readonly CreateNodeKind[] = ["project", "domain", "capability", "element"];
const KIND_LABEL_KEY: Record<CreateNodeKind, string> = {
  project: "kindProject",
  domain: "kindDomain",
  capability: "kindCapability",
  element: "kindElement",
};
const KIND_MEANING_KEY: Record<CreateNodeKind, string> = {
  project: "kindMeaningProject",
  domain: "kindMeaningDomain",
  capability: "kindMeaningCapability",
  element: "kindMeaningElement",
};
/** Enough matches to pick from without the card growing past the map's panel height. */
const PARENT_MATCHES_SHOWN = 5;

/**
 * The create card: it stands at the map's right inset like the concept panel, blocks nothing, and
 * writes on Enter. Cmd/Ctrl+Enter writes and keeps the kind and place for the next concept.
 */
export function CreateNodeForm({
  defaultKind,
  defaultParent,
  parentOptions,
  existingConcepts,
  primaryLocale,
  secondaryLocale,
  onCreate,
  onOpenExisting,
  onClose,
  rootRef,
}: {
  defaultKind: CreateNodeKind;
  defaultParent: string;
  /** value = the domain's document address, label = its display name. */
  parentOptions: readonly { value: string; label: string }[];
  /** `slug` is the map id the warning opens. */
  existingConcepts: readonly SimilarNodeCandidate[];
  /** The screen language; its name is required so the person's own screen never shows a raw title. */
  primaryLocale: string;
  secondaryLocale: string;
  onCreate: (input: CreateNodeInput, options: { keepOpen: boolean }) => Promise<boolean>;
  onOpenExisting: (id: string) => void;
  onClose: () => void;
  rootRef?: Ref<HTMLElement>;
}) {
  const t = useTranslations("topology.createNode");
  const headingId = useId();
  const kindId = useId();
  const titleRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CreateNodeKind>(defaultKind);
  const [parent, setParent] = useState(defaultParent);
  const [parentQuery, setParentQuery] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [secondaryName, setSecondaryName] = useState("");
  const [creating, setCreating] = useState(false);

  const primaryEmpty = title.trim().length === 0;
  const secondaryOnly = primaryEmpty && secondaryName.trim().length > 0;
  const canCreate = !primaryEmpty && !creating;
  const hasParent = KINDS_WITH_PARENT.has(kind);
  const parentLabel = parentOptions.find((option) => option.value === parent)?.label ?? "";
  const similar = useMemo(
    () => findSimilarNodeByTitle(title, kind, existingConcepts),
    [existingConcepts, kind, title],
  );
  const parentMatches = useMemo(() => {
    if (parentQuery === null) return [];
    const needle = parentQuery.trim().toLocaleLowerCase();
    return parentOptions
      .filter((option) => !needle || option.label.toLocaleLowerCase().includes(needle))
      .slice(0, PARENT_MATCHES_SHOWN);
  }, [parentOptions, parentQuery]);

  const submit = async (keepOpen: boolean) => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const created = await onCreate(
        {
          title: title.trim(),
          kind,
          domain: hasParent && parent ? parent : undefined,
          localeLabels: {
            [primaryLocale]: title.trim(),
            ...(secondaryName.trim() ? { [secondaryLocale]: secondaryName.trim() } : {}),
          },
          description: description.trim() || undefined,
        },
        { keepOpen },
      );
      if (created && keepOpen) {
        setTitle("");
        setDescription("");
        setSecondaryName("");
        titleRef.current?.focus();
      }
    } finally {
      setCreating(false);
    }
  };

  const chooseParent = (value: string) => {
    setParent(value);
    setParentQuery(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (parentQuery !== null) setParentQuery(null);
      else onClose();
      return;
    }
    if (event.key !== "Enter" || isImeComposing(event)) return;
    const target = event.target as HTMLElement;
    if (target.tagName !== "INPUT") return;
    event.preventDefault();
    if (parentQuery !== null && target.dataset.testid === "create-node-parent") {
      chooseParent(parentMatches[0]?.value ?? parent);
      return;
    }
    void submit(event.metaKey || event.ctrlKey);
  };

  return (
    <section
      ref={rootRef}
      aria-labelledby={headingId}
      data-testid="create-node-form"
      data-surface-role="beside-map-composer"
      data-create-kind={kind}
      onKeyDown={handleKeyDown}
      className="flex max-h-[var(--map-panel-max-height)] w-full flex-col overflow-y-auto rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] shadow-[var(--map-panel-shadow)]"
    >
      <header className="flex items-center gap-2 px-[var(--map-panel-pad)] pb-2 pt-3">
        <h2
          id={headingId}
          className="min-w-0 flex-1 text-title font-[var(--font-weight-strong)] leading-title text-[color:var(--map-panel-text-primary)]"
        >
          {t("heading")}
        </h2>
        <CloseButton label={t("cancel")} onClick={onClose} data-testid="create-node-cancel" />
      </header>
      <div className="flex flex-col gap-3 px-[var(--map-panel-pad)] pb-4">
        <div className="flex flex-col gap-1.5">
          <Input
            ref={titleRef}
            label={t("primaryNamePlaceholder")}
            className="w-full"
            value={title}
            autoFocus
            autoComplete="off"
            disabled={creating}
            onChange={(event) => setTitle(event.target.value)}
            error={secondaryOnly ? t("primaryLocaleRequired") : undefined}
            data-testid="create-node-title"
          />
          {similar ? (
            <SimilarNodeWarning
              message={t("similarExists", { name: similar.title })}
              openLabel={t("openSimilar")}
              createAnywayLabel={t("createAnyway")}
              onOpen={() => onOpenExisting(similar.slug)}
              onCreateAnyway={() => void submit(false)}
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <span id={kindId} className={fieldLabel()}>
            {t("kind")}
          </span>
          <SegmentedControl
            labelledBy={kindId}
            variant="chips"
            size="md"
            fill
            value={kind}
            onChange={setKind}
            testId="create-node-kind"
            options={KINDS.map((value) => ({
              value,
              testId: `create-node-kind-${value}`,
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <OntologyMapKindGlyph kind={value} size={11} />
                  {t(KIND_LABEL_KEY[value])}
                </span>
              ),
            }))}
          />
          <p data-testid="create-node-kind-meaning" className="text-label leading-prose text-[color:var(--map-panel-text-tertiary)]">
            {t(KIND_MEANING_KEY[kind])}
          </p>
        </div>
        {hasParent ? (
          <div
            className="flex flex-col gap-1"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setParentQuery(null);
            }}
          >
            <Input
              label={t("parentLabel")}
              className="w-full"
              value={parentQuery ?? parentLabel}
              placeholder={t("domainNone")}
              autoComplete="off"
              role="combobox"
              aria-expanded={parentQuery !== null}
              aria-autocomplete="list"
              disabled={creating}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setParentQuery(event.target.value)}
              data-testid="create-node-parent"
            />
            {parentQuery !== null ? (
              // WebKit does not focus a pressed button, so the field's blur would close this list before the click lands.
              <ul role="listbox" aria-label={t("parentLabel")} data-testid="create-node-parent-matches" className="flex flex-col gap-px" onMouseDown={(event) => event.preventDefault()}>
                <li role="presentation">
                  <RowButton role="option" aria-selected={parent === ""} size="sm" onClick={() => chooseParent("")}>
                    <span className="text-[color:var(--map-panel-text-tertiary)]">{t("domainNone")}</span>
                  </RowButton>
                </li>
                {parentMatches.map((option) => (
                  <li key={option.value} role="presentation">
                    <RowButton
                      role="option"
                      aria-selected={parent === option.value}
                      size="sm"
                      onClick={() => chooseParent(option.value)}
                      data-testid="create-node-parent-option"
                    >
                      <OntologyMapKindGlyph kind="domain" size={11} />
                      <span className="min-w-0 truncate">{option.label}</span>
                    </RowButton>
                  </li>
                ))}
                {parentMatches.length === 0 ? (
                  <li className="px-2 py-1 text-label text-[color:var(--map-panel-text-quaternary)]">{t("parentNoMatch")}</li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}
        <Input
          label={t("descriptionLabel")}
          className="w-full"
          value={description}
          autoComplete="off"
          disabled={creating}
          onChange={(event) => setDescription(event.target.value)}
          data-testid="create-node-description"
        />
        <Input
          label={t("secondaryNamePlaceholder")}
          className="w-full"
          value={secondaryName}
          autoComplete="off"
          disabled={creating}
          onChange={(event) => setSecondaryName(event.target.value)}
          data-testid="create-node-title-secondary"
        />
      </div>
      <footer className="sticky bottom-0 flex items-center gap-3 border-t border-[color:var(--map-panel-divider)] bg-[color:var(--map-panel-surface)] px-[var(--map-panel-pad)] py-3">
        <p className="min-w-0 flex-1 text-label leading-label text-[color:var(--map-panel-text-quaternary)]">{t("keysHint")}</p>
        <Button variant="primary" disabled={!canCreate} onClick={() => void submit(false)} data-testid="create-node-submit">
          {t("create")}
        </Button>
      </footer>
    </section>
  );
}
