import type { ChatSuggestion } from '@/features/acp-session';
import { cn } from '@/shared/lib/cn';
import { RowButton } from '@/shared/ui';

interface SuggestionRowsProps {
  heading: string;
  testId: string;
  centered: boolean;
  items: readonly ChatSuggestion[];
  labelFor: (suggestion: ChatSuggestion) => string;
  onSelect: (suggestion: ChatSuggestion) => void;
}

/** One shared visual/keyboard grammar for empty-chat and post-turn actions. */
export function SuggestionRows({
  heading,
  testId,
  centered,
  items,
  labelFor,
  onSelect,
}: SuggestionRowsProps) {
  return (
    <div className="grid gap-1.5" data-testid={testId}>
      <p
        className={cn(
          'text-caption leading-caption text-[color:var(--color-text-quaternary)]',
          centered && 'text-center',
        )}
      >
        {heading}
      </p>
      {items.map((suggestion) => (
        <RowButton
          key={suggestion.kind}
          size="md"
          tone="secondary"
          hoverInk="strong"
          hoverSurface="lift"
          className="rounded-chip bg-[color:var(--color-overlay-1)] px-2.5 py-1.5"
          data-testid={`acp-chat-suggestion-${suggestion.kind}`}
          onClick={() => onSelect(suggestion)}
        >
          <span className="min-w-0 break-keep">
            {labelFor(suggestion)}
          </span>
        </RowButton>
      ))}
    </div>
  );
}

/** Text, not buttons: the rows become buttons only once the session can take them. */
export function StartingSuggestionPreview({ heading, items, labelFor }: {
  heading: string;
  items: readonly ChatSuggestion[];
  labelFor: (suggestion: ChatSuggestion) => string;
}) {
  return (
    <div className="grid w-full gap-2 border-t border-[color:var(--color-divider)] pt-4 text-center" data-testid="acp-starting-suggestions">
      <p className="text-caption leading-caption text-[color:var(--color-text-tertiary)]">{heading}</p>
      <ul className="grid gap-2">
        {items.map((suggestion) => (
          <li
            key={suggestion.kind}
            data-testid={`acp-starting-suggestion-${suggestion.kind}`}
            className="text-balance text-label leading-label text-[color:var(--color-text-tertiary)]"
          >
            {labelFor(suggestion)}
          </li>
        ))}
      </ul>
    </div>
  );
}
