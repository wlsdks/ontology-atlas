#!/usr/bin/env node
/**
 * `npx project-narnia-mcp` 진입점. stdio 로 MCP 클라이언트와 통신.
 *
 * Claude Code 등록 예 (`~/.claude/mcp_servers.json` 또는 `.claude/`):
 *   {
 *     "narnia": {
 *       "command": "npx",
 *       "args": ["-y", "project-narnia-mcp"],
 *       "env": {
 *         "NARNIA_API_KEY": "nk_...",
 *         "NARNIA_ACCOUNT_ID": "stark",
 *         "NARNIA_BASE_URL": "https://asia-northeast3-<project>.cloudfunctions.net",
 *         "NARNIA_DEFAULT_PROJECT_ID": "narnia"
 *       }
 *     }
 *   }
 */
import { runNarniaMcpServer } from "./index.js";

function readEnv(key: string, required = true): string {
  const v = process.env[key]?.trim();
  if (!v) {
    if (required) {
      console.error(`[narnia-mcp] 환경변수 ${key} 가 필요합니다.`);
      process.exit(1);
    }
    return "";
  }
  return v;
}

const apiKey = readEnv("NARNIA_API_KEY");
const accountId = readEnv("NARNIA_ACCOUNT_ID");
const baseUrl = readEnv("NARNIA_BASE_URL");
const defaultProjectId = readEnv("NARNIA_DEFAULT_PROJECT_ID", false) || "general";

runNarniaMcpServer({
  apiKey,
  accountId,
  baseUrl,
  defaultProjectId,
}).catch((err) => {
  console.error("[narnia-mcp] failed to start:", err);
  process.exit(1);
});
