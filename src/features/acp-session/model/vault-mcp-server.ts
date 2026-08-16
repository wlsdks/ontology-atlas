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

export interface ExistingVaultMcpRegistration {
  /** 설정 파일에 적힌 실행 명령. */
  command: string | null | undefined;
  /** 명령뿐 아니라 현재 볼트 환경까지 전체 설정 검증을 통과했는가. */
  validForCurrentVault: boolean;
}

/**
 * 이 런타임의 CLI 가 **작업 폴더에서 스스로 읽는** 설정 파일. 볼트가 거기에
 * 이미 우리 서버를 등록해 뒀다면 앱이 또 꽂을 필요가 없다.
 *
 * ## 왜 필요한가 (2026-08-17 실측)
 *
 * `init` 이 만든 볼트에서 codex 세션을 열고 물어봤더니 **같은 서버가 두 번**
 * 돌고 있었다:
 *
 * - `mcp.ontology-atlas.list_kinds` → `{"total": 5, …}`  ← 볼트의 `.codex/config.toml`
 * - `mcp.atlas-vault.list_kinds`    → `{"total": 5, …}`  ← 앱이 꽂은 것
 *
 * `ps` 로도 `ontology-atlas-mcp` 프로세스가 둘이었다(같은 부모). 이름을
 * `atlas-vault` 로 바꾼 것이 어댑터의 중복 제거를 **피해 버려서**, 조용히
 * 버려지는 대신 조용히 두 벌이 됐다. 모델의 도구 목록에는 같은 도구가 두
 * 이름으로 들어가고, 그중 뭘 써야 하는지는 아무도 안 알려 준다.
 *
 * ## 실측한 것만 넣는다
 *
 * 안 재 본 런타임을 여기 적으면 **도구가 통째로 없는 세션**을 만들 수 있다 —
 * 중복보다 훨씬 나쁘다. 그래서 모르는 런타임은 종전대로 꽂는다.
 * (`claude-acp` 가 `.mcp.json` 을 읽는지는 아직 안 쟀다 — 로그인이 만료돼
 * 세션을 못 열었다.)
 */
const MEASURED_SELF_READ_SLOT: Readonly<Record<string, 'codex-config'>> = {
  'codex-acp': 'codex-config',
};

/** 이 런타임이 볼트에서 스스로 읽는 설정 자리 — 안 재 봤으면 `null`. */
export function vaultSelfReadSlot(runtimeId: string | null | undefined): 'codex-config' | null {
  if (typeof runtimeId !== 'string') return null;
  return MEASURED_SELF_READ_SLOT[runtimeId] ?? null;
}

/**
 * 볼트가 이미 등록해 둔 것이 **우리가 꽂으려던 바로 그것**인가.
 *
 * 「등록이 있다」만으로 건너뛰면 안 된다 — 볼트의 항목이 낡은 경로나 다른
 * `OATLAS_VAULT`를 가리키면 도구가 아예 없거나 엉뚱한 볼트를 읽는 세션이 된다.
 * 현재 볼트용 전체 설정 검증을 통과하고 명령도 **글자 그대로 같을 때만** 같은
 * 것으로 본다.
 */
export function vaultAlreadyRegisters(
  launch: McpServerLaunch | null,
  registration: ExistingVaultMcpRegistration | null | undefined,
): boolean {
  if (!launch || !registration?.validForCurrentVault) return false;
  if (typeof registration.command !== 'string') return false;
  const registeredCommand = registration.command.trim();
  return registeredCommand.length > 0 && registeredCommand === launch.command.trim();
}

/**
 * 이 볼트를 읽을 MCP 서버 한 벌. 띄울 방법을 모르면 **빈 배열** —
 * 없는 경로를 넘기면 세션은 뜨는데 도구만 조용히 없는 상태가 된다.
 *
 * 볼트가 이 런타임에게 이미 같은 서버를 등록해 주고 있으면 역시 빈 배열이다
 * (위 `vaultAlreadyRegisters` 참고) — 두 벌이 되는 것을 막는다.
 */
export function vaultMcpServers(
  launch: McpServerLaunch | null,
  vaultPath: string | null,
  registration?: ExistingVaultMcpRegistration | null,
): AcpMcpServer[] {
  if (!launch || !vaultPath) return [];
  if (vaultAlreadyRegisters(launch, registration)) return [];
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
