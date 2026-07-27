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
