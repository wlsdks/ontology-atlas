import { useEffect, useEffectEvent, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

/**
 * How long after the watcher's last `vault-changed` the screen re-reads. The Rust watcher
 * already coalesces file events over 500 ms; this only keeps a burst of its emits from
 * queueing one read per emit.
 */
const FOLLOW_DEBOUNCE_MS = 300;

export function useFollowVaultChanges({
  desktop,
  vaultPath,
  refresh,
  followBusy,
}: {
  desktop: boolean;
  vaultPath: string | null;
  refresh: () => Promise<void>;
  followBusy: boolean;
}) {
  /*
   * A notice that elapses mid-write is deferred, not dropped: the write's own re-read may miss
   * an edit saved while it ran.
   */
  const missedWhileBusy = useRef(false);
  const followVaultChange = useEffectEvent(() => {
    if (followBusy) {
      missedWhileBusy.current = true;
      return;
    }
    missedWhileBusy.current = false;
    void refresh();
  });
  useEffect(() => {
    if (followBusy || !missedWhileBusy.current) return;
    followVaultChange();
  }, [followBusy]);
  /*
   * Follow the open folder: re-read on each `vault-changed` from the watcher. Reads only; while
   * this side writes the echo is skipped, since a mid-commit read would show a half state.
   */
  useEffect(() => {
    if (!desktop || !vaultPath) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void listen("vault-changed", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        if (cancelled) return;
        followVaultChange();
      }, FOLLOW_DEBOUNCE_MS);
    })
      .then((un) => {
        if (cancelled) un();
        else unlisten = un;
      })
      .catch(() => {
        /* No event channel — the next arrival re-reads. */
      });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unlisten?.();
    };
  }, [desktop, vaultPath]);
}
