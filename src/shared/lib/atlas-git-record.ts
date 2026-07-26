/**
 * 기록 화면의 **읽기 위계**를 만드는 순수 로직 (I/O 0, React 0).
 *
 * `atlas-git-changes.ts` 가 "무엇을 남길 것인가"(커밋 산식, CLI/Rust 와
 * contract 로 묶인 진실원)를 다룬다면, 이 파일은 **사람이 그 산식을 읽는
 * 방식**을 다룬다. 두 관심사를 섞지 않는 이유: 커밋 요약 문자열은 세 표면이
 * 공유하는 계약이라 바꿀 수 없고, 화면 카피는 언제든 바뀌어야 한다.
 *
 * 여기서 하는 일은 셋뿐이고 전부 "판단에 필요한 최소 정보만 남긴다" 이다.
 *
 * ① **개념과 그 밖의 파일을 가른다** — 사용자가 이 화면에서 내리는 판단은
 *    "내 개념이 뭐가 바뀌었나" 이지 파일 목록이 아니다. `.gitignore`,
 *    `package.json` 은 함께 남지만 **읽을 것**은 아니므로 접힌 자리로 간다.
 * ② **경로를 이름과 자리로 가른다** — `capabilities/map-label-budget` 을
 *    통째로 mono 로 그리면 15개 행이 전부 같은 무게가 된다. 이름은 본문
 *    램프로, 자리는 라벨 램프로 내린다.
 * ③ **git 배관을 걷어낸다** — `diff --git` / `index 4a1c0de..8b71f92` /
 *    `@@ -12,6 +12,9 @@` 는 도구가 도구에게 하는 말이다. 사람이 판단에
 *    쓰는 것은 늘어난 줄과 줄어든 줄뿐이다.
 *
 * 그리고 ④ 우리가 **직접 만든** 커밋 제목(`formatSnapshotSummary`)은 다시
 * 평문으로 되읽는다 — 한국어 화면에서 `ontology snapshot: +3 concepts,
 * ~2 updated (...)` 를 읽게 두는 것은 우리가 만든 문자열을 우리가 번역하지
 * 않은 것이다. 우리 형식이 아닌 커밋(손으로 쓴 것, 다른 도구가 만든 것)은
 * 원문을 그대로 존중한다.
 */

import type { AtlasGitChangeLike } from "./atlas-git-changes";

/** 화면 행 하나가 필요로 하는 최소 shape — Rust `ChangeEntry` 가 만족한다. */
export interface AtlasGitRecordEntry extends AtlasGitChangeLike {
  path: string;
}

/**
 * 개념 변경 / 그 밖의 파일. `kind` 가 있으면 vault 노드다(Rust 가 frontmatter
 * 를 읽어 붙여 준다). 없으면 저장소의 다른 파일이다.
 */
export function splitConceptChanges<T extends AtlasGitChangeLike>(
  changes: readonly T[],
): { concepts: T[]; others: T[] } {
  const concepts: T[] = [];
  const others: T[] = [];
  for (const change of changes) {
    if (change.kind) concepts.push(change);
    else others.push(change);
  }
  return { concepts, others };
}

/**
 * 경로 → `{ name, place }`. 이름은 마지막 마디, 자리는 그 앞의 폴더.
 * `.md` 확장자는 떼어 낸다 — 노드 이름에 확장자는 잡음이다(개념이 아닌
 * 파일은 확장자가 정체의 일부라 그대로 둔다).
 */
export function describeChangePath(
  raw: string,
  options: { isConcept?: boolean } = {},
): { name: string; place: string } {
  const trimmed = raw.replace(/\/+$/, "");
  const cut = trimmed.lastIndexOf("/");
  const last = cut === -1 ? trimmed : trimmed.slice(cut + 1);
  const place = cut === -1 ? "" : trimmed.slice(0, cut);
  const name = options.isConcept ? last.replace(/\.md$/i, "") : last;
  return { name: name || trimmed, place };
}

export type AtlasGitDiffLineKind = "added" | "removed" | "context" | "skip";

export interface AtlasGitDiffLine {
  kind: AtlasGitDiffLineKind;
  text: string;
}

export interface AtlasGitDiffFile {
  /** 새 경로(`b/…`). 삭제 파일은 옛 경로. */
  path: string;
  lines: AtlasGitDiffLine[];
  added: number;
  removed: number;
}

/**
 * unified diff → 파일별 사람이 읽는 줄.
 *
 * 버리는 것: `diff --git`, `index <sha>..<sha> <mode>`, `--- a/…`, `+++ b/…`,
 * `new file mode`, `similarity index` 같은 헤더 전부. 이것들은 파일 정체를
 * 말하는데, 그 정체는 이미 목록 행이 말했다.
 *
 * `@@ … @@` 는 버리지 않고 `skip` 한 줄로 **바꾼다** — "여기 사이에 안 보여준
 * 줄이 있다" 는 사실은 사람이 알아야 하는 정보이고(생략을 숨기면 diff 가
 * 거짓말이 된다), 그 좌표(`-12,6 +12,9`)는 아니다.
 */
/**
 * 파일 헤더 배관. `+++`/`---` 는 `+`/`-` 로 시작하므로 **줄 종류 판정보다
 * 먼저** 걸러야 한다 — 순서가 뒤바뀌면 파일 경로 두 줄이 "늘어난 줄 1,
 * 줄어든 줄 1" 로 집계된다.
 */
const DIFF_PLUMBING =
  /^(index |new file mode |deleted file mode |old mode |new mode |similarity index |dissimilarity index |rename from |rename to |copy from |copy to |Binary files |GIT binary patch|--- |\+\+\+ |\\)/;

export function parseUnifiedDiff(diffText: string): AtlasGitDiffFile[] {
  const files: AtlasGitDiffFile[] = [];
  let current: AtlasGitDiffFile | null = null;

  for (const line of diffText.split("\n")) {
    const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (header) {
      current = { path: header[2] ?? header[1] ?? "", lines: [], added: 0, removed: 0 };
      files.push(current);
      continue;
    }
    if (!current) continue;
    if (DIFF_PLUMBING.test(line)) continue;

    if (line.startsWith("@@")) {
      // 첫 헝크 앞에는 생략 표시를 두지 않는다 — 파일 처음부터라는 뜻이다.
      if (current.lines.length > 0) current.lines.push({ kind: "skip", text: "" });
      continue;
    }

    if (line.startsWith("+")) {
      current.lines.push({ kind: "added", text: line.slice(1) });
      current.added += 1;
    } else if (line.startsWith("-")) {
      current.lines.push({ kind: "removed", text: line.slice(1) });
      current.removed += 1;
    } else if (line.startsWith(" ")) {
      current.lines.push({ kind: "context", text: line.slice(1) });
    }
    // 그 외(빈 줄 · 미지의 헤더)는 버린다. 문서의 빈 줄은 context 라
    // `" "` 로 오므로 위에서 잡히고, 여기 오는 빈 줄은 split 의 꼬리다.
  }

  // 꼬리의 빈 context 줄은 파일 끝 개행이라 화면에서 의미가 없다.
  for (const file of files) {
    while (
      file.lines.length > 0 &&
      file.lines[file.lines.length - 1]!.kind === "context" &&
      file.lines[file.lines.length - 1]!.text === ""
    ) {
      file.lines.pop();
    }
  }

  return files;
}

export interface AtlasGitStepSummary {
  /** 우리 형식(`ontology snapshot: …`)으로 읽혔나. false 면 원문을 그대로 쓴다. */
  matched: boolean;
  added: number;
  updated: number;
  renamed: number;
  removed: number;
  slugs: string[];
  /** 괄호 안 `+N` — 이름을 다 적지 않은 나머지. */
  overflow: number;
  raw: string;
}

const SUBJECT_PREFIX = "ontology snapshot:";

/**
 * 우리가 만든 커밋 제목을 다시 사람 말로 읽는다.
 *
 * 대응: `ontology snapshot: +2 concepts, ~1 updated, →1 renamed, -1 removed
 * (capabilities/foo, elements/bar, +3)`. 형식이 아니면 `matched:false` —
 * 손으로 쓴 커밋과 다른 도구의 커밋은 원문이 곧 사람의 말이라 건드리지 않는다.
 */
export function describeSnapshotSubject(subject: string): AtlasGitStepSummary {
  const base: AtlasGitStepSummary = {
    matched: false,
    added: 0,
    updated: 0,
    renamed: 0,
    removed: 0,
    slugs: [],
    overflow: 0,
    raw: subject,
  };
  if (!subject.startsWith(SUBJECT_PREFIX)) return base;

  let rest = subject.slice(SUBJECT_PREFIX.length).trim();

  const slugs: string[] = [];
  let overflow = 0;
  const paren = /\(([^()]*)\)\s*$/.exec(rest);
  if (paren) {
    rest = rest.slice(0, paren.index).trim();
    for (const piece of (paren[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
      const more = /^\+(\d+)$/.exec(piece);
      if (more) overflow = Number(more[1]);
      else slugs.push(piece);
    }
  }

  const counts = { added: 0, updated: 0, renamed: 0, removed: 0 };
  for (const piece of rest.split(",").map((s) => s.trim()).filter(Boolean)) {
    const added = /^\+(\d+) concepts?$/.exec(piece);
    if (added) {
      counts.added = Number(added[1]);
      continue;
    }
    const updated = /^~(\d+) updated$/.exec(piece);
    if (updated) {
      counts.updated = Number(updated[1]);
      continue;
    }
    const renamed = /^→(\d+) renamed$/.exec(piece);
    if (renamed) {
      counts.renamed = Number(renamed[1]);
      continue;
    }
    const removed = /^-(\d+) removed$/.exec(piece);
    if (removed) counts.removed = Number(removed[1]);
  }

  return { ...base, ...counts, slugs, overflow, matched: true };
}
