"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { History } from "lucide-react";
import { gitStatus, isGitBridgeAvailable } from "@/shared/lib/tauri-git";
import { cn } from "@/shared/lib/cn";

/**
 * Atlas Git 상태 타일 — 레일 하단 슬롯용 (에이전트 타일과 같은 문법).
 * `AppNavRail.tsx` 는 수정하지 않는다 — mount 배선은 HomePage/AppShell 이
 * `settingsSlot` 옆 하단 스택에 이 타일을 끼워 넣는 방식으로 한다.
 *
 * dirty 점 조회 계약: **폴링 없음.** 마운트 시 1회 + window focus 시 1회
 * `git_status` (읽기 전용) 만. 웹(브리지 없음)에서는 invoke 0 으로 정직하게
 * 강등하고 `sessionDirty` prop(세션 changeset total > 0)으로 대신 판정한다.
 *
 * dirty 점 톤 = `--color-status-warning` (신호 3톤 중 warning/amber).
 * 근거: "기록되지 않은 변경이 있다" 는 오류(red)도 완료(green)도 아닌
 * '주의를 끄는 미결 상태' — 신호 톤 의미 예약과 git 생태계의 modified=amber
 * 관례에 일치한다. hub/Layer-0 예약 앰버(`--topology-v2-amber-hub`)와는
 * 별개의 status 토큰이므로 헌장의 장식 앰버 확장 금지에 걸리지 않는다.
 */
export interface GitStatusTileProps {
  /** 클릭 → Atlas Git 패널 열기 (배선은 HomePage/AppShell 담당). */
  onActivate: () => void;
  /** 패널이 현재 열려 있는지 — `aria-expanded` 진실원. */
  panelOpen?: boolean;
  /** Tauri 데스크톱 vault 절대 경로 — 없으면(웹) git_status 조회를 건너뛴다. */
  vaultPath?: string | null;
  /** 웹 강등 dirty 신호 — 세션 changeset 에 변경이 있는가. */
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
  // null = 아직 git_status 결과 없음(웹 포함) → sessionDirty 로 폴백.
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
        // 읽기 실패는 조용히 — 타일은 신호 표면일 뿐, 에러는 패널이 말한다.
      }
    };
    // 마운트 1회 + 포커스 복귀 시 1회 — interval 폴링 금지(무거움).
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
        // 에이전트 타일과 동일 상태 안무: rest → hover(색-웨이크) → active(1px
        // 눌림 + overlay-3) → focus-visible 링.
        "relative flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] cursor-pointer items-center justify-center rounded-card text-[color:var(--color-text-tertiary)] transition-[color,background-color,transform] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset active:translate-y-px active:bg-[color:var(--color-overlay-3)]",
        className,
      )}
    >
      {/* 유틸리티 티어 아이콘 사다리 — `AppNavRail.tsx` 활동 타일과 동일 토큰
          (`--app-nav-rail-utility-icon-size`, 소유자 실보고 2026-07-23). */}
      <History
        size={18}
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
