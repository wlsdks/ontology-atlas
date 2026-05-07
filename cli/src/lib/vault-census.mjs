// R+ — analyze --apply / infer-imports --apply / bootstrap 셋이 공유하는
// vault census 출력 helper. 사용자가 명령 한 번 후 *방금 vault 에 뭐가
// land 됐는지* 한 줄로 인지 — \"→ vault now has N nodes (...)\".
//
// 공유 이유: 세 명령이 모두 같은 \"after-write summary\" 형식을 원함 — DRY.
// helper 하나가 list_kinds 호출 + 텍스트 포맷 + JSON 데이터 반환 모두 cover.
//
// 호출 실패 (e.g. mcp 시동 실패) 시 silent — caller 의 exit code 영향 0.

import { callMcpTool } from './mcp-call.mjs';

const COLORS = {
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

/**
 * mcp list_kinds 호출 → { total, byKind } | null.
 * 에러 시 silent null — caller 가 census 누락도 허용.
 */
export async function getVaultCensus(vaultRoot) {
  try {
    const result = await callMcpTool(vaultRoot, 'list_kinds', {});
    if (
      result
      && typeof result.total === 'number'
      && result.byKind
      && typeof result.byKind === 'object'
    ) {
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * stdout 에 \"→ vault now has N nodes (project=A · capability=B · ...)\"
 * 한 줄 출력. census 가 null 이면 no-op.
 *
 * 출력 순서 = 하향식 hierarchy: project · domain · capability · element ·
 * document · vault-readme. byKind 에 0 인 항목은 표시 생략.
 */
export function writeVaultCensus(census) {
  if (!census || typeof census.total !== 'number') return;
  const order = [
    'project',
    'domain',
    'capability',
    'element',
    'document',
    'vault-readme',
  ];
  const byKind = census.byKind || {};
  const parts = order.filter((k) => byKind[k]).map((k) => `${k}=${byKind[k]}`);
  process.stdout.write(
    `\n  ${COLORS.dim}→ vault now has ${COLORS.bold}${census.total}${COLORS.reset}${COLORS.dim} nodes` +
      (parts.length > 0 ? ` (${parts.join(' · ')})` : '') +
      `${COLORS.reset}\n`,
  );
}
