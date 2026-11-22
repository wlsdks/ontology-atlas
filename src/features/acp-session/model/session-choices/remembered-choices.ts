/**
 * The chat tool and model a person last chose, per absolute folder path on this Mac. A convenience
 * only: an entry that no longer names an offered tool or model is ignored, never applied.
 */

const STORAGE_KEY = 'ontology-atlas:agent-choices';
const VERSION = 1;

type ToolEntry = readonly [string, string];
type ModelEntry = readonly [string, string, string];

interface Remembered {
  tools: Map<string, ToolEntry>;
  models: Map<string, ModelEntry>;
}

const modelKey = (folder: string, toolId: string) => `${folder}\u0000${toolId}`;
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function parse(raw: string | null): Remembered {
  const remembered: Remembered = { tools: new Map(), models: new Map() };
  if (!raw) return remembered;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return remembered;
  }
  if (!value || typeof value !== 'object') return remembered;
  const record = value as { v?: unknown; tools?: unknown; models?: unknown };
  if (record.v !== VERSION) return remembered;
  for (const item of Array.isArray(record.tools) ? record.tools : []) {
    if (Array.isArray(item) && item.length === 2 && item.every(isText)) {
      remembered.tools.set(item[0], [item[0], item[1]]);
    }
  }
  for (const item of Array.isArray(record.models) ? record.models : []) {
    if (Array.isArray(item) && item.length === 3 && item.every(isText)) {
      remembered.models.set(modelKey(item[0], item[1]), [item[0], item[1], item[2]]);
    }
  }
  return remembered;
}

function read(): Remembered {
  if (typeof window === 'undefined') return parse(null);
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return parse(null);
  }
}

function write(change: (remembered: Remembered) => void): void {
  if (typeof window === 'undefined') return;
  const remembered = read();
  change(remembered);
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: VERSION, tools: [...remembered.tools.values()], models: [...remembered.models.values()] }),
    );
  } catch {
    // A refused write only costs the convenience.
  }
}

export function forgetRememberedChoices(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing was readable, so nothing is kept.
  }
}

export function rememberedTool(folder: string | null): string | null {
  return folder ? (read().tools.get(folder)?.[1] ?? null) : null;
}

export function rememberTool(folder: string | null, toolId: string): void {
  if (!folder || !toolId) return;
  write((remembered) => remembered.tools.set(folder, [folder, toolId]));
}

export function rememberedModel(folder: string | null, toolId: string): string | null {
  return folder ? (read().models.get(modelKey(folder, toolId))?.[2] ?? null) : null;
}

export function rememberModel(folder: string | null, toolId: string, modelId: string): void {
  if (!folder || !toolId || !modelId) return;
  write((remembered) => remembered.models.set(modelKey(folder, toolId), [folder, toolId, modelId]));
}
