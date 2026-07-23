/**
 * Atlas Git — 변경 요약의 순수 로직 (I/O 0, React 0).
 *
 * 세 표면(CLI `cli/src/lib/git-snapshot.mjs` · Rust `src-tauri/src/git.rs` ·
 * 웹 패널)이 같은 산식으로 "kind별 추가/수정/삭제 + 대표 슬러그" 를 말해야
 * 하므로, CLI 의 parsePorcelain / classifyChange / formatSnapshotSummary 를
 * TS 로 미러한다. 산식 정합은 `tests/contract/atlas-git-summary.contract.test.ts`
 * 가 같은 fixture 로 CLI 구현과 비교해 강제한다 — 한쪽이 drift 하면 즉시 fail.
 *
 * 웹 패널의 주 입력은 Rust IPC 가 이미 분류해 돌려주는 `files: ChangeEntry[]`
 * (path/status/kind/slug) 이고, porcelain 파서는 산식 정합 검증 + 미래의
 * raw-porcelain 소비자를 위한 미러다.
 */

export type AtlasGitChangeStatus = "added" | "modified" | "deleted" | "renamed";

/** `git status --porcelain` 한 행. CLI parsePorcelain 과 동일 shape. */
export interface AtlasGitPorcelainRow {
  index: string;
  worktree: string;
  path: string;
  renamedFrom: string | null;
}

/**
 * 요약 산식이 요구하는 최소 shape — Rust IPC 의 `ChangeEntry` (camelCase),
 * CLI `buildChangeSummary` 결과 둘 다 이 형태를 만족한다.
 */
export interface AtlasGitChangeLike {
  status: AtlasGitChangeStatus | string;
  kind?: string | null;
  slug: string;
}

export interface AtlasGitStatusCounts {
  added: number;
  modified: number;
  deleted: number;
  renamed: number;
  total: number;
}

/** kind 하나의 변경 묶음 — 패널의 "kind별 A/M/D + 대표 슬러그" 행. */
export interface AtlasGitKindGroup {
  /** frontmatter kind. 비-md/kind 미상 파일은 null (패널이 "기타" 로 라벨링). */
  kind: string | null;
  counts: AtlasGitStatusCounts;
  /** 그룹의 대표 슬러그 (등장 순, 호출자가 잘라 쓴다). */
  slugs: string[];
}

/** CLI parsePorcelain 미러 — `git status --porcelain` 출력 → 행 배열. */
export function parsePorcelainStatus(out: string): AtlasGitPorcelainRow[] {
  return out
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const index = line[0] ?? " ";
      const worktree = line[1] ?? " ";
      let rest = line.slice(3);
      let renamedFrom: string | null = null;
      const arrow = rest.indexOf(" -> ");
      if (arrow !== -1) {
        renamedFrom = rest.slice(0, arrow);
        rest = rest.slice(arrow + 4);
      }
      return { index, worktree, path: rest, renamedFrom };
    });
}

/** CLI classifyChange 미러 — porcelain 행 → 상태 분류. */
export function classifyPorcelainChange(
  row: Pick<AtlasGitPorcelainRow, "index" | "worktree">,
): AtlasGitChangeStatus {
  if (row.index === "D" || row.worktree === "D") return "deleted";
  if (row.index === "R") return "renamed";
  if ((row.index === "?" && row.worktree === "?") || row.index === "A") return "added";
  return "modified";
}

/** 상태별 카운트 — Rust `SnapshotCounts` 와 동일 산식. */
export function countChangesByStatus(
  changes: readonly AtlasGitChangeLike[],
): AtlasGitStatusCounts {
  const counts = { added: 0, modified: 0, deleted: 0, renamed: 0, total: changes.length };
  for (const change of changes) {
    if (change.status === "added") counts.added += 1;
    else if (change.status === "deleted") counts.deleted += 1;
    else if (change.status === "renamed") counts.renamed += 1;
    else counts.modified += 1;
  }
  return counts;
}

/**
 * kind별 그룹 — 등장 순 유지, kind 미상(null) 그룹은 항상 마지막.
 * 패널이 "capability +2 ~1 / element ~3 / 기타 1" 식으로 렌더한다.
 */
export function groupChangesByKind(
  changes: readonly AtlasGitChangeLike[],
): AtlasGitKindGroup[] {
  const groups = new Map<string | null, AtlasGitChangeLike[]>();
  for (const change of changes) {
    const key = change.kind ?? null;
    const list = groups.get(key);
    if (list) list.push(change);
    else groups.set(key, [change]);
  }
  const named: AtlasGitKindGroup[] = [];
  let other: AtlasGitKindGroup | null = null;
  for (const [kind, list] of groups) {
    const group: AtlasGitKindGroup = {
      kind,
      counts: countChangesByStatus(list),
      slugs: list.map((c) => c.slug),
    };
    if (kind === null) other = group;
    else named.push(group);
  }
  return other ? [...named, other] : named;
}

/**
 * CLI formatSnapshotSummary 미러 — 의미 단위 커밋 요약 한 줄.
 * 예: `ontology snapshot: +2 concepts, ~1 updated (capabilities/foo, elements/bar, +1)`
 * 스냅샷 확인 스텝이 "이 메시지로 커밋됩니다" 미리보기로 쓴다.
 */
export function formatSnapshotSummary(changes: readonly AtlasGitChangeLike[]): string {
  const { added, modified, deleted, renamed } = countChangesByStatus(changes);

  const parts: string[] = [];
  if (added > 0) parts.push(`+${added} concept${added === 1 ? "" : "s"}`);
  if (modified > 0) parts.push(`~${modified} updated`);
  if (renamed > 0) parts.push(`→${renamed} renamed`);
  if (deleted > 0) parts.push(`-${deleted} removed`);

  const headline =
    parts.length > 0
      ? `ontology snapshot: ${parts.join(", ")}`
      : "ontology snapshot: no concept changes";

  const slugs = changes.map((c) => c.slug);
  const shown = slugs.slice(0, 3);
  const overflow = slugs.length - shown.length;
  const slugText =
    shown.length > 0 ? ` (${shown.join(", ")}${overflow > 0 ? `, +${overflow}` : ""})` : "";

  return `${headline}${slugText}`;
}
