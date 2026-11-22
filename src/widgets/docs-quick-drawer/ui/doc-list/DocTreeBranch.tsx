"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { VaultTreeNode } from "@/entities/docs-vault";
import { cn } from "@/shared/lib/cn";
import { RowButton, controlClass } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

function highlightMatch(text: string, needle: string) {
  if (!needle) return text;
  const matchStart = text.toLowerCase().indexOf(needle);
  if (matchStart === -1) return text;
  return (
    <>
      {text.slice(0, matchStart)}
      <mark className="rounded-micro bg-[color:var(--color-indigo-a28)] px-0.5 text-[color:var(--color-text-primary)]">
        {text.slice(matchStart, matchStart + needle.length)}
      </mark>
      {text.slice(matchStart + needle.length)}
    </>
  );
}

/** One folder or document of the filtered tree; a folder opens by press, or stays open while filtering. */
export function DocTreeBranch({
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
  forceOpen: boolean;
  needle: string;
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
          onClick={() => setOpen((current) => !current)}
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
            {node.children.filter((child) => child.type === "doc" || (child.children?.length ?? 0) > 0).length}
          </span>
        </RowButton>
      ) : null}
      {effectiveOpen
        ? node.children.map((child) => (
            <DocTreeBranch
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
