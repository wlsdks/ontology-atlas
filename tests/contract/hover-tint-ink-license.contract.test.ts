import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { composite, contrastRatio, parseColor } from "../../scripts/lib/contrast.mjs";
import { stripComments } from "../../scripts/lib/static-surface-census.mjs";

/**
 * **알파 틴트 면 위의 잉크 라이선스 — 호버 상태까지** (2026-08-15).
 *
 * ## 어디가 비어 있었나 — 세 계약이 나란히 비켜 갔다
 *
 * 이 저장소에는 잉크 라이선스가 이미 셋 있는데, 셋 다 이 자리를 안 본다:
 *
 * | 계약 | 관할 | 왜 이 자리를 못 보나 |
 * |---|---|---|
 * | `accent-ink-contrast` | 틴트 위 **인디고** 잉크 | 잉크가 danger/success/amber 면 관할 밖 |
 * | `brand-fill-ink-license` | **불투명** 브랜드 면 | 면이 알파 틴트면 관할 밖 |
 * | `quaternary-ink-surface` | 무채색 바탕의 겹침 단계 | 색이 섞인 면은 그 사다리에 없다 |
 *
 * 그 사이로 **알파 틴트 면 × 비-인디고 잉크**가 통째로 빠졌고, 실제로 하나가
 * 샜다: 스튜디오 삭제 확인 칩이 호버에서 `--color-danger-a32` 면을 켜는데
 * 그 위 `--color-danger-text` 는 **어느 호스트 표면에서도** AA 미달이었다
 * (canvas 4.30 · panel 4.05 · elevated 3.72). 쉬는 상태가 5.32 였으니
 * **호버가 읽기를 나쁘게 만들고 있었다.**
 *
 * 값은 하나도 안 틀렸다 — `danger-a32` 도 `danger-text` 도 정당한 램프
 * 토큰이다. 틀린 것은 **자리**이고(`design-gates.md` 「값이 아니라 «자리» 가
 * 토큰을 정한다」), 게다가 `a32` 는 이 저장소에서 **보더로 14번 · 면으로
 * 1번**(그 결함 자리) 쓰인 토큰이었다.
 *
 * ## 왜 호버가 특히 위험한가
 *
 * 호버 면 전수(2026-08-15): 대비가 **좋아지는 222 대 나빠지는 73**. 나빠지는
 * 73 중 71이 「면만 바뀌는」 자리다 — 잉크는 그대로인데 면이 밝아지는 것이
 * 이 앱의 호버 기본값이다. 지금 대부분 안 터지는 이유는 규칙이 아니라
 * **출발점**이다: 그 71의 대부분이 16~18:1 에서 출발해 1~2 떨어져도 14 위에
 * 남는다. **잉크가 낮은 톤(danger · accent · tertiary)에서 출발한 자리에서만
 * 터졌고, 실제로 터진 세 자리가 전부 그 셋이었다.**
 *
 * ## 판정은 허용목록이 아니라 계산이다
 *
 * `brand-fill-ink-license` 와 같은 문법 — `app/globals.css` 에서 토큰 값을
 * 읽어 합성 대비를 낸다. 목록을 손으로 적으면 램프가 움직이는 날 검사가
 * 조용히 틀린다.
 *
 * 호스트 표면은 소스만 봐서는 모르므로 **네 불투명 표면 전부에서** 잰다.
 * 하나에서라도 통과하면 「자리에 달렸다」로 두고(경계 목록), **전부에서
 * 미달이면 호스트와 무관한 결함**이라 빨개진다. 그 문턱이 이 계약을
 * 「추측으로 남을 잡지 않는」 것으로 만든다.
 */

const ROOT = process.cwd();
const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");

type Rgba = readonly number[];

function cssToken(name: string): Rgba | null {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (!m) return null;
  const v = m[1].trim();
  if (v.startsWith("var(")) return cssToken(v.slice(4, -1).trim());
  return (parseColor(v) as Rgba) ?? null;
}

/** 앱의 불투명 호스트 표면 넷 — 알파 면은 이 중 하나 위에 얹힌다. */
const HOSTS = ["--color-canvas", "--color-panel", "--color-elevated", "--topology-v2-panel-surface"]
  .map((n) => [n, cssToken(n)] as const)
  .filter((e): e is readonly [string, Rgba] => e[1] !== null);

/** 본문 기준. 이 앱의 컨트롤 타입은 9.5~14px 이라 큰-글자 완화가 안 걸린다. */
const AA = 4.5;

const ratio = (ink: Rgba, bg: Rgba) => contrastRatio(composite(ink, bg), bg);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
      continue;
    }
    if (/\.tsx$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(p);
  }
  return out;
}

/**
 * className 리터럴 단위로 본다 — 여는 태그 파서는 이 저장소에서 이미 한 번
 * 원소 수십 개를 한 「태그」로 삼켰다(`brand-fill-ink-license` 머리말).
 * className 리터럴에는 JSX 가 들어 있을 수 없다는 성질로 인공물을 버린다.
 */
const JSX_INSIDE = /<[A-Za-z/]/;
const literals = (src: string): string[] =>
  [...src.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)]
    .map((m) => m[1] ?? m[2] ?? m[3] ?? "")
    .filter((s) => !JSX_INSIDE.test(s));

/**
 * **톤 → 잉크 표를 값 층에서 읽어 온다.**
 *
 * 이 계약을 처음 켰을 때 프로브가 구멍을 잡았다: 고친 그 결함 자리
 * (`StudioLaneOverlays` 삭제 확인 칩)를 **되돌려도 초록**이었다. className
 * 리터럴에 잉크가 없었기 때문이다 — 그 자리의 잉크는 `tone: "danger"` 가
 * 내고, tone 은 문자열이 아니라 **`controlClass` 호출의 다른 속성**이다.
 *
 * 즉 스캐너의 단위(리터럴)가 결함의 단위(호출)보다 작았다. 2026-08-15 (9) 가
 * 배운 그 문장의 반대 방향이다 — **단위가 굵어도 가늘어도 그만큼 못 본다.**
 * 그래서 리터럴 스캔에 더해 호출 블록도 본다.
 *
 * 표는 베끼지 않고 `control-class.ts` 에서 **읽는다** — 값이 두 곳에 적히면
 * 그 순간부터 어긋나기 시작한다(Carbon).
 */
function toneInkMap(): Map<string, string> {
  const src = readFileSync(path.join(ROOT, "src/shared/ui/control-class.ts"), "utf8");
  const out = new Map<string, string>();
  for (const m of src.matchAll(/^\s{6}([a-zA-Z]+): 'text-\[color:var\((--[a-z0-9-]+)\)\]'/gm)) {
    out.set(m[1], m[2]);
  }
  return out;
}

/** `controlClass({ … })` 를 중괄호 깊이로 끊는다 — `=>` 에서 잘리지 않게. */
function callBlocks(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/controlClass\(\{/g)) {
    let depth = 0;
    let quote: string | null = null;
    let i = m.index! + "controlClass(".length;
    for (; i < src.length; i += 1) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (!depth) {
          i += 1;
          break;
        }
      }
    }
    out.push(src.slice(m.index!, i));
  }
  return out;
}

/** 호버 면 — 알파(불투명하지 않은) 것만. 불투명 면은 brand-fill 계약의 관할이다. */
const HOVER_FACE = /hover:bg-\[color:var\((--[a-z0-9-]+)\)\]/g;
/** 같은 리터럴이 지는 잉크 — 호버 잉크가 있으면 그것이 이긴다. */
const HOVER_INK = /hover:text-\[color:var\((--[a-z0-9-]+)\)\]/;
const REST_INK = /(?:^|[\s"'`])text-\[color:var\((--[a-z0-9-]+)\)\]/;

interface Offender {
  where: string;
  face: string;
  ink: string;
  worst: number;
  best: number;
}

function scan() {
  const offenders: Offender[] = [];
  const boundary: Offender[] = [];
  const seen = new Set<string>();
  const tones = toneInkMap();
  let facesSeen = 0;
  let judged = 0;

  const consider = (rel: string, unit: string, inkFallback?: string) => {
    HOVER_FACE.lastIndex = 0;
    for (const fm of unit.matchAll(HOVER_FACE)) {
      facesSeen += 1;
      const face = cssToken(fm[1]);
      if (!face || face[3] >= 1) continue;
      const inkName =
        (HOVER_INK.exec(unit) ?? REST_INK.exec(unit))?.[1] ?? inkFallback;
      if (!inkName) continue;
      const ink = cssToken(inkName);
      if (!ink) continue;
      const key = `${rel}|${fm[1]}|${inkName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      judged += 1;
      const ratios = HOSTS.map(([, host]) => ratio(ink, composite(face, host)));
      const worst = Math.min(...ratios);
      const best = Math.max(...ratios);
      const row = { where: rel, face: fm[1], ink: inkName, worst, best };
      if (best < AA) offenders.push(row);
      else if (worst < AA) boundary.push(row);
    }
  };

  for (const dir of ["src", "app"]) {
    for (const file of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      const src = stripComments(readFileSync(file, "utf8"));
      // ① 호출 블록 — 잉크가 `tone:` 으로 오는 자리를 본다.
      for (const block of callBlocks(src)) {
        const tone = /tone:\s*["']([a-zA-Z]+)["']/.exec(block)?.[1];
        consider(rel, block, tone ? tones.get(tone) : undefined);
      }
      // ② 리터럴 — 호출 밖(호이스트 상수·네이티브 원소)까지 덮는다.
      for (const literal of literals(src)) {
        consider(rel, literal);
      }
    }
  }
  return { offenders, boundary, facesSeen, judged };
}

describe("호버 틴트 면 위의 잉크 — 계산이 판정한다", () => {
  const census = scan();

  it("탐지기가 공회전하지 않는다 — 호스트가 실재하고 호버 면을 실제로 찾는다", () => {
    expect(HOSTS.length, "호스트 표면 토큰을 못 읽었다").toBeGreaterThanOrEqual(3);
    for (const [name, host] of HOSTS) {
      expect(host[3], `${name} 이 불투명하지 않다 — 호스트의 전제가 깨진다`).toBe(1);
    }
    expect(census.facesSeen, "호버 면을 하나도 못 찾았다 — 정규식이 램프와 어긋났다").toBeGreaterThan(20);
    expect(census.judged, "잉크까지 짝지어 판정한 자리가 없다").toBeGreaterThan(5);
  });

  it("분리의 근거가 아직 실재한다 — 실제로 AA 를 깨는 짝이 계산 가능하다", () => {
    /*
     * `/gate-probe`: 빈 집합 위에서 공회전하는 검출기를 금지한다. 이 단언이
     * 빨개지는 날은 danger 램프가 수렴해 어떤 틴트 위에서도 통과하게 된
     * 날이고, 그날 이 계약의 문턱을 재평가한다.
     */
    const ink = cssToken("--color-danger-text")!;
    const face = cssToken("--color-danger-a32")!;
    const worst = Math.min(...HOSTS.map(([, h]) => ratio(ink, composite(face, h))));
    expect(
      worst,
      "danger-a32 면 위 danger-text 가 이제 AA 를 넘는다 — 이 계약의 존재 이유를 재평가하라",
    ).toBeLessThan(AA);
  });

  it("위반 0 — 어느 호스트에서도 못 넘는 호버 짝은 없다", () => {
    const lines = census.offenders.map(
      (o) => `${o.where}: hover ${o.face} × ${o.ink} — 최선 ${o.best.toFixed(2)} (필요 ${AA})`,
    );
    expect(
      lines,
      "호버 틴트 면 위 잉크가 **어느 호스트 표면에서도** AA 에 못 미친다.\n" +
        "값이 아니라 짝이 틀린 것이다 — 면을 한 단 내리거나(같은 색 가족의 낮은 알파)\n" +
        "잉크를 올려라. 알파 토큰의 역할(보더용/면용)을 실사용으로 확인할 것.\n" +
        lines.join("\n"),
    ).toEqual([]);
  });

  it("경계 자리는 세어만 둔다 — 표면을 옮기면 조용히 깨지는 자리들", () => {
    /*
     * 「지금 놓인 표면에서만」 통과하는 짝이다. 결함은 아니지만 옮기면
     * 깨지므로, 수가 늘면 그 자리를 열어 봐야 한다. 오늘 실측을 상한으로
     * 박는다 — 줄이는 것은 자유다.
     */
    const lines = census.boundary.map(
      (o) => `${o.where}: ${o.face} × ${o.ink} — ${o.worst.toFixed(2)}~${o.best.toFixed(2)}`,
    );
    expect(lines.length, `경계 자리가 늘었다:\n${lines.join("\n")}`).toBeLessThanOrEqual(12);
  });

  it("탐지기가 심은 위반을 잡고 정상 짝은 놓아준다", () => {
    const judge = (literal: string) => {
      const out: string[] = [];
      HOVER_FACE.lastIndex = 0;
      for (const fm of literal.matchAll(HOVER_FACE)) {
        const face = cssToken(fm[1]);
        if (!face || face[3] >= 1) continue;
        const inkName = (HOVER_INK.exec(literal) ?? REST_INK.exec(literal))?.[1];
        if (!inkName) continue;
        const ink = cssToken(inkName)!;
        const best = Math.max(...HOSTS.map(([, h]) => ratio(ink, composite(face, h))));
        if (best < AA) out.push(fm[1]);
      }
      return out;
    };

    expect(
      judge("text-[color:var(--color-danger-text)] hover:bg-[color:var(--color-danger-a32)]"),
      "심은 위반(고친 그 짝)을 못 잡는다",
    ).toHaveLength(1);
    expect(
      judge("text-[color:var(--color-danger-text)] hover:bg-[color:var(--color-danger-a12)]"),
      "고친 짝을 위반으로 센다 — 그러면 고칠 이유가 사라진다",
    ).toEqual([]);
    expect(
      judge("hover:bg-[color:var(--color-overlay-1)]"),
      "잉크를 모르는 자리는 판정하지 않는다",
    ).toEqual([]);
    expect(
      judge("text-[color:var(--color-text-on-accent)] hover:bg-[color:var(--color-indigo-brand-hover)]"),
      "불투명 면은 brand-fill-ink-license 의 관할이다",
    ).toEqual([]);
    expect(
      judge(
        "text-[color:var(--color-text-tertiary)] hover:bg-[color:var(--color-danger-a32)] hover:text-[color:var(--color-text-primary)]",
      ),
      "호버 잉크가 있으면 그것이 쉬는 잉크를 이겨야 한다",
    ).toEqual([]);
  });
});
