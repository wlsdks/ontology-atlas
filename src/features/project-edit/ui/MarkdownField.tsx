'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { controlClass, fieldClass } from '@/shared/ui/control-class';
import { MARKDOWN_PROSE_CLASS } from '@/shared/ui/markdown-prose';

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
            // The element styling this preview grew is now `shared/ui/markdown-prose`,
            // so a node body and a project description read the same way. This call site
            // keeps only its own container: minimum height, padding, base ink.
            MARKDOWN_PROSE_CLASS,
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
