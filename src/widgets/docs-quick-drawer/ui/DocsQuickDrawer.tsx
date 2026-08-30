"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { fieldClass } from '@/shared/ui/control-class';
import { AGENT_DOCK_INSET_SURFACE_CLASS } from '@/shared/ui/agent-dock-surface';
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useLatinEyebrow } from "@/shared/lib/latin-eyebrow";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Folder,
  Hash,
  Link2,
  Search,
  Star,
  X,
} from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import {
  findRelatedDocs,
  pinnedDocsStorageKey,
  recentDocsStorageKey,
  vaultScopeKey,
  type VaultManifest,
  type VaultTreeNode,
} from "@/entities/docs-vault";
import { useStaticVaultSource } from "@/entities/vault-session";
import { useDataSourceMode } from "@/entities/vault-session";
import { useLocalVault } from "@/entities/vault-session";
import {
  filterTree,
  firstDocSlug,
  flattenDocs,
  flattenTreeSlugs,
} from "../lib/tree-utils";
import { MOTION } from "@/shared/motion";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { cn } from "@/shared/lib/cn";
import { resolveLocaleDisplayName } from "@/shared/lib/locale-display-name";
import { IconButton, RowButton, controlClass } from "@/shared/ui";

function readStoredSlugs(key: string, limit: number): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === "string")
      .slice(0, limit);
  } catch {
    return [];
  }
}

/** Same behaviour as the docs-vault widget's togglePinnedDoc — pinning inserts at the front. */
function togglePinnedInStorage(pinnedKey: string, slug: string): string[] {
  if (typeof window === "undefined") return [];
  const current = readStoredSlugs(pinnedKey, 500);
  const next = current.includes(slug)
    ? current.filter((s) => s !== slug)
    : [slug, ...current];
  try {
    window.localStorage.setItem(pinnedKey, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** The vault path prefix the drawer's links attach to. Defaults to `/docs`. */
  basePath?: string;
  getDocHref?: (slug?: string | null) => string;
  /** The project context selected on the map. When present, a related-documents section shows at the top. */
  contextProject?: {
    slug: string;
    name: string;
    aliases?: string[];
  } | null;
}

interface FlatDoc {
  slug: string;
  title: string;
  path: string;
  updatedAt: string;
  tags: string[];
  excerpt: string;
}

const MAX_RECENT = 8;


function highlightMatch(text: string, needle: string) {
  if (!needle) return text;
  const lc = text.toLowerCase();
  const idx = lc.indexOf(needle);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-micro bg-[color:var(--color-indigo-a28)] px-0.5 text-[color:var(--color-text-primary)]">
        {text.slice(idx, idx + needle.length)}
      </mark>
      {text.slice(idx + needle.length)}
    </>
  );
}

function TreeBranch({
  node,
  getDocHref,
  onPick,
  depth,
  forceOpen,
  needle,
  focusedSlug,
}: {
  node: VaultTreeNode;
  getDocHref: (slug?: string | null) => string;
  onPick: () => void;
  depth: number;
  /** Held open while searching or at depth 0. */
  forceOpen: boolean;
  /** The lowercased search text — highlights the matching part of the title when present. */
  needle: string;
  /** The slug selected by keyboard nav — indigo highlight plus scrollIntoView. */
  focusedSlug: string | null;
}) {
  const [open, setOpen] = useState(depth === 0);
  const effectiveOpen = forceOpen || open;
  const linkRef = useRef<HTMLAnchorElement | null>(null);
  const isFocused = node.type === "doc" && node.slug === focusedSlug;

  useEffect(() => {
    if (!isFocused || !linkRef.current) return;
    linkRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isFocused]);

  if (node.type === "doc" && node.slug) {
    return (
      <Link
        ref={linkRef}
        href={getDocHref(node.slug)}
        onClick={onPick}
        className={controlClass({
          shape: "row",
          size: "sm",
          tone: isFocused ? "default" : "secondary",
          className: cn(
            "group gap-2 rounded-card hover:bg-[color:var(--color-indigo-a10)] hover:text-[color:var(--color-text-primary)]",
            isFocused && "bg-[color:var(--color-indigo-a18)] ring-1 ring-[color:var(--color-indigo-a40)]",
          ),
        })}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <FileText size={ICON_SIZE.sm} className="shrink-0 text-[color:var(--color-text-quaternary)] group-hover:text-[color:var(--color-indigo-accent)]" />
        <span className="truncate">
          {highlightMatch(node.title ?? node.name, needle)}
        </span>
      </Link>
    );
  }

  if (!node.children?.length) return null;

  return (
    <div>
      {depth > 0 ? (
        <RowButton
          size="sm"
          tone="muted"
          onClick={() => setOpen((v) => !v)}
          className="rounded-card font-mono hover:bg-[color:var(--color-overlay-1)]"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          aria-expanded={effectiveOpen}
        >
          {effectiveOpen ? (
            <ChevronDown size={ICON_SIZE.sm} />
          ) : (
            <ChevronRight size={ICON_SIZE.sm} />
          )}
          <Folder size={ICON_SIZE.sm} />
          <span className="truncate">{node.name}</span>
          <span className="ml-auto font-mono text-caption text-[color:var(--color-text-quaternary)]">
            {node.children.filter((c) => c.type === "doc" || (c.children?.length ?? 0) > 0).length}
          </span>
        </RowButton>
      ) : null}
      {effectiveOpen
        ? node.children.map((child) => (
            <TreeBranch
              key={child.path || child.name}
              node={child}
              getDocHref={getDocHref}
              onPick={onPick}
              depth={depth + 1}
              forceOpen={forceOpen}
              needle={needle}
              focusedSlug={focusedSlug}
            />
          ))
        : null}
    </div>
  );
}

function DocRow({
  doc,
  getDocHref,
  onClose,
  pinned,
  onTogglePin,
  trailingText,
}: {
  doc: FlatDoc;
  getDocHref: (slug?: string | null) => string;
  onClose: () => void;
  pinned: boolean;
  onTogglePin: (slug: string) => void;
  trailingText?: string;
}) {
  const t = useTranslations("vaultWidgets.docsDrawer");
  const hasExcerpt = doc.excerpt.trim().length > 0;
  return (
    <div className="group flex flex-col rounded-card transition-colors hover:bg-[color:var(--color-indigo-a10)]">
      <div className="flex items-center gap-1">
        <Link
          href={getDocHref(doc.slug)}
          onClick={onClose}
          className={controlClass({ hoverInk: 'strong', shape: "row", size: "sm", tone: "secondary", className: "min-w-0 flex-1 gap-2 group-" })}
        >
          <FileText
            size={ICON_SIZE.sm}
            className="shrink-0 text-[color:var(--color-text-quaternary)] group-hover:text-[color:var(--color-indigo-accent)]"
          />
          <span className="truncate">{doc.title}</span>
          {trailingText ? (
            <span className="ml-auto shrink-0 font-mono text-caption text-[color:var(--color-text-quaternary)]">
              {trailingText}
            </span>
          ) : null}
        </Link>
        <IconButton
          size="sm"
          tone="muted"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin(doc.slug);
          }}
          label={
            pinned
              ? t("togglePinOff", { title: doc.title })
              : t("togglePinOn", { title: doc.title })
          }
          title={pinned ? t("pinTooltipOn") : t("pinTooltipOff")}
          className={cn(
            "mr-1 transition-opacity",
            pinned
              ? "text-[color:var(--color-indigo-accent)] opacity-100"
              : "[@media(hover:hover)]:opacity-0 hover:text-[color:var(--color-indigo-accent)] group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          <Star size={ICON_SIZE.sm} fill={pinned ? "currentColor" : "none"} />
        </IconButton>
      </div>
      {hasExcerpt && (
        // A preview of the body's first paragraph, rendered on hover only. Gated
        // behind a hover: hover media query so it never appears on touch devices.
        <p className="hidden line-clamp-2 px-2 pb-1.5 text-label leading-label text-[color:var(--color-text-quaternary)] [@media(hover:hover)]:group-hover:block">
          {doc.excerpt}
        </p>
      )}
    </div>
  );
}

export function DocsQuickDrawer({
  open,
  onClose,
  basePath = "/docs",
  getDocHref = (slug) =>
    slug
      ? `${basePath}/?slug=${encodeURIComponent(slug)}`
      : basePath,
  contextProject,
}: Props) {
  const t = useTranslations("vaultWidgets.docsDrawer");
  // Entry review E-10 — a Latin eyebrow laid over the Korean section labels of the
  // docs-vault and workspace drawers. It only widened the spaces, as in
  // "by folder  ·  31". The folder name rows (TreeBranch) keep mono because they are
  // machine strings — what is forbidden is laying it over a Korean sentence.
  const eyebrow14 = useLatinEyebrow("tracking-[var(--tracking-caps-14)]");
  const eyebrow08 = useLatinEyebrow("tracking-[var(--tracking-caps-08)]");
  const locale = useLocale();
  const router = useRouter();

  // #61 — this drawer is quick access to **the active vault** (the label says so
  // too, and 'all' goes to /docs). It used to read the build-time bundled
  // `vaultManifest` directly, so selecting a 5-document local vault still produced
  // Atlas bundle documents, and pinned/recent were fixed at `:server`, mixing in
  // another vault's lists (review 2026-07-25).
  //
  // It now follows the same rule as /docs: with a local vault loaded, that
  // manifest and that vault's scoped pinned/recent; otherwise the bundled sample
  // the user chose (dogfood or the example shop) — reading the bundle directly
  // would make the sample choice ignored here alone.
  const mode = useDataSourceMode();
  const localVault = useLocalVault();
  const staticVault = useStaticVaultSource();
  const isLocalLoaded =
    mode === "local" && localVault.status === "loaded" && Boolean(localVault.manifest);
  const activeManifest: VaultManifest =
    isLocalLoaded && localVault.manifest
      ? localVault.manifest
      : staticVault.manifest;
  const scope = vaultScopeKey({
    isLocalLoaded,
    handleName: localVault.handle?.name ?? null,
  });
  const pinnedKey = pinnedDocsStorageKey(scope);
  const recentKey = recentDocsStorageKey(scope);

  const [query, setQuery] = useState("");
  const [pinnedSlugs, setPinnedSlugs] = useState<string[]>([]);
  const [recentSlugs, setRecentSlugs] = useState<string[]>([]);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [focusedSlug, setFocusedSlug] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) {
      queueMicrotask(() => {
        setQuery("");
        setActiveTag(null);
      });
      return;
    }
    // Re-read on every open, so something just pinned in /docs shows immediately.
    queueMicrotask(() => {
      setPinnedSlugs(readStoredSlugs(pinnedKey, 50));
      setRecentSlugs(readStoredSlugs(recentKey, 5));
    });
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => searchRef.current?.focus(), 40);
    return () => {
      window.clearTimeout(t);
    };
    // A vault change re-reads that vault's scoped pinned and recent.
  }, [open, pinnedKey, recentKey]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  const docs: FlatDoc[] = useMemo(() => {
    const all = flattenDocs(activeManifest.tree as VaultTreeNode)
      .filter((n) => n.type === "doc" && n.slug)
      .map((n) => {
        const meta = activeManifest.docs.find((d) => d.slug === n.slug);
        const canonical = n.title ?? n.name;
        return {
          slug: n.slug as string,
          // Pick the name by the same rule as the map popover — this was the only
          // place drawing the canonical title, so a document just read as
          // "my project" on a Korean screen appeared as `My project` in the search list.
          title: resolveLocaleDisplayName(meta?.frontmatter, locale, canonical),
          path: n.path,
          updatedAt: meta?.updatedAt ?? "",
          tags: meta?.tags ?? [],
          excerpt: meta?.excerpt ?? "",
        } satisfies FlatDoc;
      });
    return all;
  }, [activeManifest, locale]);

  // Document slug sets per tag. `manifest.tags` is already an inverted index but is
  // treated as readonly when loaded from JSON — rebuilt from FlatDoc.tags into a Set
  // for O(1) lookup.
  const tagIndex = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const d of docs) {
      for (const t of d.tags) {
        const bucket = map.get(t) ?? new Set<string>();
        bucket.add(d.slug);
        map.set(t, bucket);
      }
    }
    return map;
  }, [docs]);

  // The top 12 tags, by descending count. Exposed as chips at the top of the screen.
  const topTags = useMemo(() => {
    const counts: { tag: string; count: number }[] = [];
    tagIndex.forEach((slugs, tag) => counts.push({ tag, count: slugs.size }));
    counts.sort((a, b) =>
      b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag),
    );
    return counts.slice(0, 12);
  }, [tagIndex]);

  const docBySlug = useMemo(() => {
    const map = new Map<string, FlatDoc>();
    for (const d of docs) map.set(d.slug, d);
    return map;
  }, [docs]);

  const modifiedDocs = useMemo(
    () =>
      [...docs]
        .filter((d) => d.updatedAt)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .slice(0, MAX_RECENT),
    [docs],
  );

  const pinnedDocs = useMemo(
    () => pinnedSlugs.map((s) => docBySlug.get(s)).filter((d): d is FlatDoc => !!d),
    [pinnedSlugs, docBySlug],
  );
  const pinnedSet = useMemo(() => new Set(pinnedSlugs), [pinnedSlugs]);

  const handleTogglePin = (slug: string) => {
    setPinnedSlugs(togglePinnedInStorage(pinnedKey, slug));
  };

  const recentViewed = useMemo(
    () => recentSlugs.map((s) => docBySlug.get(s)).filter((d): d is FlatDoc => !!d),
    [recentSlugs, docBySlug],
  );

  // With a project selected on the map, compute the top N related documents.
  // findRelatedDocs returns a score combining the frontmatter projects, wikilink,
  // url, title and tag signals — the same logic as ProjectDrawer.
  const relatedDocs = useMemo(() => {
    if (!contextProject) return [];
    const manifest = activeManifest;
    return findRelatedDocs(
      manifest.docs,
      {
        projectSlug: contextProject.slug,
        projectName: contextProject.name,
        aliases: contextProject.aliases,
      },
      6,
    );
  }, [contextProject, activeManifest]);

  const trimmedQuery = query.trim().toLowerCase();
  const activeTagSlugs = useMemo(
    () => (activeTag ? (tagIndex.get(activeTag) ?? null) : null),
    [activeTag, tagIndex],
  );
  const filteredTree = useMemo(
    () =>
      filterTree(
        activeManifest.tree as VaultTreeNode,
        trimmedQuery,
        activeTagSlugs,
      ),
    [trimmedQuery, activeTagSlugs, activeManifest],
  );

  // The flat list of slugs ↑/↓ cycles through in search and tag mode. Inactive when
  // there is neither a trimmedQuery nor an activeTag (normal mode is split into
  // sections, so a flat order would be ambiguous).
  const flatTreeSlugs = useMemo(() => {
    if (!trimmedQuery && !activeTag) return [];
    return flattenTreeSlugs(filteredTree);
  }, [filteredTree, trimmedQuery, activeTag]);

  // Reset focus to the first item when the filter results change — what the user
  // expects while typing.
  useEffect(() => {
    queueMicrotask(() => setFocusedSlug(flatTreeSlugs[0] ?? null));
  }, [flatTreeSlugs]);

  const totalDocs = docs.length;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="docs-quick-drawer"
          data-interactive-overlay="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MOTION.base}
          className="pointer-events-auto fixed inset-0 z-40 bg-[color:var(--color-backdrop-medium)]"
          onClick={onClose}
        >
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("ariaLabel")}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={MOTION.base}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.4 }}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              // Close on 120px+ to the right, or a fast flick (velocity 450+).
              // Supports natural swipe-to-dismiss on mobile instead of an overlay tap.
              if (info.offset.x > 120 || info.velocity.x > 450) {
                onClose();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            /*
             * ⚠️ **Inset like the agent dock, not glued to the window** (owner, 2026-08-25: *"can
             * this be composed like the agent panel? the panel is stuck to the top and bottom and
             * looks bad"*).
             *
             * It used to be `fixed right-0 top-0 h-full`, so it met the window edge on three sides
             * and its top and bottom simply ended — a panel with no visible boundary reads as a
             * broken frame rather than a surface. `AGENT_DOCK_INSET_SURFACE_CLASS` is the contract
             * the agent dock already uses for exactly this: 12px insets so all four sides are seen,
             * with the panel radius, border and shadow tokens. Sharing it also means the two right-
             * hand surfaces cannot drift apart.
             */
            className={`${AGENT_DOCK_INSET_SURFACE_CLASS} fixed right-3 flex w-full max-w-[380px] flex-col touch-pan-y`}
          >
            <header className="shrink-0 border-b border-[color:var(--color-border-soft)] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={`text-caption text-[color:var(--color-indigo-accent)] ${eyebrow14}`}>
                    {t("eyebrow")}
                  </p>
                  <p className="mt-1 text-body text-[color:var(--color-text-secondary)]">
                    {t("totalLine", { count: totalDocs })}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    href={getDocHref()}
                    onClick={onClose}
                    className={controlClass({ shape: "pill", size: "sm", tone: "secondary", className: "gap-1 border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] hover:border-[color:var(--color-indigo-a40)] hover:text-[color:var(--color-text-primary)]" })}
                    aria-label={t("openAllAriaLabel")}
                  >
                    <BookOpen size={ICON_SIZE.sm} />
                    {t("openAllLabel")}
                  </Link>
                  <IconButton
                    label={t("closeAriaLabel")}
                    size="lg"
                    onClick={onClose}
                    className="hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]"
                  >
                    <X size={ICON_SIZE.md} />
                  </IconButton>
                </div>
              </div>

              <form
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  // Enter → the focused slug first, otherwise the first match.
                  const slug = focusedSlug ?? firstDocSlug(filteredTree);
                  if (!slug) return;
                  router.push(getDocHref(slug));
                  onClose();
                }}
                onKeyDown={(e) => {
                  if (flatTreeSlugs.length === 0) return;
                  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                  e.preventDefault();
                  const currentIdx = focusedSlug
                    ? flatTreeSlugs.indexOf(focusedSlug)
                    : -1;
                  const delta = e.key === "ArrowDown" ? 1 : -1;
                  const nextIdx =
                    (currentIdx + delta + flatTreeSlugs.length) %
                    flatTreeSlugs.length;
                  setFocusedSlug(flatTreeSlugs[nextIdx]);
                }}
                className="mt-3 flex items-center gap-2 rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-2 transition-[border-color,box-shadow] focus-within:border-[color:var(--color-indigo-a50)] focus-within:ring-2 focus-within:ring-[color:var(--color-indigo-a24)]"
              >
                <Search size={ICON_SIZE.sm} className="text-[color:var(--color-text-quaternary)]" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("filterPlaceholder")}
                  name="docsQuickFilter"
                  autoComplete="off"
                  className={fieldClass({ frame: "bare", className: "flex-1" })}
                  aria-label={t("filterAriaLabel")}
                />
                {query ? (
                  <IconButton
                    label={t("filterClearAriaLabel")}
                    size="sm"
                    tone="muted"
                    onClick={() => setQuery("")}
                    className="hover:text-[color:var(--color-text-primary)]"
                  >
                    <X size={ICON_SIZE.sm} aria-hidden />
                  </IconButton>
                ) : null}
              </form>

              {topTags.length > 0 && (
                <div
                  className="-mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 py-0.5 [&::-webkit-scrollbar]:h-0"
                  role="toolbar"
                  aria-label={t("tagToolbarAriaLabel")}
                >
                  {activeTag && (
                    <button
                      type="button"
                      onClick={() => setActiveTag(null)}
                      className={controlClass({ hoverInk: 'strong', hoverBorder: 'strong',
                        shape: "pill",
                        size: "sm",
                        className: "shrink-0 gap-1",
                      })}
                      aria-label={t("tagClearAriaLabel")}
                    >
                      <X size={ICON_SIZE.sm} />
                      {t("tagClearLabel")}
                    </button>
                  )}
                  {topTags.map(({ tag, count }) => {
                    const selected = activeTag === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setActiveTag((current) => (current === tag ? null : tag))
                        }
                        aria-pressed={selected}
                        className={controlClass({
                          shape: "pill",
                          size: "sm",
                          active: selected,
                          /*
                           * The hover border is given **only to unselected chips**
                           * (2026-08-15). It used to apply unconditionally, so
                           * hovering a selected chip let hover cover the selection
                           * border — weakening the selection signal (measured:
                           * `indigo-pale-a28` 2.09 → `a34` 1.48). `CommitDetail` in
                           * the same family already had this guard, with a comment.
                           */
                          className: selected
                            ? "shrink-0 gap-1"
                            : "shrink-0 gap-1 hover:border-[color:var(--color-indigo-a34)] hover:text-[color:var(--color-text-primary)]",
                        })}
                      >
                        <Hash size={ICON_SIZE.sm} />
                        <span className="max-w-[96px] truncate">{tag}</span>
                        <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </header>

            <div className="flex-1 overflow-y-auto px-3 py-3 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[color:var(--color-divider)]">
              {trimmedQuery || activeTag ? null : (
                <>
                  {contextProject && relatedDocs.length > 0 && (
                    <section className="mb-4 rounded-panel border border-[color:var(--color-indigo-a24)] bg-[color:var(--color-indigo-a06)] p-2">
                      <p className={`mb-1.5 flex items-center gap-1 px-1 text-caption text-[color:var(--color-indigo-accent)] ${eyebrow14}`}>
                        <Link2 size={ICON_SIZE.sm} />
                        {t("relatedSection", { name: contextProject.name, count: relatedDocs.length })}
                      </p>
                      <div className="space-y-0.5">
                        {relatedDocs.map((m) => (
                          <Link
                            key={`rel-${m.doc.slug}`}
                            href={getDocHref(m.doc.slug)}
                            onClick={onClose}
                            className={controlClass({ shape: "row", size: "sm", tone: "secondary", className: "group gap-2 hover:bg-[color:var(--color-indigo-a14)] hover:text-[color:var(--color-text-primary)]" })}
                          >
                            <FileText size={ICON_SIZE.sm} className="shrink-0 text-[color:var(--color-text-quaternary)] group-hover:text-[color:var(--color-indigo-accent)]" />
                            <span className="truncate">{m.doc.title}</span>
                            <span
                              className={`ml-auto shrink-0 text-caption text-[color:var(--color-text-quaternary)] ${eyebrow08}`}
                              title={m.reasons.join(", ")}
                            >
                              {m.reasons[0]}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </section>
                  )}

                  {pinnedDocs.length > 0 && (
                    <section className="mb-4">
                      <p className={`mb-1.5 flex items-center gap-1 px-2 text-caption text-[color:var(--color-indigo-accent)] ${eyebrow14}`}>
                        <Star size={ICON_SIZE.sm} />
                        {t("pinnedSection", { count: pinnedDocs.length })}
                      </p>
                      <div className="space-y-0.5">
                        {pinnedDocs.map((doc) => (
                          <DocRow
                            key={`pin-${doc.slug}`}
                            doc={doc}
                            getDocHref={getDocHref}
                            onClose={onClose}
                            pinned
                            onTogglePin={handleTogglePin}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {recentViewed.length > 0 && (
                    <section className="mb-4">
                      <p className={`mb-1.5 flex items-center gap-1 px-2 text-caption text-[color:var(--color-text-quaternary)] ${eyebrow14}`}>
                        <Clock size={ICON_SIZE.sm} />
                        {t("recentSection", { count: recentViewed.length })}
                      </p>
                      <div className="space-y-0.5">
                        {recentViewed.map((doc) => (
                          <DocRow
                            key={`rv-${doc.slug}`}
                            doc={doc}
                            getDocHref={getDocHref}
                            onClose={onClose}
                            pinned={pinnedSet.has(doc.slug)}
                            onTogglePin={handleTogglePin}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="mb-4">
                    <p className={`mb-1.5 flex items-center gap-1 px-2 text-caption text-[color:var(--color-text-quaternary)] ${eyebrow14}`}>
                      <Clock size={ICON_SIZE.sm} />
                      {t("modifiedSection", { count: modifiedDocs.length })}
                    </p>
                    <div className="space-y-0.5">
                      {modifiedDocs.map((doc) => (
                        <DocRow
                          key={`mod-${doc.slug}`}
                          doc={doc}
                          getDocHref={getDocHref}
                          onClose={onClose}
                          pinned={pinnedSet.has(doc.slug)}
                          onTogglePin={handleTogglePin}
                          trailingText={formatRelative(doc.updatedAt, t)}
                        />
                      ))}
                    </div>
                  </section>
                </>
              )}

              <section>
                <p className={`mb-1.5 px-2 text-caption text-[color:var(--color-text-quaternary)] ${eyebrow14}`}>
                  {trimmedQuery
                    ? t("searchHeader", { query })
                    : activeTag
                      ? t("tagHeader", { tag: activeTag, count: activeTagSlugs?.size ?? 0 })
                      : t("folderHeader", { count: totalDocs })}
                </p>
                {filteredTree ? (
                  <TreeBranch
                    node={filteredTree}
                    getDocHref={getDocHref}
                    onPick={onClose}
                    depth={0}
                    forceOpen={trimmedQuery.length > 0 || activeTag !== null}
                    needle={trimmedQuery}
                    focusedSlug={focusedSlug}
                  />
                ) : (
                  <div className="rounded-card border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-5 text-center">
                    <p className="text-body text-[color:var(--color-text-tertiary)]">
                      {trimmedQuery
                        ? t("emptySearch", { query })
                        : activeTag
                          ? t("emptyTag", { tag: activeTag })
                          : t("emptyAll")}
                    </p>
                    <div className="mt-2 flex items-center justify-center gap-2">
                      {(trimmedQuery || activeTag) && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuery("");
                            setActiveTag(null);
                            searchRef.current?.focus();
                          }}
                          className={controlClass({
                            shape: "pill",
                            className:
                              "gap-1 hover:border-[color:var(--color-indigo-a40)] hover:text-[color:var(--color-text-primary)]",
                          })}
                        >
                          {t("clearFilters")}
                        </button>
                      )}
                      <Link
                        href={getDocHref()}
                        onClick={onClose}
                        className={controlClass({ shape: "pill", size: "sm", className: "gap-1 border-[color:var(--color-indigo-a32)] bg-[color:var(--color-indigo-a10)] hover:border-[color:var(--color-indigo-a50)]" })}
                      >
                        <BookOpen size={ICON_SIZE.sm} />
                        {t("openVault")}
                      </Link>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <footer
              className={cn(
                "shrink-0 border-t border-[color:var(--color-overlay-2)] bg-[color:var(--color-overlay-1)] px-5 py-2.5",
              )}
            >
              <p className={`text-caption text-[color:var(--color-text-quaternary)] ${eyebrow14}`}>
                <kbd className="rounded-micro border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">↑↓</kbd>
                {" "}{t("footerMove")} ·{" "}
                <kbd className="rounded-micro border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">↵</kbd>
                {" "}{t("footerOpen")} ·{" "}
                <kbd className="rounded-micro border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">Esc</kbd>
                {" "}{t("footerClose")} · {t("footerSwipe")}
              </p>
            </footer>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function formatRelative(
  iso: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (!iso) return "";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return t("today");
  if (diffMs < 2 * day) return t("yesterday");
  const days = Math.floor(diffMs / day);
  if (days < 30) return t("daysAgo", { count: days });
  const months = Math.floor(days / 30);
  if (months < 12) return t("monthsAgo", { count: months });
  return t("yearsAgo", { count: Math.floor(months / 12) });
}
