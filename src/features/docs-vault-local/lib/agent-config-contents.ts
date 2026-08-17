import { bundledServerLaunch, type McpServerLaunch } from '@/shared/config';

import { buildCodexConfigToml, buildMcpConfigJson } from './ontology-starter';

export { bundledServerLaunch };

/**
 * 「에이전트 연결」 버튼이 각 설정 파일에 넣을 내용.
 *
 * `OATLAS_VAULT` 는 **설정 파일이 놓이는 자리 기준**이어야 한다. 설정이 repo
 * 최상위에 놓이고 vault 가 그 아래 폴더면 `.` 이 아니라 그 하위 경로다.
 * 설치 앱 실측(2026-07-27)에서 `.mcp.json` 만 `.` 로 박혀 있어 repo 루트를
 * vault 로 읽는 설정이 나왔고, 자가 검증은 vault 경로를 직접 스폰 인자로
 * 쓰기 때문에 이걸 잡지 못했다 — 그래서 여기 테스트가 있다.
 *
 * `.mcp.json.example` 만 절대 경로다. 다른 작업 디렉토리에서 등록하라고
 * 있는 파일이라 상대 경로면 쓸모가 없다.
 */
export function agentConfigContents({
  fileName,
  launch,
  vaultRelative,
  vaultAbsolute,
}: {
  fileName: string;
  launch: McpServerLaunch;
  vaultRelative: string;
  vaultAbsolute: string;
}): string {
  if (fileName === '.mcp.json.example') {
    return buildMcpConfigJson('vault', vaultAbsolute, launch);
  }
  if (fileName === '.codex/config.toml') {
    return buildCodexConfigToml(vaultRelative, launch);
  }
  return buildMcpConfigJson('vault', vaultRelative, launch);
}

/** 설정이 놓이는 자리에서 vault 를 가리키는 상대 경로. 같은 폴더면 ".". */
export function vaultPathRelativeToConfigRoot(configRoot: string, vaultPath: string): string {
  if (configRoot === vaultPath) return '.';
  if (vaultPath.startsWith(`${configRoot}/`)) return vaultPath.slice(configRoot.length + 1);
  return vaultPath;
}

/**
 * **남이 등록해 둔 서버를 지우지 않는다.**
 *
 * ## 왜 (2026-08-16 검수에서 적발)
 *
 * 「에이전트 연결」은 `.mcp.json` 을 **처음부터 새로 지어서** 통째로 덮어썼다.
 * 그래서 그 저장소에 다른 MCP 서버가 등록돼 있으면 **한 번의 클릭으로 전부
 * 사라졌다.** 되돌릴 길은 git 뿐이고, 그 파일이 커밋돼 있지 않으면 그것도 없다.
 *
 * 날카로운 부분은 이거다 — **같은 파일에 대해 CLI 는 정확히 반대로 한다.**
 * CLI 의 `agent-setup --write` 는 우리 항목만 갈아 끼우고 나머지를 보존하며,
 * 애매하면 아예 손대지 않고 병합용 본을 따로 내놓는다. 같은 파일,
 * 두 표면, 반대 방향의 안전. 그리고 앱 쪽에는 그것을 확인하는 검사가 없었다.
 *
 * 우리가 넣는 항목은 `ontology-atlas` 하나다. 그 한 칸만 바꾸고 나머지는
 * 그대로 둔다. 읽을 수 없는 파일이면 **아무것도 하지 않고 그렇게 말한다** —
 * 못 읽는 파일을 덮어쓰는 것은 지우는 것과 같다.
 */
export function mergeMcpServersJson(
  currentContents: string | null,
  nextContents: string,
): { ok: true; text: string } | { ok: false; reason: 'unreadable' } {
  if (currentContents === null || currentContents.trim() === '') {
    return { ok: true, text: nextContents };
  }
  let current: unknown;
  let next: unknown;
  try {
    current = JSON.parse(currentContents);
    next = JSON.parse(nextContents);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  if (!isPlainObject(current) || !isPlainObject(next)) return { ok: false, reason: 'unreadable' };

  const currentServers = current.mcpServers;
  if (currentServers !== undefined && !isPlainObject(currentServers)) {
    // `mcpServers` 가 우리가 아는 모양이 아니다 — 손대지 않는다.
    return { ok: false, reason: 'unreadable' };
  }
  const ours = isPlainObject(next.mcpServers) ? next.mcpServers['ontology-atlas'] : undefined;
  if (ours === undefined) return { ok: false, reason: 'unreadable' };

  const merged = {
    ...current,
    mcpServers: { ...(currentServers ?? {}), 'ontology-atlas': ours },
  };
  return { ok: true, text: `${JSON.stringify(merged, null, 2)}\n` };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
