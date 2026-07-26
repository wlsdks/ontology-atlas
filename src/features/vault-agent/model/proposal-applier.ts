import type { AgentProposal, ProposalChange } from './types';

/**
 * 동의된 제안을 디스크에 쓰는 **유일한** 모듈.
 *
 * ## 이 파일이 존재하는 이유
 *
 * 실행기가 쓰기를 못 하게 만든 대가로, 쓰기는 여기 한 곳에 모인다. 여기를
 * 부르는 곳은 동의 카드의 [적용] 핸들러 하나뿐이어야 한다 — 다른 곳에서
 * 부르면 "사용자가 누를 때만 쓴다" 가 깨진다.
 *
 * ## 순서가 계약이다
 *
 * 1. mtime 재확인 — 제안한 뒤 사람이 같은 파일을 고쳤으면 **쓰지 않는다.**
 * 2. (체크됐고 git 이면) 저장점 먼저.
 * 3. `after` 문자열을 **그대로** 쓴다 — 카드가 그린 것과 같은 값.
 * 4. 다시 읽어 지도를 갱신.
 *
 * 어느 단계에서 막히든 **파일 0개 변경**으로 끝난다. 반쯤 적용된 상태를
 * 만들지 않기 위해 mtime 검사는 쓰기 시작 전에 전부 끝낸다.
 */

export interface VaultWritePort {
  /** 새 파일. 이미 있으면 실패해야 한다. */
  createDoc(slug: string, content: string): Promise<void>;
  /** 기존 파일 덮어쓰기. */
  saveDoc(slug: string, content: string, options?: { expectedMtime?: number }): Promise<void>;
  /** 지금 디스크의 mtime. 모르면 undefined. */
  currentMtime(slug: string): number | undefined;
  /** 매니페스트 재적재 → 지도 갱신. */
  refresh(): Promise<void>;
  /**
   * 적용 직전 git 저장점. git 볼트가 아니면 null 을 돌려준다 — 그 사실을
   * 카드가 정직하게 말한다("이 폴더는 git 이 아니라 저장점을 만들 수 없어요").
   */
  snapshot(label: string): Promise<string | null>;
}

export type ApplyOutcome =
  | { status: 'applied'; snapshotSha: string | null; writtenPaths: string[] }
  | { status: 'conflict'; conflictedPaths: string[] }
  | { status: 'failed'; message: string };

function slugOf(path: string): string {
  return path.replace(/\.md$/, '');
}

export async function applyProposal(
  proposal: AgentProposal,
  port: VaultWritePort,
  options: { snapshotLabel: string },
): Promise<ApplyOutcome> {
  const selected = proposal.changes.filter((change) => change.selected);
  if (selected.length === 0) {
    return { status: 'applied', snapshotSha: null, writtenPaths: [] };
  }

  // ── 1. 쓰기 전에 전부 검사한다 ──────────────────────────────────────
  const conflicted: string[] = [];
  for (const change of selected) {
    if (change.expectedMtime === undefined) continue;
    for (const file of change.files) {
      if (file.kind !== 'modify') continue;
      const current = port.currentMtime(slugOf(file.path));
      // mtime 을 모르면(정적 모드 등) 가드를 걸 수 없다 — 없는 사실로
      // 충돌을 지어내지도, 안전하다고 말하지도 않는다.
      if (current === undefined) continue;
      if (current !== change.expectedMtime) conflicted.push(file.path);
    }
  }
  if (conflicted.length > 0) {
    // 파일 0개 변경. 카드가 "방금 이 문서가 바뀌었어요" 로 강등된다.
    return { status: 'conflict', conflictedPaths: conflicted };
  }

  // ── 2. 저장점 ────────────────────────────────────────────────────────
  let snapshotSha: string | null = null;
  if (proposal.snapshotRequested) {
    try {
      snapshotSha = await port.snapshot(options.snapshotLabel);
    } catch (error) {
      // 저장점을 못 만들었는데 쓰면 "되돌릴 수 있다" 는 약속이 거짓이 된다.
      return { status: 'failed', message: String(error) };
    }
  }

  // ── 3. 쓰기 ─────────────────────────────────────────────────────────
  const written: string[] = [];
  try {
    for (const change of selected) {
      for (const file of change.files) {
        const slug = slugOf(file.path);
        if (file.kind === 'create') {
          await port.createDoc(slug, file.after);
        } else {
          await port.saveDoc(slug, file.after, {
            expectedMtime: change.expectedMtime,
          });
        }
        written.push(file.path);
      }
    }
  } catch (error) {
    return { status: 'failed', message: String(error) };
  }

  // ── 4. 지도 갱신 ────────────────────────────────────────────────────
  await port.refresh();
  return { status: 'applied', snapshotSha, writtenPaths: written };
}

/** 읽기 전용 볼트용 — [적용] 대신 [이 변경을 복사] 가 주는 문자열. */
export function proposalToClipboardPacket(proposal: AgentProposal): string {
  const lines: string[] = [
    'Apply these vault changes with the ontology-atlas MCP tools:',
    '',
  ];
  for (const change of proposal.changes.filter((c) => c.selected)) {
    lines.push(`- ${change.summary}`);
    for (const file of change.files) {
      lines.push(`  file: ${file.path} (${file.kind})`);
    }
  }
  lines.push('', 'Full content of each file after the change:');
  for (const change of proposal.changes.filter((c) => c.selected)) {
    for (const file of change.files) {
      lines.push('', `--- ${file.path} ---`, file.after);
    }
  }
  return lines.join('\n');
}

/** 카드 헤더의 총량 — "파일 3개 · +42줄 −3줄". 접힌 diff 도장을 막는다. */
export function summarizeChangeVolume(changes: readonly ProposalChange[]): {
  files: number;
  added: number;
  removed: number;
} {
  let files = 0;
  let added = 0;
  let removed = 0;
  for (const change of changes) {
    for (const file of change.files) {
      files += 1;
      const beforeLines = file.before === null ? [] : file.before.split('\n');
      const afterLines = file.after.split('\n');
      const beforeSet = new Set(beforeLines);
      const afterSet = new Set(afterLines);
      for (const line of afterLines) if (!beforeSet.has(line)) added += 1;
      for (const line of beforeLines) if (!afterSet.has(line)) removed += 1;
    }
  }
  return { files, added, removed };
}
