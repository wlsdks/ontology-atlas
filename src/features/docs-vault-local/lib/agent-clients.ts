/**
 * 지원하는 MCP 클라이언트와 **각자가 쓰는 파일** — 도구별 버튼의 진실원.
 *
 * ## 왜 이 표가 생겼나
 *
 * 「Connect to Claude Code」 한 번이 파일 셋을 썼다(`.mcp.json` ·
 * `.mcp.json.example` · `.codex/config.toml`). 플래너가 허용 목록 전체를 타깃으로
 * 내고 호출부가 그것을 전부 순회했기 때문이다.
 *
 * **라벨이 거짓말하는 결함이다.** 이 저장소가 이미 게이트로 막는 부류다 —
 * 「지도로 돌아가기」가 `/` 를 가리킨 것, 라벨 끝 장식 화살표, 죽은 npm 명령.
 * 게다가 안 쓰는 도구의 설정이 사용자 git diff 에 뜬다: *"모든 변경이 읽을 수 있는
 * diff"* 라는 이 제품의 주장에 정면으로 반한다.
 *
 * ## 목록은 조사로 정했다 (2026-07-30)
 *
 * 전문: `.qa-scratch/mcp-client-research-2026-07-30.md`. 판정 기준 셋 —
 * ① stdio JSON-RPC 를 받는가 ② **프로젝트 스코프** 설정이 있는가(볼트 안에 쓰고
 * git diff 로 감사하는 것이 계약이다) ③ 실재하는가.
 *
 * | 도구 | 근거 |
 * |---|---|
 * | Claude Code | `.mcp.json` — 공식 문서가 "버전관리 체크인" 용도로 명기 |
 * | Codex | 리포 안 `.codex/config.toml` 공식 지원 (신뢰 폴더 조건) |
 * | Cursor | `.cursor/mcp.json` 프로젝트 스코프 — **딥링크에서 파일 쓰기로 승격** |
 * | Antigravity | 워크스페이스 `.agents/mcp_config.json`, stdio 명시 |
 *
 * **VS Code 를 뺀 이유는 취향이 아니다.** `.vscode/mcp.json` 을 지원하지만 키가
 * `mcpServers` 가 아니라 **`servers`** 다 — 라이터를 혼자 하나 더 요구하면서
 * 타겟 겹침이 가장 작다. 반대로 Cursor·Antigravity 는 같은 `mcpServers` 키라
 * **기존 라이터로 그냥 떨어진다**(`agentConfigContents` 의 기본 분기).
 *
 * **openclaw · Hermes Agent 는 기각.** 둘 다 실재하고 사용자도 많지만
 * (`~/.openclaw/openclaw.json` · `~/.hermes/config.yaml`) **전역 홈 설정만** 지원해
 * 위 기준 ②를 깨야 지원된다. 스타 수는 계약을 굽힐 근거가 아니다.
 *
 * **대기석 1순위 opencode** — 프로젝트 `opencode.json` 이 계약을 만족한다. `command`
 * 가 배열이라 어댑터 하나가 필요해서, 그 어댑터를 쓸 이유가 생길 때 넣는다.
 */

export type AgentClientId = 'claude-code' | 'codex' | 'cursor' | 'antigravity';

export interface AgentClient {
  id: AgentClientId;
  /** i18n 키 — 사람이 부르는 이름. */
  labelKey: string;
  /**
   * 이 도구를 연결하면 **쓰는 파일**. 볼트(또는 리포 루트) 기준 상대 경로.
   *
   * 하나뿐인 것이 계약이다 — 버튼 하나가 파일 하나를 쓴다. 배열인 이유는 미래에
   * 두 개를 요구하는 도구가 나올 수 있어서이고, 그때도 **그 도구의 것만** 쓴다.
   */
  files: readonly string[];
  /**
   * 이 도구가 자기 설정을 어디에 두라고 문서화했는지 — 화면에 근거로 보여준다.
   * 사용자가 "왜 이 파일이 생기는가" 를 우리 말이 아니라 **그 도구의 말**로 확인할
   * 수 있어야 한다.
   */
  docsUrl: string;
}

export const AGENT_CLIENTS: readonly AgentClient[] = [
  {
    id: 'claude-code',
    labelKey: 'claudeCode',
    files: ['.mcp.json'],
    docsUrl: 'https://docs.claude.com/en/docs/claude-code/mcp',
  },
  {
    id: 'codex',
    labelKey: 'codex',
    files: ['.codex/config.toml'],
    docsUrl: 'https://developers.openai.com/codex/mcp',
  },
  {
    id: 'cursor',
    labelKey: 'cursor',
    files: ['.cursor/mcp.json'],
    docsUrl: 'https://docs.cursor.com/context/model-context-protocol',
  },
  {
    id: 'antigravity',
    labelKey: 'antigravity',
    files: ['.agents/mcp_config.json'],
    docsUrl: 'https://antigravity.google/docs/mcp',
  },
];

/** 이 도구가 쓰는 파일만 — 호출부가 `plan.targets` 를 이걸로 걸러야 라벨이 참이 된다. */
export function filesForClient(id: AgentClientId): readonly string[] {
  return AGENT_CLIENTS.find((client) => client.id === id)?.files ?? [];
}

/**
 * 앱이 쓸 수 있는 파일 전부 — Rust 의 `ALLOWED_CONFIG_FILES` 와 **같아야 한다**.
 *
 * 그쪽은 보안 allowlist(목록 밖은 거절)이고 이쪽은 UI 의 진실원이라, 둘이 어긋나면
 * 버튼이 있는데 쓰기가 거절되거나 그 반대가 된다. 계약 테스트가 두 목록을 맞댄다.
 */
export function allAgentConfigFiles(): readonly string[] {
  return [...new Set(AGENT_CLIENTS.flatMap((client) => client.files))].sort();
}
