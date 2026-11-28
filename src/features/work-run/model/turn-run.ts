import type { WorkRunCardState, WorkRunToolLabel } from './work-run';

/**
 * A Library turn that may write, held by the app session so it outlives the Library screen. Its
 * facts are what the agent reported: files are counted from completed tool calls, not the disk.
 */

export type TurnRunDoor = 'compile' | 'fix' | 'import' | 'propose' | 'typed';

export type TurnRunPhase = 'running' | 'asking' | 'stopping' | 'written' | 'answered' | 'stopped' | 'ended' | 'switched';

export type TurnRunLine =
  | { kind: 'connecting' }
  | { kind: 'reading'; page: string }
  | { kind: 'tool'; label: WorkRunToolLabel }
  | { kind: 'writingFile'; file: string }
  | { kind: 'answering' };

export type TurnAskAction = 'edit' | 'delete' | 'execute' | 'read' | 'ontology' | 'unknown';

export interface TurnRunAsk {
  action: TurnAskAction;
  target: string | null;
  since: number;
}

export interface TurnRun {
  id: number;
  folder: string;
  folderName: string;
  owner: string;
  runtimeId: string;
  agent: string;
  door: TurnRunDoor;
  request: string;
  startedAt: number;
  endedAt: number | null;
  phase: TurnRunPhase;
  line: TurnRunLine;
  ask: TurnRunAsk | null;
  /** Distinct folder-relative paths and concept changes the agent reported written, in order. */
  written: readonly string[];
  /** It ran a tool or wrote outside the folder: what changed is not known. */
  beyond: boolean;
  partial: readonly string[];
  switched: boolean;
  unseen: boolean;
  card: WorkRunCardState;
}

export interface TurnWorkReport {
  kind: string;
  label: WorkRunToolLabel | null;
  target: string | null;
  asking: boolean;
  request?: { action: TurnAskAction; target: string | null } | null;
  stopping?: boolean;
}

export interface TurnToolEvent {
  id: string;
  toolKind: string;
  status: string;
  title: string;
  rawInput?: unknown;
}

export type TurnToolFact = { kind: 'write'; name: string } | { kind: 'beyond' } | null;

export type TurnEndOutcome = 'completed' | 'cancelled' | 'failed';

const WRITE_KINDS = new Set(['edit', 'delete', 'move']);
const PATH_KEYS = ['filePath', 'file_path', 'path', 'targetPath', 'destination'] as const;
const CONCEPT_WRITE_TOOLS = new Set([
  'add_concept', 'add_concepts', 'patch_concept', 'rename_concept', 'merge_concepts',
  'delete_concept', 'absorb_document', 'add_relation', 'add_relations', 'remove_relation',
]);

export function isTurnActive(run: TurnRun | null): boolean {
  return run !== null && (run.phase === 'running' || run.phase === 'asking' || run.phase === 'stopping');
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function toolInput(rawInput: unknown): { input: Record<string, unknown> | null; mcpTool: string | null } {
  const envelope = record(rawInput);
  if (envelope && typeof envelope.server === 'string' && typeof envelope.tool === 'string') {
    return { input: record(envelope.arguments), mcpTool: envelope.tool };
  }
  return { input: envelope, mcpTool: null };
}

/** Folder-relative when the path lies inside the folder, null when it lies outside it. */
export function insideFolder(path: string, vaultRoot: string): string | null {
  const normalized = path.trim().replaceAll('\\', '/');
  const root = vaultRoot.replaceAll('\\', '/').replace(/\/+$/, '');
  const relative = normalized.startsWith(`${root}/`)
    ? normalized.slice(root.length + 1)
    : /^([a-zA-Z]:)?\//.test(normalized) ? null : normalized;
  if (relative === null || relative === '' || relative.split('/').includes('..')) return null;
  return relative.normalize('NFC');
}

export function turnToolFact(event: TurnToolEvent, vaultRoot: string): TurnToolFact {
  const kind = event.toolKind.trim().toLowerCase();
  if (event.status !== 'completed') return null;
  if (kind === 'execute') return { kind: 'beyond' };
  const { input, mcpTool } = toolInput(event.rawInput);
  const path = PATH_KEYS.map((key) => input?.[key]).find((value): value is string => typeof value === 'string' && value.trim() !== '');
  if (path && (WRITE_KINDS.has(kind) || mcpTool !== null)) {
    if (!WRITE_KINDS.has(kind) && !mcpTool?.includes('write')) return null;
    const relative = insideFolder(path, vaultRoot);
    return relative ? { kind: 'write', name: relative } : { kind: 'beyond' };
  }
  if (mcpTool && CONCEPT_WRITE_TOOLS.has(mcpTool)) {
    const slug = typeof input?.slug === 'string' ? input.slug : null;
    return { kind: 'write', name: slug ?? `${mcpTool}:${event.id}` };
  }
  return WRITE_KINDS.has(kind) && !path ? { kind: 'beyond' } : null;
}

/** Writes open when the turn ended: a call the agent reported running and never finished. */
function openWrites(events: readonly TurnToolEvent[], vaultRoot: string): string[] {
  const open: string[] = [];
  for (const event of events) {
    if (event.status !== 'in_progress' || !WRITE_KINDS.has(event.toolKind.trim().toLowerCase())) continue;
    const { input } = toolInput(event.rawInput);
    const path = PATH_KEYS.map((key) => input?.[key]).find((value): value is string => typeof value === 'string');
    const relative = path ? insideFolder(path, vaultRoot) : null;
    if (relative && !open.includes(relative)) open.push(relative);
  }
  return open;
}

export function beginTurnRun(input: Omit<TurnRun, 'endedAt' | 'phase' | 'line' | 'ask' | 'written' | 'beyond' | 'partial' | 'switched' | 'unseen' | 'card'>): TurnRun {
  return {
    ...input,
    endedAt: null,
    phase: 'running',
    line: { kind: 'connecting' },
    ask: null,
    written: [],
    beyond: false,
    partial: [],
    switched: false,
    unseen: false,
    card: 'open',
  };
}

function lineFor(current: TurnRunLine, work: TurnWorkReport): TurnRunLine {
  if (work.kind === 'answering') return { kind: 'answering' };
  if (work.kind === 'writing' && work.target) return { kind: 'writingFile', file: work.target };
  if (work.kind === 'reading' && work.target) return { kind: 'reading', page: work.target };
  if (work.label && work.label.text) return { kind: 'tool', label: work.label };
  return current;
}

function sameLine(a: TurnRunLine, b: TurnRunLine): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A request turns the card to waiting, bringing back a card hidden earlier; Stop holds it at stopping. */
export function observeTurnWork(run: TurnRun, work: TurnWorkReport | null, at: number): TurnRun {
  if (!isTurnActive(run) || work === null) return run;
  const stopping = run.phase === 'stopping' || work.stopping === true;
  const asking = !stopping && work.asking;
  const phase: TurnRunPhase = stopping ? 'stopping' : asking ? 'asking' : 'running';
  const line = lineFor(run.line, work);
  const request = asking ? work.request ?? null : null;
  const ask: TurnRunAsk | null = request
    ? run.ask && run.ask.action === request.action && run.ask.target === request.target
      ? run.ask
      : { action: request.action, target: request.target, since: run.ask?.since ?? at }
    : null;
  const card: WorkRunCardState = asking && run.phase !== 'asking' && run.card === 'hidden' ? 'open' : run.card;
  if (phase === run.phase && sameLine(line, run.line) && ask === run.ask && card === run.card) return run;
  return { ...run, phase, line: sameLine(line, run.line) ? run.line : line, ask, card };
}

export function observeTurnTool(run: TurnRun, fact: TurnToolFact): TurnRun {
  if (!fact || run.endedAt !== null) return run;
  if (fact.kind === 'beyond') return run.beyond ? run : { ...run, beyond: true };
  return run.written.includes(fact.name) ? run : { ...run, written: [...run.written, fact.name] };
}

export function stopTurnRun(run: TurnRun, switched: boolean): TurnRun {
  if (!isTurnActive(run)) return run;
  return { ...run, phase: 'stopping', ask: null, switched: run.switched || switched, card: switched || run.card === 'closed' ? 'open' : run.card };
}

/**
 * Ends the turn with what its transcript holds. Where its conversation is on screen nothing is
 * drawn; a turn stopped with nothing written and nothing run closes without a card.
 */
export function finishTurnRun(
  run: TurnRun,
  end: { outcome: TurnEndOutcome; events: readonly TurnToolEvent[]; vaultRoot: string },
  at: number,
  stageVisible: boolean,
): TurnRun {
  if (!isTurnActive(run)) return run;
  let next: TurnRun = run;
  for (const event of end.events) next = observeTurnTool(next, turnToolFact(event, end.vaultRoot));
  const stopped = run.phase === 'stopping' || end.outcome === 'cancelled';
  const phase: TurnRunPhase = run.switched
    ? 'switched'
    : stopped
      ? 'stopped'
      : end.outcome === 'failed'
        ? 'ended'
        : next.written.length > 0 ? 'written' : 'answered';
  const partial = phase === 'stopped' || phase === 'ended' || phase === 'switched' ? openWrites(end.events, end.vaultRoot) : [];
  const quiet = phase === 'stopped' && next.written.length === 0 && !next.beyond && partial.length === 0;
  const card: WorkRunCardState = quiet || (stageVisible && phase !== 'switched') ? 'closed' : 'open';
  return { ...next, phase, partial, ask: null, endedAt: at, card, unseen: card === 'open' && phase !== 'stopped' && phase !== 'switched' };
}

export function hideTurnCard(run: TurnRun): TurnRun {
  return run.card === 'open' && isTurnActive(run) ? { ...run, card: 'hidden' } : run;
}

export function closeTurnCard(run: TurnRun): TurnRun {
  return run.card === 'closed' && !run.unseen ? run : { ...run, card: 'closed', unseen: false };
}

export function seeTurn(run: TurnRun): TurnRun {
  return isTurnActive(run) ? run : closeTurnCard(run);
}

export function turnPageDoor(run: TurnRun): string | null {
  if (run.phase !== 'written' || run.written.length !== 1 || run.beyond) return null;
  const [only] = run.written;
  return only && /^wiki\/.+\.md$/.test(only) ? only.replace(/\.md$/, '') : null;
}
