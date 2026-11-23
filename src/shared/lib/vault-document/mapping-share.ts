import type { NotMappedAreas } from './not-mapped-areas';

/** The two counts of a project note's line the share is read from. */
export type MappingShareFigures = Pick<NotMappedAreas, 'abilitiesUncovered' | 'abilitiesTotal'>;

/** A project note's summary line: the note's slug and its figures. */
export interface MappingProjectLine {
  project: string;
  figures: MappingShareFigures;
}

/** On the map out of found, floored, so one ability off the map never reads as 100%. */
export function mappingShare(figures: MappingShareFigures | null): { mapped: number; total: number; percent: number } | null {
  if (!figures) return null;
  const { abilitiesTotal: total, abilitiesUncovered: uncovered } = figures;
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(uncovered) || total <= 0) return null;
  const mapped = Math.min(total, Math.max(0, total - uncovered));
  return { mapped, total, percent: Math.floor((mapped / total) * 100) };
}

/** The line with the most abilities off the map; the first on a tie. O(n). */
export function widestProjectLine(lines: ReadonlyArray<{ project: string; figures: MappingShareFigures | null }>): MappingProjectLine | null {
  let widest: MappingProjectLine | null = null;
  for (const { project, figures } of lines) {
    if (figures && (!widest || figures.abilitiesUncovered > widest.figures.abilitiesUncovered)) widest = { project, figures };
  }
  return widest;
}
