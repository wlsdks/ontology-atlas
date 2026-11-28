import { parseAtlasToolCall, readToolCommandArgument, readToolFallbackTarget, type AcpEvent } from '@/features/acp-session';

import { canonicalToolTitle, commandRowWords, toolLabel, withKindFallback, type ToolLabel } from './tool-label';

/**
 * What the agent is doing right now, read only from what the turn has reported. With no open
 * tool call the turn is `thinking`, unless answer text is still arriving.
 */
export type TurnActivityKind = 'thinking' | 'reading' | 'searching' | 'writing' | 'running' | 'answering';

export interface TurnActivity {
  kind: TurnActivityKind;
  label: ToolLabel | null;
  target: string | null;
  steps: number;
  /** Distinct concepts and relations this turn's finished vault writes report as written. */
  written: TurnWrites;
}

export interface TurnWrites {
  concepts: number;
  relations: number;
}

const SETTLED = new Set(['completed', 'failed', 'cancelled']);

/** Text counts as still arriving for this long after the turn's last update; the turn clock ticks once a second. */
export const TEXT_ARRIVING_MS = 2_500;

const KNOWN_TOOL_KIND: Readonly<Record<string, TurnActivityKind>> = {
  connect: 'reading',
  read: 'reading',
  readConstellation: 'reading',
  readSource: 'reading',
  readCode: 'reading',
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

const CONCEPT_WRITE_TOOLS = new Set(['add_concept', 'add_concepts', 'patch_concept', 'rename_concept', 'merge_concepts', 'absorb_document']);
const RELATION_WRITE_TOOLS = new Set(['add_relation', 'add_relations']);
/** How deep a result may sit inside the adapter's envelope (`result` → `content` → text block → JSON). */
const RESULT_DEPTH = 6;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function vaultWriteResult(raw: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > RESULT_DEPTH) return null;
  if (typeof raw === 'string') {
    try {
      return vaultWriteResult(JSON.parse(raw), depth + 1);
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const found = vaultWriteResult(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(raw);
  if (!record || record.isError === true) return null;
  if ('ok' in record || Array.isArray(record.concepts) || Array.isArray(record.relations)) return record;
  for (const key of ['structuredContent', 'result', 'content', 'text', 'output']) {
    const found = record[key] === undefined ? null : vaultWriteResult(record[key], depth + 1);
    if (found) return found;
  }
  return null;
}

const wroteRow = (row: unknown) => asRecord(row)?.ok === true && asRecord(row)?.changed === true;

/** What a written row names, so a concept patched five times counts as one concept. */
function rowIdentity(row: Record<string, unknown>, fallback: string): string {
  if (typeof row.slug === 'string') return row.slug;
  if (typeof row.from === 'string' && typeof row.to === 'string') return `${row.from} ${String(row.type)} ${row.to}`;
  return fallback;
}

function writtenIdentities(result: Record<string, unknown>, callId: string): string[] {
  const rows = Array.isArray(result.concepts) ? result.concepts : Array.isArray(result.relations) ? result.relations : [result];
  return rows.flatMap((row, index) => {
    const record = asRecord(row);
    return record && wroteRow(record) ? [rowIdentity(record, `${callId}#${index}`)] : [];
  });
}

interface WrittenSets {
  concepts: Set<string>;
  relations: Set<string>;
}

function collectWrites(written: WrittenSets, event: ToolEvent, callId: string): void {
  if (event.status !== 'completed') return;
  const name = parseAtlasToolCall(event.title, event.rawInput)?.name;
  const target = name && CONCEPT_WRITE_TOOLS.has(name) ? written.concepts : name && RELATION_WRITE_TOOLS.has(name) ? written.relations : null;
  if (!target) return;
  const result = vaultWriteResult(event.rawOutput);
  if (result) for (const identity of writtenIdentities(result, callId)) target.add(identity);
}

function kindOf(event: ToolEvent, label: ToolLabel): TurnActivityKind {
  // Every vault tool this table does not call a read or a search changes the folder.
  if (label.kind === 'known') return KNOWN_TOOL_KIND[label.text] ?? 'writing';
  return PROTOCOL_KIND[event.toolKind] ?? 'thinking';
}

export function turnActivity(
  events: readonly AcpEvent[],
  lastUserEventIndex: number,
  vaultServerName: string,
  /**
   * Whether the turn's last update is recent enough to call its text still arriving. An agent
   * that says a sentence and then goes quiet is thinking again, not writing.
   */
  textArriving: boolean,
): TurnActivity {
  let steps = 0;
  const writtenSets: WrittenSets = { concepts: new Set(), relations: new Set() };
  let open: ToolEvent | null = null;
  let last: AcpEvent | null = null;
  for (let index = lastUserEventIndex + 1; index < events.length; index += 1) {
    const event = events[index];
    last = event;
    if (event.kind !== 'tool') continue;
    steps += 1;
    collectWrites(writtenSets, event, String(index));
    if (!SETTLED.has(event.status)) open = event;
  }
  const written: TurnWrites = { concepts: writtenSets.concepts.size, relations: writtenSets.relations.size };
  if (open) {
    const title = canonicalToolTitle(open.title, open.rawInput);
    const label = withKindFallback(toolLabel(title, vaultServerName), title, vaultServerName, open.toolKind);
    const command = commandRowWords(label, readToolCommandArgument(open.rawInput));
    if (command) return { kind: kindOf(open, command.label), label: command.label, target: command.target, steps, written };
    return { kind: kindOf(open, label), label, target: readToolFallbackTarget(open.rawInput)?.value ?? null, steps, written };
  }
  const answering = textArriving && last?.kind === 'agent' && last.text.trim().length > 0;
  return { kind: answering ? 'answering' : 'thinking', label: null, target: null, steps, written };
}
