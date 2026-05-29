"use client";

import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getTauriVaultRootPath, isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";
import { useLocalVault } from "./LocalVaultProvider";

/**
 * live-tauri (JS 측) — 데스크톱(Tauri)에서 vault 가 로드되면 Rust 파일워처를
 * 켜고(start_vault_watch) `vault-changed` 이벤트를 listen 해 즉시 refresh.
 *
 * 그러면 5초 폴링 대기 없이 OS 이벤트로 *즉시* 반영 — 에이전트가 디스크에
 * 쓰는 순간 화면이 따라온다(Obsidian 급). 웹/브라우저(isTauriVaultRuntime
 * false)에선 no-op — 기존 5초 폴링 fallback 이 그대로 커버. 헤드리스(렌더 없음),
 * LocalVaultProvider 안에 VaultDiffToaster 와 나란히 마운트.
 *
 * (status, rootPath) 당 1회만 구독 — refresh 는 ref 로 최신값 호출해 매 reload
 * 마다 재구독하지 않는다.
 */
export function TauriVaultWatchBridge() {
  const { status, handle, refresh } = useLocalVault();
  const rootPath = handle ? getTauriVaultRootPath(handle) ?? null : null;
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!isTauriVaultRuntime() || status !== "loaded" || !rootPath) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        await invoke("start_vault_watch", { rootPath });
        const un = await listen("vault-changed", () => {
          void refreshRef.current();
        });
        if (cancelled) un();
        else unlisten = un;
      } catch {
        /* Tauri 미가용/권한 실패 — 폴링 fallback 이 커버 */
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [status, rootPath]);

  return null;
}
