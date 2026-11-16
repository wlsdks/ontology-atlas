import { readToolFallbackTarget, type AcpEvent } from '@/features/acp-session';

import { toolLabel, withKindFallback, type ToolLabel } from './tool-label';

/**
 * What the agent is doing right now, read only from what the turn has reported. Nothing here is
 * guessed from elapsed time: with no open tool call and no answer text, the turn is `thinking`.
 */
export type TurnActivityKind = 'thinking' | 'reading' | 'searching' | 'writing' | 'running' | 'answering';

export interface TurnActivity {
  kind: TurnActivityKind;
  /** The open call's name, in the same words its transcript row uses; absent without an open call. */
  label: ToolLabel | null;
  /** The file, concept or query the open call names. */
  target: string | null;
  /** Tool calls this turn has opened so far. */
  steps: number;
}

const SETTLED = new Set(['completed', 'failed', 'cancelled']);

const KNOWN_TOOL_KIND: Readonly<Record<string, TurnActivityKind>> = {
  connect: 'reading',
  read: 'reading',
  readConstellation: 'reading',
  readSource: 'reading',
  readHistory: 'reading',
  readCode: 'reading',
  findEvidence: 'searching',
  findOrphans: 'searching',
  check: 'searching',
  checkPages: 'searching',
};

const PROTOCOL_KIND: Readonly<Record<string, TurnActivityKind>> = {
  read: 'reading',
  search: 'searching',
  fetch: 'searching',
  edit: 'writing',
  delete: 'writing',
  move: 'writing',
  execute: 'running',
};

type ToolEvent = Extract<AcpEvent, { kind: 'tool' }>;

function kindOf(event: ToolEvent, label: ToolLabel): TurnActivityKind {
  // Every vault tool this table does not call a read or a search changes the folder.
  if (label.kind === 'known') return KNOWN_TOOL_KIND[label.text] ?? 'writing';
  return PROTOCOL_KIND[event.toolKind] ?? 'thinking';
}

export function turnActivity(
  events: readonly AcpEvent[],
  lastUserEventIndex: number,
  vaultServerName: string,
): TurnActivity {
  let steps = 0;
  let open: ToolEvent | null = null;
  let last: AcpEvent | null = null;
  for (let index = lastUserEventIndex + 1; index < events.length; index += 1) {
    const event = events[index];
    last = event;
    if (event.kind !== 'tool') continue;
    steps += 1;
    if (!SETTLED.has(event.status)) open = event;
  }
  if (open) {
    const label = withKindFallback(toolLabel(open.title, vaultServerName), open.title, vaultServerName, open.toolKind);
    return { kind: kindOf(open, label), label, target: readToolFallbackTarget(open.rawInput)?.value ?? null, steps };
  }
  const answering = last?.kind === 'agent' && last.text.trim().length > 0;
  return { kind: answering ? 'answering' : 'thinking', label: null, target: null, steps };
}
