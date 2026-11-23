/** A folder the uncommitted files are in, at most three names deep. */
export interface ChangedArea {
  /** The folder's path, or `''` for files at the repository's root. */
  path: string;
  files: number;
  /** When a file in it was last written, in epoch seconds; `null` when none has a time. */
  changedAt: number | null;
}

const AREA_DEPTH = 3;

/** The folder a file counts under: its own, cut to three names. Git spells paths with `/`. */
function areaOf(path: string): string {
  return path.split('/').slice(0, -1).slice(0, AREA_DEPTH).join('/');
}

/**
 * Where the uncommitted files are: one area per folder, the one written last first, then the one
 * with more files. One pass over the files and a sort of the areas: O(n + a log a).
 */
export function changedAreas(files: readonly { path: string; changedAt: number | null }[]): ChangedArea[] {
  const areas = new Map<string, ChangedArea>();
  for (const file of files) {
    const path = areaOf(file.path);
    const area = areas.get(path) ?? { path, files: 0, changedAt: null };
    area.files += 1;
    if (file.changedAt !== null && (area.changedAt === null || file.changedAt > area.changedAt)) area.changedAt = file.changedAt;
    areas.set(path, area);
  }
  return [...areas.values()].sort((a, b) => (b.changedAt ?? 0) - (a.changedAt ?? 0) || b.files - a.files || (a.path < b.path ? -1 : 1));
}
