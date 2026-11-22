import { agentDisplayName } from '@/shared/lib/agent-activity/agent-display-name';
import type { VaultProblemCounts } from '@/shared/lib/agent-activity/agent-notifications';
import type { BellHistoryRow, BellResult } from './bell-inbox';
import { inboxDuration } from './inbox-duration';

export type InboxTranslate = (key: string, values?: Record<string, number>) => string;

/**
 * What a finished write did, as one verb-first sentence. The leading kind is the largest count, ties
 * resolved added, edited, removed. Results and history share it, since a generic heading repeated
 * down a list is refused by `.claude/rules/design.md`.
 */
export function writeSentence(
  t: InboxTranslate,
  counts: { added: number; edited: number; removed: number } | null,
): string {
  if (!counts) return t('resultNothing');
  const ordered = [
    { key: 'resultAdded', count: counts.added },
    { key: 'resultEdited', count: counts.edited },
    { key: 'resultRemoved', count: counts.removed },
  ].sort((a, b) => b.count - a.count);
  const top = ordered[0];
  return top && top.count > 0 ? t(top.key, { count: top.count }) : t('resultNothing');
}

export function problemSummary(t: InboxTranslate, problems: VaultProblemCounts): string {
  const parts: string[] = [];
  if (problems.unresolvedEdges > 0) parts.push(t('problemUnresolved', { count: problems.unresolvedEdges }));
  if (problems.dependencyCycles > 0) {
    const key = problems.dependencyCyclesPartial ? 'problemCyclesAtLeast' : 'problemCycles';
    parts.push(t(key, { count: problems.dependencyCycles }));
  }
  return parts.join(t('summaryJoin'));
}

/** Who answered matters: a write nobody pressed must never read as the person's allow. */
export function decisionKey(row: Pick<BellHistoryRow, 'decision' | 'autoApproved'>): string {
  if (row.decision === 'rejected') return 'decisionRejected';
  return row.autoApproved ? 'decisionAutoApproved' : 'decisionAllowed';
}

/** The sentence a timeline row says for everything that is not a finished write; the agent goes on the second line. */
export const HISTORY_LABEL_KEY: Readonly<Record<BellHistoryRow['kind'], string>> = {
  'human-decision': 'decisionAllowed',
  'task-start': 'runningTask',
  'task-end': 'event.taskEnd',
  'domain-added': 'event.domainAdded',
  'domain-removed': 'event.domainRemoved',
  'bridge-inserted': 'event.bridgeInserted',
  'vault-problem': 'event.vaultProblem',
};

/** Null under a second, so the row leaves the duration out rather than print "0s". */
export function formatInboxDuration(t: InboxTranslate, ms: number): string | null {
  const parts = inboxDuration(ms);
  if (parts === null) return null;
  if (parts.unit === 'hours') return t('durationHours', { hours: parts.hours, minutes: parts.minutes });
  if (parts.unit === 'minutes') return t('durationMinutes', { minutes: parts.minutes, seconds: parts.seconds });
  return t('durationSeconds', { seconds: parts.seconds });
}

/** One fact on a result row's second line: a label, an optional number, and which grade it carries (plain, or one a person may want to look at). */
export interface BellFact {
  label: string;
  count?: number;
  tone?: 'neutral' | 'warning';
}

/** The second line of a result row as data, so a later per-turn brief from the ontology diff can print before the agent's own facts without rewriting the row. */
export interface ResultFactLineModel {
  agent: string | null;
  duration: string | null;
  /** When it happened, so `2m` reads as "two minutes ago" and not "it took two minutes", and the boundary a press moves is visible on the unread tab. */
  age: string | null;
  allowed: number | null;
  denied: number | null;
  autoApproved: number;
  summaryFacts: BellFact[];
}

export function resultFacts(t: InboxTranslate, row: BellResult, age: string): ResultFactLineModel {
  const agent = agentDisplayName(row.agent) ?? row.agent ?? t('unknownAgent');
  if (row.kind === 'task') {
    const decided = row.allowed > 0 || row.rejected > 0;
    return {
      agent,
      duration: formatInboxDuration(t, row.durationMs),
      age,
      allowed: decided ? row.allowed : null,
      denied: decided ? row.rejected : null,
      autoApproved: row.autoApproved,
      summaryFacts: [],
    };
  }
  const facts: BellFact[] = [
    row.decision === 'rejected'
      ? { label: t('decisionNoChange') }
      : { label: t('decisionItems', { count: row.items }) },
  ];
  // A result that is not `completed` is a state, so it says the state word once — never a
  // fourth dot-separated word beside the decision and the count.
  if (row.decision === 'allowed' && row.result !== 'completed') {
    facts.push({ label: t(`receiptResult.${row.result}`), tone: 'warning' });
  }
  return { agent, duration: null, age, allowed: null, denied: null, autoApproved: 0, summaryFacts: facts };
}
