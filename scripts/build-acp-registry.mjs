#!/usr/bin/env node
/**
 * ACP 레지스트리 스냅샷 — 빌드 시점에 한 번 받아서 저장소에 커밋한다.
 *
 * ## 왜 런타임에 안 받나
 *
 * 신뢰 헌장 ①("인터넷 없이 돌아간다")과 ②("무엇을 보내든 사용자가 켠다")를 함께
 * 건드리기 때문이다. 앱을 켤 때마다 CDN 에 붙으면 그건 사용자가 켠 적 없는
 * 통신이고, 비행기 안에서는 목록이 비어 버린다.
 *
 * 그래서 목록은 **파일로 커밋한다.** 갱신은 이 스크립트를 사람이 돌릴 때만
 * 일어나고, 무엇이 바뀌었는지는 git diff 에 그대로 남는다.
 *
 * ## 무엇을 남기고 무엇을 버리나
 *
 * 남기는 것: 띄우는 데 필요한 것(실행 방법)과 화면이 말해야 하는 것(이름 ·
 * 한 줄 설명 · 갈 곳 · 라이선스). 버리는 것: 아이콘 URL(외부 이미지를 앱이
 * 받으러 가지 않는다 — 같은 이유다), 저자 목록(화면이 안 쓴다).
 *
 * 사용법:
 *   node scripts/build-acp-registry.mjs           # 받아서 갱신
 *   node scripts/build-acp-registry.mjs --check   # 커밋된 것과 다르면 실패
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src-tauri', 'src', 'acp-registry.json');
const SOURCE = 'https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json';

/**
 * 우리가 **실제로 재 본** 실행기.
 *
 * 나머지도 목록에 넣고 띄울 수 있게 하되, 이 둘만 「검증됨」으로 표시한다 —
 * 화면이 안 해 본 것을 해 본 것처럼 말하지 않기 위해서다. 값은 실측 근거가
 * 있을 때만 늘린다(결정 원장 2026-08-16).
 */
const VERIFIED = new Set(['claude-acp', 'codex-acp']);

/**
 * 그 어댑터가 감싸는 **진짜 CLI** 의 실행 파일 이름. 레지스트리에는 없는
 * 정보라 여기서 짝지어 준다 — 이걸 알아야 「도구가 없다」와 「Node 가 없다」를
 * 갈라서 말할 수 있고, 그 둘은 사용자가 할 일이 다르다.
 *
 * 모르는 것은 비워 둔다. 짐작해서 넣으면 화면이 없는 이유를 지어내게 된다.
 */
const UNDERLYING_CLI = {
  'claude-acp': 'claude',
  'codex-acp': 'codex',
  goose: 'goose',
  gemini: 'gemini',
  'github-copilot-cli': 'copilot',
  cursor: 'cursor-agent',
  opencode: 'opencode',
  'amp-acp': 'amp',
  cline: 'cline',
  'qwen-code': 'qwen',
  kimi: 'kimi',
  junie: 'junie',
};

function pickLaunch(distribution) {
  if (distribution?.npx?.package) {
    return {
      kind: 'npx',
      package: distribution.npx.package,
      args: distribution.npx.args ?? [],
    };
  }
  if (distribution?.binary) {
    // 플랫폼별 항목에서 실행 파일 이름과 인자만 가져온다. 아카이브 URL 은
    // 남기지 않는다 — 앱은 남의 바이너리를 대신 받아 실행하지 않는다.
    const anyPlatform = Object.values(distribution.binary)[0];
    if (!anyPlatform?.cmd) return null;
    return {
      kind: 'binary',
      // `./goose` → `goose`
      command: String(anyPlatform.cmd).replace(/^\.\//, ''),
      args: anyPlatform.args ?? [],
    };
  }
  if (distribution?.uvx?.package) {
    return { kind: 'uvx', package: distribution.uvx.package, args: distribution.uvx.args ?? [] };
  }
  return null;
}

function normalize(raw) {
  const agents = [];
  for (const agent of raw.agents ?? []) {
    const launch = pickLaunch(agent.distribution);
    if (!launch) continue; // 띄울 방법이 없으면 목록에 둘 이유가 없다.
    agents.push({
      id: agent.id,
      name: agent.name,
      description: agent.description ?? '',
      website: agent.website ?? agent.repository ?? null,
      license: agent.license ?? null,
      verified: VERIFIED.has(agent.id),
      cli: UNDERLYING_CLI[agent.id] ?? null,
      launch,
    });
  }
  agents.sort((a, b) => {
    // 재 본 것이 앞. 그다음은 이름순 — 화면이 순서를 다시 정하지 않아도 되게.
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return a.name.localeCompare(b.name, 'en');
  });
  return { source: SOURCE, registryVersion: raw.version ?? null, agents };
}

async function main() {
  const check = process.argv.includes('--check');
  const response = await fetch(SOURCE, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    console.error(`[acp-registry] 받기 실패: HTTP ${response.status}`);
    process.exit(1);
  }
  const normalized = normalize(await response.json());
  const serialized = `${JSON.stringify(normalized, null, 2)}\n`;

  if (check) {
    const current = readFileSync(OUT, 'utf8');
    if (current !== serialized) {
      console.error('[acp-registry] 커밋된 스냅샷이 최신과 다릅니다.');
      console.error('  node scripts/build-acp-registry.mjs 를 돌리고 diff 를 확인하세요.');
      process.exit(1);
    }
    console.log(`[acp-registry] current · ${normalized.agents.length} agents`);
    return;
  }

  writeFileSync(OUT, serialized);
  const verified = normalized.agents.filter((a) => a.verified).length;
  console.log(
    `[acp-registry] ${normalized.agents.length} agents (검증됨 ${verified}) → src-tauri/src/acp-registry.json`,
  );
}

await main();
