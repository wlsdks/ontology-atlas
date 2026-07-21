/**
 * Coerce an unknown thrown / rejected value into a human-readable message
 * string, or `null` when nothing meaningful can be extracted.
 *
 * Why this exists (P5 desktop retention, 2026-07-21): Tauri `invoke` rejects
 * with the **bare string** a `#[tauri::command]` returned through `Err(String)`
 * — not an `Error`. So a `err instanceof Error ? err.message : null` guard
 * silently discards every desktop filesystem failure (e.g. the previously
 * selected vault folder was moved and `fs::canonicalize` returned
 * "No such file or directory (os error 2)"), collapsing it into a generic
 * fallback banner with zero cause. Routing catch sites through this helper
 * keeps the real reason visible so failures are never silent.
 */
export function toErrorMessage(err: unknown): string | null {
  if (typeof err === 'string') return nonEmpty(err);
  if (err instanceof Error) return nonEmpty(err.message);
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return nonEmpty(message);
  }
  return null;
}

function nonEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
