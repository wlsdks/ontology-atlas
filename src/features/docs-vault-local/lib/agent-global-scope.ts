import { MCP_SERVER_NAME, type McpServerLaunch } from '@/shared/config';

import { type AgentClientId } from './agent-clients';

/**
 * **전역 스코프** — 이 컴퓨터의 모든 프로젝트에서 Atlas 를 쓰기.
 *
 * ## 왜 앱이 이 파일들을 직접 쓰지 않는가
 *
 * 소유자 관측(2026-07-30): *"대부분 에이전트 연결할때 프로젝트별 보다는 전역으로
 * 할텐데?"* — 맞다. 그래서 전역을 **선택지로** 넣는다. 다만 앱이 홈 디렉토리를
 * 대신 고치지는 않는다. 규칙은 하나다:
 *
 * > **볼트/리포 안은 앱이 쓴다. 볼트 밖은 그 도구가 자기 파일을 쓴다.**
 *
 * 이 선은 세 가지가 동시에 가리킨다.
 *
 * **① 감사 가능성.** 앱이 쓴 것은 `git diff` 로 읽힌다 — 이 제품의 주장이다.
 * 홈 디렉토리는 사용자의 리포가 아니라서 그 주장이 성립하지 않는다. 기본값이
 * 제품의 주장을 부정하게 두지 않는다.
 *
 * **② lost-update.** Claude Code 의 전역 파일 `~/.claude.json` 은 공식 문서상
 * MCP 엔트리와 **런타임에 갱신되는 per-project 토글**(`enabledMcpServers` /
 * `disabledMcpServers`)이 동거하는 **상태 저장소**다. 실행 중에 제3자가 덮어쓰면
 * 조용히 사용자 설정을 지운다. 원클릭이 「성공처럼 보이는 실패」가 된다.
 *
 * **③ 업계 선례 0.** MCP 서버 벤더 12곳 공식 문서 실측
 * (`.qa-scratch/mcp-install-ux-survey-2026-07-30.md`):
 *
 * | 형태 | 채택 |
 * |---|---|
 * | 복사할 CLI 명령 | **12/12** |
 * | `~/.claude.json` 직접 편집 안내 | **0/12** |
 * | 제3자 설치 관리자가 Claude 설정을 직접 씀 | 1/12 (그것도 프로젝트 파일) |
 * | 전역/user 를 **기본**으로 미는 곳 | **0/12** |
 *
 * 게다가 **어느 벤더도 백업·병합·잠금 전략을 문서화하지 않았다** — 「안전한 직접
 * 쓰기」 선례가 업계에 없다. 그래서 전역은 **경로가 이미 채워진 한 줄**로 준다.
 * 사용자가 조립하지 않는 것이 앱의 값이고, 붙여넣기 한 단계는 그 대가다.
 *
 * ## 왜 도구별로 다르게 하지 않는가
 *
 * `~/.cursor/mcp.json` 은 제3자(딥링크)가 쓰는 관행이 있어서 「Cursor 는 우리가
 * 쓰고 Claude 는 명령」도 가능하다. 하지만 그러면 ① 사용자가 왜 다른지 알 수
 * 없고 ② Rust 보안 경계를 홈 디렉토리까지 넓혀야 한다. 그 경계에는 이유가 이미
 * 적혀 있다(`src-tauri/src/agent_setup.rs`: *"사용자 홈의 전역 설정을 앱이
 * 건드리는 것은 사정거리가 너무 넓다"*). 규칙 하나가 예외 넷보다 지켜진다.
 */

/** 전역 설정을 적용하는 방식 — 도구가 스스로 쓰게 하는가, 사용자가 파일에 붙이는가. */
export type GlobalScopeKind = 'command' | 'snippet';

export interface GlobalScopeInstruction {
  client: AgentClientId;
  kind: GlobalScopeKind;
  /**
   * 전역 설정이 사는 자리. **홈 상대 표기**(`~/…`)로 쓴다 — 사용자 이름이 든
   * 절대 경로를 화면에 박으면 스크린샷·문서에 그대로 새어 나간다.
   */
  path: string;
  /** 복사해서 실행(command)하거나 붙여넣을(snippet) 본문. 절대 경로가 이미 박혀 있다. */
  text: string;
}

/** 볼트 절대 경로가 필요하다 — 전역 설정은 볼트 옆이 아니므로 상대 경로가 성립하지 않는다. */
export interface GlobalScopeInput {
  launch: McpServerLaunch;
  vaultAbsolute: string;
}

/** 셸 한 줄에 그대로 넣을 수 있게 — 공백·따옴표가 든 경로가 조용히 쪼개지지 않도록. */
function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@%+-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

function launchWords(launch: McpServerLaunch): string {
  return [launch.command, ...launch.args].map(shellQuote).join(' ');
}

function jsonSnippet(launch: McpServerLaunch, vaultAbsolute: string): string {
  return (
    JSON.stringify(
      {
        mcpServers: {
          [MCP_SERVER_NAME]: {
            command: launch.command,
            args: launch.args,
            env: { OATLAS_VAULT: vaultAbsolute },
          },
        },
      },
      null,
      2,
    ) + '\n'
  );
}

function tomlSnippet(launch: McpServerLaunch, vaultAbsolute: string): string {
  const args = launch.args.map((arg) => JSON.stringify(arg)).join(', ');
  return [
    `[mcp_servers.${MCP_SERVER_NAME}]`,
    `command = ${JSON.stringify(launch.command)}`,
    `args = [${args}]`,
    `env = { OATLAS_VAULT = ${JSON.stringify(vaultAbsolute)} }`,
    '',
  ].join('\n');
}

/**
 * 이 도구를 **이 컴퓨터 전체**에 붙이는 방법 한 가지.
 *
 * Claude Code 만 `command` 다 — 그 도구가 `--scope user` 를 공식 지원하고, 그
 * 파일이 위 ②의 상태 저장소라서 손으로도 고치지 말아야 한다. 나머지 셋은 정적
 * 설정 파일이라 `snippet` 이고, 그 도구의 CLI 존재를 확인하지 못했으므로
 * 있다고 말하지 않는다(확인 못 한 명령을 주면 그게 죽은 CTA 다).
 */
export function globalScopeInstruction(
  client: AgentClientId,
  { launch, vaultAbsolute }: GlobalScopeInput,
): GlobalScopeInstruction {
  switch (client) {
    case 'claude-code':
      return {
        client,
        kind: 'command',
        path: '~/.claude.json',
        text: `claude mcp add --scope user --env OATLAS_VAULT=${shellQuote(vaultAbsolute)} ${MCP_SERVER_NAME} -- ${launchWords(launch)}`,
      };
    case 'codex':
      return {
        client,
        kind: 'snippet',
        path: '~/.codex/config.toml',
        text: tomlSnippet(launch, vaultAbsolute),
      };
    case 'cursor':
      return { client, kind: 'snippet', path: '~/.cursor/mcp.json', text: jsonSnippet(launch, vaultAbsolute) };
    case 'antigravity':
      return {
        client,
        kind: 'snippet',
        path: '~/.gemini/config/mcp_config.json',
        text: jsonSnippet(launch, vaultAbsolute),
      };
  }
}
