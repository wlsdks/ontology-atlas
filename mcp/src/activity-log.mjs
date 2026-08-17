// B3 (2026-07-21) — 에이전트 활동 로그: `.ontology-atlas/activity.jsonl`.
//
// 신뢰 헌장 ②의 "로컬 감사 로그"의 구현체. vault 쓰기 성공 직후 한 줄을
// best-effort append 한다 — **append 실패가 쓰기 자체를 실패시키지 않는다**
// (로그는 부수, 쓰기가 주). 전송 0, 파일은 vault 밖으로 나가지 않는다.
//
// 조사 근거·3안 비교: .qa-scratch/ux-round-2026-07-21/b3-investigation/
// activity-log-verdict.md — heartbeat 확장(스냅샷 계약 오염)·git 파생
// (승인 전 활동을 못 잡음)은 반려, append JSONL 채택.

import {
  appendVaultSidecarLine,
  readVaultSidecarText,
  replaceVaultSidecarText,
} from './vault-sidecar.mjs';

export const ACTIVITY_LOG_RELATIVE_PATH = '.ontology-atlas/activity.jsonl';
const ACTIVITY_LOG_FILENAME = 'activity.jsonl';
const HEARTBEAT_FILENAME = 'agent-activity.json';

/** 로테이션 상한: 초과 시 앞 절반 절삭 (단순·결정론). */
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

/** heartbeat 파일에서 agent 이름을 읽는다: 없거나 깨졌으면 null (조작 금지). */
export function readHeartbeatAgent(rootPath) {
  try {
    const stored = readVaultSidecarText(rootPath, HEARTBEAT_FILENAME);
    if (!stored) return null;
    const parsed = JSON.parse(stored.text);
    const agent = parsed?.agent;
    return typeof agent === 'string' && agent.trim() ? agent.trim() : null;
  } catch {
    return null;
  }
}

/**
 * 활동 한 줄에 실을 에이전트 이름 — **하트비트 > 연결 인사 > null** (2026-08-13).
 *
 * 종전에는 하트비트 파일(CLI `agent-activity` 로 직접 등록)만 봤다. 등록을 안 한
 * 에이전트의 활동은 전부 `agent: null` 로 쌓였는데, MCP initialize 인사에는
 * clientInfo.name("claude-code" 등)이 **이미 실려 온다** — 서버가 아는 사실을
 * 버리지 않는다. 하트비트가 이기는 이유: 등록은 의도(사람이 이 이름으로 부르라고
 * 정한 것)이고 인사는 기본값이다. 둘 다 없으면 null — 이름을 지어내지 않는다
 * (readHeartbeatAgent 의 「조작 금지」와 같은 규율).
 */
export function resolveAgentName(rootPath, clientInfo) {
  const heartbeat = readHeartbeatAgent(rootPath);
  if (heartbeat) return heartbeat;
  const fromHello = clientInfo?.name;
  return typeof fromHello === 'string' && fromHello.trim() ? fromHello.trim() : null;
}

/**
 * best-effort append + 로테이션. 어떤 실패도 throw 하지 않는다.
 * 반환: 기록 성공 여부 (테스트용 — 호출자는 무시해도 됨).
 */
export function appendActivityEntry(rootPath, entry) {
  try {
    appendVaultSidecarLine(rootPath, ACTIVITY_LOG_FILENAME, JSON.stringify(entry));
    rotateIfNeeded(rootPath);
    return true;
  } catch {
    return false;
  }
}

function rotateIfNeeded(rootPath) {
  try {
    const stored = readVaultSidecarText(rootPath, ACTIVITY_LOG_FILENAME);
    if (!stored) return;
    const lines = stored.text.split('\n').filter(Boolean);
    if (lines.length <= ACTIVITY_LOG_MAX_LINES) return;
    const kept = lines.slice(Math.floor(lines.length / 2));
    replaceVaultSidecarText(rootPath, ACTIVITY_LOG_FILENAME, `${kept.join('\n')}\n`, {
      expectedRevision: stored.revision,
    });
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
    const stored = readVaultSidecarText(rootPath, ACTIVITY_LOG_FILENAME);
    if (!stored) return [];
    const entries = [];
    for (const line of stored.text.split('\n')) {
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
