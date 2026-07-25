"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { TerminalSquare, X } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import {
  isTerminalAvailable,
  onTermData,
  onTermExit,
  termClose,
  termOpen,
  termResize,
  termWrite,
  type TerminalSession,
} from "@/shared/lib/tauri-terminal";

/**
 * 에이전트 터미널 하단 도크 (#79).
 *
 * ## 왜 목적지가 아니라 도크인가
 *
 * LNB 목적지는 "가서 생각하는 장소"(지도·문서함·공방·인사이트·프로젝트·기록)다.
 * 터미널은 *다른 표면을 보면서 켜두는 도구* 라 목적지로 만들면 지도를
 * 대체해버린다 — VS Code 가 터미널을 사이드바가 아니라 하단 패널에 둔 이유와
 * 같다. 지도·공방은 캔버스 전폭이 필요하므로 하단 도크가 파괴가 가장 적다.
 *
 * ## 신뢰 계약 (이 컴포넌트가 코드로 지키는 것)
 *
 * - **자동 실행 0** — 세션은 사용자가 도크를 열 때만 시작한다. `termWrite` 는
 *   xterm 의 `onData`(실제 키 입력)에서만 호출된다.
 * - **숨은 입력 0** — 프롬프트 프리필·자동 타이핑 없음. `claude` 를 쓰려면
 *   사용자가 직접 친다.
 * - **cwd 명시** — 헤더가 "어디서 도는지"(vault 경로)와 "무엇이 도는지"
 *   (셸 프로그램)를 항상 보여준다. 숨기지 않는다.
 * - **정리** — 도크를 접으면 세션을 죽인다. 좀비 셸이 사용자 기계에 남으면
 *   그건 우리가 남긴 흔적이다.
 *
 * ## 디자인
 *
 * 무채색 + 단일 인디고. xterm 테마도 `--color-*` 토큰을 `getComputedStyle` 로
 * 읽어 캔버스와 같은 팔레트를 쓴다 — 터미널만 다른 세계로 보이지 않게.
 */

export interface AgentTerminalDockProps {
  open: boolean;
  onClose: () => void;
  /** 셸이 시작할 절대 경로 — 사용자가 이미 연 vault 루트. null 이면 열지 않는다. */
  vaultPath: string | null;
}

/** 도크 기본 높이(px). 드래그 리사이즈는 후속 — 먼저 열리고 도는 것이 우선. */
const DOCK_HEIGHT = 320;

export function AgentTerminalDock({ open, onClose, vaultPath }: AgentTerminalDockProps) {
  const t = useTranslations("agentTerminal");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<TerminalSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exited, setExited] = useState(false);

  const available = isTerminalAvailable();

  // 세션 수명 — 도크가 열려 있는 동안만. 닫히면 정리한다(좀비 셸 금지).
  useEffect(() => {
    if (!open || !available || !vaultPath) return;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const host = hostRef.current;
      if (!host) return;
      try {
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import("@xterm/xterm"),
          import("@xterm/addon-fit"),
        ]);
        if (disposed) return;

        const read = (name: string, fallback: string) =>
          getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

        const term = new Terminal({
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 12,
          cursorBlink: true,
          // 앱과 같은 팔레트 — 터미널만 다른 세계로 보이지 않게.
          theme: {
            background: read("--color-canvas", "#08090a"),
            foreground: read("--color-text-secondary", "#d0d6e0"),
            cursor: read("--color-indigo-brand", "#5e6ad2"),
            selectionBackground: read("--color-overlay-3", "rgba(255,255,255,0.1)"),
          },
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(host);
        fit.fit();

        const opened = await termOpen(vaultPath, term.cols, term.rows);
        if (disposed || !opened) {
          term.dispose();
          return;
        }
        setSession(opened);
        setExited(false);

        // 실제 키 입력에서만 PTY 로 보낸다 — 이 경로 외에 write 호출 금지.
        const keyIn = term.onData((data) => void termWrite(opened.id, data));
        const unData = await onTermData(opened.id, (chunk) => term.write(chunk));
        const unExit = await onTermExit(opened.id, () => setExited(true));

        const onResize = () => {
          fit.fit();
          void termResize(opened.id, term.cols, term.rows);
        };
        const ro = new ResizeObserver(onResize);
        ro.observe(host);

        cleanup = () => {
          ro.disconnect();
          keyIn.dispose();
          unData();
          unExit();
          void termClose(opened.id);
          term.dispose();
        };
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      disposed = true;
      cleanup?.();
      setSession(null);
    };
  }, [open, available, vaultPath]);

  const handleClose = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  if (!open) return null;

  return (
    <section
      aria-label={t("title")}
      data-testid="agent-terminal-dock"
      style={{ height: DOCK_HEIGHT }}
      className="flex shrink-0 flex-col border-t border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-[color:var(--color-border-soft)] px-3 py-1.5">
        <TerminalSquare size={13} aria-hidden className="text-[color:var(--color-indigo-accent)]" />
        <span className="text-label font-semibold text-[color:var(--color-text-primary)]">
          {t("title")}
        </span>
        {/* 무엇이 · 어디서 도는지 항상 보인다 — 숨기면 신뢰가 깨진다. */}
        {session ? (
          <span
            data-testid="agent-terminal-context"
            className="truncate font-mono text-caption text-[color:var(--color-text-quaternary)]"
          >
            {session.program} · {session.cwd}
          </span>
        ) : null}
        {exited ? (
          <span className="text-caption text-[color:var(--color-text-tertiary)]">
            {t("exited")}
          </span>
        ) : null}
        <div className="flex-1" />
        <button
          type="button"
          aria-label={t("close")}
          data-testid="agent-terminal-close"
          onClick={handleClose}
          className="rounded p-1 text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
        >
          <X size={14} aria-hidden />
        </button>
      </header>

      {available && vaultPath ? (
        <div ref={hostRef} data-testid="agent-terminal-host" className="min-h-0 flex-1 px-2 py-1" />
      ) : (
        // 정직한 강등 — 웹은 프로세스를 못 띄우고, 볼트가 없으면 어디서 돌지가 없다.
        <div
          data-testid="agent-terminal-unavailable"
          className={cn("flex min-h-0 flex-1 flex-col justify-center gap-1.5 px-4")}
        >
          <p className="text-body text-[color:var(--color-text-secondary)]">
            {available ? t("needVault") : t("desktopOnly")}
          </p>
          <p className="text-label text-[color:var(--color-text-quaternary)]">
            {available ? t("needVaultHint") : t("desktopOnlyHint")}
          </p>
        </div>
      )}

      {error ? (
        <p
          data-testid="agent-terminal-error"
          className="shrink-0 px-4 py-2 text-label text-[color:var(--color-danger-text)]"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
