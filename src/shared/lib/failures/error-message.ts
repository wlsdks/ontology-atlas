/**
 * Tauri `invoke` rejects with the bare string from `Err(String)`, not an `Error`, so an `instanceof
 * Error` guard would discard every desktop failure.
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
