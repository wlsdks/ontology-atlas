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
import { LibrarySection, type LibrarySectionProps } from "./LibrarySection";
import { AGENT_TOOL_LABELS, type AgentFilesUiModel } from "../../lib/agent-files";
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
} from "@/widgets/docs-vault";
import { resolveLocaleDisplayName } from "@/shared/lib/locale-display-name";
import { Chip, IconButton, RowButton, Surface, Tooltip, controlClass } from "@/shared/ui";
import { fieldClass } from '@/shared/ui/control-class';
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";

/**
 * The docs sidebar body — the machined file tree.
 *
 * Three sections are always visible: **Pinned** → **Vault** (the full tree, kind
 * glyphs plus an engraved per-folder count) → **Recent**. An earlier round hid
 * Pinned and Recent inside a collapsible "filters and saved" details block; in an
 * Obsidian-style vault workspace those two are used as often as the tree itself,
 * so they stay open. Only the tag filter is still collapsible — it is not this
 * screen's primary purpose.
 *
 * Mobile renders it inside a drawer, desktop as the left rail. The caller wraps
 * `onSelect` with `setMobileTreeOpen(false)`, so this component depends on no
 * mobile visibility state of its own.
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
  visibleDocSlugs: Set<string>;
  onSelect: (slug: string) => void;
  onCollectionChange: (collection: DocsVaultCollection) => void;
  onTogglePin: (slug: string) => void;
  onTagSelect: (tag: string | null) => void;
  /**
   * List order — `?sort=` / `?group=` is the source of truth and the caller passes
   * it down. Why there are two axes, and the default-omission rule, are in
   * `widgets/docs-vault/lib/tree-order.ts`.
   */
  sort: DocsTreeSort;
  group: DocsTreeGroup;
  onSortChange: (sort: DocsTreeSort) => void;
  onGroupChange: (group: DocsTreeGroup) => void;
  /** Opens the same kind-first dialog the map uses to create a node. */
  onCreateNewDoc: () => void;
  canCreateNewDoc: boolean;
  /**
   * The "agent files" group — non-null only when the vault includes the repo root
   * (CLAUDE.md / AGENTS.md present, gated inside `useAgentFilesModel`). Shows a
   * per-file "which tool reads this" badge plus a drift badge (warning tone —
   * an unresolved state). Detection is read-only: a click only opens the file in
   * the existing editor; nothing is converted or repaired.
   */
  agentFiles?: AgentFilesUiModel | null;
  /**
   * The library — raw sources and wiki pages, the two vault file kinds that are not the
   * graph. Null in the read-only sample and while no folder is open: there is nothing to
   * add a document to, and a section offering to would be a door onto nothing.
   */
  library?: Omit<LibrarySectionProps, "t" | "selectedSlug" | "onSelect"> | null;
}

// Maximum rows in the "recently changed" strip. The 7-day window lets a bulk-commit
// day through by the dozen (27 in the dogfood sample), which turned the strip into a
// second full listing with its own scrollbar overlapping the tree below — two or three
// scroll areas in one sidebar leaves "which do I drag?" unanswered. Keeping five as a
// preview and dropping the scroll leaves the tree as the single scroller; the rest is
// already in the tree.
const RECENTLY_CHANGED_STRIP_MAX = 5;

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex-none px-3 pb-1.5 pt-3 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
      {children}
    </h3>
  );
}

/**
 * **Which state this rail button reports — the consumer must choose** (2026-08-15).
 *
 * It used to attach `{...railStateAria(state)}` unconditionally. `Chip` in
 * `controls.tsx` already forbids that automatic pairing in its own header:
 * *"`active` is the **visible** state and `aria-pressed` is the **spoken** state,
 * so binding them automatically makes a non-toggle read as a toggle to a screen
 * reader."* The rule was written down and this wrapper was breaking it.
 *
 * A full sweep on 2026-08-15 found the three consumers are **three different things**:
 *
 * | Consumer | What it is | Honest attribute |
 * |---|---|---|
 * | filter | a toggle | `aria-pressed` |
 * | order | **a button that opens a menu** | `aria-expanded` + `aria-haspopup` |
 * | new document | **an action** (opens a dialog, or sends you to open a folder) | none |
 *
 * The new-document button has no pressed state yet kept announcing
 * `aria-pressed="false"`. The order button used `orderMenuOpen || !orderIsDefault`,
 * **mixing two facts into one attribute** — closing the menu left pressed true
 * whenever the order was not the default. Those really are different facts and are
 * now separated: the visible indigo says "the order is not the default", the
 * accessibility tree says "the menu is open".
 *
 * So `state` is **required, not optional** — omitting it is a type error. Filling it
 * in automatically brings the defect straight back.
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

/**
 * A single button in the top icon row: plain-text hover tooltip plus an active
 * indigo. a11y: title (the tooltip), aria-label, and whatever state attribute
 * `state` decides.
 */
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
  /** The **visible** state (indigo). The spoken state is carried separately by `state`. */
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

/**
 * One row of the list-order menu. Only one option per axis can be chosen, hence
 * `menuitemradio`. The check-mark column stays reserved on unselected rows so the
 * text does not shift horizontally.
 */
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
  library = null,
}: DocsSidebarBodyProps) {
  const t = useTranslations("vaultWidgets.parts.sidebar");
  const locale = useLocale();
  const tAgentFiles = useTranslations("agentFiles");
  const tLibrary = useTranslations("docsLibrary");
  const [treeQuery, setTreeQuery] = useState("");
  // The search input is opened and closed by a toggle in the top icon row. A
  // surviving query forces it open, so a filter that is still applied is never invisible.
  const [searchOpen, setSearchOpen] = useState(false);
  // Sort and group fold into one icon-row menu rather than two always-on dropdowns —
  // the sidebar is narrow, and controls larger than the list they control is itself a defect.
  // The hook result is destructured immediately: holding the object and reading `.open`
  // during render makes lint see the same object's `ref` field and falsely report a
  // ref access during render.
  const {
    open: orderMenuOpen,
    setOpen: setOrderMenuOpen,
    ref: orderMenuRef,
  } = useAdvancedMenu();
  const orderIsDefault =
    sort === DEFAULT_DOCS_TREE_SORT && group === DEFAULT_DOCS_TREE_GROUP;
  // The hover tooltip reads the current order out, so it is knowable without opening the menu.
  const orderSummary = `${t("orderMenuLabel")} · ${t(`orderSort.${sort}`)} · ${t(`orderGroup.${group}`)}`;
  // The "recently changed" entry point. `selectRecentVaultDocs` shares the same 7-day
  // mtime window arithmetic (`recent-changes.ts`) as the INDEX map lens
  // (`useRecentChanges`) — the docs surface has `VaultDoc.updatedAt` directly and needs
  // no indirect evidenceIds lookup. The session snapshot time is taken once at mount,
  // for the same render-purity reason as `updatedAgoNowMs`.
  const [recentNowMs] = useState(() => Date.now());
  const recentlyChangedDocs = useMemo(
    () => selectRecentVaultDocs(manifest.docs, recentNowMs),
    [manifest.docs, recentNowMs],
  );
  // Recently changed is a quiet section inside the list, collapsed by default.
  const [recentlyChangedOpen, setRecentlyChangedOpen] = useState(false);
  const normalizedTreeQuery = treeQuery.trim().toLowerCase();
  // The set of slugs matching the active tag — `DocsVaultTree` calls `.has()` on it at
  // every node during recursion. A fresh Set per render would invalidate the tree's
  // internal `useMemo`s whether or not the filter changed, so it is stabilized here.
  // A null `activeTag` yields undefined, and the tree skips filtering entirely.
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
      [doc.title, doc.slug, doc.path]
        .join(" ")
        .toLowerCase()
        .includes(normalizedTreeQuery),
    ).length;
  }, [manifest.docs, normalizedTreeQuery]);
  const collectionOptions: DocsVaultCollection[] = ["all", "guides", "ontology"];

  /*
   * The collection chips are an **exclusive single selection** (`collection` holds one
   * value, and pressing the selected chip again does not clear it). They used to be
   * `role="group"` with sibling `aria-pressed`.
   *
   * That choice had a recorded basis — the comment directly below records why `tablist`
   * was given up. **That judgement still holds.** But the alternative considered then was
   * `tablist`, not `radiogroup`, and carrying exclusivity into the accessibility tree is
   * `radiogroup`'s job (2026-08-15 (3)).
   *
   * The container stays here: five things — the `bg-canvas` well, `p-0.5`/`gap-0.5`, items
   * being `Chip`, the `Tooltip` wrapper, and "only the active chip shows its label" — fit
   * neither of the primitive's two canonical containers (2026-08-15 (8)).
   */
  const collectionGroup = useRovingRadioGroup({
    value: collection,
    values: collectionOptions,
    onChange: onCollectionChange,
  });
  const collectionIcons: Record<DocsVaultCollection, ReactNode> = {
    all: <Files size={ICON_SIZE.md} aria-hidden />,
    guides: <BookOpen size={ICON_SIZE.md} aria-hidden />,
    ontology: <Waypoints size={ICON_SIZE.md} aria-hidden />,
  };
  const searchExpanded = searchOpen || Boolean(treeQuery);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* One row holds **a set of filters plus three actions**. The larger header and the
          always-on search box stay removed for density, but the three are now bound by a
          border and the active one is labelled, so «state» and «action» separate visually
          (2026-08-08 — the owner named this row as "complexity"). */}
      {/*
        a11y: this row is **not** `role="tablist"`. A full axe sweep on 2026-08-03 found one
        `aria-required-children` (WCAG 4.1.2) violation here — besides the three collections
        the row also holds the search toggle, the order menu, and new-document, so `tablist`
        was carrying a child it does not allow (`button[aria-label]`).

        The fix is **giving up the role, not turning the children into `role="tab"`.** Its
        sibling `DocsVaultTabStrip` already records the same reasoning: borrowing the role
        without `tabpanel`, `aria-controls`, and roving tabindex makes AT promise "tab n of N"
        and arrow-key movement, and nothing happens. These three buttons are **toggles that
        filter** the tree below and the source of truth is the `collection` state — the
        honest contract is `group` + `aria-pressed`. `toolbar` is out for the same reason:
        it is another arrow-key promise.
      */}
      <div className="flex flex-none items-center gap-1 border-b border-[color:var(--color-overlay-2)] px-2 py-2">
        {/*
          ⚠️ **What is active has a name** (2026-08-08, owner reported "complexity").
          All three used to be unlabelled 32px icons, so «which filter is this list under»
          could not be read from the icons alone — that answer lived only in the grey caption
          line below. Information outside the control makes a person look in two places. Now
          **the active chip states its own name and count**, and the caption row is left only
          for states a control cannot speak, such as search and tags.

          And these three are **mutually exclusive filters** that looked identical to the
          search, order, and new-document buttons beside them. One border binds them and says
          «this much is one set» — state and action mixed in one row was half the complexity.
        */}
        <div
          {...collectionGroup.groupProps}
          aria-label={t("collectionAriaLabel")}
          className="flex min-w-0 flex-none items-center gap-0.5 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] p-0.5"
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
                  className="min-w-0 flex-none hover:text-[color:var(--color-text-primary)]"
                >
                  {collectionIcons[option]}
                  {isActive ? (
                    <span className="min-w-0 truncate">
                      {t(`collection.${option}.label`)}
                    </span>
                  ) : null}
                </Chip>
              </Tooltip>
            );
          })}
        </div>
        <RailIconButton
          testId="docs-sidebar-search-toggle"
          // There were two magnifiers on screen — this button (narrow the list) and the
          // header's ⌘K global search. The same symbol doing different jobs makes both
          // untrustworthy. This one filters, so a funnel is the honest icon (2026-08-08).
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
            // The visible indigo says "the order is not the default"; the accessibility tree
            // says "the menu is open" — different facts, so different values.
            active={orderMenuOpen || !orderIsDefault}
            state={{ kind: "disclosure", expanded: orderMenuOpen }}
            onClick={() => setOrderMenuOpen((open) => !open)}
          />
          <Surface
              open={orderMenuOpen}
            // The anchor is the top right, so it grows from there — the comment below about
            // growing from the nearest edge applies to the motion, not just the placement.
              origin="top right"
              role="menu"
              aria-label={t("orderMenuLabel")}
              data-testid="docs-sidebar-order-menu"
            // Anchored to the right edge. This button sits at the sidebar's right edge, so
            // opening with `left-0` pushes the 192px menu outside the sidebar (measured: 73px
            // of overflow, owner report 2026-07-28). A menu near a container edge grows from
            // that edge.
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
        <span className="flex-1" />
        {/* The "new document" entry point — the same kind-first dialog the map uses. */}
        {/*
          It is **pressable even in the read-only sample**. It used to be disabled with a
          hover tooltip, but a hover-only explanation on a 40%-opacity icon never arrived —
          in the owner's own use it read as "Why is there no 'create document'?"

          Pressing it now goes to what makes it possible: open my folder. The label says so in
          advance, so nothing is surprising — the charter's degradation grammar ("why it is
          unavailable **and where to go**") applied to one button.
        */}
        <RailIconButton
          testId="docs-sidebar-new-doc"
          icon={<Plus size={ICON_SIZE.md} aria-hidden />}
          label={canCreateNewDoc ? t("newDocButtonLabel") : t("newDocDisabledHint")}
          active={false}
          state={{ kind: "action" }}
          onClick={onCreateNewDoc}
        />
      </div>
      {/* This row states **only what a control cannot say** (2026-08-08).
          It used to carry the active collection's name and count as well, because the icons
          in the row above kept their labels in tooltips only — deleting this row removed both
          from the screen entirely. Now **the active chip states its own name and count**, so
          that job has no reason to remain here: one fact said in two places makes the eye work
          twice.

          Search text and tags are different — they are not a control's «state» but a «value»
          the user just typed, which no chip carries. So this row is drawn only for those two,
          and when there is neither, the row does not exist. */}
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
            // This filter bar is `py-1` (28px), and `link`'s 44px minimum height would inflate
            // it by that much. That shape does not yet fit a control inside a sentence or a bar.
            className={controlClass({ shape: "link", className: "flex-none rounded-chip px-1.5 py-0.5 hover:text-[color:var(--color-text-primary)]" })}
          >
            {t("clearFilter")}
          </button>
        </div>
      ) : null}

      {/* Always-visible sections: recently changed (quiet, collapsed by default), agent files,
          Pinned, the Vault tree, Recent. Only the tree fills the remaining space and scrolls
          (flex-1 min-h-0). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* What is waiting on a person comes before anything the map can already
            answer. It draws nothing when both lists are empty. */}
        <ReviewQueueSection
          rows={reviewQueue}
          selectedSlug={selectedSlug}
          onSelect={onSelect}
          t={t}
        />
        {/* The library sits between the review queue and the tree: what a person brought
            in, what was made of it, then what it became. */}
        {library ? (
          <LibrarySection
            {...library}
            selectedSlug={selectedSlug}
            onSelect={onSelect}
            t={tLibrary}
          />
        ) : null}
        {/* Recently changed is a quiet section inside the list, collapsed by default, rather
            than its own stack taking the top. Unlike `recentSlugs` (visited this session),
            these are documents inside a real 7-day mtime window. */}
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
                            {/* Same naming rule as the tree, search, and map. */}
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

        {/* The "agent files" group, pinned to the top of the tree. It appears only when the
            vault is the repo root (gated by `useAgentFilesModel`). FSA cannot reach a parent
            folder, so for a nested vault such as docs/ontology not rendering the group at all
            is the honest answer. The drift badge uses the warning (amber) signal tone — an
            unresolved state. Read-only: a click opens the file in the existing editor. */}
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

        {recentSlugs.length > 0 ? (
          <section className="flex-none border-t border-[color:var(--color-overlay-2)] pb-2">
            <SectionLabel>{t("recentHeader", { count: recentSlugs.length })}</SectionLabel>
            <ul className="flex max-h-[22vh] flex-col gap-0.5 overflow-auto px-2">
              {recentSlugs.map((slug) => {
                const d = docsBySlug.get(slug);
                if (!d) return null;
                const active = selectedSlug === slug;
                return (
                  <li key={slug}>
                    <RowButton
                      active={active}
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
