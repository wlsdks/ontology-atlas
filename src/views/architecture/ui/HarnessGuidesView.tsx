'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  AGENT_TOOL_LABELS,
  CITATIONS_REVIEWED,
  declaredPairFor,
  guideCitation,
  isGuideRecord,
  isPairDrift,
  type AgentDriftFinding,
  type AgentTool,
  type HarnessReport,
  type HookConfigFacts,
} from '@/entities/agent-files';
import { ChevronRight } from 'lucide-react';

import { Chip, EmptyState, InfoHint } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';
import { cn } from '@/shared/lib/cn';

/** The amber signal pair every "unresolved state" badge on this screen wears. One definition site. */
const WARNING_BADGE =
  'border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a12)] text-[color:var(--color-amber-source-a90)]';

/**
 * **The guide inventory, with the limits of each column said out loud.**
 *
 * Every cell here is one of two kinds of fact, and the screen never lets them look alike:
 *
 * - **Measured from this repository** — the file is there, it is this many bytes, these two files
 *   the repository itself calls a pair differ, this script the config names exists.
 * - **Read from somebody else's documentation** — which tool reads which file. That claim carries
 *   its source URL and the date a person last opened it, and a claim with no document behind it
 *   says so in place of the source link, instead of rendering like the sourced rows.
 *
 * Three things this view deliberately does not do, each because a reader would take it as more
 * than it is (Evidence seat, 2026-09-13):
 *
 * 1. **No bare green.** A bare "0 drift" would read as "everything matches"; what is true is that the
 *    declared pairs match and nothing else was compared, so that is what it says.
 * 2. **No verified hooks.** A hook row says the script exists. The Codex group carries the
 *    approval gate as standing text, because that state lives in no file.
 * 3. **No commit dates.** The change column is a filesystem mtime and says so: a fresh clone
 *    stamps every file with the moment it arrived.
 */

type TranslateFn = ReturnType<typeof useTranslations<'harness'>>;

/** A rendered row: one guide path, or one directory's worth of them. */
interface GuideRow {
  key: string;
  /** What the person reads as the file's name. A tree row shows its directory. */
  label: string;
  tools: readonly AgentTool[];
  ruleId: string;
  bytes: number;
  fileCount: number;
  lastModified: number | null;
  /** Byte differences inside a declared pair only. Every other finding belongs elsewhere. */
  pairDrift: readonly string[];
  /** The twin this row is declared byte-identical to, or `null` when it has no declared pair. */
  declaredPair: string | null;
}

/**
 * Directory slots, labelled by the path a person would type. Only the nested-`AGENTS.md` slot needs
 * words rather than a path, and those words live in the catalogue like every other visible string.
 */
const TREE_RULES: Readonly<Record<string, string>> = Object.freeze({
  'claude-rules': '.claude/rules/',
  'claude-skills': '.claude/skills/',
  'claude-agents': '.claude/agents/',
  'agents-skills': '.agents/skills/',
  'agents-agents': '.agents/agents/',
  'cursor-rules': '.cursor/rules/',
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatWhen(value: number | null, locale: string): string {
  if (value == null) return '—';
  return new Date(value).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/** Groups the classifier's per-file records into the rows a person reads. */
function buildRows(report: HarnessReport, nestedLabel: string): GuideRow[] {
  const byRule = new Map<string, GuideRow>();
  const mtimeByPath = new Map(report.times.map((time) => [time.path, time.lastModified]));

  for (const record of report.analysis.records) {
    /* Guides only. The enforcement layer is the hooks section below, and the sentence's first
       number counts the same predicate, so the table and the number always agree. */
    if (!isGuideRecord(record)) continue;
    const treeLabel = record.ruleId === 'nested-agents-md' ? nestedLabel : TREE_RULES[record.ruleId];
    const key = treeLabel ? record.ruleId : record.path;
    const existing = byRule.get(key);
    const lastModified = mtimeByPath.get(record.path) ?? null;
    if (existing) {
      existing.bytes += record.bytes;
      existing.fileCount += 1;
      existing.pairDrift = [
        ...new Set([...existing.pairDrift, ...record.drift.filter(isPairDrift)]),
      ];
      if (lastModified != null && (existing.lastModified == null || lastModified > existing.lastModified)) {
        existing.lastModified = lastModified;
      }
      continue;
    }
    byRule.set(key, {
      key,
      label: treeLabel ?? record.path,
      tools: record.tools,
      ruleId: record.ruleId,
      bytes: record.bytes,
      fileCount: 1,
      lastModified,
      pairDrift: [...new Set(record.drift.filter(isPairDrift))],
      declaredPair: declaredPairFor(record.ruleId),
    });
  }

  /* Root instruction files first — they are what a person looks for — then the trees, alphabetically
     inside each group so the order does not depend on which directory the walk reached first. */
  const rank = (row: GuideRow) => (TREE_RULES[row.ruleId] || row.ruleId === 'nested-agents-md' ? 1 : 0);
  return [...byRule.values()].sort(
    (a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label),
  );
}

function ToolsCell({ row, t }: { row: GuideRow; t: TranslateFn }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {row.tools.map((tool) => {
        const citation = guideCitation(row.ruleId, tool);
        const condition = citation?.condition
          ? citation.condition === 'coding-agent'
            ? t('conditionCodingAgent')
            : t('conditionSettingsContext')
          : null;
        return (
          <span key={tool} className="inline-flex items-baseline gap-1">
            <span className="text-body text-[color:var(--color-text-secondary)]">
              {AGENT_TOOL_LABELS[tool] ?? tool}
            </span>
            {condition ? (
              <span className="text-caption text-[color:var(--color-text-quaternary)]">
                {condition}
              </span>
            ) : null}
            {citation ? (
              /* The one arrow this screen uses: ↗ prefixes an external destination, which the
                 label-decoration rule keeps as meaningful rather than decorative. */
              <a
                href={citation.source}
                target="_blank"
                rel="noreferrer"
                title={citation.source}
                /* Every citation link was named 「출처」, fourteen times. The name says whose
                   document it is and where it lives — which is also the only way to see the
                   destination in a WKWebView, since it has no status bar. */
                aria-label={t('toolsSourceFor', {
                  tool: AGENT_TOOL_LABELS[tool] ?? tool,
                  host: new URL(citation.source).host,
                })}
                className={controlClass({
                  shape: 'link',
                  hoverInk: 'secondary',
                  className:
                    'text-caption text-[color:var(--color-text-quaternary)] underline decoration-dotted underline-offset-2',
                })}
              >
                ↗{t('toolsSource')}
              </a>
            ) : (
              <span
                title={t('toolsUncitedHint')}
                className={badgeClass({ shape: 'micro', className: WARNING_BADGE })}
              >
                {t('toolsUncited')}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function SizeCell({
  row,
  report,
  t,
}: {
  row: GuideRow;
  report: HarnessReport;
  t: TranslateFn;
}) {
  const cap = report.analysis.checks.codexSizeCap;
  /*
   * The bar belongs to the merged Codex document, not to any single file. Drawing a per-file bar
   * was the shape that let a 39,617 B AGENTS.md read as healthy while the merge it sat in was
   * already being truncated — so only the two rows Codex actually merges carry a bar, and the bar
   * they carry is the same merged number.
   */
  const merged = row.ruleId === 'agents-md' || row.ruleId === 'nested-agents-md';
  if (!merged || cap.worstCaseBytes == null) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-body tabular-nums text-[color:var(--color-text-secondary)]">
          {formatBytes(row.bytes)}
        </span>
        <span className="text-caption text-[color:var(--color-text-quaternary)]">
          {t('capNone')}
        </span>
      </div>
    );
  }
  const ratio = Math.min(1, cap.worstCaseBytes / cap.capBytes);
  const over = cap.status === 'drift';
  return (
    <div className="flex flex-col gap-1" title={t('capMerged')}>
      <div
        className="h-1.5 w-full max-w-[140px] overflow-hidden rounded-micro bg-[color:var(--color-overlay-2)]"
        role="img"
        aria-label={t('capMergedValue', {
          used: formatBytes(cap.worstCaseBytes),
          cap: formatBytes(cap.capBytes),
        })}
      >
        <div
          className={cn(
            'h-full rounded-micro',
            over
              ? 'bg-[color:var(--color-amber-source-a90)]'
              : 'bg-[color:var(--color-indigo-a60)]',
          )}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <span className="text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
        {t('capMergedValue', {
          used: formatBytes(cap.worstCaseBytes),
          cap: formatBytes(cap.capBytes),
        })}
      </span>
      {over ? (
        <span className="text-caption text-[color:var(--color-amber-source-a90)]">{t('capOver')}</span>
      ) : null}
    </div>
  );
}

function HookGroup({ group, t }: { group: HookConfigFacts; t: TranslateFn }) {
  return (
    <div className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-body text-[color:var(--color-text-primary)]">
          {group.configPath}
        </span>
        {group.approvalGate ? (
          /*
           * Never a green. Codex hashes each entry and refuses to run a new or changed one until a
           * person trusts it in /hooks; that approval is session state in no file. Printing the
           * requirement is the whole truth this screen has.
           */
          <span
            title={t('hookApprovalGateHint')}
            data-testid="harness-hook-approval-gate"
            className={badgeClass({ shape: 'micro', className: WARNING_BADGE })}
          >
            {t('hookApprovalGate')}
          </span>
        ) : null}
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {group.hooks.map((hook) => (
          <li
            key={hook.ref.path ?? hook.ref.command}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
          >
            <span className="font-mono text-body text-[color:var(--color-text-secondary)]">
              {hook.ref.path ?? hook.ref.command}
            </span>
            <span className="text-caption text-[color:var(--color-text-quaternary)]">
              {hook.events}
            </span>
            <span
              title={t(
                hook.status === 'wired'
                  ? 'hookWiredHint'
                  : hook.status === 'missing'
                    ? 'hookMissingHint'
                    : 'hookUnresolvedHint',
              )}
              data-harness-hook-status={hook.status}
              className={badgeClass({
                shape: 'micro',
                className: cn(
                  hook.status === 'missing'
                    ? WARNING_BADGE
                    : 'border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)]',
                ),
              })}
            >
              {t(
                hook.status === 'wired'
                  ? 'hookWired'
                  : hook.status === 'missing'
                    ? 'hookMissing'
                    : 'hookUnresolved',
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DriftList({
  drift,
  contentByPath,
  t,
}: {
  drift: readonly AgentDriftFinding[];
  contentByPath: ReadonlyMap<string, string>;
  t: TranslateFn;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const pairChecks = drift.filter(
    (finding) => finding.check === 'skill-copy' || finding.check === 'agent-copy',
  );
  if (pairChecks.length === 0) return null;
  return (
    <section className="mt-4" data-testid="harness-drift">
      <h3 className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
        {t('driftTitle', { count: pairChecks.length })}
      </h3>
      <ul className="mt-2 flex flex-col gap-2">
        {pairChecks.map((finding) => {
          const left = typeof finding.detail?.claudePath === 'string' ? finding.detail.claudePath : null;
          const right = typeof finding.detail?.agentsPath === 'string' ? finding.detail.agentsPath : null;
          const isOpen = open === finding.path;
          return (
            <li
              key={`${finding.check}:${finding.path}`}
              className="rounded-card border border-[color:var(--color-amber-source-a35)] bg-[color:var(--color-amber-source-a07)] p-[var(--card-pad)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-body text-[color:var(--color-text-primary)]">
                  {finding.path}
                </span>
                {left && right ? (
                  /*
                   * A disclosure, so it says so: `aria-expanded` and the pressed token carry the
                   * state. The label deliberately does not flip — a control that renames itself
                   * under the cursor while also announcing `aria-expanded` states the same thing
                   * twice, and the two readings disagree (design-interaction, 2026-09-13).
                   */
                  <Chip
                    data-testid={`harness-drift-open-${finding.path}`}
                    active={isOpen}
                    aria-expanded={isOpen}
                    aria-controls={`harness-drift-diff-${finding.path}`}
                    onClick={() => setOpen(isOpen ? null : finding.path)}
                  >
                    <ChevronRight
                      size={ICON_SIZE.sm}
                      aria-hidden
                      className={cn('transition-transform', isOpen && 'rotate-90')}
                    />
                    {t('driftOpen')}
                  </Chip>
                ) : null}
              </div>
              {isOpen && left && right ? (
                /* The diff opens in the reading column, beneath the row it belongs to — two
                   complete texts side by side rather than a floating panel over the table. */
                <div
                  className="mt-3 grid gap-3 md:grid-cols-2"
                  id={`harness-drift-diff-${finding.path}`}
                  data-testid="harness-drift-diff"
                >
                  {[left, right].map((path) => (
                    <div key={path} className="min-w-0">
                      <p className="font-mono text-caption text-[color:var(--color-text-tertiary)]">
                        {path}
                      </p>
                      {/* Reachable and named: a bare `<pre>` is not in the tab order in a
                          WKWebView at all, and a byte comparison behind a horizontal scroller is
                          not a comparison. */}
                      <pre
                        tabIndex={0}
                        role="group"
                        aria-label={path}
                        className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-chip bg-[color:var(--color-overlay-1)] p-2 font-mono text-caption text-[color:var(--color-text-secondary)]"
                      >
                        {contentByPath.get(path) ?? ''}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function HarnessGuidesView({
  report,
  locale,
}: {
  report: HarnessReport;
  locale: string;
}) {
  const t = useTranslations('harness');
  const rows = useMemo(() => buildRows(report, t('nestedLabel')), [report, t]);
  const checks = report.analysis.checks;
  const declaredPairs = [checks.skillCopy, checks.agentCopy].filter(
    (check) => check.status !== 'not-applicable',
  ).length;

  if (rows.length === 0) {
    return <EmptyState title={t('empty')} description={t('emptyBody')} />;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="harness-guides">
      <header>
        <h2 className="text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {t('guidesTitle')}
        </h2>
        <p className="mt-1 text-body text-[color:var(--color-text-tertiary)]">
          {t('guidesCaption')}
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[color:var(--color-border-soft)]">
              {([
                ['columnFile', null],
                ['columnTools', null],
                ['columnSize', null],
                ['columnPair', 'pairHint'],
                ['columnChanged', 'columnChangedHint'],
              ] as const).map(([key, hint]) => (
                <th
                  key={key}
                  scope="col"
                  /* `scope="col"` hands this cell's text to every cell under it as its header
                     name, and the hint panel inside it is a 137-character paragraph. The label is
                     the column's name; the hint stays reachable on its own button. */
                  aria-label={t(key)}
                  className="pb-2 pr-4 text-label font-[var(--font-weight-signature)] uppercase tracking-[var(--tracking-label)] text-[color:var(--color-text-quaternary)]"
                >
                  <span className="inline-flex items-center gap-1">
                    {t(key)}
                    {hint ? <InfoHint label={t(key)}>{t(hint)}</InfoHint> : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                data-testid={`harness-guide-row-${row.ruleId}`}
                className="border-b border-[color:var(--color-overlay-1)] align-top"
              >
                <td className="py-2 pr-4">
                  <span className="font-mono text-body text-[color:var(--color-text-primary)]">
                    {row.label}
                  </span>
                  {row.fileCount > 1 ? (
                    <span className="ml-2 text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                      {t('fileCount', { count: row.fileCount })}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-4">
                  <ToolsCell row={row} t={t} />
                </td>
                <td className="py-2 pr-4">
                  <SizeCell row={row} report={report} t={t} />
                </td>
                <td className="py-2 pr-4">
                  {/*
                    The pair column answers one question — does this file match the twin the
                    repository itself declared it identical to — so a row with no declared twin says
                    "not applicable" rather than borrowing a finding from another check. The first
                    build printed a drift count beside `.codex/`, which has no pair at all (measured
                    in the browser, 2026-09-13).
                  */}
                  {row.declaredPair === null ? (
                    <span className="text-caption text-[color:var(--color-text-quaternary)]">
                      {t('pairNotApplicable')}
                    </span>
                  ) : row.pairDrift.length > 0 ? (
                    <span className={badgeClass({ shape: 'micro', className: WARNING_BADGE })}>
                      {t('driftTitle', { count: row.pairDrift.length })}
                    </span>
                  ) : (
                    <span
                      className="text-caption text-[color:var(--color-text-tertiary)]"
                      title={row.declaredPair}
                    >
                      {t('pairMatchesTwin')}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 text-body tabular-nums text-[color:var(--color-text-tertiary)]">
                  {formatWhen(row.lastModified, locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Never a bare zero: what is true is that the declared pairs match and nothing
          else was compared, and both halves of that are said together. */}
      <p className="text-caption text-[color:var(--color-text-quaternary)]">
        {t('pairMatched', { count: declaredPairs })} · {t('pairNotMeasured')} ·{' '}
        {t('reviewedOn', { date: CITATIONS_REVIEWED })}
      </p>

      <DriftList drift={report.analysis.drift} contentByPath={report.contents} t={t} />

      <section className="mt-2">
        <h3 className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {t('hooksTitle')}
        </h3>
        <p className="mt-1 text-body text-[color:var(--color-text-tertiary)]">{t('hooksCaption')}</p>
        <div className="mt-2 grid gap-3 md:grid-cols-2">
          {report.hookGroups.map((group) => (
            <HookGroup key={group.configPath} group={group} t={t} />
          ))}
        </div>
      </section>
    </div>
  );
}
