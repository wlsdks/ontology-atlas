'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/shared/lib/cn';

interface Props {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
}

type Mode = 'write' | 'preview';

/**
 * 마크다운 입력 필드. Write/Preview 탭 토글로 실시간 렌더링 확인.
 */
export function MarkdownField({ id, value, onChange, placeholder, rows = 8 }: Props) {
  const [mode, setMode] = useState<Mode>('write');

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] p-2">
      <div className="flex items-center gap-1 border-b border-[color:var(--color-overlay-2)] pb-1.5">
        <TabButton active={mode === 'write'} onClick={() => setMode('write')}>
          Write
        </TabButton>
        <TabButton active={mode === 'preview'} onClick={() => setMode('preview')}>
          Preview
        </TabButton>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
          Markdown · GFM
        </span>
      </div>
      {mode === 'write' ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={cn(
            'rounded-md bg-transparent px-2 py-1.5 font-mono text-sm text-[color:var(--color-text-primary)]',
            'placeholder:text-[color:var(--color-text-quaternary)]',
            'focus:outline-none',
            'resize-y',
          )}
        />
      ) : (
        <div
          className={cn(
            'min-h-[160px] rounded-md px-2 py-1.5 text-sm leading-relaxed text-[color:var(--color-text-secondary)]',
            // 간단한 마크다운 스타일
            '[&>h1]:mt-3 [&>h1]:mb-2 [&>h1]:text-xl [&>h1]:font-[var(--font-weight-signature)] [&>h1]:text-[color:var(--color-text-primary)]',
            '[&>h2]:mt-3 [&>h2]:mb-1.5 [&>h2]:text-lg [&>h2]:font-[var(--font-weight-signature)] [&>h2]:text-[color:var(--color-text-primary)]',
            '[&>h3]:mt-2 [&>h3]:mb-1 [&>h3]:text-base [&>h3]:font-[var(--font-weight-signature)] [&>h3]:text-[color:var(--color-text-primary)]',
            '[&>p]:my-1.5',
            '[&>ul]:my-1.5 [&>ul]:list-disc [&>ul]:pl-5',
            '[&>ol]:my-1.5 [&>ol]:list-decimal [&>ol]:pl-5',
            '[&_code]:rounded [&_code]:bg-[color:var(--color-elevated)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]',
            '[&>pre]:rounded-md [&>pre]:bg-[color:var(--color-elevated)] [&>pre]:p-3 [&>pre]:my-2 [&>pre]:font-mono [&>pre]:text-[12px] [&>pre>code]:bg-transparent [&>pre>code]:px-0',
            '[&_a]:text-[color:var(--color-indigo-accent)] [&_a]:underline',
            '[&>blockquote]:border-l-2 [&>blockquote]:border-[color:var(--color-border-strong)] [&>blockquote]:pl-3 [&>blockquote]:text-[color:var(--color-text-tertiary)]',
          )}
        >
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <p className="text-[color:var(--color-text-quaternary)]">미리볼 내용 없음</p>
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
      className={cn(
        'rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors',
        active
          ? 'bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-indigo-accent)]'
          : 'text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]',
      )}
    >
      {children}
    </button>
  );
}
