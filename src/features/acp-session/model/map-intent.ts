import { MCP_SERVER_NAME } from '@/shared/config';

import { VAULT_MCP_SERVER_NAME } from './vault-mcp-server';

/**
 * ACP가 실제로 부른 Atlas 읽기 도구를 지도 상태로 옮긴다.
 *
 * 에이전트 답변의 문장을 파싱하지 않는다. 문장은 같은 뜻을 여러 방식으로 쓸 수
 * 있고, 아직 도구가 끝나지 않았는데도 그럴듯한 슬러그를 말할 수 있다. 반면
 * `tool_call.rawInput`은 도구가 받은 정확한 인자다. 현재 볼트에 실재하는 이름만
 * 통과시키면 지도는 추측 없이 같은 대상을 가리킬 수 있다.
 */
export type AcpMapIntent =
  | { kind: 'focus'; slug: string; toolCallId: string }
  | { kind: 'path'; from: string; to: string; toolCallId: string };

export interface AcpMapIntentEvent {
  kind: string;
  id: string;
  title?: string;
  rawInput?: unknown;
  [key: string]: unknown;
}

const ATLAS_SERVER_NAMES = new Set([VAULT_MCP_SERVER_NAME, MCP_SERVER_NAME]);

function atlasToolName(title: string | undefined): 'get_concept' | 'find_path' | null {
  if (!title) return null;
  for (const serverName of ATLAS_SERVER_NAMES) {
    const prefix = `mcp__${serverName}__`;
    if (!title.startsWith(prefix)) continue;
    const name = title.slice(prefix.length);
    if (name === 'get_concept' || name === 'find_path') return name;
  }
  return null;
}

function recordInput(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 마지막 사용자 발화 이후의 도구만 본다. 같은 차례에서 `find_path`가 한 번이라도
 * 성립하면 이후 설명을 위한 `get_concept`보다 경로 의도가 우선한다 — 그렇지 않으면
 * 완성된 경로가 마지막 읽기 노드 하나로 되돌아간다.
 */
export function deriveAcpMapIntent(
  events: readonly AcpMapIntentEvent[],
  knownSlugs: ReadonlySet<string>,
): AcpMapIntent | null {
  if (knownSlugs.size === 0) return null;
  let turnStart = 0;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.kind !== 'user') continue;
    turnStart = index + 1;
    break;
  }

  let focus: Extract<AcpMapIntent, { kind: 'focus' }> | null = null;
  let path: Extract<AcpMapIntent, { kind: 'path' }> | null = null;
  for (let index = turnStart; index < events.length; index += 1) {
    const event = events[index];
    if (!event || event.kind !== 'tool') continue;
    const tool = atlasToolName(event.title);
    const input = recordInput(event.rawInput);
    if (!tool || !input) continue;
    if (tool === 'get_concept') {
      const slug = input.slug;
      if (typeof slug === 'string' && knownSlugs.has(slug)) {
        focus = { kind: 'focus', slug, toolCallId: event.id };
      }
      continue;
    }
    const from = input.from;
    const to = input.to;
    if (
      typeof from === 'string' &&
      typeof to === 'string' &&
      from !== to &&
      knownSlugs.has(from) &&
      knownSlugs.has(to)
    ) {
      path = { kind: 'path', from, to, toolCallId: event.id };
    }
  }
  return path ?? focus;
}
