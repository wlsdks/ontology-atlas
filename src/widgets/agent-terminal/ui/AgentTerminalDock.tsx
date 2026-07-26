"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { TerminalSquare, X } from "lucide-react";

// xterm 이 요구하는 자기 스타일시트. 이게 없으면 xterm 이 셀 폭을 재려고 만든
// 측정용 span(`.xterm-char-measure-element`)이 숨겨지지 않아 **터미널 위에
// 쓰레기 글자 줄로 그려지고**(설치 앱 실측: `4444…1111`), `.xterm-viewport` 가
// 스크롤 컨테이너가 아니게 되어 스크롤바 스타일도 붙을 자리가 없다.
import "@xterm/xterm/css/xterm.css";

import { Link } from "@/i18n/navigation";
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
import {
  clampDockHeight,
  readDockHeight,
  writeDockHeight,
  DOCK_HEIGHT_KEYBOARD_STEP,
} from "../model/dock-height";

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
 * ## 디자인 (Design Guardian 검수 2026-07-26)
 *
 * - **크롬은 앱 팔레트를 상속** — 배경/전경/커서/선택은 `--color-*` 토큰.
 * - **셀 내용(ANSI 16색)은 외부 프로그램의 data-ink** — 무채색으로 뭉개면
 *   `git diff` 의 빨강/초록이 의미를 잃는다. 대신 xterm 기본 형광 팔레트를
 *   그대로 두지도 않는다(선언 안 한 채색 시스템이 하나 더 생긴다). hue 는
 *   지키고 채도만 낮춘 `--terminal-ansi-*` 를 **명시 선언**해 쓴다.
 * - **높이는 토큰** — `--agent-terminal-dock-height`(뷰포트 비례 clamp).
 *   고정 320px 은 14"에서 본문의 36.7% 를 먹었다. 강등 상태는 내용이 두 줄뿐
 *   이라 별도 토큰(`--agent-terminal-dock-height-degraded`)으로 줄인다.
 * - **뷰포트 소유권은 셸** — `ShellWithTerminalDock` 의 `h-dvh` 칼럼 덕에
 *   도크는 항상 화면 안에 있다. 이 컴포넌트는 위치를 스스로 정하지 않는다.
 */

export interface AgentTerminalDockProps {
  open: boolean;
  onClose: () => void;
  /** 셸이 시작할 절대 경로 — 사용자가 이미 연 vault 루트. null 이면 열지 않는다. */
  vaultPath: string | null;
}

/**
 * 경로 머리 접기 — 경로는 **끝**(폴더 이름)이 정체성이라 오른쪽 말줄임이면
 * 확인해야 할 부분부터 사라진다(`/Users/jinan/side-projec…`). 전체 경로는
 * `title` 로 남아 hover·스크린리더·복사가 온전하다.
 *
 * `maxLength` 28 의 근거: 헤더 예산이다. 좁은 창(≈700px)에서 헤더는
 * 아이콘 + "터미널" + 이 캡션 + 닫기를 담아야 하고, 11px mono 는 글자당
 * ≈6.6px 이라 28자 ≈ 185px 가 캡션 몫이다. 그 안에 들어오는 경로는 접지
 * 않는다 — 접어서 얻는 게 없는데 정보만 잃는다.
 */
export function elideCwdHead(cwd: string, maxLength = 28, keepSegments = 2): string {
  if (cwd.length <= maxLength) return cwd;
  const segments = cwd.split("/").filter(Boolean);
  if (segments.length <= keepSegments) return cwd;
  return `…/${segments.slice(-keepSegments).join("/")}`;
}

export function AgentTerminalDock({ open, onClose, vaultPath }: AgentTerminalDockProps) {
  const t = useTranslations("agentTerminal");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<TerminalSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exited, setExited] = useState(false);

  // 사용자가 잡아 늘린 높이. null = 정한 적 없음 → 토큰 기본값이 산다.
  //
  // effect 가 아니라 **lazy initializer** 로 읽는다: effect 로 읽으면 첫 프레임이
  // 기본 높이로 그려졌다가 저장 높이로 튀어 도크가 열릴 때마다 깜빡인다.
  // 프리렌더에서는 `readDockHeight` 가 null 을 돌려주고(window 없음), 하이드레이션
  // 시점의 도크는 어차피 닫혀 있어(⌃` 는 클라이언트 상태) 마크업 불일치가 없다.
  const [customHeight, setCustomHeight] = useState<number | null>(() => readDockHeight());
  // 드래그 중에는 셀 재적합을 미룬다 — 프레임마다 fit 하면 cols/rows 재계산과
  // PTY resize 가 같이 돌아 드래그가 끈적해진다. 높이는 **한 번에 확정**한다.
  const resizingRef = useRef(false);
  const refitRef = useRef<(() => void) | null>(null);
  const applyHeight = useCallback((next: number | null) => {
    const resolved =
      next === null ? null : clampDockHeight(next, window.innerHeight);
    setCustomHeight(resolved);
    writeDockHeight(resolved);
  }, []);
  const handleGripPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const grip = event.currentTarget;
      const startY = event.clientY;
      // 시작 높이는 실측이다 — 토큰 clamp 로 살던 도크도 잡는 순간부터 px 로 산다.
      const startHeight = grip.parentElement?.getBoundingClientRect().height ?? 0;
      // 캡처는 있으면 좋은 것이지 전제가 아니다 — 못 잡는 환경(합성 포인터 ·
      // jsdom)에서 여기서 던지면 리스너를 달기도 전에 드래그가 죽는다.
      try {
        grip.setPointerCapture(event.pointerId);
      } catch {
        /* 캡처 없이도 6px 밖으로 나가기 전까지는 같은 요소가 이벤트를 받는다 */
      }
      resizingRef.current = true;
      // 위로 끌면 커진다(도크가 아래에 붙어 있으므로 델타 부호가 뒤집힌다).
      const onMove = (move: PointerEvent) => {
        setCustomHeight(clampDockHeight(startHeight - (move.clientY - startY), window.innerHeight));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        resizingRef.current = false;
        // 놓는 순간 딱 한 번 셀 격자를 다시 맞추고 PTY 에 알린다.
        refitRef.current?.();
        setCustomHeight((current) => {
          writeDockHeight(current);
          return current;
        });
      };
      // 리스너는 그립이 아니라 **window** 가 받는다 — 6px 띠는 손잡이일 뿐이고,
      // 포인터는 곧바로 그 밖으로 나간다. 포인터 캡처가 되는 환경이면 캡처가
      // 대신 잡아주지만, 안 되는 환경에서도 드래그가 끊기면 안 된다.
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [],
  );
  // 드래그만으로 발견되는 컨트롤은 만들지 않는다 — 키보드로도 같은 일을 한다.
  const handleGripKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const grip = event.currentTarget;
      const current = grip.parentElement?.getBoundingClientRect().height ?? 0;
      if (event.key === "ArrowUp") {
        event.preventDefault();
        applyHeight(current + DOCK_HEIGHT_KEYBOARD_STEP);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        applyHeight(current - DOCK_HEIGHT_KEYBOARD_STEP);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        applyHeight(null);
      }
    },
    [applyHeight],
  );

  const available = isTerminalAvailable();
  /** 웹이거나 볼트가 없으면 셸을 못 띄운다 — 문단 두 줄짜리 강등 표면. */
  const degraded = !available || !vaultPath;

  // 도크 상태를 문서 루트에 선언한다 — 결정론적 검증 마커.
  // PTY 실동작은 설치 앱에서만 도므로, 브라우저/WebView 캡처는 "열렸는가"를
  // 픽셀로 추측하는 대신 이 attribute 로 확인한다(open=실동작, degraded=웹·
  // 볼트 미선택). 레이아웃 입력이 아니다 — 높이는 셸의 `h-dvh` 칼럼이 잡는다.
  useEffect(() => {
    const root = document.documentElement;
    if (!open) {
      delete root.dataset.agentTerminal;
      return;
    }
    root.dataset.agentTerminal = degraded ? "degraded" : "open";
    return () => {
      delete root.dataset.agentTerminal;
    };
  }, [open, degraded]);

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

        // resolve-캐시 — getComputedStyle 은 호출마다 스타일 재계산을 강제하므로
        // 한 번만 읽어 20개 토큰을 뽑는다. 하드코딩 fallback 은 두지 않는다:
        // 값이 비면 xterm 기본값이 보여 토큰 오타/삭제가 즉시 드러나지만,
        // hex fallback 은 토큰이 움직여도 조용히 옛 색을 유지해 drift 를 숨긴다.
        const styles = getComputedStyle(document.documentElement);
        const token = (name: string) => styles.getPropertyValue(name).trim() || undefined;

        const term = new Terminal({
          // `--font-mono` 가 아니라 터미널 전용 체인이다 — 앱 mono(JetBrains Mono,
          // latin 서브셋)는 Powerline PUA 글리프가 없고 macOS 시스템 mono 폰트에도
          // 하나도 없어서, 그대로 두면 agnoster 프롬프트가 두부(□)로 깨진다.
          // 토큰이 사용자 디스크에 이미 설치된 폰트로 글리프 단위 폴백을 잇는다.
          fontFamily: token("--terminal-font-family") ?? "ui-monospace, monospace",
          fontSize: Number.parseFloat(token("--terminal-font-size") ?? "12"),
          lineHeight: Number.parseFloat(token("--terminal-line-height") ?? "1.35"),
          cursorBlink: true,
          theme: {
            // 크롬 — 앱과 같은 팔레트. 터미널만 다른 세계로 보이지 않게.
            background: token("--color-canvas"),
            foreground: token("--color-text-secondary"),
            cursor: token("--color-indigo-brand"),
            selectionBackground: token("--color-overlay-3"),
            // 셀 — 외부 프로그램의 data-ink. hue 유지, 채도만 캔버스에 맞춤.
            black: token("--terminal-ansi-black"),
            red: token("--terminal-ansi-red"),
            green: token("--terminal-ansi-green"),
            yellow: token("--terminal-ansi-yellow"),
            blue: token("--terminal-ansi-blue"),
            magenta: token("--terminal-ansi-magenta"),
            cyan: token("--terminal-ansi-cyan"),
            white: token("--terminal-ansi-white"),
            brightBlack: token("--terminal-ansi-bright-black"),
            brightRed: token("--terminal-ansi-bright-red"),
            brightGreen: token("--terminal-ansi-bright-green"),
            brightYellow: token("--terminal-ansi-bright-yellow"),
            brightBlue: token("--terminal-ansi-bright-blue"),
            brightMagenta: token("--terminal-ansi-bright-magenta"),
            brightCyan: token("--terminal-ansi-bright-cyan"),
            brightWhite: token("--terminal-ansi-bright-white"),
          },
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(host);

        // WebGL 렌더러 — **폰트가 아니라 우리가** 세퍼레이터를 그리기 위해서다.
        //
        // `customGlyphs`(기본 true)는 U+E0B0–E0B7 Powerline 세퍼레이터와 박스
        // 드로잉을 폰트에서 읽지 않고 **절차적으로** 그린다. 그런데 이 옵션은
        // canvas/webgl 렌더러 전용이라 DOM 렌더러에서는 죽은 옵션이었다. 즉
        // 폰트 체인(`--terminal-font-family`)이 못 잡는 기기 — Nerd Font 를
        // 하나도 안 깐 사용자 — 에서는 여전히 두부(□)가 났다.
        //
        // 덤으로 `--terminal-line-height: 1.35` 에서 폰트 글리프가 만들던 세로
        // 틈(삼각형이 행간을 못 채워 세그먼트 밴드에 이가 빠지던 것)도 사라진다.
        // 절차 드로잉은 셀 전체 높이를 채운다.
        //
        // 실패는 조용히 넘긴다 — WebGL2 가 없거나(구형 GPU) 컨텍스트를 잃으면
        // DOM 렌더러로 계속 돈다. 터미널이 안 뜨는 것보다 세퍼레이터가 두부인
        // 게 낫다.
        let webgl: { dispose(): void } | null = null;
        try {
          const { WebglAddon } = await import("@xterm/addon-webgl");
          if (!disposed) {
            const addon = new WebglAddon();
            // 컨텍스트 유실(GPU 절전·드라이버 리셋)은 정상적으로 일어난다.
            // 애드온을 버리면 xterm 이 DOM 렌더러로 자동 복귀한다.
            addon.onContextLoss(() => {
              addon.dispose();
              webgl = null;
            });
            term.loadAddon(addon);
            webgl = addon;
          }
        } catch {
          /* DOM 렌더러로 계속 — 폰트 체인이 잡는 기기에서는 차이가 없다 */
        }

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
        refitRef.current = onResize;
        // 드래그 중에는 건너뛴다 — 놓을 때 `refitRef` 로 한 번만 확정한다.
        const ro = new ResizeObserver(() => {
          if (resizingRef.current) return;
          onResize();
        });
        ro.observe(host);

        cleanup = () => {
          refitRef.current = null;
          ro.disconnect();
          keyIn.dispose();
          unData();
          unExit();
          void termClose(opened.id);
          // 애드온을 먼저 버린다 — GPU 리소스(텍스처 아틀라스)를 term.dispose()
          // 뒤에 정리하면 컨텍스트가 이미 사라져 누수가 남는다.
          webgl?.dispose();
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

  // 강등 상태는 문단 두 줄이 전부라 잡아 늘릴 것이 없다 — 그때는 토큰 그대로.
  const height = degraded
    ? "var(--agent-terminal-dock-height-degraded)"
    : customHeight !== null
      ? `${customHeight}px`
      : "var(--agent-terminal-dock-height)";

  return (
    <section
      aria-label={t("title")}
      data-testid="agent-terminal-dock"
      style={{ height }}
      className="agent-terminal-dock relative flex shrink-0 flex-col border-t border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]"
    >
      {!degraded ? (
        // 높이 그립 — 상단 보더 위에 겹치는 얇은 띠. 잉크를 새로 그리지 않는다:
        // 평소엔 투명이고 hover/포커스에서만 보더가 인디고로 바뀐다(도크의 위쪽
        // 경계 자체가 손잡이라는 사실을 색으로만 말한다).
        //
        // 드래그만으로 발견되는 컨트롤은 만들지 않는다 — separator 로서 포커스를
        // 받고 ↑↓ 로 같은 일을 하며, 더블클릭/Enter 는 기본 높이로 되돌린다.
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={t("resizeLabel")}
          title={t("resizeHint")}
          tabIndex={0}
          data-testid="agent-terminal-resize-grip"
          onPointerDown={handleGripPointerDown}
          onDoubleClick={() => applyHeight(null)}
          onKeyDown={handleGripKeyDown}
          className="absolute inset-x-0 -top-px z-10 h-[var(--terminal-resize-grip-size)] cursor-ns-resize border-t-2 border-transparent transition-colors hover:border-[color:var(--color-indigo-accent)] focus-visible:border-[color:var(--color-indigo-accent)] focus-visible:outline-none"
        />
      ) : null}
      <header className="flex shrink-0 items-center gap-2 border-b border-[color:var(--color-border-soft)] px-3 py-1.5">
        <TerminalSquare size={13} aria-hidden className="text-[color:var(--color-indigo-accent)]" />
        <span className="shrink-0 text-label font-semibold text-[color:var(--color-text-primary)]">
          {t("title")}
        </span>
        {/* 무엇이 · 어디서 도는지 항상 보인다 — 숨기면 신뢰가 깨진다.
            이건 마이크로 라벨이 아니라 사용자가 **확인해야 하는 영수증**이라
            caption(9.5px) 이 아니라 label(11px) 이다. */}
        {session ? (
          <span
            data-testid="agent-terminal-context"
            title={`${session.program} · ${session.cwd}`}
            className="min-w-0 truncate font-mono text-label text-[color:var(--color-text-tertiary)]"
          >
            {session.program} · {elideCwdHead(session.cwd)}
          </span>
        ) : null}
        {exited ? (
          <span className="shrink-0 text-label text-[color:var(--color-text-quaternary)]">
            {t("exited")}
          </span>
        ) : null}
        <div className="flex-1" />
        <button
          type="button"
          aria-label={session && !exited ? `${t("close")} — ${t("closeEndsSession")}` : t("close")}
          title={session && !exited ? t("closeEndsSession") : undefined}
          data-testid="agent-terminal-close"
          onClick={handleClose}
          className="shrink-0 rounded p-1 text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
        >
          <X size={14} aria-hidden />
        </button>
      </header>

      {!degraded ? (
        // 여백은 **래퍼**가 가진다. FitAddon 은 측정 대상(host)의 computed 크기에서
        // `.xterm` 요소의 패딩만 빼므로, host 자신이 패딩을 가지면 그만큼 cols/rows 를
        // 과대 산정해 우측 열이 여백 밑으로 잘린다. 래퍼로 분리하면 산정이 정확해지고
        // ResizeObserver 대상(host)은 그대로다.
        <div
          className="min-h-0 flex-1"
          style={{ padding: "var(--terminal-inset-y) var(--terminal-inset-x)" }}
        >
          <div ref={hostRef} data-testid="agent-terminal-host" className="h-full w-full" />
        </div>
      ) : (
        // 정직한 강등 — 웹은 프로세스를 못 띄우고, 볼트가 없으면 어디서 돌지가
        // 없다. 강등은 "안 된다" 로 끝나면 막다른 길이므로 **다음 한 걸음**을
        // 같이 준다(웹 → 데스크톱 앱 받기).
        <div
          data-testid="agent-terminal-unavailable"
          className={cn("flex min-h-0 flex-1 flex-col justify-center gap-1.5 px-3")}
        >
          <p className="text-body text-[color:var(--color-text-secondary)]">
            {available ? t("needVault") : t("desktopOnly")}
          </p>
          <p className="text-label text-[color:var(--color-text-quaternary)]">
            {available ? t("needVaultHint") : t("desktopOnlyHint")}
          </p>
          {available ? null : (
            <Link
              href="/download/"
              data-testid="agent-terminal-download-link"
              className="mt-0.5 w-fit rounded text-label text-[color:var(--color-indigo-accent)] underline underline-offset-2 transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              {t("downloadLink")}
            </Link>
          )}
        </div>
      )}

      {error ? (
        <p
          data-testid="agent-terminal-error"
          className="shrink-0 px-3 py-2 text-label text-[color:var(--color-danger-text)]"
        >
          {error}
          </p>
        ) : null}
    </section>
  );
}
