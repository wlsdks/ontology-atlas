'use client';

import type { ReactNode } from 'react';
import { CircleHelp, Info } from 'lucide-react';

import { AGENT_TOOL_LABELS } from '@/entities/agent-files';
import {
  ReachGrid,
  ReachMark,
  ScopePath,
  SCOPE_NAMES,
  SCOPE_REACH,
  scopeHookKey,
  type ScopeFinding,
  type ScopeFindings,
  type ScopeHeading,
  type ScopeHookTag,
} from '@/entities/agent-scopes';
import { cn } from '@/shared/lib/cn';
import type { HarnessScopes, ScopeFile, ScopeHook, ScopeTool } from '@/shared/lib/harness-scopes/tauri-harness-scopes';
import { IconButton, RowButton } from '@/shared/ui';
import { badgeClass } from '@/shared/ui/badge-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import type { SetupGroupId, SetupItem } from '../model/harness-setup';
import { displayPath, hookTitle, reportItemFor, scopeOptionKey, type ScopeHookGroup } from '../model/scope-hook-groups';
import { Fact, ItemStatus, NEUTRAL_BADGE, StatusHints, type TranslateFn } from './harness-setup-item';

/** Asks the page to open "Where settings live" on one tool's scope row. */
export type ExplainScope = (tool: ScopeTool, row: string) => void;

const NOTE = 'text-pretty text-label text-[color:var(--color-text-tertiary)]';

function scopeName(file: ScopeFile): string {
  return SCOPE_NAMES[file.scope];
}

function captionKey(file: ScopeFile): string {
  return file.picked ? 'scopes.picked' : `scopes.caption.${file.scope}`;
}

function placeKey(file: ScopeFile): string {
  if (file.picked || file.scope === 'user') return 'scopes.place.outside';
  if (file.scope === 'managed' || file.scope === 'system') return 'scopes.place.managed';
  return `scopes.place.${file.scope}`;
}

/** A script path as a person reads it: without Claude Code's `$CLAUDE_PROJECT_DIR` prefix. */
function readableScript(title: string): string {
  return title.replace(/^\$\{?CLAUDE_PROJECT_DIR(?::-\.)?\}?\//, '');
}

/** The script's file name, and the folder it sits in when the command names one. */
function splitTitle(title: string): { name: string; folder: string } {
  const cut = Math.max(title.lastIndexOf('/'), title.lastIndexOf('\\'));
  return cut > 0 ? { name: title.slice(cut + 1), folder: title.slice(0, cut) } : { name: title, folder: '' };
}

function affectsKey(file: ScopeFile): string {
  if (file.picked) return 'scopes.affects.picked';
  if (file.scope === 'project' && file.tool === 'codex') return 'scopes.affects.projectCodex';
  return `scopes.affects.${file.scope}`;
}

function gitKey(file: ScopeFile, scopes: HarnessScopes): string {
  if (file.scope === 'managed' || file.scope === 'system') return 'scopes.git.outside';
  if (file.scope === 'user') return 'scopes.git.user';
  if (file.scope === 'project') return 'scopes.git.project';
  const local = scopes.localFileGit;
  return local && (local.tracked || !local.ignored) ? 'scopes.git.localTracked' : 'scopes.git.local';
}

const VARIABLE: Readonly<Record<ScopeTool, string>> = { 'claude-code': 'CLAUDE_CONFIG_DIR', codex: 'CODEX_HOME' };

function FindingLine({ finding, scopes, t }: { finding: ScopeFinding; scopes: HarnessScopes; t: TranslateFn }) {
  const say = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const text =
    finding.kind === 'tool-gap' ?
      say('scopes.finding.toolGap', { toolA: AGENT_TOOL_LABELS[finding.blocking], toolB: AGENT_TOOL_LABELS[finding.unblocked] })
    : finding.kind === 'all-off' ? say('scopes.finding.allOff', { file: displayPath(finding.path, scopes) })
    : finding.kind === 'managed-only' ? say('scopes.finding.managedOnly', { count: finding.skippedCount })
    : finding.kind === 'local-tracked' ? say('scopes.finding.localTracked', { file: displayPath(finding.path, scopes) })
    : finding.kind === 'worktree-local' ?
      say('scopes.finding.worktreeLocal', {
        folder: finding.folder,
        mainFile: displayPath(finding.readFile, scopes),
        file: displayPath(finding.unusedFile, scopes),
      })
    : finding.kind === 'codex-inline' ?
      say('scopes.finding.codexInline', { file: displayPath(finding.path, scopes), events: finding.events.join(', ') })
    : null;
  if (!text) return null;
  return (
    <p data-scope-finding={finding.kind} className={cn('flex gap-2 px-2.5', NOTE)}>
      <Info size={ICON_SIZE.sm} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--color-text-quaternary)]" />
      <span className="min-w-0 break-words">{text}</span>
    </p>
  );
}

function findingsOfFile(file: ScopeFile, findings: ScopeFindings): ScopeFinding[] {
  return findings.lines.filter(
    (finding) =>
      ((finding.kind === 'all-off' || finding.kind === 'codex-inline') && finding.fileId === file.id) ||
      ((finding.kind === 'local-tracked' || finding.kind === 'worktree-local') && file.id === 'claude-local') ||
      (finding.kind === 'codex-inline' && finding.fileId === 'codex-user-config' && file.id === 'codex-user') ||
      (finding.kind === 'codex-inline' && finding.fileId === 'codex-project-config' && file.id === 'codex-project'),
  );
}

function FileNotes({ file, scopes, t }: { file: ScopeFile; scopes: HarnessScopes; t: TranslateFn }) {
  const say = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  if (file.status === 'invalid') {
    return <p data-scope-file-note="invalid" className={cn('pl-5 pt-0.5', NOTE)}>{say('scopes.now.invalid', { file: displayPath(file.path, scopes) })}</p>;
  }
  if (file.status === 'unreadable') {
    const reason = file.failure ?? 'io';
    const reasonKey = `scopes.reason.${reason.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}`;
    return (
      <p data-scope-file-note="unreadable" className={cn('pl-5 pt-0.5', NOTE)}>
        {say('scopes.now.unreadable', { file: displayPath(file.path, scopes), reason: say(reasonKey) })}
      </p>
    );
  }
  const shown = file.hooks.length;
  return (
    <>
      {file.hooksTruncated > 0 ? (
        <p data-scope-file-note="truncated" className={cn('pl-5 pt-0.5', NOTE)}>
          {say('scopes.now.truncated', { shown, total: shown + file.hooksTruncated })}
        </p>
      ) : null}
      {file.unknownEvents > 0 ? (
        <p data-scope-file-note="unknown-events" className={cn('pl-5 pt-0.5', NOTE)}>
          {say('scopes.now.unknownEvents', { count: file.unknownEvents })}
        </p>
      ) : null}
    </>
  );
}

function HookTags({ tags, t }: { tags: readonly ScopeHookTag[]; t: TranslateFn }) {
  const say = t as unknown as (key: string) => string;
  const labels = [
    ...tags.map((tag) =>
      tag.kind === 'work-status' ? ['work-status', say('scopes.tag.workStatus')]
      : ['two-files', say(tag.tool === 'codex' ? 'scopes.tag.twoFilesCodex' : 'scopes.tag.twoFilesClaude')],
    ),
  ];
  if (labels.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      {labels.map(([key, text]) => (
        <span key={key} data-scope-tag={key} className={badgeClass({ shape: 'tag', className: cn('whitespace-nowrap', NEUTRAL_BADGE) })}>
          {text}
        </span>
      ))}
    </span>
  );
}

function ScopeFileHeading({
  heading,
  scopes,
  findings,
  onExplain,
  t,
}: {
  heading: ScopeHeading;
  scopes: HarnessScopes;
  findings: ScopeFindings;
  onExplain?: ExplainScope;
  t: TranslateFn;
}) {
  const say = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const { file } = heading;
  const path = displayPath(file.path, scopes);
  return (
    <div
      data-scope-heading={file.id}
      className="sticky -top-4 z-[1] flex flex-col gap-px border-t border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-2.5 pb-1.5 pt-[7px] shadow-[inset_0_-1px_0_var(--color-overlay-1)] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-2 before:bg-[color:var(--color-canvas)]"
    >
      <div className="flex min-h-5 min-w-0 items-center gap-2">
        <ReachMark reach={SCOPE_REACH[file.scope]} />
        <span className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{scopeName(file)}</span>
        <span className="shrink-0 whitespace-nowrap rounded-chip border border-[color:var(--color-border-soft)] px-1.5 text-label text-[color:var(--color-text-tertiary)]">
          {AGENT_TOOL_LABELS[file.tool]}
        </span>
        {onExplain ? (
          <IconButton
            label={say('scopes.help', { scope: scopeName(file) })}
            size="xs"
            data-scope-explain={file.id}
            onClick={() => onExplain(file.tool, file.picked ? file.id : file.scope)}
            className="-ml-1 text-[color:var(--color-text-quaternary)]"
          >
            <CircleHelp size={ICON_SIZE.sm} aria-hidden />
          </IconButton>
        ) : null}
        <span className="min-w-0 flex-1 text-pretty text-right text-label text-[color:var(--color-text-secondary)]">{say(captionKey(file))}</span>
      </div>
      <div className="flex h-4 min-w-0 items-center gap-2 pl-5">
        <ScopePath path={path} className="flex-1 text-label text-[color:var(--color-text-tertiary)]" />
        {heading.hooks.length > 0 ? (
          <span className="shrink-0 text-label tabular-nums text-[color:var(--color-text-secondary)]">{say('sectionTotal', { count: heading.hooks.length })}</span>
        ) : null}
      </div>
      {file.tool === 'codex' ? (
        <p data-scope-file-note="codex-review" className={cn('pl-5 pt-0.5', NOTE)}>
          {file.scope === 'project' ? `${say('scopes.heading.codexTrust')} ` : null}
          {say('scopes.heading.codexReview')}
        </p>
      ) : null}
      <FileNotes file={file} scopes={scopes} t={t} />
      {findingsOfFile(file, findings).map((finding) => (
        <FindingLine key={finding.kind} finding={finding} scopes={scopes} t={t} />
      ))}
    </div>
  );
}

/** Pane 2 of a hook category: every settings file's hooks under its heading, the repository's first. */
export function ScopeHookList({
  group,
  categoryId,
  scopes,
  findings,
  reportItems,
  selectedKey,
  labelledBy,
  onSelect,
  onExplain,
  t,
}: {
  group: ScopeHookGroup;
  categoryId: SetupGroupId;
  scopes: HarnessScopes;
  findings: ScopeFindings;
  reportItems: ReadonlyMap<string, SetupItem>;
  selectedKey: string | null;
  labelledBy: string;
  onSelect: (key: string) => void;
  onExplain?: ExplainScope;
  t: TranslateFn;
}) {
  const say = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const lines = findings.lines.filter(
    (finding) => (finding.kind === 'tool-gap' && categoryId === 'blockingHooks') || finding.kind === 'managed-only',
  );
  const byScope = new Map<string, number>();
  for (const heading of group.headings) {
    const name = scopeName(heading.file);
    byScope.set(name, (byScope.get(name) ?? 0) + heading.hooks.length);
  }
  const activeScope = group.headings.find((heading) => heading.hooks.some((hook) => scopeOptionKey(heading.file, hook) === selectedKey));
  const activeName = activeScope ? scopeName(activeScope.file) : null;
  const jump = (name: string) => {
    const heading = group.headings.find((entry) => scopeName(entry.file) === name);
    if (!heading) return;
    document.querySelector(`[data-scope-heading="${CSS.escape(heading.file.id)}"]`)?.scrollIntoView({ block: 'start' });
  };
  return (
    <div data-testid="scope-hook-list" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3.5 px-2.5 text-label text-[color:var(--color-text-tertiary)]">
        {[...byScope].map(([name, count]) => (
          <button
            key={name}
            type="button"
            aria-current={name === activeName ? 'true' : undefined}
            onClick={() => jump(name)}
            className={cn(
              'relative inline-flex items-baseline gap-1.5 py-1 hover:text-[color:var(--color-text-primary)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]',
              name === activeName &&
                'text-[color:var(--color-text-primary)] after:absolute after:inset-x-0 after:bottom-0 after:h-[length:var(--tabbar-underline)] after:bg-[color:var(--color-indigo-accent)]',
            )}
          >
            {name}
            <em className="not-italic tabular-nums text-[color:var(--color-text-quaternary)]">{count}</em>
          </button>
        ))}
      </div>
      {lines.map((finding) => (
        <FindingLine key={finding.kind} finding={finding} scopes={scopes} t={t} />
      ))}
      <div className="flex flex-col">
        {group.headings.map((heading) => {
          const headingId = `${labelledBy}-${heading.file.id}`;
          return (
            <section key={heading.file.id} aria-labelledby={headingId} className="flex flex-col pb-1">
              <span id={headingId} className="sr-only">
                {`${scopeName(heading.file)} · ${AGENT_TOOL_LABELS[heading.file.tool]} · ${displayPath(heading.file.path, scopes)}`}
              </span>
              <ScopeFileHeading heading={heading} scopes={scopes} findings={findings} onExplain={onExplain} t={t} />
              {heading.hooks.length > 0 ? (
                <ul role="listbox" aria-labelledby={headingId} className="flex flex-col gap-0.5">
                  {heading.hooks.map((hook) => {
                    const key = scopeOptionKey(heading.file, hook);
                    const selected = key === selectedKey;
                    const item = reportItemFor(heading.file, hook, scopes, reportItems);
                    const tags = findings.tags.get(scopeHookKey(heading.file.id, hook)) ?? [];
                    const title = readableScript(displayPath(hookTitle(hook), scopes));
                    const { name, folder } = splitTitle(title);
                    return (
                      <li role="none" key={key}>
                        <RowButton
                          role="option"
                          aria-selected={selected}
                          tabIndex={selected ? 0 : -1}
                          data-option-key={key}
                          data-scope-hook={key}
                          active={selected}
                          hoverSurface="lift"
                          size="md"
                          onClick={() => onSelect(key)}
                          title={title}
                          className="h-13 w-full flex-col items-stretch justify-center gap-0.5 py-1.5"
                        >
                          <span className="flex min-w-0 items-baseline gap-2">
                            <span className={cn('min-w-0 flex-1 truncate font-mono text-body', selected ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)]')}>
                              {name}
                            </span>
                            {/* A wired hook needs no mark; only a missing or unresolved script does. */}
                            {item && item.hookStatus !== 'wired' ? <ItemStatus item={{ ...item, approvalGate: undefined }} oneLine t={t} /> : null}
                            <HookTags tags={tags} t={t} />
                          </span>
                          <span className="flex min-w-0 items-baseline gap-2 overflow-hidden font-mono text-label">
                            <span className="shrink-0 text-[color:var(--color-text-tertiary)]">{hook.event}</span>
                            {hook.matcher ? <span className="min-w-0 max-w-[40%] shrink truncate text-[color:var(--color-text-quaternary)]">{hook.matcher}</span> : null}
                            {folder ? <ScopePath path={folder} title={title} className="ml-auto min-w-0 max-w-[55%] text-[color:var(--color-text-quaternary)]" /> : null}
                          </span>
                        </RowButton>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
      <p className="sr-only">{say('sectionTotal', { count: group.count })}</p>
    </div>
  );
}

/** Pane 3 for one hook from any settings file: where it lives, who it reaches and what it runs. */
export function ScopeHookDetail({
  file,
  hook,
  scopes,
  findings,
  reportItem,
  headingId,
  action,
  onExplain,
  t,
}: {
  file: ScopeFile;
  hook: ScopeHook;
  scopes: HarnessScopes;
  findings: ScopeFindings;
  reportItem: SetupItem | null;
  headingId: string;
  action?: ReactNode;
  onExplain?: ExplainScope;
  t: TranslateFn;
}) {
  const say = t as unknown as (key: string, values?: Record<string, string | number>) => string;
  const tags = findings.tags.get(scopeHookKey(file.id, hook)) ?? [];
  const affects = say(affectsKey(file), { variable: VARIABLE[file.tool] });
  const others = (tag: ScopeHookTag) => (tag.kind === 'two-files' ? tag.otherPaths.map((path) => displayPath(path, scopes)) : []);
  return (
    <div data-testid="scope-hook-detail" data-scope-hook={scopeOptionKey(file, hook)}>
      <div className="flex items-start gap-3">
        <h2 id={headingId} className="min-w-0 flex-1 break-all font-mono text-body-lg text-[color:var(--color-text-primary)]">
          {readableScript(displayPath(hookTitle(hook), scopes))}
        </h2>
        {action}
      </div>
      <dl className="mt-1 divide-y divide-[color:var(--color-overlay-1)]">
        <Fact label={say('scopes.label.where')}>
          <p className="flex min-h-5 flex-wrap items-center gap-2">
            <ReachMark reach={SCOPE_REACH[file.scope]} size="md" />
            <span className="text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{scopeName(file)}</span>
            <span className="rounded-chip border border-[color:var(--color-border-soft)] px-1.5 text-label text-[color:var(--color-text-tertiary)]">
              {AGENT_TOOL_LABELS[file.tool]}
            </span>
            {file.picked ? (
              <span className="rounded-chip border border-[color:var(--color-indigo-line-a35)] px-1.5 text-label text-[color:var(--color-text-secondary)]">
                {say('scopes.picked')}
              </span>
            ) : null}
          </p>
          <p className="mt-1 break-all font-mono text-label text-[color:var(--color-text-secondary)]">{file.path}</p>
          <p className={cn('mt-1', NOTE)}>{say(placeKey(file))}</p>
          {onExplain ? (
            <button
              type="button"
              data-scope-explain-detail={file.id}
              onClick={() => onExplain(file.tool, file.picked ? file.id : file.scope)}
              className="mt-1.5 inline-flex items-center gap-1.5 rounded-chip text-label text-[color:var(--color-indigo-accent)] hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]"
            >
              <CircleHelp size={ICON_SIZE.sm} aria-hidden />
              {say('scopes.help', { scope: scopeName(file) })}
            </button>
          ) : null}
        </Fact>
        <Fact label={say('scopes.label.affects')}>
          <div className="flex flex-col items-start gap-2.5">
            <p className="min-w-0 text-pretty text-body text-[color:var(--color-text-primary)]">{affects}</p>
            <ReachGrid
              reach={SCOPE_REACH[file.scope]}
              label={affects}
              labels={{
                me: say('scopes.grid.me'),
                others: say('scopes.grid.others'),
                here: say('scopes.grid.thisRepository'),
                elsewhere: say('scopes.grid.otherProjects'),
              }}
            />
          </div>
        </Fact>
        <Fact label={say('scopes.label.git')}>
          <p className="text-pretty text-body text-[color:var(--color-text-primary)]">{say(gitKey(file, scopes))}</p>
        </Fact>
        <Fact label={say('detailEvent')}>
          <p className="break-all text-body text-[color:var(--color-text-primary)]">
            <span className="font-mono">{hook.event}</span>
            {hook.matcher ? <span className="font-mono text-label text-[color:var(--color-text-tertiary)]"> · {hook.matcher}</span> : null}
          </p>
        </Fact>
        <Fact label={say('scopes.label.command')}>
          {hook.kind === 'command' && hook.command ? (
            <p className="break-all font-mono text-label text-[color:var(--color-text-secondary)]">{hook.command}</p>
          ) : (
            <p className={NOTE}>{say('scopes.tag.typeOnly', { type: hook.kind })}</p>
          )}
        </Fact>
        {file.tool === 'codex' || reportItem || tags.length > 0 ? (
          <Fact label={say('detailStatus')}>
            <div className="flex flex-col gap-1.5">
              {reportItem ? (
                <>
                  <ItemStatus item={reportItem} t={t} />
                  <StatusHints item={reportItem} t={t} />
                </>
              ) : file.tool === 'codex' ? (
                <>
                  <span className={badgeClass({ shape: 'tag', className: cn('w-fit whitespace-nowrap', NEUTRAL_BADGE) })}>{say('hookApprovalGate')}</span>
                  <p className={NOTE}>{say('hookApprovalGateHint')}</p>
                </>
              ) : null}
              {tags.map((tag) => (
                <p key={tag.kind} data-scope-tag-hint={tag.kind} className={NOTE}>
                  {tag.kind === 'work-status' ?
                    say('scopes.tag.workStatusHint')
                  : say(tag.tool === 'codex' ? 'scopes.tag.twoFilesCodexHint' : 'scopes.tag.twoFilesClaudeHint', {
                      files: [displayPath(file.path, scopes), ...others(tag)].join(', '),
                    })}
                </p>
              ))}
            </div>
          </Fact>
        ) : null}
        <Fact label={say('scopes.label.runs')}>
          <p className="text-pretty text-body text-[color:var(--color-text-primary)]">
            {say(file.tool === 'codex' ? 'scopes.runs.codex' : 'scopes.runs.claude')}
          </p>
        </Fact>
      </dl>
    </div>
  );
}
