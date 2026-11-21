/**
 * Tauri `invoke` rejects with the bare string from `Err(String)`, not an `Error`, so an `instanceof
 * Error` guard would discard every desktop failure.
 */
export function toErrorMessage(error: unknown): string | null {
  if (typeof error === 'string') return nonEmpty(error);
  if (error instanceof Error) return nonEmpty(error.message);
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return nonEmpty(message);
  }
  return null;
}

function nonEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
