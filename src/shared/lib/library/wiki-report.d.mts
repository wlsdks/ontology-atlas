export interface WikiReportProblem {
  code: string;
  message?: string;
  line?: number;
  detail?: { key: string; values?: Record<string, string> };
}

export interface WikiReportPageInput {
  page?: string;
  path?: string;
  problems?: readonly WikiReportProblem[];
}

export interface WikiReportRow {
  /** Vault-relative page path, `wiki/<slug>.md`, as `wiki-validate --json` prints it. */
  page: string;
  /** The full code, instance part included (`missing-field:title`). */
  code: string;
  message: string;
  line?: number;
  detail?: { key: string; values?: Record<string, string> };
}

export interface WikiReportGroup {
  /** The finding kind: the code without its instance part. */
  code: string;
  advisory: boolean;
  folder: boolean;
  count: number;
  /** Distinct pages this kind touches, in row order. */
  pages: string[];
  rows: WikiReportRow[];
}

export interface WikiReport {
  pageCount: number;
  fitPageCount: number;
  /** Pages carrying at least one non-advisory finding. */
  blockingPageCount: number;
  findingCount: number;
  /** Pages present in the folder whose bytes have not been judged yet. */
  unmeasured: string[];
  groups: WikiReportGroup[];
}

export const WIKI_FOLDER_CODES: readonly string[];
export const WIKI_ADVISORY_CODES: readonly string[];

export function isWikiFolderCode(code: string): boolean;
export function isWikiAdvisoryCode(code: string): boolean;
export function wikiFindingCode(code: string): string;

export function aggregateWikiFindings(input?: {
  pages?: readonly WikiReportPageInput[];
  unmeasured?: readonly string[];
}): WikiReport;
