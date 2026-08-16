import { invoke as tauriInvoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * ACP 하네스 — Tauri IPC 브리지 (`src-tauri/src/acp.rs` + `lib.rs` 의 5 command).
 *
 * 계약 (Rust 코드가 진실원):
 * - `acp_detect_runtimes()` → `AcpRuntimeStatus[]` — 이 기기에 무엇이 있나
 * - `acp_start(runtimeId, cwd)` → 세션 이름 — 프로세스를 띄운다
 * - `acp_send(sessionId, line)` → 한 줄 보내기 (줄바꿈은 Rust 가 붙인다)
 * - `acp_stop(sessionId)` → 그 세션과 **그것이 띄운 모든 것**을 끝낸다
 * - `acp_permission_verdict(vaultRoot, filePath)` → `allow-inside-vault` | `ask`
 *
 * 이벤트 넷이 자식에게서 올라온다: `acp://message`(프로토콜 한 줄) ·
 * `acp://stderr`(진단) · `acp://exit`(끝남) · `acp://notice`(버린 줄 등).
 *
 * ## 웹 강등 계약
 *
 * 브라우저는 프로세스를 띄울 수 없다 — 원리적으로 못 하는 일이다. Tauri 런타임이
 * 아니면 `isAcpBridgeAvailable()` 이 false 이고 모든 래퍼가 `null` 을 돌려준다.
 * 호출부는 「곧 됩니다」가 아니라 **왜 안 되는지와 어디서 되는지**를 말해야 한다
 * (`.claude/rules/surfaces.md`).
 *
 * ## 판정을 여기서 다시 구현하지 않는다
 *
 * 권한 정책(`볼트 안이면 허용, 밖이면 묻기`)은 Rust 에만 있다. 두 벌이 되면
 * 한쪽만 느슨해지는 쪽이 기본값이 되고, 하필 그 한쪽이 사용자에게 보이는 쪽이다.
 * 게다가 그 판정은 심볼릭 링크를 풀고 아직 없는 경로의 조상을 정규화해야 해서
 * 브라우저 쪽에서는 애초에 정확히 할 수 없다.
 */

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function getInvoke(): TauriInvoke | null {
  if (typeof window === 'undefined') return null;
  if (!isTauri()) return null;
  return (command, args) => tauriInvoke(command, args);
}

export function isAcpBridgeAvailable(): boolean {
  return getInvoke() !== null;
}

/** Rust `AcpRuntimeStatus` (serde camelCase). */
export interface AcpRuntimeStatus {
  id: string;
  label: string;
  description: string;
  website: string | null;
  license: string | null;
  /**
   * 우리가 **실제로 재 본** 실행기인가. 화면이 안 해 본 것을 해 본 것처럼
   * 말하지 않기 위한 표시다.
   */
  verified: boolean;
  /** 번들된 아이콘 경로(`/acp-icons/<id>.svg`). 없으면 null. */
  icon: string | null;
  launchKind: 'npx' | 'uvx' | 'binary';
  /**
   * `ready` — 바로 쓸 수 있다
   * `cli-missing` — 그 도구를 설치해야 한다
   * `node-missing` — 도구는 있는데 어댑터를 띄울 Node 가 없다
   * `uvx-missing` — 〃 uv 가 없다
   * `binary-missing` — 직접 설치해야 하는 실행 파일이 없다
   *
   * 다섯을 「설치됨/아님」 둘로 뭉개지 않는다 — 각각 사용자가 할 일이 다르다.
   */
  state: 'ready' | 'cli-missing' | 'node-missing' | 'uvx-missing' | 'binary-missing';
  cliPath: string | null;
  adapterPath: string | null;
  adapterPackage: string | null;
  /**
   * 앱이 이 실행기의 설정을 격리할 수 있는가.
   *
   * **false 면 권한 관문이 없다.** 사용자가 그 도구에 해 둔 설정을 그대로 쓰므로,
   * 「묻지 말고 다 해」로 설정해 둔 사람에게는 앱에서 띄워도 안 묻는다. 화면은
   * 그 사실을 그 줄에 적어야 한다 — 빼거나 조용히 두지 않는다.
   */
  isolated: boolean;
}

export async function detectAcpRuntimes(): Promise<AcpRuntimeStatus[] | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<AcpRuntimeStatus[]>('acp_detect_runtimes');
}

export async function startAcpSession(
  runtimeId: string,
  cwd: string,
): Promise<string | null> {
  const invoke = getInvoke();
  if (!invoke) return null;
  return invoke<string>('acp_start', { runtimeId, cwd });
}

export async function sendAcpLine(sessionId: string, line: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke<void>('acp_send', { sessionId, line });
}

export async function stopAcpSession(sessionId: string): Promise<void> {
  const invoke = getInvoke();
  if (!invoke) return;
  await invoke<void>('acp_stop', { sessionId });
}

export type AcpPermissionVerdict = 'allow-inside-vault' | 'ask';

/**
 * 이 경로가 볼트 안인가. **경로를 모르면 `ask`** 다 — 판단할 수 없는 요청일수록
 * 그냥 통과하게 두지 않는다. 브리지가 없으면(웹) 역시 `ask`.
 */
export async function acpPermissionVerdict(
  vaultRoot: string,
  filePath: string | null,
): Promise<AcpPermissionVerdict> {
  const invoke = getInvoke();
  if (!invoke) return 'ask';
  return invoke<AcpPermissionVerdict>('acp_permission_verdict', {
    vaultRoot,
    filePath,
  });
}

export interface AcpLineEvent {
  sessionId: string;
  line: string;
}

export interface AcpExitEvent {
  sessionId: string;
  code: number | null;
}

export interface AcpNoticeEvent {
  sessionId: string;
  message: string;
}

/**
 * 세션 하나의 이벤트를 듣는다. 돌려주는 함수를 부르면 전부 끊는다.
 *
 * **다른 세션의 줄을 걸러 내는 것은 여기서 한다.** 호출부마다 그 필터를 다시
 * 쓰게 두면 언젠가 한 곳이 빠뜨리고, 그러면 두 대화가 서로의 말을 받는다.
 */
export async function listenToAcpSession(
  sessionId: string,
  handlers: {
    onMessage?: (line: string) => void;
    onStderr?: (line: string) => void;
    onNotice?: (message: string) => void;
    onExit?: (code: number | null) => void;
  },
): Promise<() => void> {
  if (!isAcpBridgeAvailable()) return () => {};
  const unlisteners = await Promise.all([
    listen<AcpLineEvent>('acp://message', (event) => {
      if (event.payload.sessionId === sessionId) handlers.onMessage?.(event.payload.line);
    }),
    listen<AcpLineEvent>('acp://stderr', (event) => {
      if (event.payload.sessionId === sessionId) handlers.onStderr?.(event.payload.line);
    }),
    listen<AcpNoticeEvent>('acp://notice', (event) => {
      if (event.payload.sessionId === sessionId) handlers.onNotice?.(event.payload.message);
    }),
    listen<AcpExitEvent>('acp://exit', (event) => {
      if (event.payload.sessionId === sessionId) handlers.onExit?.(event.payload.code);
    }),
  ]);
  return () => {
    for (const off of unlisteners) off();
  };
}
