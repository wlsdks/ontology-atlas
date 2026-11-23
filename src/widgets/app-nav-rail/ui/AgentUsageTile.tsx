'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';

import {
  contextFraction,
  limitsInForce,
  useLatestAgentUsage,
  type AgentUsage,
  type LimitLevel,
} from '@/entities/agent-usage';
import registry from '@/src-tauri/src/acp-registry.json';
import { agentDisplayName } from '@/shared/lib/agent-activity/agent-display-name';
import { cn } from '@/shared/lib/cn';
import { useDismissibleMenu } from '@/shared/lib/overlays/use-dismissible-menu';
import { Tooltip } from '@/shared/ui/hints/tooltip';
import { Surface } from '@/shared/ui/surfaces/surface';
import { transientSurface } from '@/shared/ui/surfaces/transient-surface';

import { AgentUsagePanel } from './AgentUsagePanel';

/**
 * The name the conversation shows, else the registry's, else a known product name; never the
 * runtime id, which is an identifier and not a name. The mark is the registry's bundled one.
 */
function agentOf(usage: AgentUsage): { name: string | null; icon: string | null } {
  const entry = registry.agents.find((agent) => agent.id === usage.runtimeId);
  const known = agentDisplayName(usage.runtimeId);
  const name = usage.agentName ?? entry?.name ?? (known !== usage.runtimeId.trim() ? known : null);
  return { name, icon: entry?.icon ?? null };
}

const RING_INK: Record<LimitLevel, string> = {
  calm: 'var(--color-text-secondary)',
  notice: 'var(--color-text-primary)',
  warning: 'var(--color-status-warning)',
};

interface Ring {
  key: string;
  fraction: number;
  level: LimitLevel;
}

/** Five-hour outside, weekly inside; with no limits reported, the context window alone. */
function ringsOf(usage: AgentUsage): Ring[] {
  const limits = limitsInForce(usage, usage.readAtMs);
  if (limits.length > 0) {
    return limits.map((limit) => ({ key: limit.window, fraction: limit.usedFraction, level: limit.level }));
  }
  return usage.context ? [{ key: 'context', fraction: contextFraction(usage.context), level: 'calm' }] : [];
}

const RING_RADII = [14.5, 11] as const;

function UsageRings({ rings }: { rings: readonly Ring[] }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" fill="none" className="pointer-events-none absolute inset-0 m-auto size-8 overflow-visible">
      {rings.slice(0, RING_RADII.length).map((ring, index) => {
        const radius = RING_RADII[index];
        return (
          <g key={ring.key} data-testid={`agent-usage-ring-${ring.key}`} data-ring-fraction={ring.fraction.toFixed(3)} data-level={ring.level}>
            <circle cx={16} cy={16} r={radius} strokeWidth={1.75} stroke="var(--color-overlay-3)" />
            <circle
              cx={16}
              cy={16}
              r={radius}
              strokeWidth={1.75}
              stroke={RING_INK[ring.level]}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray="1 1"
              strokeDashoffset={1 - Math.min(1, Math.max(0, ring.fraction))}
              transform="rotate(-90 16 16)"
              className="transition-[stroke-dashoffset,stroke] duration-[var(--motion-slow)] ease-[var(--motion-ease)]"
            />
          </g>
        );
      })}
    </svg>
  );
}

/** The agent's bundled mark drawn as a mask in the tile's own ink, as the rail's icons are. */
function AgentGlyph({ icon, name }: { icon: string | null; name: string }) {
  if (!icon) {
    return <span aria-hidden className="text-label leading-label font-[var(--font-weight-strong)]">{name.slice(0, 1).toUpperCase()}</span>;
  }
  return (
    <span
      aria-hidden
      data-agent-glyph={icon}
      className="size-3.5 bg-current"
      style={{
        maskImage: `url("${icon}")`,
        WebkitMaskImage: `url("${icon}")`,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
      }}
    />
  );
}

const POPOVER_WIDTH_PX = 296;
const POPOVER_GAP_PX = 8;

/**
 * The connected agent's usage in the rail: rings for the account limits it reports, its context
 * window otherwise, and a popover with each figure and when it arrived. Absent until the agent
 * reports, and on the web, where no agent runs inside Atlas.
 */
export function AgentUsageTile() {
  const usage = useLatestAgentUsage();
  if (!usage) return null;
  return <ReportedUsageTile usage={usage} />;
}

function ReportedUsageTile({ usage }: { usage: AgentUsage }) {
  const t = useTranslations('navRail.usage');
  const { open, setOpen, ref, surfaceRef } = useDismissibleMenu();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [placement, setPlacement] = useState<{ left: number; bottom: number; openedAtMs: number } | null>(null);
  const found = agentOf(usage);
  const agent = { ...found, name: found.name ?? t('agentFallback') };
  const rings = ringsOf(usage);
  const limits = limitsInForce(usage, usage.readAtMs);
  const figures = limits.length > 0
    ? limits.map((limit) => t('limitFigure', { limit: t(`limitName.${limit.window}`), percent: limit.percent }))
    : usage.context ? [t('contextFigure', { percent: Math.round(contextFraction(usage.context) * 100) })] : [];
  const name = t('tileName', { agent: agent.name });

  const toggle = () => {
    const trigger = triggerRef.current;
    if (!open && trigger) {
      const rect = trigger.getBoundingClientRect();
      setPlacement({ left: rect.right + POPOVER_GAP_PX, bottom: window.innerHeight - rect.bottom, openedAtMs: Date.now() });
    }
    setOpen((wasOpen) => !wasOpen);
  };

  const setSurface = useCallback((node: HTMLElement | null) => {
    const wasEmpty = surfaceRef.current === null;
    surfaceRef.current = node;
    if (node && wasEmpty) node.focus({ preventScroll: true });
  }, [surfaceRef]);

  /* Focus leaves the popover with it, back to the tile, unless the person already moved it on. */
  const wasOpenRef = useRef(open);
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!wasOpen || open) return;
    const active = document.activeElement;
    if (active === null || active === document.body || surfaceRef.current?.contains(active)) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [open, surfaceRef]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnFocusElsewhere = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (surfaceRef.current?.contains(target) || ref.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('focusin', closeOnFocusElsewhere);
    return () => document.removeEventListener('focusin', closeOnFocusElsewhere);
  }, [open, ref, setOpen, surfaceRef]);

  return (
    <div ref={ref} className="relative shrink-0">
      <Tooltip content={name} side="right">
        <button
          ref={triggerRef}
          type="button"
          data-testid="agent-usage-tile"
          data-open={open ? 'true' : 'false'}
          aria-label={[name, ...figures].join(', ')}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={toggle}
          className={cn(
            'relative flex h-[var(--app-nav-rail-tile-height)] w-[var(--app-nav-rail-tile-width)] items-center justify-center rounded-card border transition-[color,background-color,border-color,translate] active:translate-y-px motion-reduce:translate-none focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]',
            open
              ? 'border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-indigo-a14)] text-[color:var(--color-indigo-pale-a94)]'
              : 'border-transparent text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]',
          )}
        >
          <UsageRings rings={rings} />
          <AgentGlyph icon={agent.icon} name={agent.name} />
        </button>
      </Tooltip>
      {placement && typeof document !== 'undefined'
        ? createPortal(
            <Surface
              open={open}
              origin="bottom left"
              // eslint-disable-next-line no-restricted-syntax -- a non-modal anchored popover (APG calls it a dialog); Dialog's scrim and focus trap would block the screen beside it
              role="dialog"
              tabIndex={-1}
              aria-label={name}
              data-testid="agent-usage-popover"
              ref={setSurface}
              {...transientSurface('anchored')}
              style={{ left: placement.left, bottom: placement.bottom, width: POPOVER_WIDTH_PX }}
              className="fixed z-50 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-3 shadow-[var(--shadow-elevation-2)] focus:outline-none"
            >
              <AgentUsagePanel usage={usage} agentName={agent.name} nowMs={placement.openedAtMs} />
            </Surface>,
            document.body,
          )
        : null}
    </div>
  );
}
