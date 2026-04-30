'use client';

import {
  GitBranch,
  ListChecks,
  RotateCcw,
  SquareCheckBig,
} from 'lucide-react';
import {
  getDeveloperActivityTargetSlugs,
  type DeveloperActivityEvent,
  type VaultDoc,
} from '@/entities/docs-vault';

interface Props {
  events: DeveloperActivityEvent[];
  docsBySlug: Map<string, VaultDoc>;
  selectedSlug: string | null;
  onNavigate: (slug: string) => void;
  onAcknowledge: (id: string) => void;
  onRestore: (id: string) => void;
}

const SOURCE_LABEL: Record<DeveloperActivityEvent['source'], string> = {
  mcp: 'MCP',
  api: 'API',
  github: 'GitHub',
};

const KIND_LABEL: Record<DeveloperActivityEvent['kind'], string> = {
  'doc.created': '문서 생성',
  'doc.updated': '문서 수정',
  'doc.linked': '연결 변경',
  'github.push': 'GitHub Push',
  'github.pull_request': 'GitHub PR',
  'github.issue': 'GitHub Issue',
};

const formatter = new Intl.DateTimeFormat('ko-KR', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function DocsVaultActivityPanel({
  events,
  docsBySlug,
  selectedSlug,
  onNavigate,
  onAcknowledge,
  onRestore,
}: Props) {
  const visibleEvents = events.slice(0, 4);
  const unreadCount = events.filter((event) => event.unread !== false).length;
  const activeDocs = getActiveDocs(events, docsBySlug);
  const selectedDocActive =
    selectedSlug !== null && activeDocs.some((doc) => doc.slug === selectedSlug);
  const primaryActiveDoc = activeDocs[0] ?? null;
  const hasEvents = visibleEvents.length > 0;
  if (!hasEvents && activeDocs.length === 0) return null;
  const summaryLabel = selectedDocActive
    ? '지금 보는 문서 작업 중'
    : activeDocs.length > 0
      ? `${activeDocs.length}개 문서 작업 중`
      : '작업 이벤트 있음';

  return (
    <section
      className="mx-auto max-w-[760px] px-6 pt-4 md:px-10"
      aria-label="Developer Activity Ingest"
    >
      <details
        className={`group rounded-md border ${
          selectedDocActive
            ? 'border-[color:rgba(83,190,137,0.24)] bg-[color:rgba(83,190,137,0.045)]'
            : 'border-[color:rgba(139,151,255,0.14)] bg-[color:rgba(94,106,210,0.035)]'
        }`}
        open={selectedDocActive}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.45)]">
          <ListChecks
            size={13}
            aria-hidden
            className={
              selectedDocActive
                ? 'text-[color:rgba(143,221,184,0.92)]'
                : 'text-[color:var(--color-text-quaternary)]'
            }
          />
          <span className="min-w-0 truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            작업 모니터
          </span>
          <span
            className={`rounded-sm border px-1.5 py-0.5 text-[10px] ${
              selectedDocActive
                ? 'border-[color:rgba(83,190,137,0.24)] bg-[color:rgba(83,190,137,0.08)] text-[color:rgba(143,221,184,0.92)]'
                : 'border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]'
            }`}
          >
            {summaryLabel}
          </span>
          {unreadCount > 0 ? (
            <span
              role="status"
              aria-live="polite"
              className="ml-auto rounded-sm border border-[color:rgba(139,151,255,0.26)] px-1.5 py-0.5 font-mono text-[9px] text-[color:rgba(200,210,255,0.9)]"
            >
              {unreadCount} new
            </span>
          ) : null}
        </summary>

        {activeDocs.length > 0 ? (
          <div className="border-t border-[color:var(--color-border-soft)] px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0">
                <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  작업 대상
                </p>
                <p className="mt-0.5 text-[11px] text-[color:var(--color-text-tertiary)]">
                  새 이벤트가 닿은 문서를 먼저 확인하세요.
                </p>
              </div>
              {primaryActiveDoc ? (
                <button
                  type="button"
                  onClick={() => onNavigate(primaryActiveDoc.slug)}
                  aria-label={`${primaryActiveDoc.title} 작업 문서 열기`}
                  className="ml-auto rounded-sm border border-[color:rgba(139,151,255,0.28)] px-2 py-1 text-[11px] text-[color:rgba(200,210,255,0.92)] transition-colors hover:border-[color:rgba(139,151,255,0.55)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.5)]"
                >
                  작업 문서 열기
                </button>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {activeDocs.slice(0, 8).map((doc) => (
                <ActiveDocChip
                  key={doc.slug}
                  doc={doc}
                  selected={doc.slug === selectedSlug}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ) : null}

        {hasEvents ? (
          <details className="border-t border-[color:var(--color-border-soft)]">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.45)]">
              <ListChecks
                size={13}
                aria-hidden
                className="text-[color:var(--color-text-quaternary)]"
              />
              <span className="min-w-0 flex-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                이벤트 로그
              </span>
              <span className="rounded-sm border border-[color:var(--color-divider)] px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--color-text-quaternary)]">
                {visibleEvents.length}
              </span>
            </summary>
            <ul className="space-y-2 px-3 pb-3">
              {visibleEvents.map((event) => (
                <ActivityEventRow
                  key={event.id}
                  event={event}
                  docsBySlug={docsBySlug}
                  onNavigate={onNavigate}
                  onAcknowledge={onAcknowledge}
                  onRestore={onRestore}
                />
              ))}
            </ul>
          </details>
        ) : null}
      </details>
    </section>
  );
}

function ActivityEventRow({
  event,
  docsBySlug,
  onNavigate,
  onAcknowledge,
  onRestore,
}: {
  event: DeveloperActivityEvent;
  docsBySlug: Map<string, VaultDoc>;
  onNavigate: (slug: string) => void;
  onAcknowledge: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const targetDocs = getEventDocs(event, docsBySlug);
  const targetDoc = targetDocs[0] ?? null;
  const unread = event.unread !== false;
  return (
    <li className="flex min-w-0 items-start gap-2 rounded-sm border border-[color:var(--color-border-soft)] bg-[color:rgba(12,14,20,0.45)] px-2.5 py-2.5">
      <span
        aria-hidden
        className={`mt-1.5 h-1.5 w-1.5 flex-none rounded-full ${
          unread
            ? 'bg-[color:rgba(139,151,255,0.95)]'
            : 'bg-[color:rgba(120,128,145,0.6)]'
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-sm border border-[color:var(--color-divider)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {SOURCE_LABEL[event.source]}
          </span>
          <span className="rounded-sm border border-[color:var(--color-divider)] px-1.5 py-0.5 text-[10px] text-[color:var(--color-text-quaternary)]">
            {KIND_LABEL[event.kind]}
          </span>
          <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-[color:var(--color-text-primary)]">
            {event.title}
          </p>
          <span
            className={`rounded-sm border px-1.5 py-0.5 text-[10px] ${
              unread
                ? 'border-[color:rgba(139,151,255,0.24)] text-[color:rgba(200,210,255,0.9)]'
                : 'border-[color:var(--color-divider)] text-[color:var(--color-text-quaternary)]'
            }`}
          >
            {unread ? '미확인' : '확인됨'}
          </span>
        </div>
        {event.summary ? (
          <p className="mt-1 line-clamp-2 text-[11.5px] leading-[1.45] text-[color:var(--color-text-tertiary)]">
            {event.summary}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
          <span>{formatter.format(new Date(event.createdAt))}</span>
          {event.actor ? <span translate="no">{event.actor}</span> : null}
          {event.repository ? (
            <span className="inline-flex min-w-0 items-center gap-1" translate="no">
              <GitBranch size={10} aria-hidden />
              <span className="max-w-[160px] truncate">
                {event.repository}
              </span>
            </span>
          ) : null}
          {event.branch ? (
            <span className="max-w-[140px] truncate" translate="no">
              {event.branch}
            </span>
          ) : null}
        </div>
        {targetDocs.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {targetDocs.slice(0, 4).map((doc) => (
              <button
                key={doc.slug}
                type="button"
                onClick={() => onNavigate(doc.slug)}
                aria-label={`${doc.title} 문서 열기`}
                className="min-w-0 max-w-[180px] rounded-sm border border-[color:var(--color-divider)] px-1.5 py-0.5 text-left text-[10.5px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.45)]"
              >
                <span className="block truncate">{doc.title}</span>
              </button>
            ))}
            {targetDocs.length > 4 ? (
              <span className="rounded-sm border border-[color:var(--color-divider)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                +{targetDocs.length - 4}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 rounded-sm border border-[color:var(--color-border-soft)] px-2 py-1 text-[10.5px] text-[color:var(--color-text-quaternary)]">
            연결된 문서 없음
          </p>
        )}
      </div>
      <div className="flex flex-none items-center gap-1">
        {targetDoc ? (
          <button
            type="button"
            onClick={() => {
              onNavigate(targetDoc.slug);
              onAcknowledge(event.id);
            }}
            aria-label={`${targetDoc.title} 열고 ${event.title} 확인 처리`}
            className="rounded-sm border border-[color:rgba(139,151,255,0.28)] px-2 py-1 text-[11px] text-[color:rgba(200,210,255,0.92)] transition-colors hover:border-[color:rgba(139,151,255,0.55)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.5)]"
          >
            열고 확인
          </button>
        ) : null}
        {unread ? (
          <button
            type="button"
            onClick={() => onAcknowledge(event.id)}
            aria-label={`${event.title} 확인 처리`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.5)]"
          >
            <SquareCheckBig size={12} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onRestore(event.id)}
            aria-label={`${event.title} 확인 취소`}
            className="inline-flex h-7 items-center gap-1 rounded-sm border border-[color:var(--color-divider)] px-2 text-[11px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.5)]"
          >
            <RotateCcw size={12} aria-hidden />
            확인 취소
          </button>
        )}
      </div>
    </li>
  );
}

function ActiveDocChip({
  doc,
  selected,
  onNavigate,
}: {
  doc: VaultDoc;
  selected: boolean;
  onNavigate: (slug: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(doc.slug)}
      aria-label={`${doc.title} 작업 문서 열기`}
      className={`min-w-0 max-w-[220px] rounded-sm border px-2 py-1 text-left text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.5)] ${
        selected
          ? 'border-[color:rgba(139,151,255,0.5)] bg-[color:rgba(94,106,210,0.16)] text-[color:var(--color-text-primary)]'
          : 'border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)] hover:border-[color:rgba(139,151,255,0.35)] hover:text-[color:var(--color-text-primary)]'
      }`}
      title={doc.title}
    >
      <span className="block truncate">{doc.title}</span>
    </button>
  );
}

function getActiveDocs(
  events: DeveloperActivityEvent[],
  docsBySlug: Map<string, VaultDoc>,
): VaultDoc[] {
  const docs = new Map<string, VaultDoc>();
  for (const event of events) {
    if (event.unread === false) continue;
    for (const doc of getEventDocs(event, docsBySlug)) {
      docs.set(doc.slug, doc);
    }
  }
  return [...docs.values()].slice(0, 12);
}

function getEventDocs(
  event: DeveloperActivityEvent,
  docsBySlug: Map<string, VaultDoc>,
): VaultDoc[] {
  const docs = new Map<string, VaultDoc>();
  for (const slug of getDeveloperActivityTargetSlugs(event)) {
    const doc = docsBySlug.get(slug);
    if (doc) docs.set(doc.slug, doc);
  }
  return [...docs.values()];
}
