/**
 * 클라이언트별 MCP 원클릭 딥링크 빌더 (#12, Phase 4).
 *
 * Cursor / VS Code 는 URL 스킴으로 MCP 서버를 원클릭 등록한다. 두 링크 모두
 * 같은 표준 stdio triple(command/args/env)을 실어 나르되 인코딩만 다르다:
 * - Cursor: `config` 쿼리에 base64(JSON)
 * - VS Code: 쿼리 문자열에 url-encoded JSON
 *
 * 핵심 제약: `OATLAS_VAULT` 는 **절대 경로**여야 원클릭이 성립한다. 브라우저
 * 세션은 폴더 절대 경로를 알 수 없으므로(구조적 제약) 이때 딥링크는 만들지
 * 않고 `null` 을 돌려준다 — UI 는 설정 파일 복사 경로로 정직하게 강등한다.
 */

export const MCP_SERVER_NAME = "ontology-atlas";
export const MCP_SERVER_PACKAGE = "ontology-atlas-mcp";

export interface McpStdioConfig {
  command: "npx";
  args: readonly string[];
  env: { OATLAS_VAULT: string };
}

/**
 * 딥링크에 실을 표준 stdio config 객체. 절대 경로를 모르면 null.
 */
export function buildMcpDeeplinkConfig(
  vaultPath: string | null | undefined,
): McpStdioConfig | null {
  if (!vaultPath) return null;
  return {
    command: "npx",
    args: ["-y", MCP_SERVER_PACKAGE],
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
 * 절대 경로를 모르면 null(웹 강등).
 */
export function buildCursorMcpDeeplink(
  vaultPath: string | null | undefined,
): string | null {
  const config = buildMcpDeeplinkConfig(vaultPath);
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
): string | null {
  const config = buildMcpDeeplinkConfig(vaultPath);
  if (!config) return null;
  const payload = { name: MCP_SERVER_NAME, ...config };
  return `vscode:mcp/install?${encodeURIComponent(JSON.stringify(payload))}`;
}
