import { readToolTargets } from './tool-targets';
import type {
  AcpEvent,
  AcpSessionStatus,
  PendingPermission,
} from './use-acp-session';

export type AcpTurnActivityState = 'planning' | 'editing' | 'verifying' | 'blocked';

export interface AcpTurnActivity {
  state: AcpTurnActivityState;
  summary: string | null;
  ontologySlug: string | null;
  toolName: string | null;
}

const VERIFY_TOOL = /(?:verify|validate|health|check|test|diagnos)/i;
const EDIT_TOOL = /(?:add|create|patch|write|edit|rename|replace|merge|delete|remove|move)/i;
const DONE_TOOL_STATES = new Set(['completed', 'failed', 'cancelled']);

function boundedSummary(value: string | null | undefined): string | null {
  const compact = value?.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.length <= 160 ? compact : `${compact.slice(0, 159).trimEnd()}…`;
}

function latestUserText(events: readonly AcpEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.kind === 'user') return boundedSummary(event.text);
  }
  return null;
}

function latestPendingTool(events: readonly AcpEvent[]): Extract<AcpEvent, { kind: 'tool' }> | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.kind === 'tool' && !DONE_TOOL_STATES.has(event.status)) return event;
  }
  return null;
}

function targetOf(rawInput: unknown, knownSlugs: ReadonlySet<string>): string | null {
  return readToolTargets(rawInput, knownSlugs)[0] ?? null;
}

export function deriveAcpTurnActivity(
  status: AcpSessionStatus,
  events: readonly AcpEvent[],
  pending: PendingPermission | null,
  knownSlugs: ReadonlySet<string>,
): AcpTurnActivity | null {
  if (status !== 'thinking') return null;
  const summary = latestUserText(events);

  if (pending) {
    return {
      state: 'blocked',
      summary,
      ontologySlug: targetOf(pending.request.rawInput, knownSlugs),
      toolName: pending.request.toolName,
    };
  }

  const tool = latestPendingTool(events);
  if (!tool) {
    return { state: 'planning', summary, ontologySlug: null, toolName: null };
  }
  const signature = `${tool.title} ${tool.toolKind}`;
  const state: AcpTurnActivityState = VERIFY_TOOL.test(signature)
    ? 'verifying'
    : EDIT_TOOL.test(signature)
      ? 'editing'
      : 'planning';
  return {
    state,
    summary,
    ontologySlug: targetOf(tool.rawInput, knownSlugs),
    toolName: tool.title.trim() || null,
  };
}
