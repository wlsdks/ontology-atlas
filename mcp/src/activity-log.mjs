// B3 (2026-07-21) — 에이전트 활동 로그: `.ontology-atlas/activity.jsonl`.
//
// 신뢰 헌장 ②의 "로컬 감사 로그"의 구현체. vault 쓰기 성공 직후 한 줄을
// best-effort append 한다 — **append 실패가 쓰기 자체를 실패시키지 않는다**
// (로그는 부수, 쓰기가 주). 전송 0, 파일은 vault 밖으로 나가지 않는다.
//
// 조사 근거·3안 비교: .qa-scratch/ux-round-2026-07-21/b3-investigation/
// activity-log-verdict.md — heartbeat 확장(스냅샷 계약 오염)·git 파생
// (승인 전 활동을 못 잡음)은 반려, append JSONL 채택.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const ACTIVITY_LOG_RELATIVE_PATH = '.ontology-atlas/activity.jsonl';

/** 로테이션 상한 — 초과 시 앞 절반 절삭 (단순·결정론). */
export const ACTIVITY_LOG_MAX_LINES = 4000;

/**
 * 한 줄 스키마 v1 (최소 계약 — 필드 추가는 v 올리지 않고 optional 로):
 *   {"v":1,"at":ISO,"tool":string,"target":string,"summary":string,
 *    "agent":string|null,"why":string|null}
 */
export function buildActivityEntry({ tool, target, summary, agent = null, why = null, at = null }) {
  return {
    v: 1,
    at: at ?? new Date().toISOString(),
    tool: String(tool),
    target: String(target),
    summary: String(summary),
    agent: agent ? String(agent) : null,
    why: why ? String(why) : null,
  };
}

/** heartbeat 파일에서 agent 이름을 읽는다 — 없거나 깨졌으면 null (조작 금지). */
export function readHeartbeatAgent(rootPath) {
  try {
    const raw = readFileSync(join(rootPath, '.ontology-atlas/agent-activity.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    const agent = parsed?.agent;
    return typeof agent === 'string' && agent.trim() ? agent.trim() : null;
  } catch {
    return null;
  }
}

/**
 * best-effort append + 로테이션. 어떤 실패도 throw 하지 않는다.
 * 반환: 기록 성공 여부 (테스트용 — 호출자는 무시해도 됨).
 */
export function appendActivityEntry(rootPath, entry) {
  try {
    const filePath = join(rootPath, ACTIVITY_LOG_RELATIVE_PATH);
    mkdirSync(dirname(filePath), { recursive: true });
    appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf-8');
    rotateIfNeeded(filePath);
    return true;
  } catch {
    return false;
  }
}

function rotateIfNeeded(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    if (lines.length <= ACTIVITY_LOG_MAX_LINES) return;
    const kept = lines.slice(Math.floor(lines.length / 2));
    writeFileSync(filePath, `${kept.join('\n')}\n`, 'utf-8');
  } catch {
    /* best-effort */
  }
}

/**
 * 로그 tail 읽기 — 다이제스트/CLI 소비용. 깨진 줄은 건너뛴다 (감사 로그는
 * 있는 그대로 보여주되, 파서가 죽어서 전체를 못 보여주는 것이 더 나쁘다).
 */
export function readActivityEntries(rootPath, { limit = 100, sinceMs = null } = {}) {
  try {
    const filePath = join(rootPath, ACTIVITY_LOG_RELATIVE_PATH);
    if (!existsSync(filePath)) return [];
    const raw = readFileSync(filePath, 'utf-8');
    const entries = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed?.v !== 1 || typeof parsed.at !== 'string') continue;
        if (sinceMs !== null && Date.parse(parsed.at) < sinceMs) continue;
        entries.push(parsed);
      } catch {
        /* skip broken line */
      }
    }
    return entries.slice(-limit);
  } catch {
    return [];
  }
}
