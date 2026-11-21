import type { Ref } from 'react';

import type { AcpSlashCommand } from '@/features/acp-session';
import { RowButton } from '@/shared/ui';

/** The slash commands that match what is typed, one per row; hovering moves the active row, a click chooses it. */
export function SlashMenu({
  menuRef,
  label,
  matches,
  activeIndex,
  onActivate,
  onChoose,
}: {
  menuRef: Ref<HTMLUListElement>;
  label: string;
  matches: readonly AcpSlashCommand[];
  activeIndex: number;
  onActivate: (index: number) => void;
  onChoose: (name: string) => void;
}) {
  return (
    <ul
      ref={menuRef}
      data-testid="acp-chat-slash-menu"
      role="listbox"
      aria-label={label}
      className="atlas-scroll-quiet max-h-56 shrink-0 overflow-y-auto rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-elevated)] p-1"
    >
      {matches.map((command, index) => {
        const active = index === activeIndex;
        return (
          <li key={command.name} role="option" aria-selected={active}>
            <RowButton
              active={active}
              hoverSurface="lift"
              hoverInk="strong"
              onMouseEnter={() => onActivate(index)}
              onClick={() => onChoose(command.name)}
              className="w-full gap-2"
            >
              <span className="shrink-0 font-mono text-label">/{command.name}</span>
              {command.description ? (
                <span className="min-w-0 flex-1 truncate text-left text-label text-[color:var(--color-text-quaternary)]">
                  {command.description}
                </span>
              ) : null}
            </RowButton>
          </li>
        );
      })}
    </ul>
  );
}
