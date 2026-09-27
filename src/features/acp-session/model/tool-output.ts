import { outputCount } from './tool-outcome';
import { architectureResultRows, fullBodyResultRows } from './tool-output-evidence';

/**
 * A transcript keeps what it reads of a tool answer: the row's count and, while a turn awaits
 * capture, its analysis rows. Past this size only the opening and length are held.
 */
export const TOOL_OUTPUT_PREVIEW_CHARS = 64 * 1024;

interface ToolOutputPreview {
  readonly preview: 'tool-output';
  readonly chars: number;
  readonly head: string;
  readonly total?: number;
  readonly count?: number;
}

export interface ToolOutputEvidence {
  readonly fullBody: ReadonlyArray<Record<string, unknown>>;
  readonly architecture: ReadonlyArray<Record<string, unknown>>;
}

/** Whether `value` serializes past `limit` characters; O(limit), escapes uncounted. */
function exceeds(value: unknown, limit: number): boolean {
  let size = 0;
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === 'string') size += current.length + 2;
    else if (Array.isArray(current)) {
      // Counted before its items are pushed, so a huge array is refused at once.
      size += 1 + current.length;
      if (size > limit) return true;
      for (let index = current.length - 1; index >= 0; index -= 1) stack.push(current[index]);
    } else if (current !== null && typeof current === 'object') {
      size += 2;
      for (const key in current) {
        if (!Object.hasOwn(current, key)) continue;
        size += key.length + 4;
        if (size > limit) return true;
        stack.push((current as Record<string, unknown>)[key]);
      }
    } else size += 5;
    if (size > limit) return true;
  }
  return false;
}

/**
 * A long `slice` is a view that keeps its whole parent alive in V8, so the head is copied out.
 * Measured: thirty 64K heads of 500K answers held 15 MB as slices, 2.5 MB copied.
 */
function detachedHead(serialized: string): string {
  const head = serialized.slice(0, TOOL_OUTPUT_PREVIEW_CHARS);
  return JSON.parse(JSON.stringify(head)) as string;
}

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

/** What a tool event keeps of `rawOutput`; `evidence` says a turn awaits capture. */
export function keepToolOutput(
  rawOutput: unknown,
  options: { evidence: boolean },
): { rawOutput: unknown; evidence: ToolOutputEvidence | null } {
  if (rawOutput === undefined || rawOutput === null || !exceeds(rawOutput, TOOL_OUTPUT_PREVIEW_CHARS)) {
    return { rawOutput, evidence: null };
  }
  const serialized = serialize(rawOutput);
  const count = outputCount(rawOutput);
  const preview: ToolOutputPreview = {
    preview: 'tool-output',
    chars: serialized.length,
    head: detachedHead(serialized),
    ...(count ? { [count.key]: count.value } : {}),
  };
  if (!options.evidence) return { rawOutput: preview, evidence: null };
  // Only answers whose JSON text carries a row's marker are walked.
  const fullBody = serialized.includes('bodyInfo') ? fullBodyResultRows(rawOutput) : [];
  const architecture = serialized.includes('architectureBrief:v1') ? architectureResultRows(rawOutput) : [];
  return {
    rawOutput: preview,
    evidence: fullBody.length > 0 || architecture.length > 0 ? { fullBody, architecture } : null,
  };
}
