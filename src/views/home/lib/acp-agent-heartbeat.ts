/**
 * 앱 안 에이전트가 **자기 이름을 볼트에 등록**한다.
 *
 * ## 왜 (2026-08-17 실측, 소유자 지시)
 *
 * 볼트에 노드가 생기면 `created_by` 에 누가 만들었는지 적힌다 — 사람이면
 * `human`, 에이전트면 `agent:<이름>`. 그런데 앱 안 에이전트가 만든 것은 전부
 * `agent:unknown` 이었다. 서버는 이름을 알고 있었다(같은 쓰기에서
 * `activity.jsonl` 에는 `codex-mcp-client` 라고 적혔다). 이름을 버린 것은
 * **일부러**다 — 그 칸은 볼트에 영구히 박히므로 「사람이 의도적으로 등록한
 * 이름」만 받고 자동 추측은 안 들인다(2026-07-31 원장).
 *
 * 문제는 **등록할 방법이 아무 데도 없었다는 것**이다. MCP 에 그런 도구가 없고,
 * 앱은 하트비트를 읽기만 했으며, CLI 명령은 앱만 설치한 사람에게는 없다.
 * 그래서 규칙은 옳은데 그 규칙을 지킬 길이 없었다.
 *
 * 앱이 대신 등록한다(소유자 지시). 사람이 「에이전트」를 켜고 어느 도구로
 * 대화할지 고른 것이 곧 의도적 선택이고, 앱은 그 선택을 안다.
 *
 * ## 왜 「세션이 열려 있는 동안」이 아니라 「한 차례가 도는 동안」인가
 *
 * 하트비트가 신선하면 화면이 **레일에 「에이전트 활동 중」 표시**를 켠다
 * (`hasFreshAgentHeartbeat`). 세션만 열어 두고 아무것도 안 시켰는데 그 표시가
 * 켜지면 화면이 일어나지 않은 일을 말하는 것이다 — 이 저장소가 대화 칸에서
 * 이미 정해 둔 규율과 같다(*"전송 전에 「읽음」으로 찍으면 화면이 아직 일어나지
 * 않은 일을 말하는 것"*).
 *
 * 그래서 **말을 보내는 순간 쓰고, 차례가 끝나면 지운다.** 쓰기는 차례 안에서만
 * 일어나므로 `created_by` 는 이름을 얻고, 쉬는 동안에는 아무 표시도 안 남는다.
 *
 * ## 지도에 링을 켜지 않는다
 *
 * 지도의 에이전트 포커스 링은 `heartbeat.focus.ontologySlug` 를 본다. 앱은
 * 에이전트가 지금 어느 노드를 만지는지 모르므로 그 칸을 비워 둔다 — 모르는 것을
 * 아는 척하지 않는다. 링은 여전히 실데이터(에이전트가 실제로 쓴 노드)에서만
 * 나온다.
 */

import type { AgentActivityHeartbeat } from "@/features/docs-vault-local";

/** 하트비트가 사는 곳 — `agent-activity.json` 과 같은 사이드카 폴더. */
export const AGENT_HEARTBEAT_VAULT_DIR = ".ontology-atlas";
export const AGENT_HEARTBEAT_VAULT_FILE = "agent-activity.json";

/**
 * 한 차례가 도는 동안의 하트비트.
 *
 * `state: "editing"` 인 이유: 다섯 상태(planning/editing/verifying/blocked/
 * complete) 중 「지금 이 폴더에 일하는 중」에 가장 가깝다. 앱은 그 차례가
 * 읽기인지 쓰기인지 미리 모르지만, **차례가 돌고 있다는 것**은 확실히 안다.
 */
export function buildAcpTurnHeartbeat({
  agent,
  at,
}: {
  agent: string;
  at: Date;
}): AgentActivityHeartbeat {
  return {
    agent,
    state: "editing",
    focus: { summary: null, ontologySlug: null, files: [] },
    plan: [],
    evidence: { mcp: [], source: [], codegraph: [], verification: [] },
    updatedAt: at.toISOString(),
  };
}

/**
 * 이 런타임을 볼트에 뭐라고 적을 것인가. 실행기 id 를 **그대로** 쓴다 —
 * 새 이름 체계를 만들지 않고, 사람이 화면에서 고른 그 도구와 한 글자도 다르지
 * 않게 한다. 모양이 이상하면 등록하지 않는다(모름은 모름으로 남는 편이 낫다).
 */
export function acpHeartbeatAgentName(runtimeId: unknown): string | null {
  if (typeof runtimeId !== "string") return null;
  const trimmed = runtimeId.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return null;
  return /^[a-z0-9][a-z0-9._-]*$/i.test(trimmed) ? trimmed : null;
}

/** 볼트에 하트비트를 쓰거나 지우는 통로 — 파일을 만지는 코드는 여기 하나다. */
export interface AcpHeartbeatStore {
  write(heartbeat: AgentActivityHeartbeat): Promise<void>;
  clear(): Promise<void>;
}

export function createVaultAcpHeartbeatStore(
  handle: FileSystemDirectoryHandle,
): AcpHeartbeatStore {
  const dir = (create: boolean) =>
    handle.getDirectoryHandle(AGENT_HEARTBEAT_VAULT_DIR, { create });
  return {
    async write(heartbeat) {
      const sidecar = await dir(true);
      const file = await sidecar.getFileHandle(AGENT_HEARTBEAT_VAULT_FILE, { create: true });
      const writable = await file.createWritable();
      await writable.write(`${JSON.stringify(heartbeat, null, 2)}\n`);
      await writable.close();
    },
    async clear() {
      try {
        await (await dir(false)).removeEntry(AGENT_HEARTBEAT_VAULT_FILE);
      } catch {
        /* 이미 없음 — 지우는 것은 실패해도 해로울 게 없다 */
      }
    },
  };
}
