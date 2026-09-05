'use client';

import { ChevronLeft, ChevronRight, MapPinned, MessageCircle, Presentation } from 'lucide-react';
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslations } from 'next-intl';

import type {
  AcpPresentationScene,
  AcpPresentationTrace,
} from '@/features/acp-session';
import { Button, Chip } from '@/shared/ui';
import { badgeClass } from '@/shared/ui/badge-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';

export function AcpPresentationPanel({
  trace,
  activeIndex,
  onChangeScene,
  onFocusCitation,
  onOpenMap,
  onAsk,
  onClose,
}: {
  trace: AcpPresentationTrace;
  activeIndex: number;
  onChangeScene: (index: number) => void;
  onFocusCitation?: (slug: string, toolCallId: string) => void;
  onOpenMap?: (scene: AcpPresentationScene) => void;
  onAsk: (scene: AcpPresentationScene) => void;
  onClose: () => void;
}) {
  const t = useTranslations('acpChat.presentation');
  const rootRef = useRef<HTMLElement | null>(null);
  const scene = trace.scenes[activeIndex];
  const last = activeIndex === trace.scenes.length - 1;

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      const interactive = target !== rootRef.current && Boolean(
        target?.closest('button, a, input, textarea, select, [contenteditable="true"]'),
      );
      if (interactive) return;
      if (event.key === 'ArrowLeft' && activeIndex > 0) {
        event.preventDefault();
        onChangeScene(activeIndex - 1);
        return;
      }
      if (event.key === 'ArrowRight' && !last) {
        event.preventDefault();
        onChangeScene(activeIndex + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [activeIndex, last, onChangeScene, onClose]);

  return (
    <section
      ref={rootRef}
      tabIndex={-1}
      data-testid="acp-presentation"
      aria-label={t('ariaLabel')}
      className="flex h-full min-h-0 flex-col gap-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-accent)]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-[color:var(--color-divider)] pb-3">
        <div className="grid min-w-0 gap-1">
          <span className="flex items-center gap-1.5 text-caption uppercase tracking-wide text-[color:var(--color-text-quaternary)]">
            <Presentation size={ICON_SIZE.sm} aria-hidden />
            {t('eyebrow')}
          </span>
          <h2 className="truncate text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
            {t('title')}
          </h2>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={onClose}>
          <ChevronLeft size={ICON_SIZE.sm} aria-hidden />
          {t('backToChat')}
        </Button>
      </header>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-label leading-label text-[color:var(--color-text-tertiary)]">
            {t('progress', { current: activeIndex + 1, total: trace.scenes.length })}
          </span>
          <span
            className={badgeClass({
              shape: 'micro',
              className:
                'bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-tertiary)]',
            })}
          >
            {t('sourceHidden', { count: trace.sourceHidden.fullBodyConcepts })}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={t('progressAria')}
          aria-valuemin={1}
          aria-valuemax={trace.scenes.length}
          aria-valuenow={activeIndex + 1}
          className="flex gap-1"
        >
          {trace.scenes.map((item, index) => (
            <span
              key={item.id}
              aria-hidden
              className={`h-px flex-1 ${
                index <= activeIndex
                  ? 'bg-[color:var(--color-indigo-accent)]'
                  : 'bg-[color:var(--color-border-soft)]'
              }`}
            />
          ))}
        </div>
      </div>

      <article
        key={scene.id}
        aria-live="polite"
        className="agent-next-step-in atlas-scroll-quiet flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]"
      >
        <div className="grid gap-2">
          <span
            className={badgeClass({
              shape: 'tag',
              className: scene.qualification === 'limited'
                ? 'w-fit border border-dashed border-[color:var(--color-amber-source-a42)] bg-[color:var(--color-amber-source-a08)] text-[color:var(--color-amber-source-text-a95)]'
                : 'w-fit border border-[color:var(--color-indigo-a22)] bg-[color:var(--color-indigo-a12)] text-[color:var(--color-text-secondary)]',
            })}
          >
            {t(`qualification.${scene.qualification}`)}
          </span>
          <h3 className="text-title leading-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
            {scene.title ?? t('sceneFallback', { current: activeIndex + 1 })}
          </h3>
        </div>

        <div className="break-keep text-body-lg leading-prose text-[color:var(--color-text-secondary)] [&_code]:font-mono [&_code]:text-label [&_code]:text-[color:var(--color-text-tertiary)] [&_p]:m-0">
          <ReactMarkdown>{scene.body}</ReactMarkdown>
        </div>

        <div className="mt-auto grid gap-2 border-t border-[color:var(--color-divider)] pt-3">
          <p className="text-caption uppercase tracking-wide text-[color:var(--color-text-quaternary)]">
            {t('evidence')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {scene.citationReads.map(({ slug, toolCallId }) => (
              onFocusCitation ? (
                <Chip
                  key={slug}
                  size="sm"
                  tone="secondary"
                  hoverInk="strong"
                  hoverBorder="strong"
                  onClick={() => onFocusCitation(slug, toolCallId)}
                  data-testid="acp-presentation-citation"
                  data-citation-slug={slug}
                >
                  {slug}
                </Chip>
              ) : (
                <span
                  key={slug}
                  data-testid="acp-presentation-citation"
                  data-citation-slug={slug}
                  className={badgeClass({
                    shape: 'tag',
                    className: 'border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)]',
                  })}
                >
                  {slug}
                </span>
              )
            ))}
          </div>
        </div>
      </article>

      <footer className="grid gap-2">
        {onOpenMap ? (
          <Button
            variant="outline"
            size="sm"
            data-testid="acp-presentation-open-map"
            className="w-full"
            onClick={() => onOpenMap(scene)}
          >
            <MapPinned size={ICON_SIZE.sm} aria-hidden />
            {t('openOnMap')}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          data-testid="acp-presentation-ask"
          className="w-full"
          onClick={() => onAsk(scene)}
        >
          <MessageCircle size={ICON_SIZE.md} aria-hidden />
          {t('ask')}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            data-testid="acp-presentation-previous"
            disabled={activeIndex === 0}
            onClick={() => onChangeScene(activeIndex - 1)}
          >
            <ChevronLeft size={ICON_SIZE.md} aria-hidden />
            {t('previous')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            data-testid="acp-presentation-next"
            onClick={() => (last ? onClose() : onChangeScene(activeIndex + 1))}
          >
            {last ? t('finish') : t('next')}
            {!last ? <ChevronRight size={ICON_SIZE.md} aria-hidden /> : null}
          </Button>
        </div>
      </footer>
    </section>
  );
}
