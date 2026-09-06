'use client';

import { Fragment, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { OntologyChangeItem, OntologyChangeSet } from '@/entities/knowledge-graph';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';
import { cn } from '@/shared/lib/cn';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { RowButton } from '@/shared/ui';
import { badgeClass } from '@/shared/ui/badge-class';
import { controlClass } from '@/shared/ui/control-class';

import { fieldNameKey, sentenceMapChange, stringList } from '../lib/change-summary';

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  // A list of slugs is a list, and it reads as one per line. `["a","b"]` is the request's
  // serialization, not the change (owner, 2026-09-06: the card read as a debugger's dump).
  const list = stringList(value);
  if (list) return list.join('\n');
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

/**
 * A block of the change's own text, folded when it is long enough to push the two answers out of
 * reach. Shared by a field value and by one sentence of a sentence map, so a long reason folds the
 * same way a long body does rather than growing the card until the buttons leave the frame.
 */
function FoldedText({ id, text, tone }: { id: string; text: string; tone: 'value' | 'sentence' }) {
  const t = useTranslations('ontologyChangeReview');
  const [open, setOpen] = useState(false);
  const long = isLongValue(text);
  return (
    <>
      <span
        id={id}
        /*
          The fold marker sits on the text itself rather than on the row around it: one row can now
          carry a previous value and a new one, and a sentence map carries one of these per target,
          so 「is this folded?」 is a fact about a block of text and not about the field.
        */
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
    </>
  );
}

/**
 * The name of a frontmatter key, in this product's words, with the key itself kept beneath it.
 *
 * ⚠️ Both halves are load-bearing. The plain word is what makes the row answerable — 「connection
 * reasons」 says what is being written where `relation_notes` only says which key holds it. The raw key stays
 * because it is what will literally appear in the Markdown, and because a person who opens the file
 * afterwards must find the same word there. A key this product cannot name in plain words shows
 * only its raw spelling; a friendly name invented for an unknown key is the one thing this card
 * must never do.
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

/**
 * One target and the sentence that will be written about it.
 *
 * `relation_notes` arrives as a map — eight reasons for eight targets — and it used to be printed
 * as one JSON string, then as one text block of alternating lines. Neither is a row a person reads.
 * One row per target, the target quiet and the sentence at reading size, is the only shape in which
 * 「is this right?」 can be answered per line.
 */
function SentenceRow({
  id,
  entry,
}: {
  id: string;
  entry: { target: string; text: string; before?: string };
}) {
  const t = useTranslations('ontologyChangeReview');
  return (
    <li
      data-testid="ontology-change-review-entry-row"
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
      <div className="min-w-0">
        <FoldedText id={id} text={entry.text} tone="sentence" />
      </div>
    </li>
  );
}

function ChangeDetails({
  item,
  operation,
}: {
  item: OntologyChangeItem;
  operation: OntologyChangeSet['operation'];
}) {
  const t = useTranslations('ontologyChangeReview');
  const visibleFields = item.fields.slice(0, 8);
  const hiddenCount = Math.max(0, item.fields.length - visibleFields.length);
  /*
   * ⚠️ **Never draw a before-value the request did not carry.** `OntologyChangeField.before` is
   * populated only by an editor that already holds the document on disk; an ACP request carries the
   * requested after-values and nothing else. So the card states which of the two situations it is
   * in rather than letting a person read a bare value as 「this replaces nothing」.
   */
  const carriesBefore = item.fields.some((field) => field.before !== undefined);

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
        <dl className="grid gap-2 text-label">
          {visibleFields.map((field) => {
            const sentences = sentenceMapChange(field.after, field.before);
            if (sentences) {
              /*
                A sentence map takes the full width instead of the 6rem key track: its values are
                sentences, and 96px of label beside them would leave about 240px of the 352px panel
                for prose that is the whole point of the row.
              */
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
                        />
                      ))}
                    </ul>
                  </dd>
                </div>
              );
            }
            const afterText = formatValue(field.after);
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
                    /*
                      Before and after are stacked and labelled rather than joined by an arrow.
                      A body, an element list and a reason are all multi-line values here, and
                      `old → new` on one line is legible only while both sides are short — one
                      shape that holds for every value beats two that depend on its length.
                    */
                    <>
                      <span className="mb-1 block whitespace-pre-line break-words text-[color:var(--color-text-quaternary)]">
                        <span className="mr-1.5 text-caption">{t('beforeLabel')}</span>
                        {formatValue(field.before)}
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
                  />
                </dd>
              </div>
            );
          })}
          {hiddenCount > 0 ? (
            <div className="text-caption text-[color:var(--color-text-quaternary)]">
              {t('moreFields', { count: hiddenCount })}
            </div>
          ) : null}
        </dl>
      ) : null}

      {visibleFields.length > 0 && !carriesBefore ? (
        <p
          data-testid="ontology-change-review-value-note"
          data-note={operation === 'create' ? 'new' : 'after-only'}
          className="break-keep text-caption leading-caption text-[color:var(--color-text-quaternary)]"
        >
          {t(operation === 'create' ? 'allValuesNew' : 'afterValuesOnly')}
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
}: {
  item: OntologyChangeItem;
  index: number;
  active: boolean;
  operation: OntologyChangeSet['operation'];
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
            <ChangeDetails item={item} operation={operation} />
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
      {/*
        ⚠️ **The address line, not a second title.** The card's own headline now says the change in
        plain words, so repeating 「Update concept」 at the same weight underneath would be the
        duplicate line this card has been criticised for twice. What is left here is what the
        sentence above cannot carry: the exact document the bytes land in — a file header, the way a
        pull request names the file before showing the hunk — with the operation demoted to a chip
        beside it.
      */}
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
          <ChangeDetails item={activeItem} operation={changeSet.operation} />
        </div>
      ) : null}
    </div>
  );
}
