'use client';

import { Fragment, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { OntologyChangeItem, OntologyChangeSet } from '@/entities/knowledge-graph';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';
import { cn } from '@/shared/lib/cn';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { RowButton } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // A map of sentences (relation_notes) reads as one line per target, not as a JSON
  // string a person has to parse at a permission card (owner, 2026-09-06).
  if (typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 0 && entries.every(([, v]) => typeof v === 'string')) {
      return entries.map(([k, v]) => `${k}\n${String(v)}`).join('\n\n');
    }
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Past this many characters a field value is folded to its first lines behind 「show more」.
 *
 * ⚠️ Measured on the owner's phone-height screenshot (2026-09-03): an agent's `add_concept` body
 * ran to about 2,400 characters of element lists, decision citations and a confidence paragraph,
 * and the permission card printed all of it — the 「Don't / Allow once」 buttons sat two screens
 * below the question. A checkpoint whose answer buttons are out of reach is a wall, not a
 * question. The first lines say what the change is; the rest is there on request, unclamped,
 * because nothing is hidden from a person who wants to read it before deciding.
 */
const LONG_VALUE_CHARS = 320;
const LONG_VALUE_LINES = 6;

function isLongValue(text: string): boolean {
  return text.length > LONG_VALUE_CHARS || text.split('\n').length > LONG_VALUE_LINES;
}

function FieldValue({ id, text }: { id: string; text: string }) {
  const t = useTranslations('ontologyChangeReview');
  const [open, setOpen] = useState(false);
  const long = isLongValue(text);
  return (
    <dd
      data-testid="ontology-change-review-field-value"
      data-long={long ? 'true' : undefined}
      data-folded={long ? String(!open) : undefined}
      className="min-w-0 break-words text-[color:var(--color-text-primary)]"
    >
      <span id={id} className={cn('block whitespace-pre-line break-words', long && !open && 'line-clamp-6')}>
        {text}
      </span>
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          data-testid="ontology-change-review-field-toggle"
          onClick={() => setOpen((value) => !value)}
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
    </dd>
  );
}

function ChangeDetails({ item }: { item: OntologyChangeItem }) {
  const t = useTranslations('ontologyChangeReview');
  const visibleFields = item.fields.slice(0, 8);
  const hiddenCount = Math.max(0, item.fields.length - visibleFields.length);

  return (
    <>
      {/*
        ⚠️ **One grid for the whole list, not one grid per row.** Each row used to be its own
        `grid grid-cols-[4.5rem_…]`, so the labels lined up only because 4.5rem was written four
        times — and 4.5rem is 72px holding four 11px labels of two characters each, about 22px of
        text. The remaining 50px read as a gap between a label and its own value, which is what
        made this block look crooked (owner, on the installed rc.13 build).

        `auto` sizes the shared column to the widest label instead, so alignment is a property of
        the structure rather than of a number that has to be kept true by hand, and a longer word
        or another locale cannot break it.

        The field list below keeps its explicit 6rem: those keys are raw frontmatter names, and
        `contextual-meaning-editor.spec.ts` measures that column at 96px inside a 352px panel.
      */}
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
              {/* The reason is prose and the only new thing here: from/relation/to already appear
                  in the row's own summary, so this line gets the space to be read. */}
              <dt className="text-[color:var(--color-text-quaternary)]">{t('why')}</dt>
              <dd className="break-words leading-prose text-[color:var(--color-text-secondary)]">
                {item.relation.why}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}

      {visibleFields.length > 0 ? (
        <dl className="grid gap-1.5 text-label">
          {visibleFields.map((field) => (
            /* In the 352px relation panel, 6rem keeps the current long keys readable;
               minmax(0,1fr) plus break-words still lets unbroken paths wrap when needed. */
            <div
              key={field.key}
              data-testid="ontology-change-review-field-row"
              className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2"
            >
              <dt
                data-testid="ontology-change-review-field-key"
                className="break-words font-mono text-[color:var(--color-text-quaternary)]"
              >
                {field.key}
              </dt>
              <FieldValue
                id={`ontology-change-review-value-${item.key}-${field.key}`}
                text={formatValue(field.after)}
              />
            </div>
          ))}
          {hiddenCount > 0 ? (
            <div className="text-caption text-[color:var(--color-text-quaternary)]">
              {t('moreFields', { count: hiddenCount })}
            </div>
          ) : null}
        </dl>
      ) : null}
    </>
  );
}

function ChangeItemRow({
  item,
  index,
  active,
  onSelect,
}: {
  item: OntologyChangeItem;
  index: number;
  active: boolean;
  onSelect: () => void;
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
            /*
              ⚠️ `pt` matters here in a way it does not on the other disclosures: this row carries a
              filled active background, so without it the first label sits flush against that fill and
              reads as part of the header rather than as the start of the detail.
            */
            className="ai-row-disclosure-body grid gap-2 pb-2.5 pl-7 pr-1 pt-1.5"
          >
            <ChangeDetails item={item} />
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
}: {
  changeSet: OntologyChangeSet;
  activeItemIndex?: number;
  onActiveItemChange?: (index: number) => void;
  testId?: string;
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
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <p className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
          {t(`operation.${changeSet.operation}`)}
        </p>
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
                onSelect={() => choose(index)}
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
          {activeItem.target ? (
            <p className="break-words font-mono text-label text-[color:var(--color-text-secondary)]">
              {activeItem.target}
            </p>
          ) : null}
          <ChangeDetails item={activeItem} />
        </div>
      ) : null}
    </div>
  );
}
