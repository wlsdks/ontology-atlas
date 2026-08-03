'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';

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
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
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
          className={cn(
            'rounded-chip bg-transparent px-2 py-1.5 font-mono text-body-lg text-[color:var(--color-text-primary)]',
            'placeholder:text-[color:var(--color-text-quaternary)]',
            'focus:outline-none',
            'resize-y',
          )}
        />
      ) : (
        <div
          className={cn(
            'min-h-[160px] rounded-chip px-2 py-1.5 text-body-lg leading-relaxed text-[color:var(--color-text-secondary)]',
            // 간단한 마크다운 스타일
            '[&>h1]:mt-3 [&>h1]:mb-2 [&>h1]:text-xl [&>h1]:font-[var(--font-weight-signature)] [&>h1]:text-[color:var(--color-text-primary)]',
            '[&>h2]:mt-3 [&>h2]:mb-1.5 [&>h2]:text-lg [&>h2]:font-[var(--font-weight-signature)] [&>h2]:text-[color:var(--color-text-primary)]',
            '[&>h3]:mt-2 [&>h3]:mb-1 [&>h3]:text-base [&>h3]:font-[var(--font-weight-signature)] [&>h3]:text-[color:var(--color-text-primary)]',
            '[&>p]:my-1.5',
            '[&>ul]:my-1.5 [&>ul]:list-disc [&>ul]:pl-5',
            '[&>ol]:my-1.5 [&>ol]:list-decimal [&>ol]:pl-5',
            '[&_code]:rounded-micro [&_code]:bg-[color:var(--color-elevated)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px]',
            '[&>pre]:rounded-chip [&>pre]:bg-[color:var(--color-elevated)] [&>pre]:p-3 [&>pre]:my-2 [&>pre]:font-mono [&>pre]:text-[12px] [&>pre>code]:bg-transparent [&>pre>code]:px-0',
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
       * 보더 없는 인셋 세그먼트다. `text-[10px]` 은 램프에 없는 스텝이라
       * **짝인 행간이 없어 상속 1.5(15px)로 떨어져 있었다** — 램프 밖 크기의
       * 조용한 실패 모드 그 자체다(`design.md` "크기 스텝이 자기 행간을
       * 싣는다"). `text-label`(11px/16px)로 올리면 짝이 붙는다.
       * 눌림 표현도 램프의 다수(a16 + 1차 잉크)로 맞춘다 — 발자국 프리셋에서
       * 이미 같은 방언 정규화를 했다.
       */
      className={controlClass({
        shape: 'segment',
        active,
        className: cn(
          'font-mono uppercase tracking-[0.1em]',
          active ? '' : 'hover:text-[color:var(--color-text-primary)]',
        ),
      })}
    >
      {children}
    </button>
  );
}
