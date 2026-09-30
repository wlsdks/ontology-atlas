"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { History } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { listen } from "@tauri-apps/api/event";
import { gitStatus, isGitBridgeAvailable } from "@/shared/lib/tauri-git";
import { cn } from "@/shared/lib/cn";

/**
 * Git dirty-dot tile for the rail: a read-only `git_status` on mount, on focus and on watcher
 * changes, never polling; on the web it falls back to `sessionDirty`.
 */
export interface GitStatusTileProps {
  /** Click → open the Atlas Git panel (HomePage/AppShell own the wiring). */
  onActivate: () => void;
  /** Whether the panel is currently open — the source of truth for `aria-expanded`. */
  panelOpen?: boolean;
  /** The Tauri desktop vault's absolute path — without it (on the web) the git_status query is skipped. */
  vaultPath?: string | null;
  /** The web degradation's dirty signal — whether the session changeset has changes. */
  sessionDirty?: boolean;
  className?: string;
}

export function GitStatusTile({
  onActivate,
  panelOpen = false,
  vaultPath = null,
  sessionDirty = false,
  className,
}: GitStatusTileProps) {
  const t = useTranslations("atlasGit");
  /*
   * The count is stored with the folder it was read from, so a stale count simply does not apply.
   */
  const [read, setRead] = useState<{ path: string; count: number } | null>(null);
  // null = no git_status result for *this* folder yet (the web included) → fall back to sessionDirty.
  const gitChangedCount = read && read.path === vaultPath ? read.count : null;

  useEffect(() => {
    if (!vaultPath) return;
    let cancelled = false;
    const check = async () => {
      if (!isGitBridgeAvailable()) return;
      try {
        const status = await gitStatus(vaultPath);
        if (!cancelled && status) {
          setRead({ path: vaultPath, count: status.initialized ? status.changedCount : 0 });
        }
      } catch {
        // A failed read stays silent — the tile is only a signal surface; the panel reports errors.
      }
    };
    // Once on mount and once on focus return — no interval polling (too heavy).
    void check();
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    /* Re-read once per burst of watcher `vault-changed` events; still no polling. */
    let unlisten: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void listen("vault-changed", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        if (!cancelled) void check();
      }, 300);
    })
      .then((un) => {
        if (cancelled) un();
        else unlisten = un;
      })
      .catch(() => {
        /* No event channel — focus return still re-reads, as before. */
      });
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      if (timer) clearTimeout(timer);
      unlisten?.();
    };
  }, [vaultPath]);

  const dirty = gitChangedCount !== null ? gitChangedCount > 0 : sessionDirty;
  const title = dirty
    ? t("tileTitleDirty", { count: gitChangedCount ?? 1 })
    : t("tileTitleClean");

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-haspopup="dialog"
      aria-expanded={panelOpen}
      onClick={onActivate}
      data-testid="app-nav-rail-git-tile"
      className={cn(
        "relative flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card text-[color:var(--color-text-tertiary)] transition-[color,background-color,translate] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset active:translate-y-px motion-reduce:translate-none active:bg-[color:var(--color-overlay-3)]",
        className,
      )}
    >
      <History
        size={ICON_SIZE.lg}
        aria-hidden
        className="h-[var(--app-nav-rail-utility-icon-size)] w-[var(--app-nav-rail-utility-icon-size)]"
      />
      {dirty ? (
        <span
          aria-hidden="true"
          data-testid="app-nav-rail-git-dot"
          className="absolute right-1.5 top-1 h-1.5 w-1.5 rounded-full bg-[color:var(--color-status-warning)]"
        />
      ) : null}
    </button>
  );
}
