/**
 * One manual write, as the bytes of its file before and after; `null` is "no file". Undo puts the
 * before bytes back only while the file still holds the after bytes.
 */
export interface ManualWrite {
  id: number;
  /** The folder the write was made in; Undo never writes into another one. */
  folder: string | null;
  slug: string;
  before: string | null;
  after: string | null;
}

export type UndoStep =
  | { action: "delete" }
  | { action: "create"; content: string }
  | { action: "save"; content: string };

export function planUndo(write: ManualWrite, currentText: string | null): UndoStep | "changed" {
  if (currentText !== write.after) return "changed";
  if (write.before === null) return { action: "delete" };
  if (write.after === null) return { action: "create", content: write.before };
  return { action: "save", content: write.before };
}
