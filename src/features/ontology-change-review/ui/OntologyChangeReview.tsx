'use client';

import { Fragment, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { OntologyChangeItem, OntologyChangeSet } from '@/entities/knowledge-graph';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';
import { cn } from '@/shared/lib/cn';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { RowButton } from '@/shared/ui';
import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';

import {
  fieldNameKey,
  sentenceMapChange,
  stringList,
  type OntologyChangeSentence,
} from '../lib/change-summary';

/* `none` for an empty list or a deleted key: `[]` and `null` are serialization, not the change. */
function formatValue(value: unknown, none: string): string {
  if (value === null || value === undefined) return none;
  if (Array.isArray(value) && value.length === 0) return none;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // A slug list reads one per line, not as its serialization.
  const list = stringList(value);
  if (list) return list.join('\n');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Longer values fold behind "show more" so the answer buttons stay in reach. */
const LONG_VALUE_CHARS = 320;
const LONG_VALUE_LINES = 6;

function isLongValue(text: string): boolean {
  return text.length > LONG_VALUE_CHARS || text.split('\n').length > LONG_VALUE_LINES;
}

/** Change text folded when long enough to push the two answers out of reach. */
function FoldedText({ id, text, tone, onExpandedChange }: { id: string; text: string; tone: 'value' | 'sentence'; onExpandedChange?: (expanded: boolean) => void }) {
  const t = useTranslations('ontologyChangeReview');
  const [open, setOpen] = useState(false);
  const long = isLongValue(text);
  return (
    <>
      <span
        id={id}
        /* The fold marker sits on the text block, since one row can carry a previous and a new value. */
        data-testid="ontology-change-review-text"
        data-long={long ? 'true' : undefined}
        data-folded={long ? String(!open) : undefined}
        className={cn(
          'block whitespace-pre-line break-words',
          tone === 'sentence'
            ? 'text-body leading-prose text-[color:var(--color-text-primary)]'
            : 'text-[color:var(--color-text-primary)]',
          long && !open && 'line-clamp-6',
        )}
      >
        {text}
      </span>
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          data-testid="ontology-change-review-field-toggle"
          onClick={() => setOpen((value) => {
            const next = !value;
            onExpandedChange?.(next);
            return next;
          })}
          className={controlClass({
            shape: 'card',
            size: 'sm',
            tone: 'muted',
            hoverBorder: 'strong',
            hoverInk: 'secondary',
            className: 'mt-1.5',
          })}
        >
          {t(open ? 'showLess' : 'showMore')}
        </button>
      ) : null}
    </>
  );
}

/**
 * A frontmatter key in plain words with the raw key beneath, as it appears in the file. An
 * unknown key shows only its raw spelling; never invent a friendly name for it.
 */
function FieldName({ fieldKey, testId }: { fieldKey: string; testId: string }) {
  const t = useTranslations('ontologyChangeReview');
  const nameKey = fieldNameKey(fieldKey);
  return (
    <dt
      data-testid={testId}
      data-field-key={fieldKey}
      className="break-words text-[color:var(--color-text-quaternary)]"
    >
      {nameKey ? (
        <>
          <span className="block text-[color:var(--color-text-tertiary)]">{t(nameKey)}</span>
          <span className="block break-words font-mono text-caption leading-caption">{fieldKey}</span>
        </>
      ) : (
        <span className="block break-words font-mono">{fieldKey}</span>
      )}
    </dt>
  );
}

/** One target and the sentence written about it, so each can be judged per line. */
function SentenceRow({
  id,
  entry,
  onExpandedChange,
}: {
  id: string;
  entry: { target: string; text: string; before?: string; change?: OntologyChangeSentence['change'] };
  onExpandedChange?: (expanded: boolean) => void;
}) {
  const t = useTranslations('ontologyChangeReview');
  return (
    <li
      data-testid="ontology-change-review-entry-row"
      data-change={entry.change}
      className="grid gap-0.5 border-t border-[color:var(--color-divider)] pt-2 first:border-t-0 first:pt-0"
    >
      <p className="break-words font-mono text-caption leading-caption text-[color:var(--color-text-quaternary)]">
        {entry.target}
      </p>
      {entry.before === undefined ? null : (
        <p className="break-words text-label leading-label text-[color:var(--color-text-quaternary)]">
          <span className="mr-1.5 text-caption">{t('beforeLabel')}</span>
          {entry.before}
        </p>
      )}
      {entry.change === 'removed' ? (
        /* A sentence going away says "after: none" in the field rows' words. */
        <p className="text-label leading-label text-[color:var(--color-text-secondary)]">
          <span className="mr-1.5 text-caption text-[color:var(--color-text-quaternary)]">{t('afterLabel')}</span>
          {t('noValue')}
        </p>
      ) : (
        <div className="min-w-0">
          <FoldedText id={id} text={entry.text} tone="sentence" onExpandedChange={onExpandedChange} />
        </div>
      )}
    </li>
  );
}

function ChangeDetails({
  item,
  operation,
  onFullScopeAvailableChange,
  valueBasis,
}: {
  item: OntologyChangeItem;
  operation: OntologyChangeSet['operation'];
  onFullScopeAvailableChange?: (available: boolean) => void;
  valueBasis: 'after-only' | 'request-raw';
}) {
  const t = useTranslations('ontologyChangeReview');
  const [showAllFields, setShowAllFields] = useState(false);
  const [expandedLongValues, setExpandedLongValues] = useState<Set<string>>(() => new Set());
  const fieldListId = `ontology-change-fields-${item.key.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const visibleFields = showAllFields ? item.fields : item.fields.slice(0, 8);
  const hiddenCount = Math.max(0, item.fields.length - visibleFields.length);
  const hasFieldOverflow = item.fields.length > 8;
  const longValueIds = item.fields.flatMap((field) => {
    const sentences = sentenceMapChange(field.after, field.before);
    if (sentences) return sentences.flatMap((entry) => {
      const id = `ontology-change-review-sentence-${item.key}-${field.key}-${entry.target}`;
      return isLongValue(entry.text) ? [id] : [];
    });
    const id = `ontology-change-review-value-${item.key}-${field.key}`;
    return isLongValue(formatValue(field.after, t('noValue'))) ? [id] : [];
  });
  const fullScopeAvailable = (!hasFieldOverflow || showAllFields)
    && longValueIds.every((id) => expandedLongValues.has(id));
  useEffect(() => {
    onFullScopeAvailableChange?.(fullScopeAvailable);
  }, [fullScopeAvailable, onFullScopeAvailableChange]);
  const trackExpanded = (id: string, expanded: boolean) => {
    setExpandedLongValues((current) => {
      const next = new Set(current);
      if (expanded) next.add(id); else next.delete(id);
      return next;
    });
  };
  /* Never draw a before-value the request did not carry: ACP requests carry only after-values. */
  const carriesBefore = item.fields.some((field) => field.before !== undefined);

  return (
    <>
      {/* One grid, `auto` label column; the field list keeps 6rem, measured by `contextual-meaning-editor.spec.ts`. */}
      {item.relation ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-label">
          {([
            ['from', item.relation.from],
            ['relation', item.relation.type],
            ['to', item.relation.to],
          ] as const).map(([label, value]) => (
            <Fragment key={label}>
              <dt className="text-[color:var(--color-text-quaternary)]">{t(label)}</dt>
              <dd className="break-words font-mono text-[color:var(--color-text-primary)]">{value}</dd>
            </Fragment>
          ))}
          {item.relation.why ? (
            <>
              {/* The reason gets the space; from/relation/to already appear in the row summary. */}
              <dt className="text-[color:var(--color-text-quaternary)]">{t('why')}</dt>
              <dd className="break-words leading-prose text-[color:var(--color-text-secondary)]">
                {item.relation.why}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {visibleFields.length > 0 ? (
        <dl id={fieldListId} className="grid gap-2 text-label">
          {visibleFields.map((field) => {
            const sentences = sentenceMapChange(field.after, field.before);
            if (sentences) {
              /* A sentence map takes the full width: 96px of label would leave too little room for prose. */
              return (
                <div key={field.key} data-testid="ontology-change-review-entry-group" className="grid gap-1.5">
                  <FieldName fieldKey={field.key} testId="ontology-change-review-entry-key" />
                  <dd className="min-w-0">
                    <ul className="grid gap-2">
                      {sentences.map((entry) => (
                        <SentenceRow
                          key={entry.target}
                          id={`ontology-change-review-sentence-${item.key}-${field.key}-${entry.target}`}
                          entry={entry}
                          onExpandedChange={(expanded) => trackExpanded(`ontology-change-review-sentence-${item.key}-${field.key}-${entry.target}`, expanded)}
                        />
                      ))}
                    </ul>
                  </dd>
                </div>
              );
            }
            const afterText = formatValue(field.after, t('noValue'));
            return (
              /* In the 352px relation panel, 6rem keeps the current long keys readable;
                 minmax(0,1fr) plus break-words still lets unbroken paths wrap when needed. */
              <div
                key={field.key}
                data-testid="ontology-change-review-field-row"
                className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2"
              >
                <FieldName fieldKey={field.key} testId="ontology-change-review-field-key" />
                <dd
                  data-testid="ontology-change-review-field-value"
                  data-has-before={field.before === undefined ? undefined : 'true'}
                  className="min-w-0 break-words text-[color:var(--color-text-primary)]"
                >
                  {field.before === undefined ? null : (
                    /* Before and after stacked and labelled, since multi-line values break an inline arrow. */
                    <>
                      <span className="mb-1 block whitespace-pre-line break-words text-[color:var(--color-text-quaternary)]">
                        <span className="mr-1.5 text-caption">{t('beforeLabel')}</span>
                        {formatValue(field.before, t('noValue'))}
                      </span>
                      <span className="mr-1.5 text-caption text-[color:var(--color-text-quaternary)]">
                        {t('afterLabel')}
                      </span>
                    </>
                  )}
                  <FoldedText
                    id={`ontology-change-review-value-${item.key}-${field.key}`}
                    text={afterText}
                    tone="value"
                    onExpandedChange={(expanded) => trackExpanded(`ontology-change-review-value-${item.key}-${field.key}`, expanded)}
                  />
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}

      {hasFieldOverflow ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--color-divider)] pt-2">
          <p
            data-testid="ontology-change-review-field-coverage"
            data-visible={visibleFields.length}
            data-total={item.fields.length}
            data-hidden={hiddenCount}
            className="text-caption leading-caption text-[color:var(--color-text-quaternary)]"
          >
            {t('fieldCoverage', {
              visible: visibleFields.length,
              total: item.fields.length,
              hidden: hiddenCount,
            })}
          </p>
          <button
            type="button"
            aria-expanded={showAllFields}
            aria-controls={fieldListId}
            data-testid="ontology-change-review-fields-toggle"
            onClick={() => setShowAllFields((value) => !value)}
            className={controlClass({
              shape: 'card',
              size: 'sm',
              tone: 'muted',
              hoverBorder: 'strong',
              hoverInk: 'secondary',
            })}
          >
            {t(showAllFields ? 'showFewerFields' : 'showAllFields', { count: item.fields.length })}
          </button>
        </div>
      ) : null}

      {visibleFields.length > 0 && !carriesBefore ? (
        <p
          data-testid="ontology-change-review-value-note"
          data-note={operation === 'create' ? 'new' : 'after-only'}
          className="break-keep text-caption leading-caption text-[color:var(--color-text-quaternary)]"
        >
          {t(operation === 'create' ? 'allValuesNew' : valueBasis === 'request-raw' ? 'requestValuesRaw' : 'afterValuesOnly')}
        </p>
      ) : null}
    </>
  );
}

function ChangeItemRow({
  item,
  index,
  active,
  operation,
  onSelect,
  valueBasis,
}: {
  item: OntologyChangeItem;
  index: number;
  active: boolean;
  operation: OntologyChangeSet['operation'];
  onSelect: () => void;
  valueBasis: 'after-only' | 'request-raw';
}) {
  const t = useTranslations('ontologyChangeReview');
  const bodyId = `ontology-change-item-${index}`;
  const { mounted, boxRef, contentRef } = useRowDisclosure(active);
  const summary = item.relation
    ? `${item.relation.from} → ${item.relation.type} → ${item.relation.to}`
    : item.target ?? t('unknownTarget');

  return (
    <li
      data-testid="acp-ontology-change-item"
      className="border-t border-[color:var(--color-divider)] first:border-t-0"
    >
      <RowButton
        size="md"
        tone={active ? 'strong' : 'secondary'}
        active={active}
        hoverInk="strong"
        hoverSurface="lift"
        aria-expanded={active}
        aria-controls={bodyId}
        data-testid={`acp-ontology-change-item-${index}`}
        onClick={onSelect}
        className="w-full rounded-none px-1 py-2 text-left"
      >
        <ChevronRight
          size={ICON_SIZE.sm}
          aria-hidden
          className="shrink-0 transition-transform"
          style={{ transform: active ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        <span className="shrink-0 font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-label">{summary}</span>
      </RowButton>
      <div
        ref={boxRef}
        id={bodyId}
        data-state={active ? 'open' : 'closed'}
        className="ai-row-disclosure"
        inert={!active}
      >
        {mounted ? (
          <div
            ref={contentRef}
            /* The top padding separates the detail from this row's filled active background. */
            className="ai-row-disclosure-body grid gap-2 pb-2.5 pl-7 pr-1 pt-1.5"
          >
            <ChangeDetails key={item.key} item={item} operation={operation} valueBasis={valueBasis} />
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function OntologyChangeReview({
  changeSet,
  activeItemIndex,
  onActiveItemChange,
  testId = 'acp-ontology-change-review',
  onFullScopeAvailableChange,
  valueBasis = 'after-only',
}: {
  changeSet: OntologyChangeSet;
  activeItemIndex?: number;
  onActiveItemChange?: (index: number) => void;
  testId?: string;
  onFullScopeAvailableChange?: (available: boolean) => void;
  valueBasis?: 'after-only' | 'request-raw';
}) {
  const t = useTranslations('ontologyChangeReview');
  const [localActiveIndex, setLocalActiveIndex] = useState(0);
  const requestedIndex = activeItemIndex ?? localActiveIndex;
  const activeIndex = Math.min(
    Math.max(requestedIndex, 0),
    Math.max(0, changeSet.items.length - 1),
  );
  const activeItem = changeSet.items[activeIndex] ?? null;
  const batch = changeSet.items.length > 1;
  const choose = (index: number) => {
    if (activeItemIndex === undefined) setLocalActiveIndex(index);
    onActiveItemChange?.(index);
  };

  return (
    <div
      data-testid={testId}
      data-change-operation={changeSet.operation}
      data-change-exact={String(changeSet.exact)}
      data-active-item={activeIndex}
      className="grid gap-2"
    >
      {/* The address line names the exact document, with the operation as a chip beside it. */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            data-testid="ontology-change-review-operation"
            className={badgeClass({
              shape: 'micro',
              className:
                'border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-tertiary)]',
            })}
          >
            {t(`operation.${changeSet.operation}`)}
          </span>
          {!batch && activeItem?.target ? (
            <p className="min-w-0 break-words font-mono text-label text-[color:var(--color-text-secondary)]">
              {activeItem.target}
            </p>
          ) : null}
        </div>
        {batch ? (
          <span className="shrink-0 text-caption text-[color:var(--color-text-quaternary)]">
            {t('itemCount', { count: changeSet.itemCount })}
          </span>
        ) : null}
      </div>

      {batch ? (
        <>
          <p className="break-keep text-caption leading-caption text-[color:var(--color-text-tertiary)]">
            {t('batchHint')}
          </p>
          <ol
            aria-label={t('batchLabel')}
            className="overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]"
          >
            {changeSet.items.map((item, index) => (
              <ChangeItemRow
                key={item.key}
                item={item}
                index={index}
                active={index === activeIndex}
                operation={changeSet.operation}
                onSelect={() => choose(index)}
                valueBasis={valueBasis}
              />
            ))}
          </ol>
        </>
      ) : activeItem ? (
        <div
          className={cn(
            'grid gap-2',
            (activeItem.relation || activeItem.fields.length > 0) &&
              'border-t border-[color:var(--color-divider)] pt-2',
          )}
        >
          <ChangeDetails key={activeItem.key} item={activeItem} operation={changeSet.operation} onFullScopeAvailableChange={onFullScopeAvailableChange} valueBasis={valueBasis} />
        </div>
      ) : null}
    </div>
  );
}
