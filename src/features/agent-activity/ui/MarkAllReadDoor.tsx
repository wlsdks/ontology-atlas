import { Check } from 'lucide-react';

import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

export function MarkAllReadDoor({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onPress}
      data-testid="agent-inbox-mark-all-read"
      className={controlClass({
        shape: 'link',
        hoverInk: 'strong',
        className: 'shrink-0 text-[color:var(--color-text-tertiary)]',
      })}
    >
      <Check size={ICON_SIZE.sm} aria-hidden />
      {label}
    </button>
  );
}
