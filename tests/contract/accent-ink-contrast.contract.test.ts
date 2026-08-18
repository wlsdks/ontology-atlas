import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../scripts/lib/contrast.mjs";
import { controlClass } from "../../src/shared/ui/control-class";

/**
 * 인디고 잉크 2단의 **라이선스 계약** (2026-08-03 체계석 판정, PR #886 후속).
 *
 * ## 무엇을 잠그나
 *
 * 이 앱에는 인디고 잉크의 해가 둘이다:
 *
 * | 톤 | 토큰 | 라이선스 |
 * |---|---|---|
 * | `accent` | `--color-indigo-accent`(#7170ff) | **맨 어두운 바탕만** (canvas/panel/elevated) |
 * | `accentOnTint` | `--color-indigo-text-soft` | 어디서나 — 틴트 채움·호버 채움 포함 |
 *
 * 판정은 이름이 아니라 **합성 대비 실측**이다: 여기서 `app/globals.css` 의
 * 실제 토큰 값을 읽어 WCAG 2.2 §1.4.3(AA 4.5:1)을 계산한다. 토큰 값이
 * 움직이면 이 시험이 그 순간의 진실을 다시 계산한다 — 상수 복제가 아니라서
 * 드리프트가 없다.
 *
 * ## 왜 lint 만으로 안 되나
 *
 * eslint 페어링 셀렉터(`accentTintPairingSelectors`)는 **같은 호출/원소 안의
 * 리터럴**만 본다. `INDIGO_CHIP` 같은 파일 상수로 우회된 className 은 AST
 * 셀렉터 하나에 안 담긴다 — 그 층을 여기 소스 스캔(상수 해석 포함)이 맡는다.
 * (`design.md` "lint 가 못 보는 층은 계약 테스트가 맡는다".)
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/** `app/globals.css` 첫 정의 우선으로 토큰 값을 꺼낸다. */
type Rgba = readonly number[];

function cssToken(css: string, name: string): Rgba {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`globals.css 에 ${name} 이 없다`);
  const v = m[1].trim();
  if (v.startsWith("var(")) return cssToken(css, v.slice(4, -1).trim());
  const parsed = parseColor(v);
  if (!parsed) throw new Error(`${name} 값(${v})을 색으로 못 읽는다`);
  return parsed as Rgba;
}

const css = read("app/globals.css");

/** 앱의 맨 바탕 3단 — 모든 컨트롤 호스트의 바닥. */
const BASES = {
  canvas: cssToken(css, "--color-canvas"),
  panel: cssToken(css, "--color-panel"),
  elevated: cssToken(css, "--color-elevated"),
};

/**
 * 이관 전수(29곳)가 실제로 딛고 있던 틴트들. 여기 없는 새 틴트 위에 accent 를
 * 올리려면 이 목록을 넓히고 아래 라이선스로 증명해야 한다.
 */
const TINTS = {
  "indigo-a06": cssToken(css, "--color-indigo-a06"),
  "indigo-a08": cssToken(css, "--color-indigo-a08"),
  "indigo-a10": cssToken(css, "--color-indigo-a10"),
  "indigo-a12": cssToken(css, "--color-indigo-a12"),
  "indigo-a14": cssToken(css, "--color-indigo-a14"),
  "indigo-a16": cssToken(css, "--color-indigo-a16"),
  "indigo-a18": cssToken(css, "--color-indigo-a18"),
  "indigo-a24": cssToken(css, "--color-indigo-a24"),
  "indigo-a26": cssToken(css, "--color-indigo-a26"),
  "indigo-a32": cssToken(css, "--color-indigo-a32"),
  "indigo-line-a13": cssToken(css, "--color-indigo-line-a13"),
  "amber-signal-a07": cssToken(css, "--color-amber-signal-a07"),
  "amber-signal-a16": cssToken(css, "--color-amber-signal-a16"),
  "danger-a10": cssToken(css, "--color-danger-a10"),
};

const ratioOn = (ink: Rgba, bg: Rgba) =>
  contrastRatio(composite(ink, bg), bg);

describe("인디고 잉크 라이선스 — 값이 아니라 대비가 판정한다", () => {
  const accent = cssToken(css, "--color-indigo-accent");
  const soft = cssToken(css, "--color-indigo-text-soft");

  it("톤 → 토큰 매핑이 서 있다 — accent 는 표식 인디고, accentOnTint 는 글자 인디고", () => {
    /*
     * 대비만으로는 이 매핑을 못 잠근다: soft 는 맨 바탕도 통과하므로
     * `accent` 잉크를 soft 로 바꿔치기해도 아래 라이선스는 초록이다.
     * 하지만 그 순간 앱 전역 99줄의 손글씨 `--color-indigo-accent` 텍스트와
     * 램프가 두 방언이 된다 — 그 정합이 이 매핑의 존재 이유다.
     */
    expect(controlClass({ tone: "accent" })).toContain("text-[color:var(--color-indigo-accent)]");
    expect(controlClass({ tone: "accentOnTint" })).toContain(
      "text-[color:var(--color-indigo-text-soft)]",
    );
  });

  it("accent 의 라이선스: 맨 바탕 3단 전부에서 AA(4.5:1)", () => {
    for (const [name, base] of Object.entries(BASES)) {
      const r = ratioOn(accent, base);
      expect(r, `accent(#7170ff) 가 맨 ${name} 위에서 ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("accentOnTint 의 라이선스: 모든 바탕 × 모든 틴트 합성에서 AA(4.5:1) — 어디서나 안전한 잉크", () => {
    for (const [bn, base] of Object.entries(BASES)) {
      expect(ratioOn(soft, base), `soft 가 맨 ${bn} 위에서 미달`).toBeGreaterThanOrEqual(4.5);
      for (const [tn, tint] of Object.entries(TINTS)) {
        const bg = composite(tint, base);
        const r = ratioOn(soft, bg);
        expect(r, `soft 가 ${tn}/${bn} 합성 위에서 ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("⚠️ 분리의 근거가 사라졌다 — 악센트가 잉걸로 바뀌면서 accent 가 틴트 위에서도 AA 를 통과한다", () => {
    /*
     * **이 단언은 2026-08-18 에 방향이 뒤집혔다.** 원래 문장은 *"분리의 근거가
     * 아직 실재한다 — accent 는 틴트 위에서 실제로 AA 를 깬다"* 였고,
     * `/gate-probe` 규율("빈 집합 위에서 공회전하는 검출기를 금지한다")대로
     * **그 단언이 빨개지는 날 두 톤을 하나로 접을 수 있다**고 미리 적어 두었다.
     *
     * 그날이 왔다. 악센트를 인디고(`#5e6ad2`)에서 잉걸(`#c14a24`)로 바꾸자
     * 실측이 이렇게 움직였다:
     *
     * | 자리 | 인디고 시절 | 잉걸 |
     * |---|---|---|
     * | accent × a24/canvas | 4.5 미만(분리의 근거) | **6.50** |
     *
     * 즉 `accent` / `accentOnTint` 두 톤으로 갈라 둔 **이유 자체가 없어졌다.**
     * 그렇다고 이 커밋에서 접지는 않는다 — 톤 축을 줄이는 것은
     * `src/shared/ui/control-class.ts` 의 **축 변경**이라 `design.md` 「규격을
     * 바꾸려면 「체계」를 부른다」에 걸리고, `pnpm decisions:check` 가 원장
     * 기재를 요구한다. 색 교체와 축 변경을 한 커밋에 섞지 않는다(`git.md`).
     *
     * 그래서 지금 이 단언이 지키는 것은 **뒤집힌 새 사실**이다: 악센트가
     * 다시 대비가 나쁜 색으로 바뀌면 여기가 빨개지고, 그때는 톤을 접자는
     * 후속 판단이 무효라는 뜻이다.
     */
    expect(
      ratioOn(accent, composite(TINTS["indigo-a24"], BASES.canvas)),
      "accent 가 a24/canvas 에서 AA 미달 — 악센트 대비가 나빠졌다. 톤 접기 후속 판단이 무효가 된다",
    ).toBeGreaterThanOrEqual(4.5);
    expect(ratioOn(accent, composite(TINTS["indigo-line-a13"], BASES.elevated))).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * 소스 스캔 — `tone accent` 가 틴트 채움과 **한 컨트롤에서** 짝지어지지 않는다.
 *
 * 창 휴리스틱: tone 표기 앞뒤 12줄에서 틴트 배경 리터럴과, className 에 얹힌
 * 파일 상수(`const NAME = '…'`)를 해석해 본다. 오늘 잔류 accent 3곳은 전부
 * 맨 바탕 위 `link` 라 창 안에 틴트가 없다 — 새로 생기면 여기가 빨개지고,
 * 처방은 금지가 아니라 `accentOnTint` 다.
 */
describe("accent × 틴트 페어링 금지 — lint 가 못 보는 상수 우회까지", () => {
  const TINT_RE = /bg-\[color:var\(--color-(indigo|amber)/;
  const TONE_RE = /tone(?::\s*|=)["']accent["']/;

  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, acc);
      else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) acc.push(p);
    }
    return acc;
  };

  /**
   * ## 손글씨 층 — 이 게이트가 못 보던 자리 (2026-08-04)
   *
   * 위 스캔은 **값 층의 `tone` 표기**를 찾는다. 그래서 `tone` 을 아예 안 쓰고
   * 잉크와 틴트를 **손으로 나란히 쓴** 자리는 통째로 시야 밖이었다:
   *
   * ```
   * className="… bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-accent)]"
   * ```
   *
   * 2026-08-04 시스템 감사가 그런 자리 하나(에이전트 연결 단계 번호 배지)를
   * **4.27:1** 로 실측했는데, 이 파일도 `a11y-ratchet` 도 그것을 본 적이 없다 —
   * 전자는 `tone` 만 봤고 후자는 첫 화면만 쟀으며, 게다가 그 배지는
   * `aria-hidden` 이라 axe 의 `color-contrast` 는 원리적으로 건너뛴다.
   * **자동 검사 셋의 사각지대가 한 자리에서 겹쳤다.**
   *
   * ### 왜 0 이 아니라 래칫인가
   *
   * 켜기 전 전수: **24곳**. 잉크를 바꾸면 픽셀이 바뀌고, 픽셀을 바꾸는 결정은
   * 값 규칙이 아니라 디자인 게이트의 일이다(`design.md`). 게다가 판정이
   * **호스트 배경에 달렸다** — accent 는 `a16`/panel 에서 4.27(미달)이지만
   * `a16`/canvas 에서는 4.55(통과)다. 정적 스캔은 그 자리가 어느 바탕 위에
   * 그려지는지 모른다. 그래서 여기서는 **늘지 못하게만** 잠그고, 실제 판정은
   * 열린 표면을 여는 런타임 계기(`a11y-ratchet`)가 맡는다.
   *
   * 감사가 지목한 1건은 그 라운드에서 갚았고(`StepRow`, 8.39:1), 남은 23은
   * 2026-08-04 「체계」 잉크 라운드(열린 표면 오버레이 대비)가 전수 이관했다 —
   * 잉크만 `--color-indigo-text-soft` 로 바뀌었고 치수·보더 변화 0. 이관 후
   * 전 자리 합성 대비 6.30:1 이상(최저는 a32/elevated). 그래서 기준선이 0 이다:
   * 이제 이 층의 라이선스는 「틴트를 지는 잉크는 soft」 하나이고, 새 위반은
   * 첫 건부터 빨갛다. 탐지기 자체는 아래 프로브 시험이 계속 증명한다.
   */
  const HAND_WRITTEN_INK = /text-\[color:var\(--color-indigo-accent\)\]/;
  const HAND_WRITTEN_TINT = /bg-\[color:var\(--color-(indigo|amber)[a-z-]*-a\d+\)\]/;
  const BASELINE_HAND_WRITTEN_ACCENT_ON_TINT = 0;

  /** 여는 태그를 **중괄호 깊이**로 끊는다 — `onClick={() => …}` 의 `=>` 가 태그 끝이 아니다. */
  const openingTags = (src: string): string[] => {
    const tags: string[] = [];
    for (const m of src.matchAll(/<[A-Za-z][\w.]*/g)) {
      let depth = 0;
      let quote: string | null = null;
      let i = m.index! + m[0].length;
      let closed = false;
      for (; i < src.length; i += 1) {
        const c = src[i];
        if (quote) {
          if (c === quote && src[i - 1] !== "\\") quote = null;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") quote = c;
        else if (c === "{") depth += 1;
        else if (c === "}") depth -= 1;
        else if (c === ">" && depth === 0) {
          closed = true;
          break;
        }
      }
      // ★ 닫히지 않은 것은 태그가 아니다. 이 가드 없이 파일 끝까지 슬라이스하면
      //   «태그» 안에 뒤따르는 원소 전부가 들어와 30 을 세게 된다(실측 24 → 30).
      if (closed) tags.push(src.slice(m.index!, i));
    }
    return tags;
  };

  const handWritten = (): string[] => {
    const hits: string[] = [];
    for (const file of walk(join(process.cwd(), "src"))) {
      const src = readFileSync(file, "utf8");
      if (!HAND_WRITTEN_INK.test(src)) continue;
      for (const tag of openingTags(src)) {
        if (HAND_WRITTEN_INK.test(tag) && HAND_WRITTEN_TINT.test(tag)) {
          hits.push(`${file.replace(process.cwd(), ".")}`);
        }
      }
    }
    return hits;
  };

  it("손글씨 accent × 틴트가 늘지 않는다 — `tone` 을 안 쓰면 이 게이트가 못 보던 층", () => {
    const hits = handWritten();
    expect(
      hits.length,
      `잉크와 틴트를 손으로 나란히 쓴 자리가 ${BASELINE_HAND_WRITTEN_ACCENT_ON_TINT} → ${hits.length} 로 늘었다.\n` +
        `틴트를 지는 잉크는 --color-indigo-text-soft 다(같은 자리 4.27 → 8.39:1).\n` +
        hits.join("\n"),
    ).toBeLessThanOrEqual(BASELINE_HAND_WRITTEN_ACCENT_ON_TINT);
  });

  it("갚았으면 기준선도 내린다 — 여유를 무료로 두지 않는다", () => {
    expect(
      handWritten().length,
      "손글씨 accent×틴트가 줄었다 — BASELINE_HAND_WRITTEN_ACCENT_ON_TINT 도 같이 내려라.",
    ).toBeGreaterThanOrEqual(BASELINE_HAND_WRITTEN_ACCENT_ON_TINT);
  });

  it("탐지기가 공회전하지 않는다 — 합성 프로브를 실제로 잡고, 정상 짝은 놓아준다", () => {
    const offender = `<span className="rounded-full bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-accent)]">1</span>`;
    const fixed = `<span className="rounded-full bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-text-soft)]">1</span>`;
    const bare = `<span className="text-[color:var(--color-indigo-accent)]">1</span>`;
    const hit = (s: string) =>
      openingTags(s).some((t) => HAND_WRITTEN_INK.test(t) && HAND_WRITTEN_TINT.test(t));
    expect(hit(offender), "일부러 만든 위반을 못 잡는다 — 탐지기가 죽었다").toBe(true);
    expect(hit(fixed), "고친 짝을 위반으로 센다 — 그러면 고칠 이유가 사라진다").toBe(false);
    expect(hit(bare), "맨 바탕 위 accent 는 라이선스 안이다").toBe(false);
    // 감사가 지목한 그 자리는 실제로 갚였다.
    expect(
      readFileSync(join(process.cwd(), "src/features/docs-vault-local/ui/StepRow.tsx"), "utf8"),
    ).toContain("--color-indigo-text-soft");
  });

  it("위반 0 — 틴트를 지는 주 행동 잉크는 accentOnTint 다", () => {
    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), "src"))) {
      const src = readFileSync(file, "utf8");
      if (!TONE_RE.test(src)) continue;
      const lines = src.split("\n");
      // 같은 파일의 문자열 상수(예: INDIGO_CHIP)를 값으로 해석한다.
      const consts = new Map<string, string>();
      for (const m of src.matchAll(/const\s+([A-Z0-9_]+)\s*=\s*\n?\s*["'`]([^"'`]+)["'`]/g)) {
        consts.set(m[1], m[2]);
      }
      lines.forEach((line, i) => {
        if (!TONE_RE.test(line)) return;
        const window = lines.slice(Math.max(0, i - 12), i + 13).join("\n");
        let resolved = window;
        for (const [name, value] of consts) {
          if (window.includes(name)) resolved += `\n${value}`;
        }
        if (TINT_RE.test(resolved)) {
          offenders.push(`${file.replace(process.cwd(), ".")}:${i + 1}`);
        }
      });
    }
    expect(
      offenders,
      `tone accent 가 인디고/앰버 틴트 채움과 같은 컨트롤에 있다 — accentOnTint 로:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
