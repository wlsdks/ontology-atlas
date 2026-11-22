import { asPlainRecord, asRecord } from '../adapter-json';
import { modeKeepsGate, partitionModes } from './mode-safety';

export interface AcpChoice {
  id: string;
  name: string;
  description: string | null;
  /** `_meta.kind` as the adapter stated it; the safety check reads it, so dropping it disarms that check. */
  metaKind?: string | null;
  /** The adapter's `_meta` verbatim, so a new field can be seen without first editing the parser. */
  meta?: Record<string, unknown> | null;
}

export function keepGateSafeModes(modes: AcpChoice[]): AcpChoice[] {
  return partitionModes(modes).offered;
}

interface ParsedChoices {
  choices: AcpChoice[];
  dropped: number;
}

function toChoices(raw: unknown, listKey: string): ParsedChoices {
  const block = asRecord(raw);
  const list = block && Array.isArray(block[listKey]) ? (block[listKey] as unknown[]) : [];
  const out: AcpChoice[] = [];
  let dropped = 0;
  for (const item of list) {
    const row = asRecord(item);
    const id =
      typeof row?.modelId === 'string'
        ? row.modelId
        : typeof row?.id === 'string'
          ? row.id
          : null;
    if (!id) {
      dropped += 1;
      continue;
    }
    const meta = asPlainRecord(row._meta);
    out.push({
      id,
      name: typeof row.name === 'string' && row.name.trim() ? row.name : id,
      description: typeof row.description === 'string' ? row.description : null,
      metaKind: typeof meta?.kind === 'string' ? meta.kind : null,
      meta,
    });
  }
  return { choices: out, dropped };
}

function currentId(raw: unknown, key: string): string | null {
  const block = asRecord(raw);
  const value = block?.[key];
  return typeof value === 'string' ? value : null;
}

export interface AcpSessionChoices {
  models: AcpChoice[];
  currentModelId: string | null;
  modes: AcpChoice[];
  currentModeId: string | null;
  /** Modes that remain in the list but whose outside-the-folder gate has not been measured. */
  unverifiedModeIds: string[];
  droppedModeCount: number;
}

export function readSessionChoices(result: Record<string, unknown>): AcpSessionChoices {
  const modelChoices = toChoices(result.models, 'availableModels');
  const modeChoices = toChoices(result.modes, 'availableModes');
  const modePartition = partitionModes(modeChoices.choices);
  return {
    models: modelChoices.choices,
    currentModelId: currentId(result.models, 'currentModelId'),
    modes: modePartition.offered,
    currentModeId: currentId(result.modes, 'currentModeId'),
    unverifiedModeIds: modePartition.unverified,
    droppedModeCount: modeChoices.dropped + modePartition.dropped,
  };
}

/**
 * A gate-removing mode is shown as current but not re-listed (`use-acp-session.ts` raises `gate-off`);
 * an unadvertised mode is shown marked unchecked.
 */
export function applyCurrentMode(
  choices: AcpSessionChoices,
  modeId: string,
): AcpSessionChoices {
  const id = modeId.trim();
  if (!id) return choices;
  if (choices.modes.some((mode) => mode.id === id)) return { ...choices, currentModeId: id };
  if (!modeKeepsGate(id)) return { ...choices, currentModeId: id };
  return {
    ...choices,
    currentModeId: id,
    modes: [...choices.modes, { id, name: id, description: null, metaKind: null, meta: null }],
    unverifiedModeIds: choices.unverifiedModeIds.includes(id)
      ? choices.unverifiedModeIds
      : [...choices.unverifiedModeIds, id],
  };
}
