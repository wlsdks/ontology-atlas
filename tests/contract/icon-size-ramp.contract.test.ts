import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { ICON_SIZE } from '../../src/shared/ui/icon-size';

/**
 * 콘텐츠 아이콘 크기 램프 — **CSS ↔ JS 거울 + 램프 밖 리터럴 래칫.**
 *
 * ## 왜 이 게이트가 없으면 안 되나 (2026-08-04 체계석 전수, docs/DECISIONS.md)
 *
 * 콘텐츠 아이콘(lucide)의 크기는 JSX **숫자 prop**(`size={N}`)으로 들어간다.
 * className 이 아니므로 값 lint(`text-[Npx]` 류)의 사정거리 밖이고, 크기 토큰
 * (`--topology-chrome-icon-size` 등)은 표면 전용이라 콘텐츠 아이콘이 기댈 데가
 * 없었다. 결과 — 전수 167 콜사이트가 px 값 **9종**(10·11·12·13·14·15·16·17 +
 * 무지정 24)으로 갈라졌고, 같은 파일 안에 4값이 섞인 표면이 둘이었다
 * (문서함 팔레트 10/11/12/14 · 의존 피커 10/11/12/13). 역할이 아니라 드리프트다.
 * 실사용 시험자의 기록: *"아무것도 나에게 다른 값을 알려주지 않았다."*
 *
 * framer duration 사고(`motion-token-mirror.contract.test.ts`)와 같은 병 —
 * **값이 게이트가 안 보는 채널에 살면 반드시 갈라진다.**
 *
 * ## 왜 lint 룰이 아니라 래칫인가
 *
 * 부채 64건은 한 PR 로 못 치운다 — 치환이 곧 렌더 픽셀 변경(±1~2px)이라
 * 자리마다 디자인 판정이 필요하다(컨트롤 래칫 창립 판단과 같은 이유). 그리고
 * lint 로 걸면 부채 파일을 `no-restricted-syntax` 예외로 빼야 하는데, flat
 * config 는 rule option 을 병합하지 않고 교체하므로 아이콘 전용 예외 블록이
 * 그 파일들의 **램프 셀렉터까지 통째로** 바꿔치기한다(다중 블록 함정) —
 * 예외의 사정거리가 원리적으로 안 맞는다. 래칫은 파일 단위로 정확히 이
 * 리터럴만 세고, **새 파일은 첫날부터 0 이어야 한다.**
 *
 * ## 사정거리
 *
 * lucide import 가 있는 프로덕션 `.tsx` 의 lucide 여는 태그만 본다. 크롬·레일
 * 아이콘 토큰(`--*-icon-size` · `--chrome-icon`)은 표면 계약 소유라 대상 밖.
 * 알려진 한계: `size={cond ? 14 : undefined}` 같은 **조건식은 리터럴이 아니라
 * 안 보인다**(현재 1곳, AppSettingsMenu — else 가지는 무지정 24 로 렌더된다).
 * 과소 계상 방향의 오차이고, 그 자리는 아래 무지정 래칫의 주석에 적어 둔다.
 */

const ROOT = process.cwd();
const CSS = readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');

function cssPx(name: string): number {
  const m = CSS.match(new RegExp(`^\\s*${name}\\s*:\\s*([0-9.]+)px;`, 'm'));
  if (!m) throw new Error(`${name} 이 app/globals.css 에 없다`);
  return Number(m[1]);
}

/** 여는 태그를 중괄호 깊이로 끊는다 — 컨트롤 래칫이 두 번 밟은 함정의 회피. */
function openingTag(source: string, from: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = from; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (c === quote && source[i - 1] !== '\\') quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return source.slice(from, i);
  }
  return source.slice(from, from + 2000);
}

interface IconScan {
  /** lucide 여는 태그 수 (공회전 방지의 분모). */
  total: number;
  /** 파일별 램프 밖 크기 리터럴 수 (`size={N}` prop + `size-N`/`h-N w-N` class). */
  offRamp: Map<string, number>;
  /** 파일별 무지정(lucide 기본 24px 렌더) 수. */
  unsized: Map<string, number>;
}

function scanSource(rel: string, source: string, ramp: Set<number>, acc: IconScan): void {
  // [^}] 는 개행도 포함하므로 /s 플래그가 필요 없다. [\s\S]*? 로 쓰면 안 된다 —
  // 게으른 수량자가 앞선 다른 모듈의 import 를 건너 삼켜 아이콘 이름 집합이 오염된다
  // (전수 스캔에서 실제로 그랬다: 파일 9개의 분류가 조용히 틀어졌다).
  const importMatch = /import\s*\{([^}]*)\}\s*from\s*'lucide-react'/.exec(source);
  if (!importMatch) return;
  const lucide = new Set(
    importMatch[1]
      .split(',')
      .map((n) => n.trim().split(/\s+as\s+/).pop()?.trim() ?? '')
      .filter(Boolean),
  );
  for (const tagMatch of source.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) {
    if (!lucide.has(tagMatch[1])) continue;
    acc.total += 1;
    const tag = openingTag(source, tagMatch.index ?? 0);
    const prop = /\bsize=\{(\d+)\}/.exec(tag);
    const cls = /\bsize-(\d+(?:\.\d)?)\b/.exec(tag) ?? /\bh-(\d+(?:\.\d)?)\s+w-\1\b/.exec(tag);
    if (prop) {
      if (!ramp.has(Number(prop[1]))) acc.offRamp.set(rel, (acc.offRamp.get(rel) ?? 0) + 1);
    } else if (cls) {
      if (!ramp.has(Number(cls[1]) * 4)) acc.offRamp.set(rel, (acc.offRamp.get(rel) ?? 0) + 1);
    } else if (!tag.includes('size=') && !tag.includes('size-[') && !tag.includes('h-[')) {
      acc.unsized.set(rel, (acc.unsized.get(rel) ?? 0) + 1);
    }
  }
}

function scanProduction(ramp: Set<number>): IconScan {
  const acc: IconScan = { total: 0, offRamp: new Map(), unsized: new Map() };
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === 'node_modules' || name === '.next') continue;
        walk(p);
      } else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) {
        scanSource(path.relative(ROOT, p), readFileSync(p, 'utf8'), ramp, acc);
      }
    }
  };
  for (const root of ['src', 'app']) walk(path.join(ROOT, root));
  return acc;
}

/**
 * **리터럴 장부다 — 스캔 결과에서 파생하지 않는다** (컨트롤 래칫의 규율 그대로:
 * 기준선을 실측에서 파생하면 「늘지 않는다」가 원리적으로 실패 불가가 된다).
 *
 * 값은 2026-08-04 전수. 여기 있는 파일은 **면제가 아니라 부채**다 — 수가
 * 늘면 빨개지고, 0 이 되면 줄을 지워야 한다. 갚는 라운드는 자리마다
 * before→after 표를 갖는 디자인 패스다(±1~2px 픽셀 이동).
 */
const OFF_RAMP_DEBT: ReadonlyArray<readonly [string, number]> = [
  ['src/features/agent-activity/ui/AgentActivityChip.tsx', 1],
  ['src/features/docs-vault-local/ui/AgentConnectAction.tsx', 7],
  ['src/features/docs-vault-local/ui/OntologyStarterCta.tsx', 1],
  ['src/features/docs-vault-local/ui/WebManualConnectPanel.tsx', 2],
  ['src/features/project-edit/ui/DependencyPicker.tsx', 5],
  ['src/features/vault-ontology/ui/RecentChangesNeedsVaultDialog.tsx', 2],
  ['src/views/docs-vault/ui/DocsVaultPage.tsx', 2],
  ['src/views/download/ui/DownloadPage.tsx', 6],
  ['src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx', 3],
  ['src/widgets/app-settings-menu/ui/VaultAgentSetupPanel.tsx', 1],
  ['src/widgets/bottom-tab-bar/ui/BottomTabBar.tsx', 1],
  ['src/widgets/docs-vault/ui/DocsVaultBacklinks.tsx', 4],
  ['src/widgets/docs-vault/ui/DocsVaultEditor.tsx', 10],
  ['src/widgets/docs-vault/ui/DocsVaultUnifiedPalette.tsx', 13],
  ['src/widgets/docs-vault/ui/DocsVaultViewer.tsx', 3],
  ['src/widgets/search-palette/ui/SearchPalette.tsx', 2],
  ['src/widgets/vault-agent-panel/ui/AgentProposalCard.tsx', 1],
];

/**
 * 무지정 lucide — 기본 24px 로 렌더된다. 셋 다 의도한 24 가 아니라 누락으로
 * 보이지만(형제들은 전부 명시 크기), 고치면 픽셀이 움직이므로 부채로 등재만
 * 한다. (+ AppSettingsMenu 의 조건식 else 가지 1곳은 탐지기 시야 밖 — 사정거리
 * 주석 참조.)
 */
const UNSIZED_DEBT: ReadonlyArray<readonly [string, number]> = [
  ['src/widgets/search-hint/ui/SearchHint.tsx', 2],
  ['src/widgets/topology-controls/ui/TopologyFitControl.tsx', 1],
];

describe('콘텐츠 아이콘 크기 램프', () => {
  const ramp = new Set<number>(Object.values(ICON_SIZE));

  it('CSS 램프(--icon-*)와 JS 거울(ICON_SIZE)이 같은 값이다', () => {
    expect(cssPx('--icon-sm')).toBe(ICON_SIZE.sm);
    expect(cssPx('--icon-md')).toBe(ICON_SIZE.md);
    expect(cssPx('--icon-lg')).toBe(ICON_SIZE.lg);
  });

  it('거울의 이름 집합이 3단(sm/md/lg)을 벗어나지 않는다 — 단을 늘리려면 원장부터', () => {
    expect(Object.keys(ICON_SIZE).sort()).toEqual(['lg', 'md', 'sm']);
  });

  it('램프 단이 타입 램프의 짝 위에 서 있다 — sm≈label·body, md=body-lg, lg=title', () => {
    // 짝의 정의가 움직이면(타입 램프 개정) 이 단언이 재판정을 요구한다.
    expect(ICON_SIZE.md).toBe(cssPx('--text-body-lg'));
    expect(ICON_SIZE.lg).toBe(cssPx('--text-title'));
    expect(ICON_SIZE.sm).toBeGreaterThan(cssPx('--text-label'));
    expect(ICON_SIZE.sm).toBeLessThan(cssPx('--text-body-lg'));
  });

  const scan = scanProduction(ramp);

  it('탐지기가 공회전하지 않는다 — 제품을 실제로 먹는다', () => {
    // 2026-08-04 실측 167. 아이콘을 지우는 리팩터를 막자는 게 아니라
    // 「스캔 대상이 사라졌는데 0 위반」을 초록으로 두지 않으려는 바닥이다.
    expect(scan.total).toBeGreaterThanOrEqual(120);
  });

  it('램프 밖 크기 리터럴은 장부를 넘지 못한다 — 새 파일은 첫날부터 0', () => {
    const ledger = new Map(OFF_RAMP_DEBT);
    const over: string[] = [];
    for (const [file, count] of scan.offRamp) {
      const allowed = ledger.get(file) ?? 0;
      if (count > allowed) over.push(`${file}: ${count} > 장부 ${allowed}`);
    }
    expect(over, '램프 밖 아이콘 크기가 늘었다 — ICON_SIZE(12/14/16)를 쓰거나, 새 단이 필요하면 「체계」 소집 + 원장').toEqual([]);
  });

  it('장부의 0 회수분은 줄을 지운다 — 장부가 실측보다 후하면 래칫이 헐겁다', () => {
    const stale: string[] = [];
    for (const [file, allowed] of OFF_RAMP_DEBT) {
      const actual = scan.offRamp.get(file) ?? 0;
      if (actual < allowed) stale.push(`${file}: 장부 ${allowed} > 실측 ${actual} — 장부를 ${actual}로 내려라`);
    }
    expect(stale).toEqual([]);
  });

  it('무지정(기본 24px) lucide 는 장부를 넘지 못한다', () => {
    const ledger = new Map(UNSIZED_DEBT);
    const over: string[] = [];
    for (const [file, count] of scan.unsized) {
      const allowed = ledger.get(file) ?? 0;
      if (count > allowed) over.push(`${file}: ${count} > 장부 ${allowed}`);
    }
    expect(over, '크기 무지정 lucide 가 늘었다 — 기본 24 는 선택이 아니라 누락이다').toEqual([]);
    const stale: string[] = [];
    for (const [file, allowed] of UNSIZED_DEBT) {
      const actual = scan.unsized.get(file) ?? 0;
      if (actual < allowed) stale.push(`${file}: 장부 ${allowed} > 실측 ${actual}`);
    }
    expect(stale).toEqual([]);
  });

  /*
   * ── 상주 프로브 — 탐지기 자신이 살아 있는지. 합성 소스를 같은 함수에 먹인다.
   * (게이트 프로브 규율: 「위반이 있다」가 아니라 「제품/결함을 실제로 먹는다」)
   */
  it('프로브: 램프 밖 prop·class 는 잡히고, 램프 값·문자열 size·비-lucide 는 통과한다', () => {
    const probe = (body: string): IconScan => {
      const acc: IconScan = { total: 0, offRamp: new Map(), unsized: new Map() };
      scanSource(
        'probe.tsx',
        `import { Check, Search } from 'lucide-react';\nimport { Select } from './x';\n${body}`,
        ramp,
        acc,
      );
      return acc;
    };
    // 위반 — 램프 밖 숫자 prop (다행 태그 + 콜백 중괄호까지 검증)
    const bad = probe('<Check\n  size={13}\n  onClick={() => {}}\n/>');
    expect(bad.offRamp.get('probe.tsx')).toBe(1);
    // 위반 — 램프 밖 class 표기
    expect(probe('<Check className="h-5 w-5" />').offRamp.get('probe.tsx')).toBe(1);
    // 정상 — 램프 값 셋
    const good = probe('<Check size={12} /><Check size={14} /><Search size={16} />');
    expect(good.offRamp.size).toBe(0);
    expect(good.total).toBe(3);
    // 정상 — 램프 class 표기 (size-3 = 12px)
    expect(probe('<Check className="size-3" />').offRamp.size).toBe(0);
    // 무지정 — 기본 24 로 잡힌다
    expect(probe('<Check aria-hidden />').unsized.get('probe.tsx')).toBe(1);
    // 시야 밖이 맞는 것 — 비-lucide 태그의 숫자 size, 문자열 size
    expect(probe('<Select size={13} />').total).toBe(0);
    // 토큰 참조는 무지정도 위반도 아니다
    const varRef = probe('<Check className="size-[var(--icon-sm)]" />');
    expect(varRef.offRamp.size).toBe(0);
    expect(varRef.unsized.size).toBe(0);
  });

  it('프로브: 스캔 루트가 공집합이면 실패한다', () => {
    const acc: IconScan = { total: 0, offRamp: new Map(), unsized: new Map() };
    scanSource('empty.tsx', '', ramp, acc);
    expect(acc.total).toBe(0); // 빈 소스는 0 — 위 분모 단언(≥120)이 공집합 공회전을 막는다
  });
});
