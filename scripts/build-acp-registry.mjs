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

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src-tauri', 'src', 'acp-registry.json');
/**
 * 아이콘도 **빌드 때 받아 번들한다.** 목록을 파일로 커밋하는 것과 같은 이유다 —
 * 앱이 켜질 때마다 CDN 에서 이미지를 받아오면 그건 사용자가 켠 적 없는 통신이고,
 * 비행기 안에서는 목록이 회색 네모가 된다.
 *
 * 남의 로고를 쓰는 것과 남의 디자인을 베끼는 것은 다르다. 이건 「이게 그 도구다」
 * 를 말하는 식별 표시이고, 레지스트리가 클라이언트 UI 를 위해 공개한 자산이다.
 */
const ICON_DIR = join(ROOT, 'public', 'acp-icons');
const SOURCE = 'https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json';

/**
 * 브랜드 색의 출처. 레지스트리 아이콘은 **전부 `currentColor` 단색**이라
 * (등록 규칙이 색 박은 SVG 를 거부한다) 색은 여기서 따로 가져온다.
 *
 * simple-icons 의 경로 데이터는 CC0-1.0 이고, 우리가 쓰는 것은 그중 **색 값
 * 하나**뿐이다 — 그림은 레지스트리가 준 그 벤더 자신의 마크를 그대로 쓴다.
 * 색 값 자체는 저작 대상이 아니지만, 어디서 왔는지는 적어 둔다.
 */
const BRAND_SOURCE = 'https://cdn.jsdelivr.net/npm/simple-icons@latest/data/simple-icons.json';

/**
 * 실행기 → simple-icons 항목 제목. **사람이 하나씩 확인한 짝만 둔다.**
 *
 * ⚠️ 이름으로 자동으로 짝지으면 **엉뚱한 브랜드 색**이 붙는다. 실측 두 건:
 * `amp-acp`(Sourcegraph Amp)가 구글 AMP 의 파랑(#005AF0)에, `pi-acp` 가
 * 라즈베리파이의 검정에 걸렸다. 색이 없는 것보다 **틀린 색이 나쁘다** — 없으면
 * 화면이 무채색으로 떨어지지만, 틀리면 남의 브랜드를 잘못 표시하는 것이다.
 *
 * 그래서 자동 매칭을 쓰지 않는다. 여기 없는 실행기는 무채색으로 그린다.
 *
 * OpenAI(Codex)는 **일부러 비어 있다** — 벤더 요청으로 simple-icons v16 에서
 * 빠졌다. 마크 자체는 ACP 레지스트리가 클라이언트 UI 용으로 공개한 것을 쓰고,
 * 색은 넣지 않는다. Buzz 도 같은 이유로 OpenAI 마크를 번들하지 않는다.
 */
const BRAND_MARK = {
  'claude-acp': 'Claude Code',
  gemini: 'Google Gemini',
  'mistral-vibe': 'Mistral AI',
  'qwen-code': 'QWen',
  'codebuddy-code': 'CodeBuddy',
  'glm-acp-agent': 'Z.ai',
  cursor: 'Cursor',
  'github-copilot-cli': 'GitHub Copilot',
  opencode: 'OpenCode',
  kimi: 'Kimi',
  cline: 'Cline',
};

/**
 * 우리가 **실제로 재 본** 실행기.
 *
 * 나머지도 목록에 넣고 띄울 수 있게 하되, 이 둘만 「검증됨」으로 표시한다 —
 * 화면이 안 해 본 것을 해 본 것처럼 말하지 않기 위해서다. 값은 실측 근거가
 * 있을 때만 늘린다(결정 원장 2026-08-16).
 */
const VERIFIED = new Set(['claude-acp', 'codex-acp']);

/**
 * 화면에 쓸 이름 — 레지스트리 이름이 사람들이 부르는 이름과 다를 때만 적는다.
 *
 * 레지스트리의 `Claude Agent` 는 정확하지만 아무도 그렇게 안 부른다. 화면이
 * 사용자가 쓰는 말을 써야 「내가 가진 그거」라고 알아본다.
 */
const DISPLAY_NAME = {
  'claude-acp': 'Claude Code',
};

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

/**
 * 확인해 둔 짝의 브랜드 색을 받아 온다. 짝은 있는데 상대가 사라졌으면
 * **조용히 넘기지 않고 알린다** — 그 줄은 사람이 다시 확인해야 한다.
 */
async function fetchBrandInk() {
  const res = await fetch(BRAND_SOURCE, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    console.error(`[acp-registry] 브랜드 색 받기 실패: HTTP ${res.status}`);
    process.exit(1);
  }
  const data = await res.json();
  const icons = Array.isArray(data) ? data : (data.icons ?? []);
  const byTitle = new Map(icons.map((i) => [String(i.title).toLowerCase(), i]));
  const ink = {};
  for (const [id, title] of Object.entries(BRAND_MARK)) {
    const match = byTitle.get(title.toLowerCase());
    if (!match) {
      console.error(`[acp-registry] 브랜드 색 짝이 사라졌습니다: ${id} → "${title}"`);
      console.error('  BRAND_MARK 의 그 줄을 사람이 다시 확인해야 합니다.');
      process.exit(1);
    }
    ink[id] = `#${match.hex}`;
  }
  return ink;
}

function normalize(raw, brandInk = {}) {
  const agents = [];
  for (const agent of raw.agents ?? []) {
    const launch = pickLaunch(agent.distribution);
    if (!launch) continue; // 띄울 방법이 없으면 목록에 둘 이유가 없다.
    agents.push({
      id: agent.id,
      name: DISPLAY_NAME[agent.id] ?? agent.name,
      description: agent.description ?? '',
      website: agent.website ?? agent.repository ?? null,
      license: agent.license ?? null,
      verified: VERIFIED.has(agent.id),
      icon: agent.icon ? `/acp-icons/${agent.id}.svg` : null,
      // 확인해 둔 짝이 없으면 `null` — 화면이 무채색으로 그린다.
      brandInk: brandInk[agent.id] ?? null,
      cli: UNDERLYING_CLI[agent.id] ?? null,
      launch,
    });
  }
  agents.sort((a, b) => {
    // 재 본 것이 앞. 그다음은 이름순 — 화면이 순서를 다시 정하지 않아도 되게.
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    return a.name.localeCompare(b.name, 'en');
  });
  return {
    source: SOURCE,
    registryVersion: raw.version ?? null,
    agents,
    // 아이콘을 받으려면 원본의 절대 URL 이 필요하다. 저장하지는 않는다.
    __raw: (raw.agents ?? []).filter((a) => agents.some((n) => n.id === a.id)),
  };
}

/** 아이콘 하나를 받아 저장한다. 실패하면 그 항목만 아이콘 없이 간다. */
async function fetchIcon(agent) {
  if (!agent.icon) return false;
  try {
    const res = await fetch(agent.icon);
    if (!res.ok) return false;
    const svg = await res.text();
    // SVG 안의 스크립트·외부 참조를 받지 않는다. 앱 안에서 그리는 이미지가
    // 바깥으로 나가거나 코드를 실행할 이유가 없다.
    if (/<script|xlink:href\s*=\s*["']https?:|href\s*=\s*["']https?:/i.test(svg)) return false;
    writeFileSync(join(ICON_DIR, `${agent.id}.svg`), svg);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const check = process.argv.includes('--check');
  const response = await fetch(SOURCE, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    console.error(`[acp-registry] 받기 실패: HTTP ${response.status}`);
    process.exit(1);
  }
  const rawJson = await response.json();

  if (check) {
    // 아이콘과 브랜드 색은 받지 않는다 — 검사 모드는 **목록이 최신인가**만 본다.
    // 커밋된 스냅샷의 값을 그대로 얹어 비교해야 「아이콘 하나가 실패했다」가
    // 목록 불일치로 둔갑하지 않는다.
    const normalized = normalize(rawJson);
    const committed = JSON.parse(readFileSync(OUT, 'utf8'));
    const byId = new Map(committed.agents.map((a) => [a.id, a]));
    delete normalized.__raw;
    for (const agent of normalized.agents) {
      agent.icon = byId.get(agent.id)?.icon ?? null;
      agent.brandInk = byId.get(agent.id)?.brandInk ?? null;
    }
    const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
    if (readFileSync(OUT, 'utf8') !== serialized) {
      console.error('[acp-registry] 커밋된 스냅샷이 최신과 다릅니다.');
      console.error('  node scripts/build-acp-registry.mjs 를 돌리고 diff 를 확인하세요.');
      process.exit(1);
    }
    console.log(`[acp-registry] current · ${normalized.agents.length} agents`);
    return;
  }

  const normalized = normalize(rawJson, await fetchBrandInk());
  /*
   * 폴더를 통째로 지우지 않는다 — 여기에는 아이콘 말고 **출처 기록**
   * (`CREDITS.md`)도 산다. 통째로 지우면 남의 마크를 어디서 받아 왔는지가
   * 갱신할 때마다 사라진다. 지우는 것은 우리가 만든 것(`*.svg`)뿐이다.
   */
  mkdirSync(ICON_DIR, { recursive: true });
  for (const name of readdirSync(ICON_DIR)) {
    if (name.endsWith('.svg')) rmSync(join(ICON_DIR, name));
  }
  const raw = normalized.__raw;
  delete normalized.__raw;
  let icons = 0;
  for (const agent of raw) {
    if (await fetchIcon(agent)) icons += 1;
    else {
      const entry = normalized.agents.find((a) => a.id === agent.id);
      if (entry) entry.icon = null;
    }
  }
  writeFileSync(OUT, `${JSON.stringify(normalized, null, 2)}\n`);
  const verified = normalized.agents.filter((a) => a.verified).length;
  console.log(`[acp-registry] 아이콘 ${icons}개 → public/acp-icons/`);
  console.log(
    `[acp-registry] ${normalized.agents.length} agents (검증됨 ${verified}) → src-tauri/src/acp-registry.json`,
  );
}

await main();
