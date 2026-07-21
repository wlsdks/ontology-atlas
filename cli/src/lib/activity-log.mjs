// P2-① (retention-round-2026-07-21) — CLI 쓰기도 로컬 감사 로그에 남긴다.
//
// 지금까지 `.ontology-atlas/activity.jsonl` 감사 로그는 MCP 쓰기 경로만
// 기록했다 (mcp/src/index.js 의 logWrite). CLI 의 add/import/relate 는
// vault 파일을 직접 fs 로 쓰기 때문에 로그에 안 남아 "에이전트가 vault 에
// 쓰면 기록됩니다" 약속에 구멍이 났다. (rename/merge/delete 는 이미
// callMcpTool 로 MCP 서버를 거치므로 그쪽 logWrite 가 기록한다.)
//
// 여기서는 mcp 패키지의 activity-log 모듈을 **재사용**한다 — 스키마·로테이션·
// best-effort append 를 한 곳(single source)에 유지하기 위해. 모듈 해석은
// agent-activity.mjs 의 showActivityLog 와 같은 2단 해석(모노레포 소스 →
// 설치 패키지)을 쓴다.

let cachedModule = null;

/**
 * mcp 의 activity-log.mjs 를 resolve + import 한다 (2단: 모노레포 소스 체크아웃
 * → 설치된 ontology-atlas-mcp 패키지). 결과는 캐시 — 배치 쓰기(import)가
 * 파일당 재해석하지 않도록.
 */
async function loadActivityLogModule() {
  if (cachedModule) return cachedModule;
  const { createRequire } = await import('node:module');
  const { existsSync } = await import('node:fs');
  const { resolve: resolvePath, dirname: dirnamePath } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = dirnamePath(fileURLToPath(import.meta.url));
  const monoDev = resolvePath(here, '../../../mcp/src/activity-log.mjs');
  let modPath = monoDev;
  if (!existsSync(monoDev)) {
    const require_ = createRequire(import.meta.url);
    modPath = require_.resolve('ontology-atlas-mcp/src/activity-log.mjs');
  }
  cachedModule = await import(`file://${modPath}`);
  return cachedModule;
}

/**
 * CLI 쓰기 1건을 감사 로그에 append 한다. 순수 best-effort —
 * 어떤 실패도 throw 하지 않고, 호출자의 exit code / 출력 계약을 바꾸지 않는다.
 * dry-run·실패한 쓰기에서는 **호출하지 말 것** (감사 로그는 "일어난 일"만).
 *
 * @param {string} vaultRoot  절대 경로 (add/import 는 resolve(vault), relate 는 resolveVaultRoot).
 * @param {{tool:string, target:string, summary:string, why?:string|null}} entry
 *   tool 은 `cli:add` 처럼 CLI 쓰기임을 구분할 수 있게 접두한다.
 *   agent 필드는 heartbeat 파일에서 복사(없으면 null) — MCP logWrite 와 동일.
 */
export async function recordCliWrite(vaultRoot, { tool, target, summary, why = null }) {
  try {
    const { appendActivityEntry, buildActivityEntry, readHeartbeatAgent } =
      await loadActivityLogModule();
    appendActivityEntry(
      vaultRoot,
      buildActivityEntry({
        tool,
        target,
        summary,
        why: why ?? null,
        agent: readHeartbeatAgent(vaultRoot),
      }),
    );
  } catch {
    /* 감사 로그는 부수 — 쓰기 결과 / exit code 를 절대 해치지 않는다. */
  }
}
