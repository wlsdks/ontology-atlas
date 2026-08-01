/**
 * **웹에서 에이전트를 붙이는 길** — 사람이 경로를 알려 주면 설정을 그 자리에서 만든다.
 *
 * ## 무엇이 틀렸었나
 *
 * 웹의 강등 카드는 「이 화면에서는 **연결할 수 없어요**」라고 말했다. 거짓이다.
 * MCP 는 Atlas 에 붙는 게 아니라 **폴더에 붙는다** — 에이전트가 자기 세션에서
 * 서버를 스폰하고, 그 서버가 디스크의 볼트를 읽고 쓴다. Atlas 는 같은 폴더를
 * 보는 또 하나의 독자일 뿐이다. 그래서 웹 사용자도 연결된다.
 *
 * 브라우저가 못 하는 것은 **설정을 대신 써 주는 것** 하나다. File System
 * Access API 는 핸들만 주고 경로를 안 준다. 그건 「연결 불가」가 아니라
 * **「자동 설정 불가」**이고, 강등 카드는 능력의 범위를 실제보다 좁게 말하면
 * 안 된다(`.claude/rules/surfaces.md` 「왜 + 어디서」 계약).
 *
 * ## 브라우저는 경로를 모르지만 **사람은 안다**
 *
 * 그래서 물어본다. 사용자가 준 절대 경로 두 개(볼트 폴더 · Atlas 소스
 * 체크아웃)로 실행 가능한 설정을 만든다. 그 값은 화면 밖으로 나가지 않는다 —
 * 전송 0, 저장 0. 여기 있는 것은 전부 **순수 함수**다.
 *
 * ## 검사는 모양만 한다
 *
 * 브라우저는 그 폴더가 실재하는지 확인할 수 없다. 그러니 "확인했다"고 말하지
 * 않는다. 잡는 것: 빈 값 · 따옴표 · 상대 경로 · 홈 물결(`~`) · 여러 줄.
 * 못 잡는 것: 오타 난 실재하지 않는 경로 · 권한 · 볼트가 아닌 폴더.
 */

import { sourceCheckoutLaunch, type McpServerLaunch } from '@/shared/config';

import { type AgentClientId, filesForClient } from './agent-clients';
import { buildCodexConfigTomlTemplate, buildMcpConfigJson } from './ontology-starter';

/** 모양 검사가 잡아내는 것. `null` 이면 모양은 통과. */
export type ManualPathIssue = 'empty' | 'relative' | 'tilde' | 'multiline';

export interface ManualPathResult {
  /** 모양이 절대 경로인가. **실재 여부가 아니다.** */
  ok: boolean;
  /** 정규화된 값 — 따옴표·이스케이프·꼬리 슬래시를 걷어낸 뒤. */
  value: string;
  issue: ManualPathIssue | null;
}

/** 붙여넣기가 실제로 오는 모양들을 걷어낸다. */
function unwrap(raw: string): string {
  let value = raw.trim();

  // 따옴표 한 겹 — 터미널·Finder 복사가 흔히 씌운다.
  const quotes = ["'", '"', '`'];
  for (const quote of quotes) {
    if (value.length >= 2 && value.startsWith(quote) && value.endsWith(quote)) {
      value = value.slice(1, -1).trim();
      break;
    }
  }

  // Finder/Chrome 에서 끌어 놓으면 `file:///Users/...` 로 온다.
  if (value.startsWith('file://')) {
    const stripped = value.slice('file://'.length);
    try {
      value = decodeURI(stripped);
    } catch {
      value = stripped;
    }
  }

  // 터미널 드래그의 공백 이스케이프(`/Users/me/my\ notes`).
  value = value.replace(/\\ /g, ' ');

  // 꼬리 슬래시. 루트(`/`)만 남기고 걷어낸다 — 설정 값이 두 모양으로 갈리지 않게.
  while (value.length > 1 && (value.endsWith('/') || value.endsWith('\\'))) {
    value = value.slice(0, -1);
  }

  return value;
}

/**
 * 사용자가 붙여넣은 경로를 정규화하고 **모양만** 판정한다.
 *
 * 윈도우 드라이브 경로(`C:\Users\…`)도 절대 경로로 받는다 — 웹의 두 번째 일이
 * 정확히 "앱이 없는 OS(Windows·리눅스의 Chromium)"라서다.
 */
export function normalizeManualPath(raw: string): ManualPathResult {
  const value = unwrap(raw ?? '');
  if (value.length === 0) return { ok: false, value: '', issue: 'empty' };
  if (/[\r\n]/.test(value)) return { ok: false, value, issue: 'multiline' };
  // `~` 는 셸이 펼치는 것이고 **설정 파일에서는 펼쳐지지 않는다.** 그대로 두면
  // 붙지 않는 설정이 조용히 나간다 — 그게 이 함수가 존재하는 이유다.
  if (value.startsWith('~')) return { ok: false, value, issue: 'tilde' };
  if (value.startsWith('/')) return { ok: true, value, issue: null };
  if (/^[A-Za-z]:[\\/]/.test(value)) return { ok: true, value, issue: null };
  return { ok: false, value, issue: 'relative' };
}

export interface ManualConnectInput {
  /** 볼트 폴더 절대 경로. */
  vaultAbsolute: string;
  /** ontology-atlas 소스 체크아웃 절대 경로 — 서버를 띄우는 방법이 여기 산다. */
  checkoutAbsolute: string;
}

export interface ManualConnectConfig {
  client: AgentClientId;
  /** 이 도구가 읽는 파일 — 에이전트를 여는 폴더 기준 상대 경로. */
  file: string;
  /** 그 파일에 그대로 들어가는 본문. */
  body: string;
}

/** 소스 체크아웃 실행 계약. 앱 번들이 없는 자리의 바닥이다. */
export function manualLaunch({ checkoutAbsolute }: Pick<ManualConnectInput, 'checkoutAbsolute'>): McpServerLaunch {
  return sourceCheckoutLaunch(checkoutAbsolute);
}

/**
 * 이 도구를 이 볼트에 붙이는 설정 파일 한 벌.
 *
 * 파일 이름은 `AGENT_CLIENTS` 에서 온다 — 도구별 설정 위치의 진실원이 하나다.
 * 본문은 설치 앱이 쓰는 것과 **같은 빌더**를 지난다. 웹만의 두 번째 포맷을
 * 만들면 그중 하나가 조용히 틀린다.
 */
export function manualConnectConfig(
  client: AgentClientId,
  input: ManualConnectInput,
): ManualConnectConfig {
  const launch = manualLaunch(input);
  const file = filesForClient(client)[0] ?? '.mcp.json';
  const body =
    client === 'codex'
      ? buildCodexConfigTomlTemplate('vault', input.vaultAbsolute, launch)
      : buildMcpConfigJson('vault', input.vaultAbsolute, launch);
  return { client, file, body };
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@%+-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * 네 벌을 한 번에 만드는 CLI 한 줄 — 파일을 손으로 만들기 싫은 사람의 길.
 *
 * `agent-setup` 은 **없는 파일만** 만들고 기존 설정을 덮어쓰지 않는다.
 * `--root` 를 볼트로 두면 대상이 한 벌로 떨어진다(볼트 폴더를 프로젝트로 여는
 * 경우). 다른 코드베이스 루트에서 열 사람은 `--root` 만 바꾸면 된다.
 */
export function manualSetupCommand({ vaultAbsolute, checkoutAbsolute }: ManualConnectInput): string {
  return [
    'node',
    shellQuote(`${checkoutAbsolute}/cli/src/index.mjs`),
    'agent-setup',
    shellQuote(vaultAbsolute),
    '--root',
    shellQuote(vaultAbsolute),
    '--write',
  ].join(' ');
}

/** 만든 설정이 진짜 붙는지 사용자가 스스로 확인하는 한 줄. */
export function manualVerifyCommand({ vaultAbsolute, checkoutAbsolute }: ManualConnectInput): string {
  return [
    'node',
    shellQuote(`${checkoutAbsolute}/cli/src/index.mjs`),
    'mcp-verify',
    shellQuote(vaultAbsolute),
    '--timeout-ms',
    '15000',
  ].join(' ');
}

/** 체크아웃이 없는 사람을 위한 첫 줄. 목적지가 곧 체크아웃 경로가 된다. */
export const ATLAS_CLONE_COMMAND =
  'git clone https://github.com/wlsdks/ontology-atlas.git';
