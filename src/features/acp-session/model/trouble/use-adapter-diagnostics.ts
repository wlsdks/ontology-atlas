'use client';

import { useCallback, useRef, useState } from 'react';

/** The adapter's install progress is noise; the first lines state the cause. */
const STDERR_KEEP_LIMIT = 8;

/**
 * The adapter's first diagnostic lines, kept for the screen to show only when something goes
 * wrong; routinely it is an English warning eating the screen. `gateOffRef` stays true once a
 * `gate-off` line arrived, even one past the cap.
 */
export function useAdapterDiagnostics() {
  const [diagnostics, setDiagnostics] = useState<readonly string[]>([]);
  const gateOffRef = useRef(false);
  const stderrRef = useRef<string[]>([]);
  const resetDiagnostics = useCallback(() => {
    gateOffRef.current = false;
    stderrRef.current = [];
    setDiagnostics([]);
  }, []);
  const keepDiagnostic = useCallback((line: string) => {
    const text = line.trim();
    if (text.startsWith('gate-off')) gateOffRef.current = true;
    if (!text) return;
    const kept = stderrRef.current;
    if (kept.length >= STDERR_KEEP_LIMIT) return;
    kept.push(text);
    setDiagnostics([...kept]);
  }, []);
  return { diagnostics, gateOffRef, keepDiagnostic, resetDiagnostics };
}
