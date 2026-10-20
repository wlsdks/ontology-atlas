import {
  buildCoverageMatrix,
  type CoverageAreaInput,
  type CoverageColumn,
  type HarnessReport,
  type ScopeDeclaration,
} from '@/entities/agent-files';

export const OVERVIEW_COLUMNS: readonly CoverageColumn[] = ['told', 'gated', 'watched'];

export const EVERYWHERE_ROW = '#everywhere';

export function overviewCellKey(row: string, column: CoverageColumn | 'path'): string {
  return `${row}|${column}`;
}

export interface OverviewCell {
  key: string;
  row: string;
  column: CoverageColumn;
  entries: readonly ScopeDeclaration[];
  gap: boolean;
}

export interface OverviewRow {
  slug: string;
  title: string;
  purpose: string;
  paths: readonly string[];
  discoveredTests: number;
  cells: readonly OverviewCell[] | null;
}

export type OverviewTarget =
  | { kind: 'cell'; row: OverviewRow; cell: OverviewCell }
  | { kind: 'everywhere'; cell: OverviewCell }
  | { kind: 'no-path'; row: OverviewRow };

export interface HarnessOverview {
  rows: readonly OverviewRow[];
  everywhere: readonly OverviewCell[];
  gaps: readonly { slug: string; column: CoverageColumn; paths: readonly string[] }[];
  pathedDomainCount: number;
  targets: ReadonlyMap<string, OverviewTarget>;
  missingHookScripts: readonly string[];
  trustGatedConfigs: ReadonlySet<string>;
  outsideCount: number;
  outsideFolders: readonly string[];
  unreachedPaths: readonly string[];
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

/** O(A x C log C + H + D x S): A areas, C paths per area, H hooks, D outside declarations, S scopes. */
export function buildHarnessOverview(
  report: Pick<HarnessReport, 'coverage' | 'testFiles' | 'hookGroups'>,
  areas: readonly CoverageAreaInput[],
): HarnessOverview {
  const matrix = buildCoverageMatrix(report.coverage, areas, report.testFiles);
  const targets = new Map<string, OverviewTarget>();
  const gaps: HarnessOverview['gaps'][number][] = [];

  const rows: OverviewRow[] = matrix.areas.map((area) => {
    const paths = sortedUnique(area.capabilities.map((capability) => capability.path));
    const base = {
      slug: area.slug,
      title: area.title,
      purpose: area.purpose,
      paths,
      discoveredTests: area.discoveredTests,
    };
    if (paths.length === 0) {
      const row: OverviewRow = { ...base, cells: null };
      targets.set(overviewCellKey(area.slug, 'path'), { kind: 'no-path', row });
      return row;
    }
    const cells = OVERVIEW_COLUMNS.map((column): OverviewCell => {
      const entries = area[column];
      return {
        key: overviewCellKey(area.slug, column),
        row: area.slug,
        column,
        entries,
        gap: entries.length === 0,
      };
    });
    const row: OverviewRow = { ...base, cells };
    for (const cell of cells) {
      targets.set(cell.key, { kind: 'cell', row, cell });
      if (cell.gap) gaps.push({ slug: row.slug, column: cell.column, paths });
    }
    return row;
  });

  const everywhere = OVERVIEW_COLUMNS.map((column): OverviewCell => {
    const cell: OverviewCell = {
      key: overviewCellKey(EVERYWHERE_ROW, column),
      row: EVERYWHERE_ROW,
      column,
      entries: matrix.everywhere[column],
      gap: false,
    };
    targets.set(cell.key, { kind: 'everywhere', cell });
    return cell;
  });

  const missing: string[] = [];
  const trustGated = new Set<string>();
  for (const group of report.hookGroups) {
    if (group.approvalGate) trustGated.add(group.configPath);
    for (const hook of group.hooks) {
      if (hook.status !== 'missing') continue;
      const name = hook.ref.path ?? hook.ref.command;
      missing.push(name.split('/').pop() ?? name);
    }
  }

  return {
    rows,
    everywhere,
    gaps,
    pathedDomainCount: rows.filter((row) => row.cells !== null).length,
    targets,
    missingHookScripts: sortedUnique(missing),
    trustGatedConfigs: trustGated,
    outsideCount: new Set(matrix.outsideAreas.map((entry) => entry.id)).size,
    outsideFolders: sortedUnique(
      matrix.outsideAreas.flatMap((entry) =>
        entry.scopes.map((scope) => scope.split('/')[0]!).filter(Boolean),
      ),
    ),
    unreachedPaths: sortedUnique(matrix.unreachedCapabilities.map((capability) => capability.path)),
  };
}
