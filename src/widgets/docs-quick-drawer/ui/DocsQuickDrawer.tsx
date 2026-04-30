"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
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
  vaultManifest,
  type VaultManifest,
  type VaultTreeNode,
} from "@/entities/docs-vault";
import {
  filterTree,
  firstDocSlug,
  flattenDocs,
  flattenTreeSlugs,
} from "../lib/tree-utils";
import { MOTION } from "@/shared/motion";
import { useBodyScrollLock } from "@/shared/lib/use-body-scroll-lock";
import { cn } from "@/shared/lib/cn";

// docs-vault widget 에 이미 있는 storage key 와 shape 을 그대로 참조 — 타입만
// 같이 유지하면 두 위젯이 같은 localStorage 네임스페이스를 공유한다.
// widget→widget import 는 FSD 경계에서 금지라, 최소 read-only 접근만 inline.
const PINNED_KEY = "aslan:docs-vault:pinned:v1:server";
const RECENT_KEY = "aslan:docs-vault:recent:v2:server";

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
function togglePinnedInStorage(slug: string): string[] {
  if (typeof window === "undefined") return [];
  const current = readStoredSlugs(PINNED_KEY, 500);
  const next = current.includes(slug)
    ? current.filter((s) => s !== slug)
    : [slug, ...current];
  try {
    window.localStorage.setItem(PINNED_KEY, JSON.stringify(next));
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
      <mark className="rounded bg-[color:rgba(94,106,210,0.28)] px-0.5 text-[color:var(--color-text-primary)]">
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
          "group flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[13px] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:rgba(94,106,210,0.1)] hover:text-[color:var(--color-text-primary)]",
          isFocused &&
            "bg-[color:rgba(94,106,210,0.18)] text-[color:var(--color-text-primary)] ring-1 ring-[color:rgba(94,106,210,0.4)]",
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
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 rounded-[8px] px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-1)]"
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
          <span className="ml-auto font-mono text-[9px] text-[color:var(--color-text-quaternary)]">
            {node.children.filter((c) => c.type === "doc" || (c.children?.length ?? 0) > 0).length}
          </span>
        </button>
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
  const hasExcerpt = doc.excerpt.trim().length > 0;
  return (
    <div className="group flex flex-col rounded-[8px] transition-colors hover:bg-[color:rgba(94,106,210,0.1)]">
      <div className="flex items-center gap-1">
        <Link
          href={getDocHref(doc.slug)}
          onClick={onClose}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-[8px] px-2 py-1.5 text-[13px] text-[color:var(--color-text-secondary)] transition-colors group-hover:text-[color:var(--color-text-primary)]"
        >
          <FileText
            size={13}
            className="shrink-0 text-[color:var(--color-text-quaternary)] group-hover:text-[color:var(--color-indigo-accent)]"
          />
          <span className="truncate">{doc.title}</span>
          {trailingText ? (
            <span className="ml-auto shrink-0 font-mono text-[9px] text-[color:var(--color-text-quaternary)]">
              {trailingText}
            </span>
          ) : null}
        </Link>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin(doc.slug);
          }}
          aria-label={pinned ? `${doc.title} 고정 해제` : `${doc.title} 고정`}
          title={pinned ? "고정 해제" : "고정"}
          className={cn(
            "mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded transition-opacity",
            pinned
              ? "text-[color:var(--color-indigo-accent)] opacity-100"
              : "text-[color:var(--color-text-quaternary)] opacity-0 hover:text-[color:var(--color-indigo-accent)] group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          <Star size={12} fill={pinned ? "currentColor" : "none"} />
        </button>
      </div>
      {hasExcerpt && (
        // hover 시에만 렌더되는 본문 첫 단락 프리뷰. 터치 기기 (hover: none)
        // 에선 안 뜨게 hover: hover 미디어 쿼리로 게이팅.
        <p className="hidden line-clamp-2 px-2 pb-1.5 text-[11px] leading-4 text-[color:var(--color-text-quaternary)] [@media(hover:hover)]:group-hover:block">
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
  const router = useRouter();
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
      setPinnedSlugs(readStoredSlugs(PINNED_KEY, 50));
      setRecentSlugs(readStoredSlugs(RECENT_KEY, 5));
    });
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => searchRef.current?.focus(), 40);
    return () => {
      window.clearTimeout(t);
    };
  }, [open]);

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
    const all = flattenDocs(vaultManifest.tree as VaultTreeNode)
      .filter((n) => n.type === "doc" && n.slug)
      .map((n) => {
        const meta = vaultManifest.docs.find((d) => d.slug === n.slug);
        return {
          slug: n.slug as string,
          title: n.title ?? n.name,
          path: n.path,
          updatedAt: meta?.updatedAt ?? "",
          tags: meta?.tags ?? [],
          excerpt: meta?.excerpt ?? "",
        } satisfies FlatDoc;
      });
    return all;
  }, []);

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
    setPinnedSlugs(togglePinnedInStorage(slug));
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
    const manifest = vaultManifest as VaultManifest;
    return findRelatedDocs(
      manifest.docs,
      {
        projectSlug: contextProject.slug,
        projectName: contextProject.name,
        aliases: contextProject.aliases,
      },
      6,
    );
  }, [contextProject]);

  const trimmedQuery = query.trim().toLowerCase();
  const activeTagSlugs = useMemo(
    () => (activeTag ? (tagIndex.get(activeTag) ?? null) : null),
    [activeTag, tagIndex],
  );
  const filteredTree = useMemo(
    () =>
      filterTree(
        vaultManifest.tree as VaultTreeNode,
        trimmedQuery,
        activeTagSlugs,
      ),
    [trimmedQuery, activeTagSlugs],
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
          transition={MOTION.fast}
          className="pointer-events-auto fixed inset-0 z-40 bg-[color:var(--color-backdrop-medium)]"
          onClick={onClose}
        >
          <motion.aside
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="문서 볼트 빠른 접근"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={MOTION.medium}
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
            className="fixed right-0 top-0 flex h-full w-full max-w-[380px] flex-col overflow-hidden border-l border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[0_0_48px_rgba(0,0,0,0.42)] touch-pan-y"
          >
            <header className="shrink-0 border-b border-[color:var(--color-border-soft)] px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
                    문서 볼트
                  </p>
                  <p className="mt-1 text-[13px] text-[color:var(--color-text-secondary)]">
                    등록된 문서 {totalDocs}개를 한눈에.
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    href={getDocHref()}
                    onClick={onClose}
                    className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-3 py-1 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.4)] hover:text-[color:var(--color-text-primary)]"
                    aria-label="문서 볼트 전체 페이지로 이동"
                  >
                    <BookOpen size={11} />
                    전체
                    <ArrowUpRight size={11} />
                  </Link>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="드로어 닫기"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-border-strong)]"
                  >
                    <X size={14} />
                  </button>
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
                className="mt-3 flex items-center gap-2 rounded-[10px] border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-2 transition-[border-color,box-shadow] focus-within:border-[color:rgba(94,106,210,0.5)] focus-within:ring-2 focus-within:ring-[color:rgba(94,106,210,0.24)]"
              >
                <Search size={13} className="text-[color:var(--color-text-quaternary)]" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="제목·경로 빠른 필터…"
                  name="docsQuickFilter"
                  autoComplete="off"
                  className="flex-1 bg-transparent text-[13px] text-[color:var(--color-text-primary)] placeholder-[color:var(--color-text-quaternary)] outline-none"
                  aria-label="문서 제목·경로 필터"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="필터 지우기"
                    className="text-[color:var(--color-text-quaternary)] hover:text-[color:var(--color-text-primary)]"
                  >
                    <X size={13} aria-hidden />
                  </button>
                ) : null}
              </form>

              {topTags.length > 0 && (
                <div
                  className="-mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 py-0.5 [&::-webkit-scrollbar]:h-0"
                  role="toolbar"
                  aria-label="태그 필터"
                >
                  {activeTag && (
                    <button
                      type="button"
                      onClick={() => setActiveTag(null)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2 py-1 text-[10px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
                      aria-label="태그 필터 해제"
                    >
                      <X size={10} />
                      해제
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
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] transition-colors",
                          selected
                            ? "border-[color:rgba(94,106,210,0.55)] bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-text-primary)]"
                            : "border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-tertiary)] hover:border-[color:rgba(94,106,210,0.35)] hover:text-[color:var(--color-text-primary)]",
                        )}
                      >
                        <Hash size={9} />
                        <span className="max-w-[96px] truncate">{tag}</span>
                        <span className="font-mono text-[9px] text-[color:var(--color-text-quaternary)]">
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
                    <section className="mb-4 rounded-[12px] border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.06)] p-2">
                      <p className="mb-1.5 flex items-center gap-1 px-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
                        <Link2 size={10} />
                        {contextProject.name} 관련 · {relatedDocs.length}
                      </p>
                      <div className="space-y-0.5">
                        {relatedDocs.map((m) => (
                          <Link
                            key={`rel-${m.doc.slug}`}
                            href={getDocHref(m.doc.slug)}
                            onClick={onClose}
                            className="group flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[13px] text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:rgba(94,106,210,0.14)] hover:text-[color:var(--color-text-primary)]"
                          >
                            <FileText size={13} className="shrink-0 text-[color:var(--color-text-quaternary)] group-hover:text-[color:var(--color-indigo-accent)]" />
                            <span className="truncate">{m.doc.title}</span>
                            <span
                              className="ml-auto shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]"
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
                      <p className="mb-1.5 flex items-center gap-1 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-indigo-accent)]">
                        <Star size={10} />
                        고정 · {pinnedDocs.length}
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
                      <p className="mb-1.5 flex items-center gap-1 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                        <Clock size={10} />
                        최근 열람 · {recentViewed.length}
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
                    <p className="mb-1.5 flex items-center gap-1 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                      <Clock size={10} />
                      최근 수정 · {modifiedDocs.length}
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
                          trailingText={formatRelative(doc.updatedAt)}
                        />
                      ))}
                    </div>
                  </section>
                </>
              )}

              <section>
                <p className="mb-1.5 px-2 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                  {trimmedQuery
                    ? `검색 결과 · "${query}"`
                    : activeTag
                      ? `#${activeTag} · ${activeTagSlugs?.size ?? 0}`
                      : `폴더별 · ${totalDocs}`}
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
                  <div className="rounded-[10px] border border-dashed border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-5 text-center">
                    <p className="text-[12px] text-[color:var(--color-text-tertiary)]">
                      {trimmedQuery
                        ? `"${query}" 에 일치하는 문서가 없습니다`
                        : activeTag
                          ? `#${activeTag} 태그가 붙은 문서가 없습니다`
                          : "등록된 문서가 없습니다"}
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
                          className="inline-flex items-center gap-1 rounded-full border border-[color:var(--color-overlay-3)] px-2.5 py-1 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.4)] hover:text-[color:var(--color-text-primary)]"
                        >
                          필터 해제
                        </button>
                      )}
                      <Link
                        href={getDocHref()}
                        onClick={onClose}
                        className="inline-flex items-center gap-1 rounded-full border border-[color:rgba(94,106,210,0.32)] bg-[color:rgba(94,106,210,0.1)] px-2.5 py-1 text-[11px] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.5)]"
                      >
                        <BookOpen size={11} />
                        전체 볼트 열기
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
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                <kbd className="rounded border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">↑↓</kbd>
                {" "}이동 ·{" "}
                <kbd className="rounded border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">↵</kbd>
                {" "}열기 ·{" "}
                <kbd className="rounded border border-[color:var(--color-overlay-3)] px-1 py-0.5 tabular-nums">Esc</kbd>
                {" "}닫기 · 모바일 swipe
              </p>
            </footer>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function formatRelative(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < day) return "오늘";
  if (diffMs < 2 * day) return "어제";
  const days = Math.floor(diffMs / day);
  if (days < 30) return `${days}일 전`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}달 전`;
  return `${Math.floor(months / 12)}년 전`;
}
