import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * PTY 터미널 브리지 (#79) — `src-tauri/src/terminal.rs` 의 4 command 소비.
 *
 * **Atlas 는 이걸로 AI 클라이언트가 되지 않는다.** API 키·모델·프롬프트·비용을
 * 하나도 소유하지 않고, 사용자가 이미 설치한 `claude`/`codex`/셸이 자기
 * 자격증명으로 돈다. 우리가 하는 일은 그 프로세스에 창을 하나 주는 것뿐이다
 * (`docs/AGENT-GRAPH-WORKFLOW.md` 2026-07-26 경계).
 *
 * **`termWrite` 는 실제 키 입력에서만 호출한다.** 마운트·포커스·자동 갱신
 * 경로에서 부르는 순간 "숨은 입력 0" 약속이 깨진다.
 */

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return tauriInvoke as TauriInvoke;
}

/** Rust `TerminalOpened`. */
export interface TerminalSession {
  id: number;
  /** 실제로 띄운 프로그램 — 화면이 "무엇이 도는지" 그대로 보여준다. */
  program: string;
  /** 셸이 시작한 절대 경로 — "어디서 도는지". */
  cwd: string;
}

/** 브라우저는 프로세스를 띄울 수 없다 — false 면 정직하게 강등한다. */
export function isTerminalAvailable(): boolean {
  return getInvoke() !== null;
}

/** 세션 시작. 브리지 없으면 null(웹 강등). */
export async function termOpen(
  cwd: string,
  cols: number,
  rows: number,
): Promise<TerminalSession | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<TerminalSession>('terminal_open', { cwd, cols, rows });
}

/** 키 입력 전달 — **사용자가 실제로 친 것만**. */
export async function termWrite(id: number, data: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('terminal_write', { id, data });
}

export async function termResize(id: number, cols: number, rows: number): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('terminal_resize', { id, cols, rows });
}

/** 세션 종료 — 좀비 셸이 사용자 기계에 남지 않게 도크를 접을 때 반드시 부른다. */
export async function termClose(id: number): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke('terminal_close', { id });
}

/** 출력 스트림 구독. 반환값을 언마운트에서 호출해 리스너를 정리한다. */
export async function onTermData(
  id: number,
  handler: (chunk: string) => void,
): Promise<UnlistenFn> {
  if (!getInvoke()) return () => {};
  return listen<string>(`terminal://data/${id}`, (event) => handler(event.payload));
}

/** 프로세스 종료 구독 — 화면이 "세션이 끝났다" 를 그릴 수 있게. */
export async function onTermExit(id: number, handler: () => void): Promise<UnlistenFn> {
  if (!getInvoke()) return () => {};
  return listen(`terminal://exit/${id}`, () => handler());
}
