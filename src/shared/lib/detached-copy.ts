/** A copy sharing no storage with its source: a long V8 `slice` keeps its whole parent alive. */
export function detachedCopy(text: string): string {
  return JSON.parse(JSON.stringify(text)) as string;
}
