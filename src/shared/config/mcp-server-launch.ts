/**
 * 에이전트가 MCP 서버를 **어떻게 띄우는가** — 이 저장소의 배포 계약.
 *
 * 2026-07-27 이전에는 이 자리에 npm 발행 게이트가 있었다
 * (`agent-package-distribution.ts`). 그 게이트는 "언젠가 npm 에 올라가면
 * `npx -y ontology-atlas-mcp` 가 참이 된다"를 전제로 모든 안내를 잠가 두고
 * 있었는데, 발행하지 않기로 확정되면서 전제가 사라졌다. 기다리는 게이트를
 * 남겨 두면 그건 영원히 닫힌 문이고, 그 뒤의 안내는 거짓 약속이다.
 *
 * 지금의 배포 채널은 하나다: **앱이 서버를 품는다.** macOS 앱이 컴파일된 MCP
 * 바이너리를 자기 번들 안에 싣고, 「에이전트 연결」 버튼이 그 절대 경로로
 * 클라이언트 설정을 써 준다. 앱을 꺼도 계약은 유지된다 — 바이너리는 디스크에
 * 있고 에이전트 클라이언트가 세션마다 스폰한다.
 *
 * 앱이 없는 환경(웹 브라우저 · 리눅스 CI · 서버)은 **소스 체크아웃**이 바닥을
 * 받친다. 그 둘이 전부이고, 세 번째는 없다.
 */

/**
 * `npx` 는 이 제품의 배포 경로가 아니다.
 *
 * 코드가 이 사실을 알아야 하는 이유: 안내 문구·설정 템플릿·딥링크가 저마다
 * "발행되면" 을 가정하고 흩어져 있었다. 상수 하나로 모아 두면 다시 흩어지지
 * 않고, 판단이 바뀌면 여기 한 곳만 뒤집으면 된다.
 */
export const MCP_SERVER_DISTRIBUTION = {
  /** npm 발행 계획은 폐기됐다 (docs/DECISIONS.md 2026-07-27). */
  npmPublishing: "retired",
  decidedAt: "2026-07-27",
  channels: ["app-bundled", "source-checkout"],
} as const;

export type McpServerLaunchKind = "app-bundled" | "source-checkout";

/**
 * 클라이언트 설정에 그대로 들어가는 실행 계약.
 * `command` + `args` 는 stdio MCP 의 표준 모양이다.
 */
export interface McpServerLaunch {
  kind: McpServerLaunchKind;
  /** 실행 파일. 번들이면 바이너리 절대 경로, 소스면 `node`. */
  command: string;
  args: readonly string[];
}

/** MCP 클라이언트 설정에서 이 서버가 갖는 이름. */
export const MCP_SERVER_NAME = "ontology-atlas";

/**
 * 앱 번들 안의 바이너리로 띄우는 방식 — 사용자가 아무것도 설치하지 않아도 된다.
 * 경로는 네이티브(`mcp_bundled_server`)가 알려 준다.
 */
export function bundledServerLaunch(binaryPath: string): McpServerLaunch {
  return { kind: "app-bundled", command: binaryPath, args: [] };
}

/**
 * 소스 체크아웃으로 띄우는 방식 — 앱이 없는 환경의 바닥.
 * `repoRoot` 는 ontology-atlas 저장소 루트의 절대 경로.
 */
export function sourceCheckoutLaunch(repoRoot: string): McpServerLaunch {
  return { kind: "source-checkout", command: "node", args: [`${repoRoot}/mcp/src/index.js`] };
}

/**
 * 지금 이 화면에서 에이전트를 붙일 수 있는가 — UI 전체가 이 하나를 보고 갈린다.
 *
 * 구 `AgentPackageDistribution` 을 대체한다. 옛 모델은 "npm 에 올라갔는가"를
 * 물었고 답은 영원히 아니오였다. 새 모델은 **"이 자리에서 서버를 띄울 방법을
 * 아는가"** 를 묻는다 — 설치된 앱은 안다(번들 바이너리), 브라우저는 모른다
 * (절대 경로가 없다).
 */
export interface AgentServerAvailability {
  kind: McpServerLaunchKind | "unavailable";
  /** 실행 방법. null 이면 실행 가능한 설정을 만들 수 없다 — 정직하게 강등한다. */
  launch: McpServerLaunch | null;
  /** 번들 바이너리 절대 경로 (있을 때). 화면이 사용자에게 그대로 보여 준다. */
  binaryPath: string | null;
  /** 왜 못 하는지. 사용자가 읽는 문장이 되므로 진단이 담겨야 한다. */
  reason: string | null;
}

/** 실행 방법을 모르는 상태 — 웹 세션의 기본값. */
export function agentServerUnavailable(reason: string | null = null): AgentServerAvailability {
  return { kind: "unavailable", launch: null, binaryPath: null, reason };
}

/** 앱 번들 안의 바이너리를 찾은 상태 — 원클릭이 성립한다. */
export function agentServerFromBundle(binaryPath: string): AgentServerAvailability {
  return {
    kind: "app-bundled",
    launch: bundledServerLaunch(binaryPath),
    binaryPath,
    reason: null,
  };
}
