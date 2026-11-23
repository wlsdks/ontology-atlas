/** The account windows an agent reports; Claude's `five_hour` and `seven_day`, in drawing order. */
export const LIMIT_WINDOWS = ['fiveHour', 'weekly'] as const;
export type LimitWindow = (typeof LIMIT_WINDOWS)[number];

export interface LimitFigures {
  /** The share of the window used, as the agent states it: 1 is the cap, and usage can run past it. */
  usedFraction: number;
  resetsAtMs: number;
}

export interface ContextFigures {
  usedTokens: number;
  windowTokens: number;
}

export interface CostFigures {
  amount: number;
  currency: string;
}

/** What one usage update from the agent states; every part was validated where it was read. */
export interface UsageReport {
  sessionId: string;
  context: ContextFigures | null;
  cost: CostFigures | null;
  limits: Partial<Record<LimitWindow, LimitFigures>>;
}

type Read<T> = T & { readAtMs: number };

/** The latest of each figure one agent reported, each with the moment it arrived. */
export interface AgentUsage {
  runtimeId: string;
  /** The name the conversation shows for this agent, when the reporting screen knows it. */
  agentName: string | null;
  /** The conversation the context and cost belong to; limits belong to the account. */
  sessionId: string;
  context: Read<ContextFigures> | null;
  cost: Read<CostFigures> | null;
  limits: Partial<Record<LimitWindow, Read<LimitFigures>>>;
  /** When the last update arrived: screens judge reset windows by it instead of a running clock. */
  readAtMs: number;
}

function reportsNothing(report: UsageReport): boolean {
  return report.context === null && report.cost === null && Object.keys(report.limits).length === 0;
}

/**
 * The latest figure wins, each on its own: an update without a cost keeps the conversation's
 * last cost, and limits stay until replaced. Another conversation's update drops the previous
 * conversation's context and cost, which no longer describe what is open.
 */
export function mergeUsageReport(
  previous: AgentUsage | null,
  agent: { runtimeId: string; name: string | null },
  report: UsageReport,
  readAtMs: number,
): AgentUsage | null {
  if (reportsNothing(report)) return previous;
  const sameConversation = previous?.sessionId === report.sessionId;
  const limits: AgentUsage['limits'] = { ...previous?.limits };
  for (const window of LIMIT_WINDOWS) {
    const figures = report.limits[window];
    if (figures) limits[window] = { ...figures, readAtMs };
  }
  return {
    runtimeId: agent.runtimeId,
    agentName: agent.name ?? previous?.agentName ?? null,
    sessionId: report.sessionId,
    context: report.context ? { ...report.context, readAtMs } : sameConversation ? previous.context : null,
    cost: report.cost ? { ...report.cost, readAtMs } : sameConversation ? previous.cost : null,
    limits,
    readAtMs,
  };
}

/** A limit at this share or more is named beside the conversation and before a mapping run. */
export const LIMIT_NOTICE_PERCENT = 70;
/** A limit at this share or more turns the warning tone. */
export const LIMIT_WARNING_PERCENT = 85;

export type LimitLevel = 'calm' | 'notice' | 'warning';

export interface LimitInForce extends Read<LimitFigures> {
  window: LimitWindow;
  /** Rounded as shown, so the tone and the figure a person reads never disagree. */
  percent: number;
  level: LimitLevel;
}

export function limitPercent(usedFraction: number): number {
  return Math.round(usedFraction * 100);
}

export function limitLevel(percent: number): LimitLevel {
  if (percent >= LIMIT_WARNING_PERCENT) return 'warning';
  if (percent >= LIMIT_NOTICE_PERCENT) return 'notice';
  return 'calm';
}

/** Limits whose window has not reset by `nowMs`; a past reset says nothing about the new window. */
export function limitsInForce(usage: AgentUsage | null, nowMs: number): LimitInForce[] {
  if (!usage) return [];
  return LIMIT_WINDOWS.flatMap((window) => {
    const figures = usage.limits[window];
    if (!figures || figures.resetsAtMs <= nowMs) return [];
    const percent = limitPercent(figures.usedFraction);
    return [{ ...figures, window, percent, level: limitLevel(percent) }];
  });
}

/** The fullest limit at the notice share or more, the one worth naming where work is started. */
export function pressingLimit(usage: AgentUsage | null, nowMs: number): LimitInForce | null {
  let fullest: LimitInForce | null = null;
  for (const limit of limitsInForce(usage, nowMs)) {
    if (limit.level === 'calm') continue;
    if (!fullest || limit.percent > fullest.percent) fullest = limit;
  }
  return fullest;
}

/** The context window's fill, 0–1; an agent may report more tokens than its window after a cut. */
export function contextFraction(context: ContextFigures): number {
  return Math.min(1, context.usedTokens / context.windowTokens);
}
