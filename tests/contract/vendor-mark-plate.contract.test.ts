import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 남의 제품 마크가 앉는 **밝은 판** — 쓰임을 넓히지 않는다.
 *
 * ## 왜 이 게이트가 있나
 *
 * 이 앱은 어두운 화면 하나이고, 그 규칙에는 예외를 두지 않는다. 그런데 실행기
 * 목록의 32px 타일만은 **밝은 판**이다 — 거기 놓이는 것이 우리 것이 아니라 그
 * 벤더의 마크이고, 색을 확인한 11개 중 6개가 검정~`#2D2D2D` 라 어두운 판 위에
 * 그대로 올리면 검은 판에 검은 그림이 되기 때문이다(2026-08-16 에 실제로 그렇게
 * 나갔고 소유자가 발견했다).
 *
 * 예외는 **적어 두는 것만으로는 안 지켜진다.** 이 저장소가 발자국 번짐 예외에
 * 쓴 것과 같은 형태의 게이트를 둔다: 값이 무채색인가 · 쓰는 곳이 하나인가 ·
 * 문서에 적혀 있는가.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const GLOBALS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');

const TOKENS = ['--color-vendor-plate', '--color-vendor-plate-edge', '--color-vendor-mark-ink'];

/** `#rrggbb` 나 `rgba(r,g,b,a)` 에서 R·G·B 를 뽑는다. */
function rgb(value: string): [number, number, number] | null {
  const hex = /#([0-9a-f]{6})\b/i.exec(value);
  if (hex) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const fn = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(value);
  return fn ? [Number(fn[1]), Number(fn[2]), Number(fn[3])] : null;
}

function tokenValue(name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(GLOBALS);
  if (!match) throw new Error(`${name} 이 app/globals.css 에 없습니다`);
  return match[1].trim();
}

/** `src/**` · `app/**` 의 모든 소스 파일. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    // 검사 파일은 소비처가 아니다 — 토큰 이름을 **단언하려고** 적는 자리라,
    // 여기 세면 이 게이트가 자기 자신을 위반으로 잡는다.
    else if (/\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('남의 제품 마크 판 — 예외를 예외로 유지한다', () => {
  it('세 토큰이 실재한다', () => {
    for (const token of TOKENS) expect(tokenValue(token)).toBeTruthy();
  });

  it('판도 잉크도 무채색이다 — 새 색상을 들이는 예외가 아니다', () => {
    /*
     * 이 예외가 정당한 이유는 「어두운 화면 규칙을 한 자리에서 뒤집었다」이지
     * 「새 색을 하나 들였다」가 아니다. 값이 무채색을 벗어나는 순간 그 근거가
     * 사라지므로 여기서 잠근다. 화면에 들어오는 색은 벤더 마크 **자신의**
     * 브랜드 색뿐이고, 그 값은 코드가 아니라 생성된 데이터에 있다.
     */
    for (const token of TOKENS) {
      const parsed = rgb(tokenValue(token));
      expect(parsed, `${token} 의 값을 읽지 못했습니다`).not.toBeNull();
      const [r, g, b] = parsed!;
      expect(
        Math.max(r, g, b) - Math.min(r, g, b),
        `${token} 이 무채색이 아닙니다 — rgb(${r}, ${g}, ${b})`,
      ).toBeLessThanOrEqual(4);
    }
  });

  it('판은 밝고 기본 잉크는 어둡다 — 그 대비가 이 예외의 존재 이유다', () => {
    const [pr] = rgb(tokenValue('--color-vendor-plate'))!;
    const [ir] = rgb(tokenValue('--color-vendor-mark-ink'))!;
    expect(pr, '판이 밝지 않으면 검은 마크가 다시 안 보인다').toBeGreaterThan(200);
    expect(ir, '기본 잉크가 어둡지 않으면 밝은 판 위에서 안 보인다').toBeLessThan(60);
  });

  it('쓰는 곳은 마크 타일 한 파일뿐이다', () => {
    const users = sourceFiles(join(ROOT, 'src'))
      .concat(sourceFiles(join(ROOT, 'app')))
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return TOKENS.some((token) => text.includes(token));
      })
      .map((file) => file.slice(ROOT.length + 1));

    // globals.css 는 정의하는 곳이라 언제나 들어온다. 그 밖에 남아도 되는 것은
    // 마크 타일을 그리는 한 파일뿐이다.
    expect(users.sort()).toEqual([
      'app/globals.css',
      'src/widgets/app-settings-menu/ui/settings-primitives.tsx',
    ]);
  });

  it('출처와 근거가 문서에 적혀 있다', () => {
    const credits = readFileSync(join(ROOT, 'public', 'acp-icons', 'CREDITS.md'), 'utf8');
    expect(credits).toContain('--color-vendor-plate');
    // 자동 매칭이 남의 브랜드에 틀린 색을 붙인 실측이 기록에 남아 있어야 한다 —
    // 그것이 「사람이 확인한 짝만 둔다」는 규율의 근거다.
    expect(credits).toContain('amp-acp');
  });

  it('브랜드 색은 코드가 아니라 생성된 데이터에서 온다', () => {
    /*
     * 색을 컴포넌트에 적기 시작하면 그날부터 이 목록이 두 곳에 살고, 둘이
     * 어긋난다. 그림도 색도 빌드 산출물 하나에서만 온다.
     */
    const tile = readFileSync(
      join(ROOT, 'src', 'widgets', 'app-settings-menu', 'ui', 'settings-primitives.tsx'),
      'utf8',
    );
    // 여는 태그·인라인 스타일 어디에도 hex 리터럴이 없어야 한다. 주석은 뺀다 —
    // 「검정~#2D2D2D 였다」처럼 **왜 그렇게 했는지**를 적는 자리는 값이 아니다.
    const code = tile.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/#[0-9a-fA-F]{6}\b/);

    const registry = JSON.parse(
      readFileSync(join(ROOT, 'src-tauri', 'src', 'acp-registry.json'), 'utf8'),
    ) as { agents: Array<{ id: string; brandInk: string | null }> };
    const colored = registry.agents.filter((a) => a.brandInk !== null);
    expect(colored.length, '확인된 브랜드 색이 하나도 없습니다').toBeGreaterThan(0);
    for (const agent of colored) {
      expect(agent.brandInk, `${agent.id} 의 색이 #RRGGBB 가 아닙니다`).toMatch(
        /^#[0-9A-Fa-f]{6}$/,
      );
    }
    // Codex 는 일부러 색이 없다 — 벤더 요청으로 배포가 막힌 마크다.
    const codex = registry.agents.find((a) => a.id === 'codex-acp');
    expect(codex?.brandInk, 'OpenAI 마크에 색을 붙이면 안 된다').toBeNull();
  });
});
