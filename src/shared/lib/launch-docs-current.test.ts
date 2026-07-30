import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLI_COMMAND_COUNT } from '../../../cli/src/lib/cli-commands.mjs';
import { parseMcpToolMetadataFromDescription } from '../../../cli/src/lib/mcp-metadata.mjs';
import { dogfoodVaultCensus } from '../../../scripts/lib/vault-census.mjs';

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

const DOGFOOD_COUNT_DOCS = [
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
  {
    pattern: /~?130 (?:nodes|노드)/i,
    message: 'Hosted demo copy must not advertise the old 130-node dogfood vault.',
  },
  {
    pattern: /\b26 (?:nodes|노드)\b/i,
    message: 'Hosted demo copy must use the current 28-node dogfood vault.',
  },
  {
    pattern: /165 (?:relations|관계)/i,
    message: 'Hosted demo copy must not advertise the old 165-relation dogfood vault.',
  },
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
  it('do not advertise stale MCP, dogfood, or test counts', async () => {
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

  it('keeps dogfood node-count claims aligned with the ontology vault', async () => {
    const nodeCount = dogfoodVaultCensus(ROOT).total;
    const findings: string[] = [];

    for (const relPath of DOGFOOD_COUNT_DOCS) {
      const text = await readFile(path.join(ROOT, relPath), 'utf8');
      if (!new RegExp(`\\b${nodeCount} nodes\\b|${nodeCount} 노드`).test(text)) {
        findings.push(`${relPath}: expected ${nodeCount} dogfood nodes`);
      }
      /**
       * **맞는 수가 있는 것만으로는 부족하다** — 틀린 수가 *함께* 있어도 위
       * 검사는 통과한다. 실제로 README 가 영문 절에 98, 한국어 절에 97 을 동시에
       * 들고 그 상태로 초록이었다(2026-07-30).
       *
       * 코드 펜스 안은 면제한다. 거기 있는 `10 노드` 는 질의 결과 예시라
       * 도그푸드 볼트를 세는 문장이 아니다 — 죽은 npm 명령 게이트가 인용과
       * 지시를 자리로 가르는 것과 같은 원리다.
       */
      const prose = text.replace(/```[\s\S]*?```/g, '');
      for (const [, found] of prose.matchAll(/(\d+) (?:nodes\b|노드)/g)) {
        if (Number(found) !== nodeCount) {
          findings.push(`${relPath}: 낡은 노드 수 ${found} (현재 ${nodeCount})`);
        }
      }
    }

    expect(findings).toEqual([]);
  });

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

  it('keeps the README dogfood kind breakdown aligned with the ontology vault', async () => {
    const readme = await readFile(path.join(ROOT, 'README.md'), 'utf8');
    const counts = dogfoodVaultCensus(ROOT).byKind;

    expect(readme).toContain(`capabilities ${counts.capabilities}`);
    expect(readme).toContain(`domains ${counts.domains}`);
    expect(readme).toContain(`elements ${counts.elements}`);
    expect(readme).toContain(`project ${counts.project}`);
    expect(readme).toContain(`vault-readme ${counts['vault-readme']}`);
  });

  it('keeps the packaged agent workflow aligned with current CLI, MCP, and dogfood facts', async () => {
    expect(MCP_TOOL_METADATA).toBeTruthy();
    const workflow = await readFile(path.join(ROOT, 'docs/AGENT-GRAPH-WORKFLOW.md'), 'utf8');
    const census = dogfoodVaultCensus(ROOT);

    expect(workflow).toContain(`${CLI_COMMAND_COUNT} commands`);
    expect(workflow).toContain(`${MCP_TOOL_METADATA?.toolCount} local tools`);
    expect(workflow).toContain(`${MCP_TOOL_METADATA?.readCount} read tools`);
    expect(workflow).toContain(`${MCP_TOOL_METADATA?.writeCount} write tools`);
    expect(workflow).toContain(`${census.total} nodes`);
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

    for (const relPath of ['README.md', ...DOGFOOD_COUNT_DOCS.slice(1)]) {
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
