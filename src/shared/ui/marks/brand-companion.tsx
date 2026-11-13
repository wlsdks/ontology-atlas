'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { useDismissibleMenu } from '@/shared/lib/overlays/use-dismissible-menu';
import { RowButton } from '../controls/controls';
import { Surface } from '../surfaces/surface';
import { transientSurface } from '../surfaces/transient-surface';
import { controlClass } from '../control-class';
import timeline from './moru-companion.json';
import reactions from './moru-reactions.json';
import { companionMotion, type CompanionContext } from './moru-companion-motion';
import { companionPlayer } from './moru-companion-player';
import styles from './moru-emote.module.css';

/** Decorative company on entry/download screens, never evidence of work or progress. */
export type CompanionLabels = { pause: string; resume: string; still: string; interact: string };

export function BrandCompanion({ labels, context = 'folder' }: { labels: CompanionLabels; context?: CompanionContext }) {
  const ref = useRef<HTMLImageElement>(null);
  const reactionRef = useRef<HTMLImageElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const actor = useRef<HTMLButtonElement>(null);
  const facing = useRef<HTMLSpanElement>(null);
  const emote = useRef<HTMLSpanElement>(null);
  const menuItem = useRef<HTMLButtonElement>(null);
  const { open: menuOpen, setOpen: setMenuOpen, ref: menuRef } = useDismissibleMenu();
  const bindMenuItem = useCallback((node: HTMLButtonElement | null) => {
    menuItem.current = node;
    // Surface may mount after the open effect's first frame. Focus the actual
    // mounted item too, so keyboard context menus do not leave focus behind.
    if (node && menuOpen) node.focus({ preventScroll: true });
  }, [menuOpen]);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const intent = useRef({ paused, held: false });
  const playback = useRef<ReturnType<typeof companionPlayer> | null>(null);

  useEffect(() => {
    intent.current = { paused, held: hovered || focused || menuOpen };
    playback.current?.update();
  }, [paused, hovered, focused, menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const frame = requestAnimationFrame(() => menuItem.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [menuOpen]);

  useEffect(() => {
    const image = ref.current, reactionImage = reactionRef.current;
    const bounds = stage.current, body = actor.current, face = facing.current, bubble = emote.current;
    if (!image || !reactionImage || !bounds || !body || !face || !bubble) return;
    const motion = companionMotion(Math.max(0, bounds.clientWidth - timeline.cell), context);
    const options = { duration: motion.duration, iterations: Infinity };
    const animations = reducedMotion || typeof image.animate !== 'function' || typeof IntersectionObserver === 'undefined' ? []
      : [image.animate(motion.sprite, options), body.animate(motion.movement, options), face.animate(motion.facing, options), bubble.animate(motion.emote, options)];
    const player = companionPlayer({ image, reactionImage, body, bubble, bounds, animations, context, reducedMotion, intent: () => intent.current });
    playback.current = player;
    return () => {
      playback.current = null;
      player.destroy();
    };
  }, [reducedMotion, context]);

  return (
    <div ref={menuRef} className="relative w-40 max-w-full" data-moru-companion-region="">
    <div ref={stage} className="relative h-32 w-full min-w-32 overflow-hidden" data-moru-playground="" data-moru-context={context}>
    <button ref={actor}
      type="button" aria-label={labels.interact} title={labels.interact}
      aria-haspopup="menu" aria-expanded={menuOpen} aria-keyshortcuts="Shift+F10"
      className={controlClass({ shape: 'link', size: 'sm', tone: 'secondary', className: 'absolute top-0 left-0 w-32 shrink-0 overflow-hidden' })}
      style={{ height: timeline.cell }}
      onClick={() => playback.current?.react()}
      onContextMenu={event => { event.preventDefault(); setMenuOpen(true); }}
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
      onFocus={event => setFocused(event.currentTarget.matches(':focus-visible'))} onBlur={() => setFocused(false)}
      onKeyDown={event => {
        setFocused(true);
        if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
          event.preventDefault(); setMenuOpen(true);
        }
      }}
      data-moru-companion=""
      data-moru-paused={reducedMotion || paused}
    >
      <span ref={facing} className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Preserve native 128px cells, including jump headroom, instead of enlarging
          the lossy 64px runtime export. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={ref} src={withBasePath(`/brand/moru-companion.png?v=${timeline.digest}`)} alt="" aria-hidden="true" draggable={false}
        width={timeline.cell * timeline.columns} height={timeline.cell * timeline.rows}
        className="pointer-events-none absolute top-0 left-0 max-w-none"
        style={{ width: timeline.cell * timeline.columns, height: timeline.cell * timeline.rows, imageRendering: 'pixelated' }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={reactionRef} src={withBasePath(`/brand/moru-reactions.png?v=${reactions.digest}`)} alt="" aria-hidden="true" draggable={false} hidden
        width={reactions.cell * reactions.columns} height={reactions.cell * reactions.rows}
        className="pointer-events-none absolute top-0 left-0 max-w-none"
        style={{ width: reactions.cell * reactions.columns, height: reactions.cell * reactions.rows, imageRendering: 'pixelated' }} />
      </span>
      <span ref={emote} className={styles.bubble} data-moru-emote="" aria-hidden="true">
        {(['heart', 'note', 'spark'] as const).map(glyph => (
          // These wordless pixel drawings are decoration, never controls or status.
          // eslint-disable-next-line @next/next/no-img-element
          <img key={glyph} data-glyph={glyph} src={withBasePath(`/brand/moru-emote-${glyph}.svg`)} width={24} height={24} alt="" draggable={false} />
        ))}
      </span>
    </button>
    </div>
    <Surface open={menuOpen} origin="top left" role="menu" aria-label={labels.interact}
      {...transientSurface('menu')}
      className="absolute left-0 top-full z-[var(--z-dialog)] mt-1 w-max max-w-[calc(100vw-3rem)] rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-1 shadow-[var(--shadow-elevation-2)]">
      <RowButton ref={bindMenuItem} role="menuitem" tone="secondary" hoverInk="strong" hoverSurface="lift"
        disabled={reducedMotion}
        onClick={() => { setPaused(value => !value); setMenuOpen(false); actor.current?.focus({ preventScroll: true }); }}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation(); setMenuOpen(false); actor.current?.focus({ preventScroll: true });
          } else if (event.key === 'Tab') setMenuOpen(false);
          else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) event.preventDefault();
        }}>
        {labels[reducedMotion ? 'still' : paused ? 'resume' : 'pause']}
      </RowButton>
    </Surface>
    </div>
  );
}
