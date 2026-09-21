'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';
import { controlClass } from '@/shared/ui/control-class';
import { IconButton } from '@/shared/ui/controls';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { RowDisclosure } from '@/shared/ui/row-disclosure';
import { cn } from '@/shared/lib/cn';
import styles from './relationship-preview.module.css';

export interface PreviewItem {
  id: string;
  title: string;
  caption: string;
  label: string;
  explanation: string;
  visual: ReactNode;
  description?: string;
  mobileDetail?: string;
}

interface WireGeometry {
  width: number;
  height: number;
  paths: string[];
}

const EMPTY_WIRES: WireGeometry = { width: 1, height: 1, paths: [] };

/** A labelled illustration has its own motion; it never reports work as running. */
export function RelationshipPreview({ title, description, exampleLabel, pauseLabel, resumeLabel, items, anchor, footer, emphasizedItemId }: {
  title: string;
  description: string;
  exampleLabel: string;
  pauseLabel: string;
  resumeLabel: string;
  items: readonly PreviewItem[];
  anchor?: ReactNode;
  footer: ReactNode;
  emphasizedItemId?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [environmentActive, setEnvironmentActive] = useState(false);
  const [wires, setWires] = useState<WireGeometry>(EMPTY_WIRES);
  const item = items.find((entry) => entry.id === selected);

  useLayoutEffect(() => {
    const scene = sceneRef.current;
    if (!scene || typeof ResizeObserver === 'undefined') return;

    const measure = () => {
      const sceneRect = scene.getBoundingClientRect();
      const portRect = (selector: string) => {
        const port = scene.querySelector<HTMLElement>(selector);
        return port?.getBoundingClientRect();
      };
      const relative = (rect: DOMRect, side: 'left' | 'right') => ({
        x: (side === 'left' ? rect.left : rect.right) - sceneRect.left,
        y: rect.top + rect.height / 2 - sceneRect.top,
      });

      let paths: string[] = [];
      if (anchor) {
        const source = portRect('[data-relationship-anchor]');
        const targets = items.map((entry) => portRect(`[data-relationship-item="${CSS.escape(entry.id)}"] [data-relationship-port]`));
        if (source && targets.every((target): target is DOMRect => Boolean(target))) {
          const start = relative(source, 'right');
          const ends = targets.map((target) => relative(target, 'left'));
          const trunkX = start.x + Math.max(24, (Math.min(...ends.map((end) => end.x)) - start.x) / 2);
          paths = ends.map((end) => `M${start.x} ${start.y}H${trunkX}V${end.y}H${end.x}`);
        }
      } else {
        const ports = items.map((entry) => portRect(`[data-relationship-item="${CSS.escape(entry.id)}"] [data-relationship-port]`));
        if (ports.every((port): port is DOMRect => Boolean(port))) {
          paths = ports.slice(0, -1).map((port, index) => {
            const start = relative(port, 'right');
            const end = relative(ports[index + 1], 'left');
            const bendX = start.x + (end.x - start.x) / 2;
            return `M${start.x} ${start.y}H${bendX}V${end.y}H${end.x}`;
          });
        }
      }

      setWires({ width: sceneRect.width, height: sceneRect.height, paths });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(scene);
    scene.querySelectorAll<HTMLElement>('[data-relationship-anchor], [data-relationship-port]').forEach((element) => observer.observe(element));
    measure();
    return () => observer.disconnect();
  }, [anchor, items]);

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    let visible = false;
    const sync = () => setEnvironmentActive(visible && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(element);
    document.addEventListener('visibilitychange', sync);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sync); };
  }, []);

  return (
    <div ref={ref} data-motion={environmentActive && !userPaused ? 'running' : 'paused'} data-selected={selected ?? 'none'} className={cn(styles.preview, 'relative isolate rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]')}>
      <header className="relative z-10 flex flex-wrap items-start justify-between gap-4 px-5 pt-5 sm:px-8 sm:pt-7">
        <div className="min-w-0 max-w-prose">
          <h3 className="text-display font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{title}</h3>
          <p className="mt-2 break-keep text-body-lg text-[color:var(--color-text-secondary)]">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-label text-[color:var(--color-text-tertiary)]">{exampleLabel}</p>
          <IconButton label={userPaused ? resumeLabel : pauseLabel} aria-pressed={userPaused} size="sm" onClick={() => setUserPaused((paused) => !paused)}>
            {userPaused ? <Play size={ICON_SIZE.sm} aria-hidden /> : <Pause size={ICON_SIZE.sm} aria-hidden />}
          </IconButton>
        </div>
      </header>

      <div ref={sceneRef} className={cn(styles.scene, anchor ? styles.branch : styles.sequence, emphasizedItemId && styles.featuredScene)}>
        <div data-relationship-ambient className={styles.ambient} aria-hidden />
        {anchor ? <div data-relationship-anchor className={styles.anchor}>{anchor}</div> : null}
        <svg data-relationship-wires className={styles.wires} viewBox={`0 0 ${wires.width} ${wires.height}`} preserveAspectRatio="none" fill="none" aria-hidden>
          {wires.paths.map((path) => (
            <g key={path}>
              <path d={path} stroke="var(--color-border-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
        </svg>
        <ol className={styles.items}>
          {items.map((entry) => (
            <li key={entry.id} data-relationship-item={entry.id} className={cn('relative min-w-0',emphasizedItemId===entry.id&&styles.featured)}>
              <button type="button" aria-label={entry.label} aria-describedby={entry.description ? `${id}-${entry.id}-example` : undefined} aria-expanded={selected === entry.id} aria-controls={id}
                onClick={() => setSelected(selected === entry.id ? null : entry.id)}
                className={controlClass({ shape: 'segment', size: 'lg', className: cn(styles.node, 'w-full text-left') })}>
                <span className={styles.visual} data-item={entry.id} aria-hidden>{entry.visual}</span>
                <span className="min-w-0">
                  <span className={cn(styles.title, 'block text-title font-[var(--font-weight-emphasis)]')}>{entry.title}</span>
                  <span className="mt-1 block text-label text-[color:var(--color-text-tertiary)]">{entry.caption}</span>
                  {entry.mobileDetail ? <span className="mt-2 block text-body text-[color:var(--color-text-secondary)] sm:hidden">{entry.mobileDetail}</span> : null}
                </span>
              </button>
              {entry.description ? <span id={`${id}-${entry.id}-example`} className="sr-only">{entry.description}</span> : null}
            </li>
          ))}
        </ol>
      </div>

      <div className="relative z-10 px-5 pb-5 sm:px-8 sm:pb-7">
        <RowDisclosure open={Boolean(item)} id={id}>
          <p className="max-w-prose break-keep pb-4 text-body-lg text-[color:var(--color-text-primary)]">{item?.explanation}</p>
        </RowDisclosure>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[color:var(--color-divider)] pt-5">{footer}</div>
      </div>
    </div>
  );
}
