import { useFormatter, useTranslations } from 'use-intl';

import {
  contextFraction,
  limitsInForce,
  type AgentUsage,
  type LimitInForce,
  type LimitLevel,
} from '@/entities/agent-usage';
import { cn } from '@/shared/lib/cn';
import { useLatinEyebrow } from '@/shared/lib/locale-text/latin-eyebrow';

const MS_PER_DAY = 86_400_000;

/** A clock time today, a weekday and time within the week, a date beyond it. */
function useClockTime(nowMs: number): (atMs: number) => string {
  const format = useFormatter();
  return (atMs) => {
    const sameDay = new Date(atMs).toDateString() === new Date(nowMs).toDateString();
    if (sameDay) return format.dateTime(atMs, { hour: 'numeric', minute: '2-digit' });
    const withinWeek = Math.abs(atMs - nowMs) < 6 * MS_PER_DAY;
    return format.dateTime(atMs, withinWeek
      ? { weekday: 'short', hour: 'numeric', minute: '2-digit' }
      : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
}

const FIGURE_INK: Record<LimitLevel, string> = {
  calm: 'text-[color:var(--color-text-primary)]',
  notice: 'text-[color:var(--color-text-primary)]',
  warning: 'text-[color:var(--color-status-warning)]',
};

const METER_FILL: Record<LimitLevel, string> = {
  calm: 'bg-[color:var(--color-text-secondary)]',
  notice: 'bg-[color:var(--color-text-primary)]',
  warning: 'bg-[color:var(--color-status-warning)]',
};

/** One update moves the fill once, from where it is drawn; reduced motion jumps. */
function Meter({ fraction, level }: { fraction: number; level: LimitLevel }) {
  return (
    <span aria-hidden className="block h-1 overflow-hidden rounded-full bg-[color:var(--color-overlay-3)]">
      <span
        data-meter-fraction={fraction.toFixed(3)}
        className={cn(
          'block h-full origin-left rounded-full transition-transform duration-[var(--motion-slow)] ease-[var(--motion-ease)]',
          METER_FILL[level],
        )}
        style={{ transform: `scaleX(${Math.min(1, Math.max(0, fraction))})` }}
      />
    </span>
  );
}

function FigureRow({ name, figure, level, fraction, caption, testId, window }: {
  name: string;
  figure: string;
  level: LimitLevel;
  fraction: number;
  caption: string;
  testId: string;
  window?: string;
}) {
  return (
    <li data-testid={testId} data-limit-window={window} data-level={level} className="grid gap-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-body leading-body text-[color:var(--color-text-secondary)]">{name}</span>
        <span className={cn('shrink-0 text-body leading-body font-[var(--font-weight-strong)] tabular-nums', FIGURE_INK[level])}>
          {figure}
        </span>
      </span>
      <Meter fraction={fraction} level={level} />
      <span className="text-label leading-label tabular-nums text-[color:var(--color-text-quaternary)]">{caption}</span>
    </li>
  );
}

/**
 * What the agent last reported: each account limit, then this conversation's context and cost,
 * every figure with the time it arrived. `nowMs` is the moment the panel opened.
 */
export function AgentUsagePanel({ usage, agentName, nowMs }: { usage: AgentUsage; agentName: string; nowMs: number }) {
  const t = useTranslations('navRail.usage');
  const format = useFormatter();
  const clock = useClockTime(nowMs);
  const eyebrow = cn('text-caption leading-caption text-[color:var(--color-text-quaternary)]', useLatinEyebrow('tracking-[var(--tracking-caps-16)]'));
  const limits = limitsInForce(usage, nowMs);
  const { context, cost } = usage;
  const caption = (lead: string | null, atMs: number) =>
    [lead, t('asOf', { time: clock(atMs) })].filter(Boolean).join(' · ');
  const limitRow = (limit: LimitInForce) => (
    <FigureRow
      key={limit.window}
      testId="agent-usage-limit"
      window={limit.window}
      name={t(`limitName.${limit.window}`)}
      figure={t('limitUsed', { percent: limit.percent })}
      level={limit.level}
      fraction={limit.usedFraction}
      caption={caption(t('resets', { time: clock(limit.resetsAtMs) }), limit.readAtMs)}
    />
  );

  return (
    <div className="grid gap-3">
      <p className={eyebrow}>{t('tileName', { agent: agentName })}</p>
      {limits.length > 0 ? (
        <ul className="grid gap-3">{limits.map(limitRow)}</ul>
      ) : (
        <p data-testid="agent-usage-no-limits" className="text-label leading-label text-[color:var(--color-text-tertiary)]">
          {t('noLimits', { agent: agentName })}
        </p>
      )}
      {context || cost ? (
        <section className="grid gap-3 border-t border-[color:var(--color-divider)] pt-3">
          <p className={eyebrow}>{t('conversation')}</p>
          <ul className="grid gap-3">
            {context ? (
              <FigureRow
                testId="agent-usage-context"
                name={t('context')}
                figure={t('contextFull', { percent: Math.round(contextFraction(context) * 100) })}
                level="calm"
                fraction={contextFraction(context)}
                caption={caption(t('contextTokens', { used: context.usedTokens, size: context.windowTokens }), context.readAtMs)}
              />
            ) : null}
            {cost ? (
              <li data-testid="agent-usage-cost" className="grid gap-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-body leading-body text-[color:var(--color-text-secondary)]">{t('cost')}</span>
                  <span className="text-body leading-body font-[var(--font-weight-strong)] tabular-nums text-[color:var(--color-text-primary)]">
                    {format.number(cost.amount, { style: 'currency', currency: cost.currency })}
                  </span>
                </span>
                <span className="text-label leading-label tabular-nums text-[color:var(--color-text-quaternary)]">
                  {caption(t('costReported', { agent: agentName }), cost.readAtMs)}
                </span>
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
