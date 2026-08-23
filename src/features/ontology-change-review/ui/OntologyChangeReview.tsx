'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { OntologyChangeItem, OntologyChangeSet } from '@/entities/knowledge-graph';
import { useRowDisclosure } from '@/shared/lib/use-row-disclosure';
import { cn } from '@/shared/lib/cn';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { RowButton } from '@/shared/ui';

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function ChangeDetails({ item }: { item: OntologyChangeItem }) {
  const t = useTranslations('ontologyChangeReview');
  const visibleFields = item.fields.slice(0, 8);
  const hiddenCount = Math.max(0, item.fields.length - visibleFields.length);

  return (
    <>
      {item.relation ? (
        <dl className="grid gap-1.5 text-label">
          {([
            ['from', item.relation.from],
            ['relation', item.relation.type],
            ['to', item.relation.to],
          ] as const).map(([label, value]) => (
            <div key={label} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
              <dt className="text-[color:var(--color-text-quaternary)]">{t(label)}</dt>
              <dd className="break-words font-mono text-[color:var(--color-text-primary)]">{value}</dd>
            </div>
          ))}
          {item.relation.why ? (
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
              <dt className="text-[color:var(--color-text-quaternary)]">{t('why')}</dt>
              <dd className="break-words text-[color:var(--color-text-secondary)]">
                {item.relation.why}
              </dd>
            </div>
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
              <dd
                data-testid="ontology-change-review-field-value"
                className="break-words text-[color:var(--color-text-primary)]"
              >
                {formatValue(field.after)}
              </dd>
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
            className="ai-row-disclosure-body grid gap-2 pb-2 pl-7 pr-1"
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
