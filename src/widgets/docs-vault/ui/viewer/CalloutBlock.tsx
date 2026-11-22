import type { CalloutKind } from '../../lib/viewer/detect-callout';

const CALLOUT_STYLES: Record<
  CalloutKind,
  { border: string; bg: string; title: string; icon: string }
> = {
  note: {
    border: 'var(--color-indigo-line-a40)',
    bg: 'var(--color-indigo-a06)',
    title: 'var(--color-indigo-pale-a95)',
    icon: '📝',
  },
  tip: {
    border: 'var(--color-success-a40)',
    bg: 'var(--color-success-a06)',
    title: 'var(--color-success-text-a95)',
    icon: '💡',
  },
  info: {
    border: 'var(--color-indigo-line-a40)',
    bg: 'var(--color-indigo-a06)',
    title: 'var(--color-indigo-pale-a95)',
    icon: 'ℹ️',
  },
  warning: {
    border: 'var(--color-amber-source-a45)',
    bg: 'var(--color-amber-source-a06)',
    title: 'var(--color-amber-source-text-a95)',
    icon: '⚠️',
  },
  danger: {
    border: 'var(--color-danger-a50)',
    bg: 'var(--color-danger-a08)',
    title: 'var(--color-danger-text-strong)',
    icon: '🚫',
  },
  success: {
    border: 'var(--color-success-a45)',
    bg: 'var(--color-success-a07)',
    title: 'var(--color-success-text-a95)',
    icon: '✓',
  },
};

export function CalloutBlock({
  kind,
  title,
  children,
}: {
  kind: CalloutKind;
  title: string;
  children: React.ReactNode;
}) {
  const s = CALLOUT_STYLES[kind];
  return (
    <aside
      className="my-4 rounded-chip border-l-4 px-4 py-3"
      style={{ borderLeftColor: s.border, backgroundColor: s.bg }}
    >
      <div
        className="mb-1 flex items-center gap-1.5 text-body font-[var(--font-weight-emphasis)]"
        style={{ color: s.title }}
      >
        <span aria-hidden>{s.icon}</span>
        <span>{title}</span>
      </div>
      <div className="text-body leading-prose text-[color:var(--color-text-secondary)]">
        {children}
      </div>
    </aside>
  );
}
