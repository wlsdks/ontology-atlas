import { formatValue, type FormattedValue } from '@/features/ontology-change-review';
import type { OntologyChangeSet } from '@/entities/knowledge-graph';

export function formatReviewValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  try { return JSON.stringify(value); } catch { return String(value); }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

const MEANING_SECTIONS = new Set(['Definition', 'Includes', 'Excludes', 'Uncertainty']);
const MEANING_SUMMARY_LIMIT = 5;
const VALUE_SUMMARY_LIMIT = 8;

export type ReviewItem = OntologyChangeSet['items'][number];
export type MeaningUnit = { id: string; label: string; text: string; displayText: string; value?: FormattedValue };

/** The meaning sections of a Markdown body, and whether any other non-blank line lies outside them. */
export function bodySections(body: string) {
  const lines = body.split('\n');
  const units: Array<{ id: string; label: string; text: string; displayText: string }> = [];
  const covered = new Set<number>();
  let open: { heading: string; start: number } | null = null;
  let fence: '`' | '~' | null = null;
  const close = (end: number) => {
    if (!open || !MEANING_SECTIONS.has(open.heading)) return;
    const text = lines.slice(open.start, end).join('\n').trim();
    const displayText = lines.slice(open.start + 1, end).join('\n').trim();
    for (let index = open.start; index < end; index += 1) covered.add(index);
    if (text && displayText) units.push({ id: `body:${open.heading}`, label: open.heading, text, displayText });
  };
  for (let index = 0; index < lines.length; index += 1) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(lines[index]);
    if (fenceMatch) {
      const marker = fenceMatch[1][0] as '`' | '~';
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const heading = /^##\s+(.+?)\s*$/.exec(lines[index]);
    if (!heading) continue;
    close(index);
    open = { heading: heading[1], start: index };
  }
  close(lines.length);
  const uncovered = lines.some((line, index) => !covered.has(index) && line.trim().length > 0);
  return { units, uncovered };
}

export function proposedMeaningUnits(item: ReviewItem | null): { units: MeaningUnit[]; bodyUncovered: boolean } {
  if (!item) return { units: [], bodyUncovered: false };
  const relationUnits: MeaningUnit[] = item.relation ? [{
    id: `relation:${item.relation.from}:${item.relation.type}:${item.relation.to}`,
    label: `${item.relation.from} → ${item.relation.type} → ${item.relation.to}`,
    text: item.relation.why ?? '',
    displayText: item.relation.why ?? '',
  }].filter((unit) => unit.text.length > 0) : [];
  let bodyUncovered = false;
  const bodyUnits = item.fields.flatMap((field) => {
    if (field.key !== 'body' || typeof field.after !== 'string') return [];
    const sections = bodySections(field.after);
    bodyUncovered = sections.uncovered;
    return sections.units;
  });
  const relationNoteUnits = item.fields.flatMap((field): MeaningUnit[] => {
    if (field.key !== 'relation_notes' || !isPlainRecord(field.after)) return [];
    return Object.entries(field.after).map(([target, value]) => ({
      id: `relation_notes:${target}`,
      label: `relation_notes · ${target}`,
      text: typeof value === 'string' ? value : '',
      displayText: typeof value === 'string' ? value : '',
      ...(typeof value === 'string' && value.length > 0 ? {} : { value: formatValue(value) }),
    }));
  });
  return { units: [...relationUnits, ...bodyUnits, ...relationNoteUnits], bodyUncovered };
}

/** The fields shown as plain values: everything except those read as meaning units. */
export function requestedValueFields(item: ReviewItem | null) {
  if (!item) return [];
  return item.fields.filter((field) => !(
    (field.key === 'body' && typeof field.after === 'string')
    || (field.key === 'relation_notes' && isPlainRecord(field.after))
  ));
}

/** What the summary view of one proposed change shows, and how much of it was left out. */
export function summarizeProposal(item: ReviewItem | null) {
  const { units: meaningUnits, bodyUncovered } = proposedMeaningUnits(item);
  const visibleMeaningUnits = meaningUnits.slice(0, MEANING_SUMMARY_LIMIT);
  const omittedMeaningUnits = Math.max(0, meaningUnits.length - visibleMeaningUnits.length);
  const valueFields = requestedValueFields(item);
  const visibleValueFields = valueFields.slice(0, VALUE_SUMMARY_LIMIT);
  const omittedValueFields = valueFields.length - visibleValueFields.length;
  const coverage = omittedMeaningUnits > 0
    ? 'incomplete' as const
    : bodyUncovered
      ? 'bodyInDetails' as const
      : meaningUnits.length === 0 && valueFields.length === 0
        ? 'coverageNone' as const
        : 'detailsPointer' as const;
  return {
    visibleMeaningUnits,
    meaningUnitCount: meaningUnits.length,
    omittedMeaningUnits,
    visibleValueFields,
    omittedValueFields,
    coverage,
  };
}

/** The first paragraph of the task outcome, and the rest. */
export function splitTask(outcome: string) {
  const trimmed = outcome.trim();
  const breakAt = /\n\s*\n/.exec(trimmed);
  if (!breakAt) return { lead: trimmed, rest: '' };
  return { lead: trimmed.slice(0, breakAt.index).trim(), rest: trimmed.slice(breakAt.index).trim() };
}
