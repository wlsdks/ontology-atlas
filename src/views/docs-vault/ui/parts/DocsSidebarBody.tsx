import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDownUp,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  Clock,
  FileText,
  Files,
  Hash,
  ListFilter,
  PinOff,
  Plus,
  Search,
  Star,
  Waypoints,
  X,
} from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useLocale, useTranslations } from "next-intl";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";
import { selectRecentVaultDocs } from "@/entities/knowledge-graph";
import type { ReviewQueueRow } from "@/entities/docs-vault";
import { ReviewQueueSection } from "./ReviewQueueSection";
import { AGENT_TOOL_LABELS, type AgentFilesUiModel } from "@/entities/agent-files";
import type { DocsVaultCollection } from "../../lib/docs-vault-collection";
import { useAdvancedMenu } from "../../lib/use-advanced-menu";
import {
  DocsVaultTree,
  DEFAULT_DOCS_TREE_GROUP,
  DEFAULT_DOCS_TREE_SORT,
  DOCS_TREE_GROUPS,
  DOCS_TREE_SORTS,
  type DocsTreeGroup,
  type DocsTreeSort,
  matchesDocsTreeQuery,
} from "@/widgets/docs-vault";
import { resolveLocaleDisplayName } from "@/shared/lib/locale-display-name";
import { Chip, IconButton, RowButton, Surface, Tooltip, controlClass } from "@/shared/ui";
import { fieldClass } from '@/shared/ui/control-class';
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";
import { normalizeForMatch } from "@/shared/lib/node-name-match";

/**
 * The docs file tree: Pinned, the Vault tree and Recent stay open; recently changed and tags collapse.
 * The caller wraps `onSelect` to close the mobile drawer.
 */
export interface DocsSidebarBodyProps {
  reviewQueue: ReviewQueueRow[];
  pinnedSlugs: string[];
  recentSlugs: string[];
  selectedSlug: string | null;
  docsBySlug: Map<string, VaultDoc>;
  activeTag: string | null;
  manifest: VaultManifest;
  collection: DocsVaultCollection;
  collectionCounts: Record<DocsVaultCollection, number>;
  /** Hide the generic all/guides/ontology chooser when the parent owns a fixed scope. */
  showCollectionChooser?: boolean;
  /** Hide creation in a single-document compatibility reader. */
  showCreateDocument?: boolean;
  visibleDocSlugs: Set<string>;
  onSelect: (slug: string) => void;
  onCollectionChange: (collection: DocsVaultCollection) => void;
  onTogglePin: (slug: string) => void;
  onTagSelect: (tag: string | null) => void;
  /**
   * `?sort=` / `?group=` is the source of truth; the two axes and default omission are
   * explained in `widgets/docs-vault/lib/tree-order.ts`.
   */
  sort: DocsTreeSort;
  group: DocsTreeGroup;
  onSortChange: (sort: DocsTreeSort) => void;
  onGroupChange: (group: DocsTreeGroup) => void;
  onCreateNewDoc: () => void;
  canCreateNewDoc: boolean;
  /**
   * Non-null only when the vault includes the repo root. Read-only: a click opens the file,
   * nothing is converted or repaired.
   */
  agentFiles?: AgentFilesUiModel | null;
}

// A preview, not a second listing: more rows would add a scroller beside the tree.
const RECENTLY_CHANGED_STRIP_MAX = 5;

/**
 * The row's widest state needs 301.3px (`.claude/shots-2026-09-07/docshead-before-measurements.json`);
 * 320 adds the next gap step so a label never appears with nowhere to go.
 * The className writes it out as `@min-[320px]`: Tailwind cannot read a template, and the test compares them.
 */
export const DOCS_HEAD_LABEL_MIN_PX = 320;

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex-none px-3 pb-1.5 pt-3 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
      {children}
    </h3>
  );
}

/**
 * The consumer must choose which state a rail button reports; `Chip` forbids pairing the
 * visible `active` with `aria-pressed`, or a non-toggle reads as a toggle. Filter is a toggle,
 * order a menu button (`aria-expanded`), new document an action (none). Required, not optional.
 */
type RailButtonState =
  | { kind: "toggle"; pressed: boolean }
  | { kind: "disclosure"; expanded: boolean }
  | { kind: "action" };

function railStateAria(state: RailButtonState) {
  switch (state.kind) {
    case "toggle":
      return { "aria-pressed": state.pressed };
    case "disclosure":
      return { "aria-expanded": state.expanded, "aria-haspopup": "menu" as const };
    case "action":
      return {};
  }
}

/** Plain-text tooltip, active indigo, and the aria state `state` decides. */
function RailIconButton({
  icon,
  label,
  active,
  state,
  disabled = false,
  onClick,
  testId,
}: {
  icon: ReactNode;
  label: string;
  /** The visible state; the spoken state comes from `state`. */
  active: boolean;
  state: RailButtonState;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <Tooltip content={label}>
      <IconButton
        label={label}
        size="lg"
        active={active}
        onClick={onClick}
        disabled={disabled}
        {...railStateAria(state)}
        data-testid={testId}
        className="flex-none hover:text-[color:var(--color-text-primary)]"
      >
        {icon}
      </IconButton>
    </Tooltip>
  );
}

/** `menuitemradio` row; the check column stays reserved so text does not shift. */
function OrderOption({
  label,
  checked,
  onSelect,
  testId,
}: {
  label: string;
  checked: boolean;
  onSelect: () => void;
  testId: string;
}) {
  return (
    <RowButton
      size="sm"
      active={checked}
      role="menuitemradio"
      aria-checked={checked}
      data-testid={testId}
      onClick={onSelect}
      className="hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
    >
      <Check
        size={ICON_SIZE.sm}
        aria-hidden
        className={`flex-none ${checked ? "opacity-100" : "opacity-0"}`}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </RowButton>
  );
}

export function DocsSidebarBody({
  reviewQueue,
  pinnedSlugs,
  recentSlugs,
  selectedSlug,
  docsBySlug,
  activeTag,
  manifest,
  collection,
  collectionCounts,
  showCollectionChooser = true,
  showCreateDocument = true,
  visibleDocSlugs,
  onSelect,
  onCollectionChange,
  onTogglePin,
  onTagSelect,
  onCreateNewDoc,
  canCreateNewDoc,
  sort,
  group,
  onSortChange,
  onGroupChange,
  agentFiles = null,
}: DocsSidebarBodyProps) {
  const t = useTranslations("vaultWidgets.parts.sidebar");
  const locale = useLocale();
  const tAgentFiles = useTranslations("agentFiles");
  const recentOthers = recentSlugs.filter((slug) => slug !== selectedSlug && docsBySlug.has(slug));
  const [treeQuery, setTreeQuery] = useState("");
  // A surviving query forces search open, so an applied filter is never invisible.
  const [searchOpen, setSearchOpen] = useState(false);
  // Destructure at once: reading `.open` from the held object makes lint report a ref access
  // during render.
  const {
    open: orderMenuOpen,
    setOpen: setOrderMenuOpen,
    ref: orderMenuRef,
  } = useAdvancedMenu();
  const orderIsDefault =
    sort === DEFAULT_DOCS_TREE_SORT && group === DEFAULT_DOCS_TREE_GROUP;
  const orderSummary = `${t("orderMenuLabel")} · ${t(`orderSort.${sort}`)} · ${t(`orderGroup.${group}`)}`;
  // Same 7-day mtime window as the map's `useRecentChanges` (`recent-changes.ts`); the snapshot
  // time is taken once at mount to keep render pure.
  const [recentNowMs] = useState(() => Date.now());
  const recentlyChangedDocs = useMemo(
    () => selectRecentVaultDocs(manifest.docs, recentNowMs),
    [manifest.docs, recentNowMs],
  );
  const [recentlyChangedOpen, setRecentlyChangedOpen] = useState(false);
  const normalizedTreeQuery = normalizeForMatch(treeQuery);
  // Stable Set: the tree calls `.has()` per node, and a fresh Set would invalidate its memos.
  const activeTagSlugs = useMemo(
    () =>
      activeTag ? new Set(manifest.tags[activeTag] ?? []) : undefined,
    [activeTag, manifest.tags],
  );
  const tagEntries = useMemo(
    () =>
      Object.entries(manifest.tags).sort((a, b) => b[1].length - a[1].length),
    [manifest.tags],
  );
  const visibleTagEntries = useMemo(() => {
    if (
      activeTag &&
      tagEntries.every(([tag]) => tag !== activeTag)
    ) {
      return tagEntries.slice(0, 12);
    }
    return tagEntries
      .filter(([tag], index) => index < 12 || tag === activeTag)
      .sort((a, b) => {
        if (a[0] === activeTag) return -1;
        if (b[0] === activeTag) return 1;
        return b[1].length - a[1].length;
      });
  }, [activeTag, tagEntries]);
  const queryMatchCount = useMemo(() => {
    if (!normalizedTreeQuery) return manifest.docs.length;
    return manifest.docs.filter((doc) =>
      matchesDocsTreeQuery(doc, normalizedTreeQuery),
    ).length;
  }, [manifest.docs, normalizedTreeQuery]);
  const collectionOptions: DocsVaultCollection[] = ["all", "guides", "ontology"];

  // Exclusive single selection, so `radiogroup` rather than `tablist` (see below). The container
  // stays local: its well, spacing, `Chip` items and tooltip fit neither primitive container.
  const collectionGroup = useRovingRadioGroup({
    value: collection,
    values: collectionOptions,
    onChange: onCollectionChange,
  });
  // Collection glyphs: `Files` all, `BookOpen` guides, `Waypoints` ontology. `flex-none` keeps
  // the glyph at ramp size while the label truncates.
  const collectionIcons: Record<DocsVaultCollection, ReactNode> = {
    all: <Files size={ICON_SIZE.md} className="flex-none" aria-hidden />,
    guides: <BookOpen size={ICON_SIZE.md} className="flex-none" aria-hidden />,
    ontology: <Waypoints size={ICON_SIZE.md} className="flex-none" aria-hidden />,
  };
  const searchExpanded = searchOpen || Boolean(treeQuery);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Filters plus three actions; a border binds the filters and the active one is labelled,
         so state and action separate. */}
      {/* Not `role="tablist"`: the row also holds non-tab buttons, which axe
         reports as an `aria-required-children` violation (WCAG 4.1.2). Same reasoning as `DocsVaultTabStrip`. */}
      {/* A container: labels appear only when the row reaches `DOCS_HEAD_LABEL_MIN_PX`, since at the
         280px pane width a label pushes the `+` past the pane border. */}
      <div
        data-testid="docs-sidebar-head-row"
        className="@container/docs-head flex flex-none items-center gap-2 border-b border-[color:var(--color-overlay-2)] px-2 py-2"
      >
        {/* The active chip states its own name and count; the three chips are mutually exclusive filters. */}
        {showCollectionChooser ? (
          <div
            {...collectionGroup.groupProps}
            aria-label={t("collectionAriaLabel")}
            // `min-w-0` lets a longer future label truncate inside the chip instead of pushing controls out.
            className="flex min-w-0 items-center gap-0.5 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] p-0.5"
          >
            {collectionOptions.map((option, index) => {
              const isActive = collection === option;
              const tooltip = t(`collection.${option}.tooltip`, {
                count: collectionCounts[option],
              });
              return (
                <Tooltip key={option} content={tooltip}>
                  <Chip
                    {...collectionGroup.itemProps(index)}
                    data-testid={`docs-sidebar-collection-${option}`}
                    aria-label={tooltip}
                    active={isActive}
                    tone={isActive ? "strong" : "muted"}
                    className={
                      isActive
                        ? "min-w-0 hover:text-[color:var(--color-text-primary)]"
                        : "min-w-0 flex-none hover:text-[color:var(--color-text-primary)]"
                    }
                  >
                    {collectionIcons[option]}
                    {/* `hidden` is the base and the container query turns it on, so the narrow case needs no override. */}
                    {isActive ? (
                      <span className="hidden min-w-0 truncate @min-[320px]/docs-head:inline">
                        {t(`collection.${option}.label`)}
                      </span>
                    ) : null}
                  </Chip>
                </Tooltip>
              );
            })}
          </div>
        ) : null}
        {/* The three trailing controls are one `flex-none` cluster, so the collection well gives way
           when the row narrows; a hairline separates state from action. */}
        <div className="ml-auto flex flex-none items-center gap-0.5">
          <RailIconButton
            testId="docs-sidebar-search-toggle"
            // A funnel, not a magnifier: ⌘K global search already uses the magnifier.
            icon={<ListFilter size={ICON_SIZE.md} aria-hidden />}
            label={t("searchLabel")}
            active={searchExpanded}
            state={{ kind: "toggle", pressed: searchExpanded }}
            onClick={() => {
              if (searchExpanded) {
                setTreeQuery("");
                setSearchOpen(false);
              } else {
                setSearchOpen(true);
              }
            }}
          />
          <div ref={orderMenuRef} className="relative flex-none">
            <RailIconButton
              testId="docs-sidebar-order-toggle"
              icon={<ArrowDownUp size={ICON_SIZE.md} aria-hidden />}
              label={orderSummary}
              // Indigo says "not the default order"; the aria state says "menu open".
              active={orderMenuOpen || !orderIsDefault}
              state={{ kind: "disclosure", expanded: orderMenuOpen }}
              onClick={() => setOrderMenuOpen((open) => !open)}
            />
            <Surface
                open={orderMenuOpen}
                origin="top right"
                role="menu"
                aria-label={t("orderMenuLabel")}
                data-testid="docs-sidebar-order-menu"
              // Anchored right: at the sidebar edge a `left-0` menu overflows. Grows from the nearest edge.
                className="absolute right-0 top-[calc(100%+6px)] z-50 w-48 rounded-[var(--chrome-radius-inner)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-2 shadow-[var(--chrome-shadow)]"
              >
                <p className="px-1.5 pb-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
                  {t("orderSortHeader")}
                </p>
                {DOCS_TREE_SORTS.map((option) => (
                  <OrderOption
                    key={option}
                    testId={`docs-sidebar-order-sort-${option}`}
                    label={t(`orderSort.${option}`)}
                    checked={sort === option}
                    onSelect={() => {
                      onSortChange(option);
                      setOrderMenuOpen(false);
                    }}
                  />
                ))}
                <p className="mt-1 border-t border-[color:var(--color-border-soft)] px-1.5 pb-1 pt-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
                  {t("orderGroupHeader")}
                </p>
                {DOCS_TREE_GROUPS.map((option) => (
                  <OrderOption
                    key={option}
                    testId={`docs-sidebar-order-group-${option}`}
                    label={t(`orderGroup.${option}`)}
                    checked={group === option}
                    onSelect={() => {
                      onGroupChange(option);
                      setOrderMenuOpen(false);
                    }}
                  />
                ))}
            </Surface>
          </div>
          {showCreateDocument ? (
            <span
              aria-hidden
              className="mx-0.5 h-4 w-px flex-none bg-[color:var(--color-border-soft)]"
            />
          ) : null}
          {/* Pressable in the read-only sample: it leads to opening a folder, and its label says so. */}
          {showCreateDocument ? (
            <RailIconButton
              testId="docs-sidebar-new-doc"
              icon={<Plus size={ICON_SIZE.md} aria-hidden />}
              label={canCreateNewDoc ? t("newDocButtonLabel") : t("newDocDisabledHint")}
              active={false}
              state={{ kind: "action" }}
              onClick={onCreateNewDoc}
            />
          ) : null}
        </div>
      </div>
      {/* Only what a control cannot say: typed search text and tags. Collection name and count are on the active chip. */}
      {normalizedTreeQuery || activeTag ? (
        <p className="flex-none px-3 pt-1.5 text-caption text-[color:var(--color-text-quaternary)]">
          {normalizedTreeQuery
            ? t("treeSearchCount", { count: queryMatchCount })
            : t("treeFiltered", { tag: activeTag as string })}
        </p>
      ) : null}
      {searchExpanded ? (
        <label className="mx-3 mt-1.5 flex h-8 flex-none items-center gap-2 rounded-chip border border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-2 text-[color:var(--color-text-quaternary)] focus-within:border-[color:var(--color-indigo-line-a45)] focus-within:text-[color:var(--color-text-secondary)]">
          <Search size={ICON_SIZE.sm} aria-hidden />
          <span className="sr-only">{t("searchLabel")}</span>
          <input
            value={treeQuery}
            onChange={(event) => setTreeQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            autoFocus
            className={fieldClass({ frame: "bare", className: "min-w-0 flex-1" })}
            type="text"
            autoComplete="off"
          />
          {treeQuery ? (
            <IconButton
              label={t("clearSearch")}
              size="sm"
              tone="muted"
              onClick={() => setTreeQuery("")}
              className="hover:text-[color:var(--color-text-primary)]"
            >
              <X size={ICON_SIZE.sm} aria-hidden />
            </IconButton>
          ) : null}
        </label>
      ) : null}
      {(activeTag || normalizedTreeQuery) ? (
        <div className="mx-3 mt-2 flex flex-none items-center justify-between gap-2 rounded-micro border border-[color:var(--color-indigo-line-a22)] bg-[color:var(--color-indigo-a06)] px-2 py-1 text-label text-[color:var(--color-indigo-pale-a90)]">
          <span className="truncate">
            {activeTag ? t("activeTagSummary", { tag: activeTag }) : t("treeSearchCount", { count: queryMatchCount })}
          </span>
          <button
            type="button"
            onClick={() => {
              setTreeQuery("");
              onTagSelect(null);
            }}
            className={controlClass({ shape: "link", className: "flex-none rounded-chip px-1.5 py-0.5 hover:text-[color:var(--color-text-primary)]" })}
          >
            {t("clearFilter")}
          </button>
        </div>
      ) : null}

      {/* Only the tree fills the remaining space and scrolls. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* What waits on a person comes first; draws nothing when the queue is empty. */}
        <ReviewQueueSection
          rows={reviewQueue}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
          t={t}
        />
        {/* A real 7-day mtime window, unlike `recentSlugs` (visited this session). */}
        {recentlyChangedDocs.length > 0 ? (
          <section className="flex-none border-b border-[color:var(--color-overlay-2)] pb-1">
            <button
              type="button"
              onClick={() => setRecentlyChangedOpen((open) => !open)}
              aria-expanded={recentlyChangedOpen}
              data-testid="docs-sidebar-recently-changed-toggle"
              className={controlClass({ shape: "row", stacked: true, className: "gap-1.5 px-3 pb-1.5 pt-3 hover:text-[color:var(--color-text-secondary)]" })}
            >
              <Clock size={ICON_SIZE.sm} className="flex-none text-[color:var(--color-text-quaternary)]" aria-hidden />
              <span className="flex-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
                {t("recentlyChangedHeader", { count: recentlyChangedDocs.length })}
              </span>
              <ChevronDown
                size={ICON_SIZE.sm}
                aria-hidden
                className={`flex-none text-[color:var(--color-text-quaternary)] transition-transform ${recentlyChangedOpen ? "rotate-180" : ""}`}
              />
            </button>
            {recentlyChangedOpen ? (
              <>
                <ul
                  data-testid="docs-sidebar-recently-changed-list"
                  className="flex flex-col gap-0.5 px-2"
                >
                  {recentlyChangedDocs
                    .slice(0, RECENTLY_CHANGED_STRIP_MAX)
                    .map((doc) => {
                      const active = selectedSlug === doc.slug;
                      return (
                        <li key={doc.slug}>
                          <RowButton
                            active={active}
                            onClick={() => onSelect(doc.slug)}
                            className="group relative hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                          >
                            <FileText size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
                            <span className="min-w-0 flex-1 truncate">
                              {resolveLocaleDisplayName(doc.frontmatter, locale, doc.title)}
                            </span>
                          </RowButton>
                        </li>
                      );
                    })}
                </ul>
                {recentlyChangedDocs.length > RECENTLY_CHANGED_STRIP_MAX ? (
                  <p className="px-3 pt-1 text-caption text-[color:var(--color-text-quaternary)]">
                    {t("recentlyChangedMore", {
                      count: recentlyChangedDocs.length - RECENTLY_CHANGED_STRIP_MAX,
                    })}
                  </p>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}

        {/* Only when the vault is the repo root: FSA cannot reach a parent folder, so a nested vault such as docs/ontology
           shows no group. Read-only. */}
        {agentFiles && agentFiles.records.length > 0 ? (
          <section
            data-testid="docs-sidebar-agent-files"
            className="flex-none border-b border-[color:var(--color-overlay-2)] pb-1"
          >
            <div className="flex items-center gap-1.5 px-3 pb-1.5 pt-3" title={tAgentFiles("headerHint")}>
              <Bot size={ICON_SIZE.sm} className="flex-none text-[color:var(--color-text-quaternary)]" aria-hidden />
              <span className="flex-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
                {tAgentFiles("header")}
              </span>
              {agentFiles.driftCount > 0 ? (
                <span
                  data-testid="docs-sidebar-agent-files-drift-count"
                  className="flex-none rounded-full border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] px-1.5 font-mono text-caption tabular-nums text-[color:var(--color-amber-source-a90)]"
                >
                  {tAgentFiles("driftCount", { count: agentFiles.driftCount })}
                </span>
              ) : null}
            </div>
            <ul aria-label={tAgentFiles("listAria")} className="flex flex-col gap-0.5 px-2">
              {agentFiles.records.map((record) => {
                const active = selectedSlug === record.slug;
                const driftTitle = record.drift
                  .map((code) => tAgentFiles(`drift.${code}`))
                  .join("\n");
                return (
                  <li key={record.path}>
                    <RowButton
                      active={active}
                      onClick={() => onSelect(record.slug)}
                      title={driftTitle || undefined}
                      aria-current={active ? "true" : undefined}
                      className="group relative hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                    >
                      <FileText size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{record.path}</span>
                      <span className="flex-none font-mono text-caption text-[color:var(--color-text-quaternary)]">
                        {record.tools.map((tool) => AGENT_TOOL_LABELS[tool] ?? tool).join(" · ")}
                      </span>
                      {record.drift.length > 0 ? (
                        <span
                          data-testid={`docs-sidebar-agent-file-drift-${record.slug}`}
                          className="flex-none rounded-micro border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] px-1 font-mono text-caption text-[color:var(--color-amber-source-a90)]"
                        >
                          {tAgentFiles("driftBadge")}
                        </span>
                      ) : null}
                    </RowButton>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {pinnedSlugs.length > 0 ? (
          <section className="flex-none border-b border-[color:var(--color-overlay-2)] pb-1">
            <SectionLabel>{t("pinnedHeader", { count: pinnedSlugs.length })}</SectionLabel>
            <ul className="flex max-h-[22vh] flex-col gap-0.5 overflow-auto px-2">
              {pinnedSlugs.map((slug) => {
                const d = docsBySlug.get(slug);
                if (!d) return null;
                const active = selectedSlug === slug;
                return (
                  <li key={slug} className="group">
                    <div className="relative flex items-stretch">
                      <RowButton
                        active={active}
                        onClick={() => onSelect(slug)}
                        className="min-w-0 flex-1 pr-7 hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                      >
                        <Star
                          size={ICON_SIZE.sm}
                          className="flex-none text-[color:var(--color-amber-docs-a82)]"
                          aria-hidden
                          fill="currentColor"
                        />
                        <span className="truncate">
                          {resolveLocaleDisplayName(d.frontmatter, locale, d.title)}
                        </span>
                      </RowButton>
                      <Tooltip content={t("unpinTooltip")} withProvider={false}>
                        <IconButton
                          label={t("unpinTooltip")}
                          size="sm"
                          tone="muted"
                          onClick={(e) => {
                            e.stopPropagation();
                            onTogglePin(slug);
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 [@media(hover:hover)]:opacity-0 transition-opacity hover:text-[color:var(--color-text-primary)] focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <PinOff size={ICON_SIZE.sm} aria-hidden />
                        </IconButton>
                      </Tooltip>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="flex min-h-0 flex-1 flex-col">
          <DocsVaultTree
            tree={manifest.tree}
            selectedSlug={selectedSlug}
            onSelect={onSelect}
            query={treeQuery}
            sort={sort}
            group={group}
            activeTag={activeTag}
            activeTagSlugs={activeTagSlugs}
            visibleDocSlugs={visibleDocSlugs}
            docsBySlug={docsBySlug}
          />
        </section>

        {/* Recent lists the other documents; the open one is already the tab, row and H1. */}
        {recentOthers.length > 0 ? (
          <section className="flex-none border-t border-[color:var(--color-overlay-2)] pb-2">
            <SectionLabel>{t("recentHeader", { count: recentOthers.length })}</SectionLabel>
            <ul className="flex max-h-[22vh] flex-col gap-0.5 overflow-auto px-2">
              {recentOthers.map((slug) => {
                const d = docsBySlug.get(slug);
                if (!d) return null;
                return (
                  <li key={slug}>
                    <RowButton
                      onClick={() => onSelect(slug)}
                      className="group relative hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                    >
                      <FileText
                        size={ICON_SIZE.sm}
                        className="flex-none opacity-60"
                        aria-hidden
                      />
                      <span className="truncate">
                        {resolveLocaleDisplayName(d.frontmatter, locale, d.title)}
                      </span>
                    </RowButton>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>

      {tagEntries.length > 0 ? (
        <div className="flex-none border-t border-[color:var(--color-overlay-2)]">
          <details
            className="group"
            open={activeTag !== null ? true : undefined}
          >
            <summary className="flex list-none items-center gap-2 px-3 py-2 text-label text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-secondary)]">
              <Hash size={ICON_SIZE.sm} aria-hidden />
              <span className="font-[var(--font-weight-signature)]">{t("tagsHeader", { count: tagEntries.length })}</span>
              <ChevronDown
                size={ICON_SIZE.sm}
                aria-hidden
                className="ml-auto transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="flex max-h-[24vh] flex-wrap gap-1 overflow-auto px-3 pb-2">
              {visibleTagEntries.map(([tag, slugs]) => {
                const active = activeTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onTagSelect(active ? null : tag)}
                    aria-pressed={active}
                    className={controlClass({
                      shape: "pill",
                      active,
                      className:
                        "gap-1 hover:bg-[color:var(--color-indigo-line-a06)] hover:text-[color:var(--color-text-primary)]",
                    })}
                    title={t("tagTitle", { tag, count: slugs.length })}
                  >
                    {active ? <X size={ICON_SIZE.sm} aria-hidden /> : null}
                    {tag}
                    <span className="opacity-60">{slugs.length}</span>
                  </button>
                );
              })}
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}
