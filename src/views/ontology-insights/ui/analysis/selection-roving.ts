'use client';

import { useState, type KeyboardEvent } from 'react';

export function useSelectionRoving(scopeSelector: string, rowSelector: string) {
  const [roving, setRoving] = useState<string | null>(null);

  function moveFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const rows = [...event.currentTarget.closest(scopeSelector)!.querySelectorAll<HTMLElement>(rowSelector)];
    const at = rows.indexOf(event.currentTarget);
    const next = event.key === 'ArrowDown' ? rows[at + 1] : event.key === 'ArrowUp' ? rows[at - 1] : event.key === 'Home' ? rows[0] : event.key === 'End' ? rows.at(-1) : null;
    if (next === null) return;
    event.preventDefault();
    next?.focus();
  }

  const stopOf = (shown: ReadonlySet<string>, selected: string | null) => [roving, selected].find(id => id && shown.has(id)) ?? shown.values().next().value ?? null;
  return { moveFocus, setRoving, stopOf };
}
