import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 터미널 ANSI 팔레트 가드 — **배경으로 쓰일 때의 대비**.
 *
 * 이 팔레트는 우리 장식이 아니라 사용자가 띄운 프로그램의 data-ink 라, 원래
 * 검수는 "전경 잉크가 캔버스 위에서 읽히는가" 만 봤다. 그런데 agnoster·
 * powerlevel10k 류 프롬프트 테마는 ANSI 색을 **배경**으로 칠하고 ansi-black 을
 * 그 위 전경으로 쓴다 — 그 짝이 검수 밖이라 디렉토리 세그먼트가 3.63:1,
 * 오류 세그먼트가 3.35:1 로 미달인 채 출하돼 있었다.
 *
 * 이 테스트가 그 짝을 계약으로 잠근다. 팔레트를 다시 손볼 때 hue 를 바꾸면
 * (= 외부 프로그램의 의미를 바꾸면) 안 되고, 명도만 움직일 수 있는데 명도를
 * 잘못 움직이면 여기서 걸린다.
 *
 * 검사 대상이 **일반 8색 + 밝은 8색 전부**가 아닌 이유: ansi-black 자신은
 * 전경이고, 나머지 15색이 배경 후보다. bright 계열도 테마가 배경으로 쓰므로
 * 같이 본다.
 */

const GLOBALS = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

/** WCAG 2.1 1.4.3 — 12px 셀 본문이므로 large text 예외를 쓰지 않는다. */
const AA_TEXT = 4.5;

/**
 * ansi-black 을 전경으로 깔 수 있는 배경들. ansi-black 과 bright-black 은
 * 스스로 배경일 때 검은 전경을 받지 않으므로 뺀다(어두운 배경 + 어두운 전경은
 * 어떤 테마도 만들지 않는다).
 */
const BACKGROUND_TOKENS = [
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "bright-red",
  "bright-green",
  "bright-yellow",
  "bright-blue",
  "bright-magenta",
  "bright-cyan",
  "bright-white",
];

function tokenValue(name: string): string {
  const match = GLOBALS.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`token ${name} not found (hex expected)`);
  return match[1].toLowerCase();
}

function relativeLuminance(hex: string): number {
  const channels = hex
    .replace("#", "")
    .match(/../g)!
    .map((h) => parseInt(h, 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** HSL 색상각 — hue 보존 계약의 측정 단위. */
function hue(hex: string): number {
  const [r, g, b] = hex
    .replace("#", "")
    .match(/../g)!
    .map((h) => parseInt(h, 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  const raw =
    max === r ? (g - b) / delta + (g < b ? 6 : 0) : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return raw * 60;
}

describe("터미널 ANSI 팔레트 — 배경 짝 대비 (WCAG AA)", () => {
  const black = tokenValue("--terminal-ansi-black");
  const white = tokenValue("--terminal-ansi-white");

  for (const name of BACKGROUND_TOKENS) {
    it(`ansi-black 전경이 ansi-${name} 배경 위에서 >= ${AA_TEXT}:1`, () => {
      const bg = tokenValue(`--terminal-ansi-${name}`);
      const ratio = contrast(black, bg);
      expect(
        ratio,
        `black ${black} on ${name} ${bg} = ${ratio.toFixed(2)}:1 (need >= ${AA_TEXT})`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }

  it("ansi-black 이 배경일 때 ansi-white 전경도 읽힌다 — 컨텍스트 세그먼트", () => {
    expect(contrast(white, black)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("ansi-black 밴드는 캔버스와 구분된다 — 앱 자신의 표면 단차보다 크게", () => {
    const canvas = tokenValue("--color-canvas");
    const panel = tokenValue("--color-panel");
    expect(contrast(black, canvas)).toBeGreaterThan(contrast(panel, canvas));
  });

  it("hue 는 우리 것이 아니다 — 명도 보정이 색상각을 옮기지 않았다", () => {
    // 보정 전 ansi-black(#3a3d44)의 색상각. 명도만 내렸으므로 같아야 한다.
    // 허용 2°는 8비트 채널 반올림의 몫이다 — 의도적 hue 이동은 이 안에 못 숨는다.
    expect(Math.abs(hue(black) - hue("#3a3d44"))).toBeLessThanOrEqual(2);
  });
});
