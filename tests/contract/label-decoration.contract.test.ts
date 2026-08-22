import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Blocks decorative arrows attached to the end of a label.
 *
 * Owner verdict (2026-07-26), on seeing `지도에서 열기 →`:
 *
 * > *"나는 이런 글 옆에 화살표 있는거 싫어하거든? AI느낌이라?"*
 * > (I dislike arrows next to text like this — it feels AI-generated)
 *
 * An arrow after a label adds no information: the label already says where it goes,
 * and the control's appearance already says it is pressable. What remains is the
 * texture of a generated landing page, and on a screen like the workbench where the
 * same label appears twelve times, the noise repeats twelve times too.
 *
 * **Arrows themselves are not banned.** An arrow mid-sentence is usually data:
 * `{source} → {target}` (a path), `오래된 → 최근` (order), `설정 → Developer` (a
 * menu path), `목차 클릭 → 해당 위치로` (causation). So this gate looks only at
 * **the end of a string**. The test: delete the arrow and read the label aloud. If
 * nothing was lost, it was decoration.
 *
 * Full text: `docs/DESIGN-SYSTEM.md` "Arrows carry information or they don't ship".
 */

/** A decorative arrow at the end of a label. Mid-sentence is not in scope. */
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

    // The gate proves itself alive — if parsing breaks and reads 0 items, this
    // assertion fails first rather than reporting "no violations". (In 2026-07 a gate
    // of the same kind silently passed everything after an external process failed.)
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
    // If this regex is neutered the test above passes forever, so the predicate itself
    // is pinned.
    expect(TRAILING_ARROW.test("지도에서 열기 →")).toBe(true);
    expect(TRAILING_ARROW.test("Open →")).toBe(true);
    expect(TRAILING_ARROW.test("열기 ↗")).toBe(true);
    // Mid-sentence is data — it must not be caught.
    expect(TRAILING_ARROW.test("{source} → {target}")).toBe(false);
    expect(TRAILING_ARROW.test("오래된 → 최근 순")).toBe(false);
    expect(TRAILING_ARROW.test("설정 → Developer 에서 등록")).toBe(false);
  });

  /**
   * ── The gate's hole (measured 2026-07-26) ─────────────────────────────
   *
   * The check above reads `messages/*.json` only. The violation that actually survived
   * was a **JSX glyph** — a `↗` in a span at the end of an in-app `<Link>` in
   * `ProjectDetailPage`, in the very file the PR that registered this rule had
   * redesigned the same day. A gate that guards only translation strings cannot see
   * leakage through markup.
   *
   * `↗` has exactly one use — **a leading warning on a link that leaves the app**. So
   * the glyph must declare itself where it is used (`data-external-link-marker`). An
   * undeclared `↗` is treated as decoration.
   *
   * ── The reach was too short (measured 2026-07-27) ──────────────────────
   *
   * The paragraph above used to say "`→` is out of scope — every standalone `→` in
   * this codebase is a mid-sentence data arrow" and exempted `→` wholesale. Under that
   * exemption the studio's **primary save button** lived as
   * `확인하고 저장 <span>→</span>`. The day after registering the rule, the repository
   * that registered it broke it. **A rule whose reach is too short is the same as no
   * rule.**
   *
   * The exemption is removed, but mid-sentence data arrows must still pass. What
   * separates them is not the glyph but **what follows it**:
   *
   * - `{a} <span>→</span> {b}` — a sibling follows → mid-sentence, data.
   * - `{labels.save} <span>→</span></button>` — the parent's closing tag follows →
   *   end of label, decoration. Delete it and nothing is lost.
   *
   * Inventory before switching it on (2026-07-27, every .tsx in `src` and `app`): 3
   * trailing (all in the studio save-button family) and 7 mid-sentence. Small enough
   * to clear in one PR, so it was switched on — the .claude/rules/design.md procedure
   * "always measure before switching a rule on".
   */
  const DECORATIVE_GLYPH_NODE = /<([A-Za-z][\w.]*)\b([^<>]*)>\s*[↗➜⟶»]\s*</g;
  /** An element whose entire content is a single arrow — what follows decides whether it is mid-sentence or trailing. */
  const LONE_ARROW_NODE = /<([A-Za-z][\w.]*)\b([^<>]*)>\s*([→↗➜⟶»])\s*<\/\1\s*>/g;
  const EXTERNAL_MARKER = "data-external-link-marker";

  /** If the first non-whitespace that follows is the parent's closing tag, the arrow is at the end of a label. */
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

    // Gate liveness — a scan reading 0 files is a defect, not "no violations".
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

  /**
   * ── Dead code was holding up the allowance clause (measured 2026-08-03) ──
   *
   * This test used to start with `expect(declared.length).toBeGreaterThan(0)`, on the
   * grounds that *"if the marker disappears, the allowance clause stays unverified"*.
   * Measurement showed the only `.tsx` carrying that marker was
   * **`shared/ui/link-list-editor.tsx`**, a **dead primitive with zero production
   * consumers**. Of the 13 production files using `target="_blank"`, zero used the
   * marker. **A component nobody rendered was holding up the rule's allowance
   * clause**, and deleting that file would turn this assertion red for a reason
   * unrelated to the rule.
   *
   * Diagnosis: the idling guard was aimed at the wrong set. **The set that must not be
   * empty is "files scanned", not "files using the exception".** The scanned set is
   * already locked by the two tests above with `files.length > 100`, and whether the
   * detector works is locked by the synthetic probes below. A conditional rule with
   * zero consumers is **a rule waiting for its first case, not a broken gate.**
   *
   * Verdict and falsifier: `docs/DECISIONS.md` 2026-08-03 「죽은 프리미티브 둘」 (two
   * dead primitives).
   */
  /** Per-file verdict — a file with no declaration is out of scope for this rule, so it passes. */
  function externalMarkerSitsOnExternalLink(source: string): boolean {
    if (!source.includes(EXTERNAL_MARKER)) return true;
    return source.includes('target="_blank"');
  }

  it("선언된 외부 링크 표식은 실제로 앱을 떠나는 링크 위에만 있다", () => {
    const files: string[] = [];
    for (const root of ["src", "app"]) collectSourceFiles(join(process.cwd(), root), files);
    // The idling guard is applied to the **scanned set** — zero users of the exception
    // is not a defect.
    expect(files.length).toBeGreaterThan(100);

    const offences = files.filter((file) => !externalMarkerSitsOnExternalLink(readFileSync(file, "utf8")));
    expect(
      offences.map((f) => f.replace(process.cwd() + "/", "")),
      `외부 링크 표식(${EXTERNAL_MARKER})은 target="_blank" 링크에만 붙는다.`,
    ).toEqual([]);
  });

  it("표식 범위 게이트가 실제로 위반을 잡는다 — 소비처가 0이어도 탐지기는 살아 있다", () => {
    // Violation — attaching the marker to an in-app link to sneak a decorative arrow
    // through.
    expect(
      externalMarkerSitsOnExternalLink('<Link href="/topology"><span data-external-link-marker>↗</span>{label}</Link>'),
    ).toBe(false);
    // Clean — a link that leaves the app.
    expect(
      externalMarkerSitsOnExternalLink('<a href="https://x" target="_blank"><span data-external-link-marker>↗</span>{label}</a>'),
    ).toBe(true);
    // A file that never uses the marker is out of scope for this rule.
    expect(externalMarkerSitsOnExternalLink('<Link href="/topology">{label}</Link>')).toBe(true);
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
    // Catches only the one undeclared ↗; a declared ↗ and a mid-sentence data arrow →
    // both pass.
    expect(hits).toHaveLength(2);
    expect(hits.filter((hit) => !hit[2].includes(EXTERNAL_MARKER))).toHaveLength(1);
  });

  /**
   * Probe — proves the widened reach actually catches, with one violating line and
   * one clean line. Only when this passes does the scan's 0 above mean "no
   * violations".
   */
  it("끝자리 게이트가 실제로 위반을 잡고 중위는 놓아 준다", () => {
    // Violation — the studio save button really had this shape.
    const violation = [
      "<button>",
      "  {labels.save}",
      '  <span className="opacity-75">→</span>',
      "</button>",
    ].join("\n");
    // Clean — a mid-sentence arrow carrying a path.
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
    // A declared external-link marker passes even in trailing position (the
    // leading-position rule belongs to the gate above).
    expect(
      trailingHits('<a>{label}<span data-external-link-marker>↗</span></a>').filter(
        (hit) => !hit[2].includes(EXTERNAL_MARKER),
      ),
    ).toHaveLength(0);
  });
});
