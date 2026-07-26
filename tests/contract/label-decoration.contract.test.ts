import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 라벨 끝에 붙은 장식 화살표를 막는 게이트.
 *
 * 소유자 판정(2026-07-26), `지도에서 열기 →` 를 보고:
 *
 * > *"나는 이런 글 옆에 화살표 있는거 싫어하거든? AI느낌이라?"*
 *
 * 라벨 뒤의 화살표는 정보를 하나도 더하지 않는다 — 어디로 가는지는 라벨이
 * 이미 말했고, 누를 수 있다는 건 컨트롤 생김새가 이미 말한다. 남는 신호는
 * "생성된 랜딩 페이지" 의 결이고, 워크벤치처럼 같은 라벨이 열두 번 나오는
 * 화면에서는 소음도 열두 번 반복된다.
 *
 * **화살표 자체를 금지하는 게 아니다.** 문장 가운데의 화살표는 대개 데이터다:
 * `{source} → {target}`(경로), `오래된 → 최근`(순서), `설정 → Developer`(메뉴
 * 경로), `목차 클릭 → 해당 위치로`(인과). 그래서 이 게이트는 **문자열 끝**만
 * 본다. 판별법: 화살표를 지우고 라벨을 소리 내어 읽어라. 잃은 게 없으면 장식이었다.
 *
 * 전문: `docs/DESIGN-SYSTEM.md` "Arrows carry information or they don't ship".
 */

/** 라벨 끝의 장식 화살표. 문장 중간은 대상이 아니다. */
const TRAILING_ARROW = /[→↗➜⟶»]\s*$/;

const LOCALES = ["ko", "en"] as const;

interface Offence {
  locale: string;
  path: string;
  value: string;
}

function collectStrings(node: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof node === "string") {
    out.push([path, node]);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      collectStrings(value, path ? `${path}.${key}` : key, out);
    }
  }
}

describe("라벨 장식 — 화살표는 정보를 나를 때만", () => {
  it("i18n 문자열 끝에 장식 화살표가 없다", () => {
    const offences: Offence[] = [];
    let scanned = 0;

    for (const locale of LOCALES) {
      const raw = readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8");
      const strings: Array<[string, string]> = [];
      collectStrings(JSON.parse(raw), "", strings);
      scanned += strings.length;

      for (const [path, value] of strings) {
        if (TRAILING_ARROW.test(value)) offences.push({ locale, path, value });
      }
    }

    // 게이트가 스스로 살아있음을 증명한다 — 파싱이 깨져 0건을 읽으면 "위반
    // 없음" 이 아니라 이 단언이 먼저 터진다. (2026-07 에 같은 종류의 게이트가
    // 외부 프로세스 실패로 조용히 전부 통과시킨 사고가 있었다.)
    expect(scanned).toBeGreaterThan(1000);

    const report = offences
      .map((o) => `  ${o.locale}: ${o.path} = ${JSON.stringify(o.value)}`)
      .join("\n");
    expect(
      offences,
      offences.length === 0
        ? ""
        : `라벨 끝의 장식 화살표는 정보를 더하지 않는다. 지우고 라벨만 남겨라.\n` +
            `문장 가운데의 화살표(경로·순서·인과)는 데이터라 허용된다.\n${report}`,
    ).toEqual([]);
  });

  it("게이트가 실제로 위반을 잡는다", () => {
    // 이 정규식이 무력화되면 위 테스트는 영원히 통과한다. 판정 자체를 고정한다.
    expect(TRAILING_ARROW.test("지도에서 열기 →")).toBe(true);
    expect(TRAILING_ARROW.test("Open →")).toBe(true);
    expect(TRAILING_ARROW.test("열기 ↗")).toBe(true);
    // 문장 가운데는 데이터 — 잡으면 안 된다.
    expect(TRAILING_ARROW.test("{source} → {target}")).toBe(false);
    expect(TRAILING_ARROW.test("오래된 → 최근 순")).toBe(false);
    expect(TRAILING_ARROW.test("설정 → Developer 에서 등록")).toBe(false);
  });

  /**
   * ── 게이트 구멍 (2026-07-26 실측) ──────────────────────────────────
   *
   * 위 검사는 `messages/*.json` 만 본다. 그런데 실제로 살아남은 위반은 **JSX
   * 글리프**였다 — `ProjectDetailPage` 의 앱-내 `<Link>` 끝에 `↗` 가 span 으로
   * 박혀 있었고, 하필 그 파일은 이 규칙을 등재한 PR 이 같은 날 재설계한
   * 파일이다. 번역 문자열만 지키는 게이트는 마크업으로 새는 걸 못 본다.
   *
   * `↗` 는 용도가 하나뿐이다 — **앱을 떠나는 링크의 선행 경고**. 그래서 이
   * 글리프는 쓰는 자리에서 스스로를 선언하게 한다(`data-external-link-marker`).
   * 선언 없는 `↗` 는 장식이라고 본다.
   *
   * ── 사정거리가 짧았다 (2026-07-27 실측) ────────────────────────────────
   *
   * 위 문단은 원래 "`→` 는 대상이 아니다 — 이 코드베이스에서 홀로 선 `→` 는
   * 전부 중위 데이터 화살표다" 라고 적어 두고 `→` 를 통째로 면제했다. 그
   * 면제 아래에서 공방의 **주 저장 버튼**이 `확인하고 저장 <span>→</span>`
   * 로 살아 있었다. 규칙을 등재한 다음 날, 규칙을 등재한 저장소가 스스로
   * 어긴 것이다. **룰이 있어도 사정거리가 짧으면 룰이 없는 것과 같다.**
   *
   * 면제를 걷되 중위 데이터 화살표는 그대로 통과해야 한다. 둘을 가르는 것은
   * 글리프가 아니라 **뒤에 무엇이 오는가** 다:
   *
   * - `{a} <span>→</span> {b}` — 뒤에 형제가 온다 → 중위, 데이터.
   * - `{labels.save} <span>→</span></button>` — 뒤가 부모의 닫는 태그다 →
   *   라벨 끝, 장식. 지우고 읽어도 잃는 게 없다.
   *
   * 켜기 전 전수 측정(2026-07-27, `src`+`app` 의 .tsx 전부): 끝자리 3건
   * (전부 공방 저장 버튼 계열) · 중위 7건. 한 PR 로 치울 수 있는 규모라
   * 켰다 — `design.md` "룰을 켜기 전 반드시 측정한다" 절차.
   */
  const DECORATIVE_GLYPH_NODE = /<([A-Za-z][\w.]*)\b([^<>]*)>\s*[↗➜⟶»]\s*</g;
  /** 한 요소의 내용이 화살표 하나뿐인 자리 — 중위인지 끝자리인지는 뒤가 정한다. */
  const LONE_ARROW_NODE = /<([A-Za-z][\w.]*)\b([^<>]*)>\s*([→↗➜⟶»])\s*<\/\1\s*>/g;
  const EXTERNAL_MARKER = "data-external-link-marker";

  /** 뒤따르는 첫 비-공백이 부모의 닫는 태그면 그 화살표는 라벨 끝이다. */
  function isTrailingArrow(source: string, endIndex: number): boolean {
    return source.slice(endIndex).replace(/^\s+/, "").startsWith("</");
  }

  function collectSourceFiles(dir: string, out: string[]): void {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        collectSourceFiles(full, out);
        continue;
      }
      if (!full.endsWith(".tsx")) continue;
      if (full.includes(".test.") || full.includes(".spec.")) continue;
      out.push(full);
    }
  }

  it("JSX 마크업에도 선언 없는 장식 화살표가 없다", () => {
    const files: string[] = [];
    for (const root of ["src", "app"]) collectSourceFiles(join(process.cwd(), root), files);

    // 게이트 생존 확인 — 스캔이 0개 파일을 읽으면 "위반 없음" 이 아니라 결함이다.
    expect(files.length).toBeGreaterThan(100);

    const offences: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(DECORATIVE_GLYPH_NODE)) {
        if (match[2].includes(EXTERNAL_MARKER)) continue;
        const line = source.slice(0, match.index).split("\n").length;
        offences.push(`  ${file.replace(process.cwd() + "/", "")}:${line} — <${match[1]}>`);
      }
    }

    expect(
      offences,
      offences.length === 0
        ? ""
        : `마크업에 박힌 장식 화살표. 앱 안에서 이동하는 링크라면 지워라 — 어디로\n` +
            `가는지는 라벨이, 누를 수 있다는 건 컨트롤이 이미 말한다. 앱을 떠나는\n` +
            `링크라면 라벨 **앞**에 두고 ${EXTERNAL_MARKER} 로 선언하라.\n${offences.join("\n")}`,
    ).toEqual([]);
  });

  it("라벨 끝에 붙은 화살표 요소가 없다 (중위 데이터 화살표는 통과)", () => {
    const files: string[] = [];
    for (const root of ["src", "app"]) collectSourceFiles(join(process.cwd(), root), files);
    expect(files.length).toBeGreaterThan(100);

    const offences: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(LONE_ARROW_NODE)) {
        if (match[2].includes(EXTERNAL_MARKER)) continue;
        if (!isTrailingArrow(source, match.index + match[0].length)) continue;
        const line = source.slice(0, match.index).split("\n").length;
        offences.push(
          `  ${file.replace(process.cwd() + "/", "")}:${line} — <${match[1]}>${match[3]}`,
        );
      }
    }

    expect(
      offences,
      offences.length === 0
        ? ""
        : `라벨 끝의 화살표는 정보를 더하지 않는다 — 지우고 라벨만 남겨라.\n` +
            `문장 가운데({a} → {b})는 데이터라 통과한다.\n${offences.join("\n")}`,
    ).toEqual([]);
  });

  it("선언된 외부 링크 표식은 실제로 앱을 떠나는 링크 위에만 있다", () => {
    const files: string[] = [];
    for (const root of ["src", "app"]) collectSourceFiles(join(process.cwd(), root), files);

    const declared = files.filter((file) => readFileSync(file, "utf8").includes(EXTERNAL_MARKER));
    // 표식은 존재해야 한다 — 사라지면 위 테스트가 "예외 없음" 으로 통과해버려
    // 규칙의 허용 열(선행 ↗)이 검증되지 않은 채 남는다.
    expect(declared.length).toBeGreaterThan(0);

    for (const file of declared) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file}: 외부 링크 표식은 target="_blank" 링크에만`).toContain(
        'target="_blank"',
      );
    }
  });

  it("JSX 게이트가 실제로 위반을 잡는다", () => {
    const probe = [
      '<span aria-hidden="true" className="text-label">',
      "  ↗",
      "</span>",
      '<span data-external-link-marker aria-hidden="true">↗</span>',
      '<span className="mx-1.5">→</span>',
    ].join("\n");

    const hits = [...probe.matchAll(DECORATIVE_GLYPH_NODE)];
    // 선언 없는 ↗ 1건만 잡고, 선언된 ↗ 와 중위 데이터 화살표 → 는 통과.
    expect(hits).toHaveLength(2);
    expect(hits.filter((hit) => !hit[2].includes(EXTERNAL_MARKER))).toHaveLength(1);
  });

  /**
   * 프로브 — 넓힌 사정거리가 실제로 잡는지 위반 1줄 + 정상 1줄로 증명한다.
   * 이 단언이 통과해야 위 스캔의 0건이 "위반 없음" 이라는 뜻이 된다.
   */
  it("끝자리 게이트가 실제로 위반을 잡고 중위는 놓아 준다", () => {
    // 위반 — 공방 저장 버튼이 실제로 이 모양이었다.
    const violation = [
      "<button>",
      "  {labels.save}",
      '  <span className="opacity-75">→</span>',
      "</button>",
    ].join("\n");
    // 정상 — 경로를 나르는 중위 화살표.
    const legit = [
      "<span>",
      "  {pair.fromTitle}",
      '  <span className="mx-1.5">→</span>',
      "  {pair.toTitle}",
      "</span>",
    ].join("\n");

    const trailingHits = (source: string) =>
      [...source.matchAll(LONE_ARROW_NODE)].filter((hit) =>
        isTrailingArrow(source, hit.index + hit[0].length),
      );

    expect(trailingHits(violation)).toHaveLength(1);
    expect(trailingHits(legit)).toHaveLength(0);
    // 선언된 외부 링크 표식은 끝자리여도 통과한다(라벨 앞 규칙은 위 게이트 담당).
    expect(
      trailingHits('<a>{label}<span data-external-link-marker>↗</span></a>').filter(
        (hit) => !hit[2].includes(EXTERNAL_MARKER),
      ),
    ).toHaveLength(0);
  });
});
