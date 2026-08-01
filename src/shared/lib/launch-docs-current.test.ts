import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLI_COMMAND_COUNT } from '../../../cli/src/lib/cli-commands.mjs';
import { parseMcpToolMetadataFromDescription } from '../../../cli/src/lib/mcp-metadata.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const MCP_PKG = JSON.parse(readFileSync(path.join(ROOT, 'mcp/package.json'), 'utf8'));
const MCP_TOOL_METADATA = parseMcpToolMetadataFromDescription(MCP_PKG.description);

// `docs/PUBLISH-NPM.md` 는 npm 발행 계획 폐기 (docs/DECISIONS.md 2026-07-27) 로
// `docs/archive/` 로 옮겨졌다. 아카이브는 당시 사실을 그대로 보존하는 기록이라
// 현행 surface 드리프트 게이트의 대상이 아니다.
const CURRENT_SURFACE_DOCS = [
  'README.md',
  'docs/FEATURES.md',
  'docs/launch/README.md',
  'docs/launch/HN-POST.md',
  'docs/launch/REDDIT-POSTS.md',
  'docs/launch/X-THREAD.md',
  'docs/launch/DEMO-GIF-STORYBOARD.md',
] as const;

/**
 * 데모 링크가 지도를 약속하면서 사이트 루트로 보내는지 보는 문서 목록.
 *
 * 종전 이름은 `DOGFOOD_COUNT_DOCS` 였고 「노드 수를 적는 문서」 목록이기도
 * 했다. 그 두 번째 용도가 사라져(아래 결정) 이름을 남은 용도로 고쳤다.
 */
const DEMO_LINK_DOCS = [
  'README.md',
  'docs/launch/HN-POST.md',
  'docs/launch/DEMO-GIF-STORYBOARD.md',
] as const;

const MCP_TOOL_COUNT_DOCS = [
  'README.md',
  'docs/launch/README.md',
  'docs/launch/HN-POST.md',
  'docs/launch/REDDIT-POSTS.md',
  'docs/launch/X-THREAD.md',
] as const;

const MCP_TOOL_SPLIT_DOCS = [
  'README.md',
  'docs/FEATURES.md',
  'docs/launch/README.md',
  'docs/launch/REDDIT-POSTS.md',
] as const;

const STALE_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /\b12 tools\b/i,
    message: `MCP launch copy must use the current ${MCP_TOOL_METADATA?.toolCount}-tool surface.`,
  },
  {
    pattern: /\b20 tools\b/i,
    message: `MCP launch copy must use the current ${MCP_TOOL_METADATA?.toolCount}-tool surface.`,
  },
  {
    pattern: /\bread 8 \+ write 4\b/i,
    message: `MCP launch copy must use read ${MCP_TOOL_METADATA?.readCount} + write ${MCP_TOOL_METADATA?.writeCount}.`,
  },
  {
    pattern: /\bread 12 \+ write 8\b/i,
    message: `MCP launch copy must use read ${MCP_TOOL_METADATA?.readCount} + write ${MCP_TOOL_METADATA?.writeCount}.`,
  },
  {
    pattern: /\b8 read \+ 4 write\b/i,
    message: `MCP launch copy must use ${MCP_TOOL_METADATA?.readCount} read + ${MCP_TOOL_METADATA?.writeCount} write.`,
  },
  {
    pattern: /\b12 read \+ 8 write\b/i,
    message: `MCP launch copy must use ${MCP_TOOL_METADATA?.readCount} read + ${MCP_TOOL_METADATA?.writeCount} write.`,
  },
  // [삭제됨 2026-08-01, 소유자 지시] 볼트 노드/관계 수를 겨냥한 세 항목
  // (`~130 nodes` · `26 nodes` · `165 relations`). 이 목록은 **낡은 수를 하나씩
  // 손으로 등재해야** 자라는 장치였다 — 볼트가 커질 때마다 어제의 참값이
  // 오늘의 금지어가 되므로, 항목을 안 더하면 게이트는 조용히 무력해지고
  // 더하면 사람이 계속 잡일을 한다. 어느 쪽이든 «CI 가 볼트 노드 수를 센다»
  // 는 관습을 지지한다. 아래 남은 항목들은 **공개 계약의 수**(MCP 도구
  // 인벤토리)이거나 **수를 동결하지 말라는 규칙**이라 성격이 다르다.
  {
    pattern: /10 others/i,
    message: `MCP verification copy must mention the ${MCP_TOOL_METADATA?.toolCount}-tool namespace, not an old count.`,
  },
  {
    pattern: /\d+ (?:unit )?test files?\s*\/\s*\d+ (?:unit )?tests?/i,
    message: 'Launch proof copy must not freeze test counts that drift with every added test.',
  },
];

describe('current-surface launch docs', () => {
  it('do not advertise stale MCP or frozen test counts', async () => {
    const findings: string[] = [];

    for (const relPath of CURRENT_SURFACE_DOCS) {
      const text = await readFile(path.join(ROOT, relPath), 'utf8');
      for (const { pattern, message } of STALE_PATTERNS) {
        if (pattern.test(text)) {
          findings.push(`${relPath}: ${message}`);
        }
      }
    }

    expect(findings).toEqual([]);
  });

  // [삭제됨 2026-08-01, 소유자 지시] 「문서가 노드 수를 말한다면 그 수는 볼트와
  // 같다」 게이트.
  //
  // 이 게이트의 마지막 판(2026-07-31)은 이미 **요구를 걷고 거짓말 금지만**
  // 남긴 상태였고, 그것만 보면 유지 비용이 0 처럼 보인다. 그런데 비용은
  // 게이트가 아니라 **다음 사람의 습관**에 있었다: 세는 장치가 살아 있는 한
  // 문서에 수를 적는 것이 «지원되는 관습» 으로 읽히고, 적힌 수는 볼트가
  // 자라는 순간 CI 를 빨갛게 만든다. 볼트를 규격대로 재생성하자 그 청구서가
  // 한꺼번에 도착했다.
  //
  // 그래서 규율을 한 줄로 바꿨다 — **CI 는 볼트 노드 수를 세지 않는다.**
  // 수를 말해야 하는 자리는 문서가 아니라 명령(`node cli/src/index.mjs
  // overview`)이다. 잃은 것은 정직하게 적는다: 이제 산문에 낡은 노드 수를
  // 적어도 CI 는 침묵한다. 되살릴 조건은 `docs/DECISIONS.md` 의 반증 조건
  // (틀린 수가 사용자에게 노출된 사례가 관측되면)이다.
  //
  // **화면에 렌더되는 카피는 여전히 별개다** — 그건 사용자에게 하는 주장이라
  // 런타임에 같은 출처에서 계산되어야 하고, `DownloadPage.test.tsx` 의
  // 「캡션 == 그래프」 단언이 그 자리를 지킨다(그 단언은 손으로 맞출 숫자가
  // 없어 썩지 않는다).

  it('keeps MCP tool-count claims aligned with the package metadata', async () => {
    expect(MCP_TOOL_METADATA).toBeTruthy();
    const findings: string[] = [];
    const toolCountPattern = new RegExp(`\\b${MCP_TOOL_METADATA?.toolCount} tools\\b|\\b${MCP_TOOL_METADATA?.toolCount}-tool\\b`);

    for (const relPath of MCP_TOOL_COUNT_DOCS) {
      const text = await readFile(path.join(ROOT, relPath), 'utf8');
      if (!toolCountPattern.test(text)) {
        findings.push(`${relPath}: expected ${MCP_TOOL_METADATA?.toolCount} MCP tools`);
      }
    }

    expect(findings).toEqual([]);
  });

  it('keeps MCP read/write split claims aligned with the package metadata', async () => {
    expect(MCP_TOOL_METADATA).toBeTruthy();
    const findings: string[] = [];
    const splitPattern = new RegExp(
      `${MCP_TOOL_METADATA?.readCount} read\\s*(?:\\+|·)\\s*${MCP_TOOL_METADATA?.writeCount} write|read ${MCP_TOOL_METADATA?.readCount}\\s*\\+\\s*write ${MCP_TOOL_METADATA?.writeCount}`,
      'i',
    );

    for (const relPath of MCP_TOOL_SPLIT_DOCS) {
      const text = await readFile(path.join(ROOT, relPath), 'utf8');
      if (!splitPattern.test(text)) {
        findings.push(`${relPath}: expected ${MCP_TOOL_METADATA?.splitText}`);
      }
    }

    expect(findings).toEqual([]);
  });

  // [삭제됨 2026-07-31] README 가 kind 별 내역(capabilities 38 · elements 49 …)을
  // 적고 있으라는 게이트. 위와 같은 이유 — 여섯 개 숫자를 손으로 동기화시키는
  // 장치였고, 노드 하나만 추가돼도 무관한 PR 이 README 수정을 요구받았다.
  // README 는 이제 `node cli/src/index.mjs overview` 를 부른다.

  it('keeps the packaged agent workflow aligned with current CLI, MCP, and dogfood facts', async () => {
    expect(MCP_TOOL_METADATA).toBeTruthy();
    const workflow = await readFile(path.join(ROOT, 'docs/AGENT-GRAPH-WORKFLOW.md'), 'utf8');

    // 이 넷은 **공개 계약의 수**다 — 명령을 더하거나 도구를 등록해야만 바뀌고,
    // 그 변경은 의도적이라 문서가 따라오는 것이 맞다.
    expect(workflow).toContain(`${CLI_COMMAND_COUNT} commands`);
    expect(workflow).toContain(`${MCP_TOOL_METADATA?.toolCount} local tools`);
    expect(workflow).toContain(`${MCP_TOOL_METADATA?.readCount} read tools`);
    expect(workflow).toContain(`${MCP_TOOL_METADATA?.writeCount} write tools`);
    // **볼트 노드 수는 여기서 요구하지 않는다.** 노드는 아무나 추가하는데 이
    // 문서는 아무도 안 고친다 — 요구하면 문서가 그 말을 듣고, 그 다음 노드
    // 하나에 낡는다. 실제로 그렇게 됐다: 이 게이트가 강제한 「98 nodes」 옆에
    // 그래프 해시·엣지 수·파일 수까지 옛 볼트의 측정 기록이 통째로 얼어붙어
    // 있었다(2026-08-01, 볼트 재생성으로 드러남). 지금 그 자리는 **명령을 적은
    // 절차서**이고, 수는 그 명령을 돌린 사람이 자기 화면에서 본다.
  });

  /**
   * **"설치 없이 지도를 본다" 고 말하는 링크는 지도 주소를 가리켜야 한다.**
   *
   * 2026-07-30 에 사이트 루트가 지도에서 **다운로드 얼굴**로 바뀌었다(원장:
   * 「root-first-open」 뒤집기 구현). 그 순간 런치 자산과 README 의 「Hosted demo
   * — no install」 링크 세 개가 전부 **설치를 권하는 화면으로 되돌아오는 고리**가
   * 됐다. 앱 안에서는 `map-destination-route.contract` 가 같은 부패를 막지만,
   * 그 게이트는 소스 코드만 본다 — 산문 속 절대 URL 은 시야 밖이었다.
   *
   * 판정은 라벨과 목적지를 함께 본다. 사이트 루트를 **가리키는 것 자체**는 결함이
   * 아니다(배포 문서·첫 페이지 언급은 그대로 루트가 맞다). 결함은 *"데모"* 나
   * *"설치 없이"* 라고 말해 놓고 루트로 보내는 줄이다.
   */
  it('demo links promise the map, so they point at the map', async () => {
    const SITE = 'https://wlsdks.github.io/ontology-atlas/';
    const PROMISE = /demo|데모|no install|설치 없이|지도를 본|see the graph/i;
    /** 로케일 경로 없이 사이트 루트에서 끝나는 URL. */
    const bareRoot = (text: string) =>
      new RegExp(`${SITE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z]{2}/)`).test(text);
    const findings: string[] = [];

    for (const relPath of DEMO_LINK_DOCS) {
      const text = await readFile(path.join(ROOT, relPath), 'utf8');

      /**
       * **마크다운 링크는 라벨로 판정한다.** 사이트 루트를 가리키는 것 자체는
       * 결함이 아니다 — README 는 *"첫 페이지(`/`)는 다운로드 얼굴이다"* 라고
       * 정확히 설명하면서 루트를 가리키고, 그건 참인 문장이다. 결함은 라벨이
       * **지도/데모를 약속**하면서 루트로 보내는 것이다.
       */
      for (const [, label, url] of text.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
        if (bareRoot(url) && PROMISE.test(label)) {
          findings.push(`${relPath}: 링크 라벨 "${label}" 이 지도를 약속하는데 사이트 루트로 보낸다`);
        }
      }

      /**
       * 맨 URL 은 라벨이 없으므로 **앞줄**이 라벨 역할을 한다. 런치 포스트는
       * 「… no install:」 다음 줄에 URL 만 놓는 형식이라, 줄 단위로만 보면 이
       * 게이트가 조용히 통과한다 — 실제로 첫 판이 그렇게 통과했다.
       */
      const lines = text.split(/\r?\n/);
      for (const [i, line] of lines.entries()) {
        const trimmed = line.trim();
        if (!bareRoot(trimmed) || !/^https?:\/\/\S+$/.test(trimmed)) continue;
        if (PROMISE.test(`${lines[i - 1] ?? ''} ${trimmed}`)) {
          findings.push(`${relPath}:${i + 1} 맨 URL 이 데모를 약속하며 사이트 루트로 보낸다`);
        }
      }
    }

    expect(findings).toEqual([]);
  });
});
