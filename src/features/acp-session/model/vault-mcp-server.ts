import type { McpServerLaunch } from '@/shared/config';

/**
 * 세션에 자동으로 꽂을 MCP 서버 — **사용자가 설정 파일을 안 만져도 되게.**
 *
 * ## 이게 이 기능의 본체다
 *
 * ACP 자체는 어느 앱이든 몇 주면 붙인다. 우리만 되는 것은 그 세션이 열리는
 * 순간 **그 사람의 볼트가 이미 실려 있다**는 것이다. 다른 에디터도 MCP 를 꽂을
 * 수 있지만 꽂을 온톨로지가 없다.
 *
 * 실측(2026-08-16): `session/new` 의 `mcpServers` 로 번들 MCP 를 넘기니
 * 에이전트가 `connection_info` · `list_kinds` 를 불러 볼트 79노드를 읽었다.
 * 사용자는 `.mcp.json` 을 만든 적도, `claude mcp add` 를 친 적도 없다.
 *
 * ## 이름 충돌이 조용히 삼킨다
 *
 * 같은 실측에서 codex 쪽이 처음에 실패했는데, 원인은 프로토콜이 아니라 **이름
 * 충돌**이었다 — 그 저장소의 `.codex/config.toml` 에 이미 `ontology-atlas` 가
 * 있었고, 어댑터의 중복 제거가 우리가 주입한 것을 **말없이 버렸다**. 그래서
 * 앱이 꽂는 서버는 사용자가 손으로 쓸 법한 이름을 피한다.
 */
export const VAULT_MCP_SERVER_NAME = 'atlas-vault';

/** ACP `session/new` 의 `mcpServers` 항목 (stdio 갈래). */
export interface AcpMcpServer {
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
}

/**
 * 이 볼트를 읽을 MCP 서버 한 벌. 띄울 방법을 모르면 **빈 배열** —
 * 없는 경로를 넘기면 세션은 뜨는데 도구만 조용히 없는 상태가 된다.
 */
export function vaultMcpServers(
  launch: McpServerLaunch | null,
  vaultPath: string | null,
): AcpMcpServer[] {
  if (!launch || !vaultPath) return [];
  return [
    {
      name: VAULT_MCP_SERVER_NAME,
      command: launch.command,
      args: [...launch.args],
      env: [
        { name: 'OATLAS_VAULT', value: vaultPath },
        // 저장소 루트는 볼트가 git 안에 있을 때 MCP 가 스스로 찾는다. 여기서
        // 짐작해 넘기면 볼트가 리포 밖일 때 틀린 값을 박게 된다.
      ],
    },
  ];
}
