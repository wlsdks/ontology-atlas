/**
 * 클라이언트별 MCP 원클릭 딥링크 빌더 (#12, Phase 4).
 *
 * Cursor / VS Code 는 URL 스킴으로 MCP 서버를 원클릭 등록한다. 두 링크 모두
 * 같은 표준 stdio triple(command/args/env)을 실어 나르되 인코딩만 다르다:
 * - Cursor: `config` 쿼리에 base64(JSON)
 * - VS Code: 쿼리 문자열에 url-encoded JSON
 *
 * 성립 조건이 **둘 다** 필요하다:
 * 1. `OATLAS_VAULT` 에 넣을 **절대 경로**. 브라우저 세션은 폴더 절대 경로를
 *    알 수 없으므로(구조적 제약) 웹에서는 항상 null 이다.
 * 2. 서버를 **어떻게 띄울지**(`McpServerLaunch`). 설치된 앱은 자기 번들 안의
 *    바이너리 경로를 실어 보낸다 — 딥링크는 로컬에서 만들어 로컬에서 열리므로
 *    로컬 절대 경로가 그대로 유효하다.
 *
 * 2026-07-27 이전에는 여기에 npm 발행 게이트가 걸려 있어 **항상 null** 이었다.
 * 발행 계획이 폐기되고 앱이 서버를 품게 되면서 이 경로는 처음으로 살아난다.
 */

import { MCP_SERVER_NAME, type McpServerLaunch } from "@/shared/config";

export { MCP_SERVER_NAME };

export interface McpStdioConfig {
  command: string;
  args: readonly string[];
  env: { OATLAS_VAULT: string };
}

/**
 * 딥링크에 실을 표준 stdio config 객체. 절대 경로나 실행 방법을 모르면 null.
 */
export function buildMcpDeeplinkConfig(
  vaultPath: string | null | undefined,
  launch: McpServerLaunch | null | undefined,
): McpStdioConfig | null {
  if (!vaultPath || !launch) return null;
  return {
    command: launch.command,
    args: launch.args,
    env: { OATLAS_VAULT: vaultPath },
  };
}

/**
 * UTF-8 안전 base64 (한글 vault 경로 대응). 브라우저(btoa 는 latin1 전용)와
 * Node(Buffer) 양쪽에서 동작.
 */
export function utf8ToBase64(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "utf-8").toString("base64");
  }
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Cursor 딥링크: `cursor://anysphere.cursor-deeplink/mcp/install?name=…&config=<base64>`.
 * 절대 경로나 실행 방법을 모르면 null(웹 강등).
 */
export function buildCursorMcpDeeplink(
  vaultPath: string | null | undefined,
  launch: McpServerLaunch | null | undefined,
): string | null {
  const config = buildMcpDeeplinkConfig(vaultPath, launch);
  if (!config) return null;
  const encoded = utf8ToBase64(JSON.stringify(config));
  const params = new URLSearchParams({ name: MCP_SERVER_NAME, config: encoded });
  return `cursor://anysphere.cursor-deeplink/mcp/install?${params.toString()}`;
}

/**
 * VS Code 딥링크: `vscode:mcp/install?<url-encoded JSON>`.
 * VS Code 는 name 을 config 객체 안의 필드로 받는다. 절대 경로를 모르면 null.
 */
export function buildVsCodeMcpDeeplink(
  vaultPath: string | null | undefined,
  launch: McpServerLaunch | null | undefined,
): string | null {
  const config = buildMcpDeeplinkConfig(vaultPath, launch);
  if (!config) return null;
  const payload = { name: MCP_SERVER_NAME, ...config };
  return `vscode:mcp/install?${encodeURIComponent(JSON.stringify(payload))}`;
}
