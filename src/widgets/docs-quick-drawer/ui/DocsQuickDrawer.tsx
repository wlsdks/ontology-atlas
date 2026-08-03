"use client";

import { Link, useRouter } from "@/i18n/navigation";
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
import {
  findRelatedDocs,
  pinnedDocsStorageKey,
  recentDocsStorageKey,
  vaultScopeKey,
  type VaultManifest,
  type VaultTreeNode,
} from "@/entities/docs-vault";
import { useStaticVaultSource } from "@/features/vault-sample-source";
import { useDataSourceMode } from "@/features/data-source-mode";
import { useLocalVault } from "@/features/docs-vault-local";
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

/** docs-vault widget 의 togglePinnedDoc 과 동일 동작 — 고정 추가 시 맨 앞. */
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
  /** 드로어 내 링크가 붙는 Vault 경로 prefix. 기본 `/docs`. */
  basePath?: string;
  getDocHref?: (slug?: string | null) => string;
  /** 토폴로지에서 선택된 프로젝트 맥락. 있으면 드로어 상단에 관련 문서 섹션 표시. */
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
      <mark className="rounded bg-[color:var(--color-indigo-a28)] px-0.5 text-[color:var(--color-text-primary)]">
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
  /** 검색 중이거나 depth 0 일 때 열어둠. */
  forceOpen: boolean;
  /** 검색어 소문자 — 있으면 제목의 매치 부분 하이라이트. */
  needle: string;
  /** 키보드 nav 로 선택된 slug — indigo 하이라이트 + scrollIntoView. */
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
        className={cn(
          "group flex items-center gap-2 rounded-card px-2 py-1.5 text-body text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-indigo-a10)] hover:text-[color:var(--color-text-primary)]",
          isFocused &&
            "bg-[color:var(--color-indigo-a18)] text-[color:var(--color-text-primary)] ring-1 ring-[color:var(--color-indigo-a40)]",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <FileText size={13} className="shrink-0 text-[color:var(--color-text-quaternary)] group-hover:text-[color:var(--color-indigo-accent)]" />
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
          className="rounded-card font-mono uppercase tracking-[0.08em] hover:bg-[color:var(--color-overlay-1)]"
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          aria-expanded={effectiveOpen}
        >
          {effectiveOpen ? (
            <ChevronDown size={11} />
          ) : (
            <ChevronRight size={11} />
          )}
          <Folder size={11} />
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
          className="flex min-w-0 flex-1 items-center gap-2 rounded-card px-2 py-1.5 text-body text-[color:var(--color-text-secondary)] transition-colors group-hover:text-[color:var(--color-text-primary)]"
        >
          <FileText
            size={13}
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
              : "opacity-0 hover:text-[color:var(--color-indigo-accent)] group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          <Star size={12} fill={pinned ? "currentColor" : "none"} />
        </IconButton>
      </div>
      {hasExcerpt && (
        // hover 시에만 렌더되는 본문 첫 단락 프리뷰. 터치 기기 (hover: none)
        // 에선 안 뜨게 hover: hover 미디어 쿼리로 게이팅.
        <p className="hidden line-clamp-2 px-2 pb-1.5 text-label leading-4 text-[color:var(--color-text-quaternary)] [@media(hover:hover)]:group-hover:block">
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
  // 진입 검수 E-10 — 문서함/작업공간 드로어의 한국어 섹션 라벨에 얹힌 라틴
  // 아이브로. 「폴더별  ·  31」처럼 공백만 벌어졌다. 폴더 이름 행(TreeBranch)은
  // 기계 문자열이라 mono 를 유지한다 — 금지는 한글 문장에 얹는 것이다.
  const eyebrow14 = useLatinEyebrow("tracking-[0.14em]");
  const eyebrow08 = useLatinEyebrow("tracking-[0.08em]");
  const locale = useLocale();
  const router = useRouter();

  // #61 — 이 드로어는 **활성 볼트**의 빠른 접근이다(라벨도 "문서함 빠른 접근",
  // '전체' 는 /docs 로 간다). 예전엔 빌드타임 번들 `vaultManifest` 를 직접
  // 읽어, 5개짜리 로컬 볼트를 선택해도 Atlas 번들 문서가 나왔다. 고정/최근도
  // `:server` 로 고정돼 다른 볼트의 목록이 섞였다 (opus5 검수 2026-07-25).
  //
  // 이제 /docs 와 같은 규칙을 쓴다: 로컬 볼트가 로드돼 있으면 그 manifest 와
  // 그 볼트 범위의 고정/최근을, 아니면 사용자가 고른 번들 샘플(도그푸드 /
  // 예시 쇼핑몰)을 본다 — 번들을 직접 읽으면 샘플 선택이 여기서만 무시된다.
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
    // 열릴 때마다 다시 읽어 /docs 에서 방금 pin 한 것도 즉시 반영.
    queueMicrotask(() => {
      setPinnedSlugs(readStoredSlugs(pinnedKey, 50));
      setRecentSlugs(readStoredSlugs(recentKey, 5));
    });
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => searchRef.current?.focus(), 40);
    return () => {
      window.clearTimeout(t);
    };
    // 볼트가 바뀌면 그 볼트 범위의 고정/최근을 다시 읽는다.
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
          // 지도 팝오버와 같은 규칙으로 이름을 고른다 — 예전엔 여기만
          // canonical title 을 그려서, 한국어 화면에서 방금 `내 프로젝트`
          // 로 읽은 문서가 검색 목록엔 `My project` 로 떴다.
          title: resolveLocaleDisplayName(meta?.frontmatter, locale, canonical),
          path: n.path,
          updatedAt: meta?.updatedAt ?? "",
          tags: meta?.tags ?? [],
          excerpt: meta?.excerpt ?? "",
        } satisfies FlatDoc;
      });
    return all;
  }, [activeManifest, locale]);

  // 태그별 문서 slug set. manifest.tags 는 이미 역색인이지만 JSON 로딩시
  // readonly 로 취급 — FlatDoc.tags 에서 다시 쌓아 O(1) 조회용 Set 화.
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

  // 상위 12개 태그 — 개수 순 내림차순. 화면 상단에 칩으로 노출.
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

  // 토폴로지에서 선택된 프로젝트가 있으면 관련 문서 상위 N 개 계산.
  // findRelatedDocs 는 frontmatter projects / wikilink / url / title / tag 신호
  // 를 종합한 score 를 반환 — ProjectDrawer 와 동일 로직.
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

  // 검색/태그 모드에서 키보드 ↑/↓ 가 순회할 대상 slug 평면 리스트.
  // trimmedQuery/activeTag 아무것도 없으면 비활성 (normal 모드는 섹션 분리돼
  // 있어 flat 순서가 모호함).
  const flatTreeSlugs = useMemo(() => {
    if (!trimmedQuery && !activeTag) return [];
    return flattenTreeSlugs(filteredTree);
  }, [filteredTree, trimmedQuery, activeTag]);

  // 필터 결과가 바뀌면 focused 를 첫 항목으로 리셋 — 사용자가 타이핑 하면서
  // 기대하는 동작.
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
              // 오른쪽으로 120px 이상 또는 빠른 flick (속도 450+) 이면 닫기.
              // 모바일에서 overlay 탭 대신 자연스러운 swipe-to-dismiss 지원.
              if (info.offset.x > 120 || info.velocity.x > 450) {
                onClose();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="fixed right-0 top-0 flex h-full w-full max-w-[380px] flex-col overflow-hidden border-l border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-dock-side)] touch-pan-y"
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
                    className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-1 text-label text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-a40)] hover:text-[color:var(--color-text-primary)]"
                    aria-label={t("openAllAriaLabel")}
                  >
                    <BookOpen size={11} />
                    {t("openAllLabel")}
                  </Link>
                  <IconButton
                    label={t("closeAriaLabel")}
                    size="lg"
                    onClick={onClose}
                    className="hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]"
                  >
                    <X size={14} />
                  </IconButton>
                </div>
              </div>

              <form
                role="search"
                onSubmit={(e) => {
                  e.preventDefault();
                  // Enter → focused slug 우선, 없으면 첫 매치.
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
                <Search size={13} className="text-[color:var(--color-text-quaternary)]" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("filterPlaceholder")}
                  name="docsQuickFilter"
                  autoComplete="off"
                  className="flex-1 bg-transparent text-body text-[color:var(--color-text-primary)] placeholder-[color:var(--color-text-quaternary)] outline-none"
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
                    <X size={13} aria-hidden />
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
                      className={controlClass({
                        shape: "pill",
                        size: "sm",
                        className:
                          "shrink-0 gap-1 hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]",
                      })}
                      aria-label={t("tagClearAriaLabel")}
                    >
                      <X size={10} />
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
                          className:
                            "shrink-0 gap-1 hover:border-[color:var(--color-indigo-a34)] hover:text-[color:var(--color-text-primary)]",
                        })}
                      >
                        <Hash size={9} />
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
                        <Link2 size={10} />
                        {t("relatedSection", { name: contextProject.name, count: relatedDocs.length })}
                      </p>
                      <div className="space-y-0.5">
                        {relatedDocs.map((m) => (
                          <Link
                            key={`rel-${m.doc.slug}`}
                            href={getDocHref(m.doc.slug)}
                            onClick={onClose}
                            className="group flex items-center gap-2 rounded-card px-2 py-1.5 text-body text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-indigo-a14)] hover:text-[color:var(--color-text-primary)]"
                          >
                            <FileText size={13} className="shrink-0 text-[color:var(--color-text-quaternary)] group-hover:text-[color:var(--color-indigo-accent)]" />
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
                        <Star size={10} />
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
                        <Clock size={10} />
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
                      <Clock size={10} />
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
                        className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-indigo-a32)] bg-[color:var(--color-indigo-a10)] px-2.5 py-1 text-label text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-a50)]"
                      >
                        <BookOpen size={11} />
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
                <kbd className="rounded border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">↑↓</kbd>
                {" "}{t("footerMove")} ·{" "}
                <kbd className="rounded border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">↵</kbd>
                {" "}{t("footerOpen")} ·{" "}
                <kbd className="rounded border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">Esc</kbd>
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
