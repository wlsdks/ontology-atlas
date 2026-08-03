import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * 등장·퇴장 래칫 — **하드컷 표면은 늘어날 수 없다.**
 *
 * ## 전수 (2026-08-03)
 *
 * 조건부로 나타나는 표면 **20개 중 10개가 하드컷**이었고, 그 10개는 무작위가
 * 아니라 **전부 「인라인 패널」 계열**이었다:
 *
 * | 계열 | 개수 | 등장/퇴장 |
 * |---|---:|---|
 * | 모달(scrim + `aria-modal`) | 9 | 대부분 있음 |
 * | **인라인 패널** | 11 | **전부 없음** |
 *
 * (손으로 센 첫 집계는 10이었고 **이 게이트가 11로 정정했다** — 컨트롤 래칫이
 * 419를 417로 정정한 것과 같다. 세는 일은 사람이 하면 틀린다.)
 *
 * 이유가 분명하다 — 모달은 `AgentConnectSheet` 의 `AnimatePresence` 패턴을 베낄
 * 수 있었고 인라인 패널은 **베낄 패턴이 없었다.** 규율이 아니라 자산의 문제였고,
 * 그래서 `Surface` 를 놓았다(`src/shared/ui/surface.tsx`).
 *
 * ## 왜 lint 가 아니라 래칫인가
 *
 * 컨트롤 채택 래칫과 같은 이유다. 남은 10개를 전부 고치는 것은 한 PR 이 아니고,
 * 각각이 **자기 렌더 게이트의 모델을 퇴장 창 동안 붙들어야** 해서 기계적이지도
 * 않다. 오늘 강제되는 것은 하나다 — **11번째 하드컷은 못 들어온다.**
 */

const BASELINE_HARD_CUT_SURFACES = 11;

/** 조건부로 나타나는 표면의 파일명 관례. 새 관례가 생기면 여기도 넓힌다. */
const SURFACE_SUFFIXES = ['Panel', 'Sheet', 'Modal', 'Drawer', 'Popover', 'Dialog'];

/** 표면에 등장/퇴장을 주는 **인정되는 기제**. 새 기제를 도입하면 여기 등재한다. */
const MOTION_MECHANISMS = ['AnimatePresence', 'usePanelPresence', 'useSurfaceSwap', '<Surface'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(p, out);
    } else if (name.endsWith('.tsx') && !name.endsWith('.test.tsx')) {
      out.push(p);
    }
  }
  return out;
}

function findHardCutSurfaces(): string[] {
  return walk('src')
    .filter((f) => {
      const base = f.split('/').pop()!.replace('.tsx', '');
      return SURFACE_SUFFIXES.some((s) => base.endsWith(s));
    })
    .filter((f) => {
      const source = readFileSync(f, 'utf8');
      /*
       * ★ **자기 파일만 보지 않는다.** 표면의 등장/퇴장은 자기 파일이 아니라
       *   **부모의 렌더 게이트**가 소유할 수 있다(`{open && <X/>}`). 그런데 그
       *   경우에도 이 파일이 `Surface` 로 자기를 감싸면 여기서 보인다. 부모가
       *   `AnimatePresence` 로 감싸는 경우를 놓치는 것은 **알려진 한계**이고,
       *   그래서 이 게이트는 「전수를 다시 세라」가 아니라 「늘지 마라」만 한다.
       */
      return !MOTION_MECHANISMS.some((m) => source.includes(m));
    })
    .sort();
}

describe('등장·퇴장 래칫', () => {
  const hardCut = findHardCutSurfaces();

  it('하드컷 표면이 늘지 않는다 — 새 표면은 Surface 로 감싼다', () => {
    expect(
      hardCut.length,
      `하드컷 표면이 ${BASELINE_HARD_CUT_SURFACES} → ${hardCut.length} 로 늘었다.\n` +
        `조건부로 나타나는 표면은 \`<Surface open={…}>\` 로 감싼다 — 퇴장 창 · 퇴장 클래스 · ` +
        `inert · 포커스 복귀가 기본으로 딸려 온다.\n${hardCut.map((f) => `  ${f}`).join('\n')}`,
    ).toBeLessThanOrEqual(BASELINE_HARD_CUT_SURFACES);
  });

  it('줄었으면 기준선도 내린다 — 여유를 무료로 두지 않는다', () => {
    expect(
      hardCut.length,
      `하드컷이 ${BASELINE_HARD_CUT_SURFACES} → ${hardCut.length} 로 줄었다. ` +
        `BASELINE_HARD_CUT_SURFACES 도 ${hardCut.length} 로 내려라.`,
    ).toBeGreaterThanOrEqual(BASELINE_HARD_CUT_SURFACES);
  });

  it('탐지기가 실제로 세고 있다 — 0을 통과로 읽지 않는다', () => {
    // 접미사 관례가 바뀌면 이 워크가 조용히 빈 집합을 돌고, 그러면 위 둘이
    // «항상 통과» 가 된다. 그건 게이트가 없는 것과 구별되지 않는다.
    const all = walk('src').filter((f) => {
      const base = f.split('/').pop()!.replace('.tsx', '');
      return SURFACE_SUFFIXES.some((s) => base.endsWith(s));
    });
    expect(all.length, '표면 파일을 한 개도 못 찾았다면 접미사 관례가 바뀐 것이다').toBeGreaterThan(15);
  });
});
