"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { History } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { gitStatus, isGitBridgeAvailable } from "@/shared/lib/tauri-git";
import { cn } from "@/shared/lib/cn";

/**
 * The Atlas Git status tile — for the rail's bottom slot (the same grammar as the
 * agent tile). `AppNavRail.tsx` is not modified: HomePage/AppShell do the mount
 * wiring by slotting this tile into the bottom stack beside `settingsSlot`.
 *
 * The dirty-dot query contract: **no polling.** One read-only `git_status` on mount
 * and one on window focus. On the web (no bridge) it degrades honestly to zero
 * invokes and decides from the `sessionDirty` prop instead (the session changeset's
 * total > 0).
 *
 * The dirty dot's tone is `--color-status-warning` (warning/amber of the three signal
 * tones). Rationale: "there are unrecorded changes" is neither an error (red) nor a
 * completion (green) but an unresolved state that draws attention — consistent with
 * the reserved meanings of the signal tones and with the git ecosystem's
 * modified = amber convention. It is a status token distinct from the hub/Layer-0
 * reserved amber (`--topology-v2-amber-hub`), so it does not fall under the charter's
 * ban on spreading decorative amber.
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
  // null = no git_status result yet (the web included) → fall back to sessionDirty.
  const [gitChangedCount, setGitChangedCount] = useState<number | null>(null);

  useEffect(() => {
    if (!vaultPath) return;
    let cancelled = false;
    const check = async () => {
      if (!isGitBridgeAvailable()) return;
      try {
        const status = await gitStatus(vaultPath);
        if (!cancelled && status) {
          setGitChangedCount(status.initialized ? status.changedCount : 0);
        }
      } catch {
        // A failed read stays silent — the tile is only a signal surface; the panel reports errors.
      }
    };
    // Once on mount and once on focus return — no interval polling (too heavy).
    void check();
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
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
        // The same state choreography as the agent tile: rest → hover (colour wake) →
        // active (1px press plus overlay-3) → focus-visible ring.
        "relative flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card text-[color:var(--color-text-tertiary)] transition-[color,background-color,transform] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset active:translate-y-px active:bg-[color:var(--color-overlay-3)]",
        className,
      )}
    >
      {/* The utility tier's icon size order — the same token as the activity tile in
          `AppNavRail.tsx` (`--app-nav-rail-utility-icon-size`, owner report 2026-07-23). */}
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
