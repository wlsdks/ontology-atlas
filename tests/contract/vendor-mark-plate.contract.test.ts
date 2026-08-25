import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The **light plate** third-party product marks sit on — its use is not widened.
 *
 * **Why this gate exists.** This app is a single dark screen and that rule takes no
 * exceptions. The 32px tiles in the runtime list are the one **light plate**,
 * because what sits there is a vendor's mark rather than ours, and 6 of the 11 marks
 * whose colours were checked are black through `#2D2D2D` — placed on a dark plate
 * they become a black drawing on a black plate (which is exactly how it shipped on
 * 2026-08-16, found by the owner).
 *
 * **Writing an exception down does not keep it.** The gate takes the same form this
 * repository used for the footprint bloom exception: is the value neutral, is there
 * exactly one consumer, and is it recorded in the document.
 */

const ROOT = join(import.meta.dirname, '..', '..');
const GLOBALS = readFileSync(join(ROOT, 'app', 'globals.css'), 'utf8');

const TOKENS = ['--color-vendor-plate', '--color-vendor-plate-edge', '--color-vendor-mark-ink'];

/** Extracts R, G, B from `#rrggbb` or `rgba(r,g,b,a)`. */
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

/** Every source file under `src/**` and `app/**`. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    // Test files are not consumers — they write the token name in order to **assert**
    // it, so counting them makes this gate catch itself as a violation.
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
     * This exception is justified by "the dark-screen rule was inverted in one place",
     * not by "a new colour was introduced". The moment the value leaves neutral that
     * justification disappears, so it is locked here. The only colour entering the screen
     * is the vendor mark's **own** brand colour, and that value lives in generated data
     * rather than in code.
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

  it('판을 칠하는 곳은 한 파일뿐이다 — 소비자가 늘어도 그림은 하나다', () => {
    const users = sourceFiles(join(ROOT, 'src'))
      .concat(sourceFiles(join(ROOT, 'app')))
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return TOKENS.some((token) => text.includes(token));
      })
      .map((file) => file.slice(ROOT.length + 1));

    // globals.css always appears, since it is the definition site. The only other file
    // allowed to remain is the one that draws the mark tile.
    /*
     * The drawing file moved to `shared/ui` on 2026-08-25 so a second surface — the start checklist —
     * could show the tool it found with the vendor's own mark instead of only naming it. The
     * exception did not widen: still exactly one file paints the light plate, and every consumer
     * goes through it. That is the invariant this test exists for, and a second copy of the painting
     * is precisely what it must keep catching.
     */
    expect(users.sort()).toEqual(['app/globals.css', 'src/shared/ui/vendor-mark.tsx']);
  });

  it('출처와 근거가 문서에 적혀 있다', () => {
    const credits = readFileSync(join(ROOT, 'public', 'acp-icons', 'CREDITS.md'), 'utf8');
    expect(credits).toContain('--color-vendor-plate');
    // The measurement where automatic matching attached the wrong colour to someone
    // else's brand must stay on the record — it is the evidence for the rule that only
    // human-verified pairs are kept.
    expect(credits).toContain('amp-acp');
  });

  it('브랜드 색은 코드가 아니라 생성된 데이터에서 온다', () => {
    /*
     * Writing colours into the component makes this list live in two places from that
     * day, and the two diverge. Both the artwork and the colour come from one build
     * output.
     */
    const tile = readFileSync(
      join(ROOT, 'src', 'widgets', 'app-settings-menu', 'ui', 'settings-primitives.tsx'),
      'utf8',
    );
    // No hex literal anywhere in an opening tag or inline style. Comments are excluded —
    // a place recording **why** ("they were black through #2D2D2D") is not a value.
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
    // Codex deliberately has no colour — the vendor asked that its mark not be
    // distributed.
    const codex = registry.agents.find((a) => a.id === 'codex-acp');
    expect(codex?.brandInk, 'OpenAI 마크에 색을 붙이면 안 된다').toBeNull();
  });
});
