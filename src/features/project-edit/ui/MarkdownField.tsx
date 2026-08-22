'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { controlClass, fieldClass } from '@/shared/ui/control-class';

interface Props {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
}

type Mode = 'write' | 'preview';

/**
 * A markdown input field, with a Write/Preview tab toggle for checking the rendering live.
 */
export function MarkdownField({ id, value, onChange, placeholder, rows = 8 }: Props) {
  const t = useTranslations('settings.markdown');
  const [mode, setMode] = useState<Mode>('write');

  return (
    <div className="flex flex-col gap-2 rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] p-2">
      <div className="flex items-center gap-1 border-b border-[color:var(--color-overlay-2)] pb-1.5">
        <TabButton active={mode === 'write'} onClick={() => setMode('write')}>
          {t('tabWrite')}
        </TabButton>
        <TabButton active={mode === 'preview'} onClick={() => setMode('preview')}>
          {t('tabPreview')}
        </TabButton>
        <span className="ml-auto font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
          {t('footer')}
        </span>
      </div>
      {mode === 'write' ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={fieldClass({
            frame: 'bare',
            multiline: true,
            className: 'rounded-chip px-2 py-1.5 font-mono text-body-lg resize-y',
          })}
        />
      ) : (
        <div
          className={cn(
            'min-h-[160px] rounded-chip px-2 py-1.5 text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]',
            // Basic markdown styling.
            '[&>h1]:mt-3 [&>h1]:mb-2 [&>h1]:text-display [&>h1]:font-[var(--font-weight-signature)] [&>h1]:text-[color:var(--color-text-primary)]',
            '[&>h2]:mt-3 [&>h2]:mb-1.5 [&>h2]:text-title [&>h2]:font-[var(--font-weight-signature)] [&>h2]:text-[color:var(--color-text-primary)]',
            '[&>h3]:mt-2 [&>h3]:mb-1 [&>h3]:text-body-lg [&>h3]:font-[var(--font-weight-signature)] [&>h3]:text-[color:var(--color-text-primary)]',
            '[&>p]:my-1.5',
            '[&>ul]:my-1.5 [&>ul]:list-disc [&>ul]:pl-5',
            '[&>ol]:my-1.5 [&>ol]:list-decimal [&>ol]:pl-5',
            '[&_code]:rounded-micro [&_code]:bg-[color:var(--color-elevated)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-body',
            '[&>pre]:rounded-chip [&>pre]:bg-[color:var(--color-elevated)] [&>pre]:p-3 [&>pre]:my-2 [&>pre]:font-mono [&>pre]:text-body [&>pre>code]:bg-transparent [&>pre>code]:px-0',
            '[&_a]:text-[color:var(--color-indigo-accent)] [&_a]:underline',
            '[&>blockquote]:border-l-2 [&>blockquote]:border-[color:var(--color-border-strong)] [&>blockquote]:pl-3 [&>blockquote]:text-[color:var(--color-text-tertiary)]',
          )}
        >
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <p className="text-[color:var(--color-text-quaternary)]">{t('previewEmpty')}</p>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      /*
       * A borderless inset segment. `text-[10px]` is not a step on the ramp, so **it had no
       * paired line-height and fell to an inherited 1.5 (15px)** — the quiet failure mode of
       * an off-ramp size (see `.claude/rules/design.md`, "a size step carries its own
       * line-height"). Raising it to `text-label` (11px/16px) attaches the pair.
       * The pressed treatment is aligned to the ramp's majority (a16 plus primary ink) —
       * the same dialect normalization already done for the footprint presets.
       */
      className={controlClass({
        shape: 'segment',
        active,
        className: cn(
          'font-mono uppercase tracking-[var(--tracking-caps-10)]',
          active ? '' : 'hover:text-[color:var(--color-text-primary)]',
        ),
      })}
    >
      {children}
    </button>
  );
}
