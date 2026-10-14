import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CSS `uppercase` must not transform a value such as a slug or path, since case makes a different
 * address. Drop `uppercase` or wrap the value in a `normal-case tracking-normal` span. This is a text
 * heuristic with a 12-line window; it is narrowed to miss things rather than block legitimate code.
 */

/** A standalone `uppercase` in a class string (variant-prefixed `:uppercase` excluded). */
const UPPERCASE_IN_STRING = /(["'`])[^"'`\n]*(?<!:)\buppercase\b[^"'`\n]*\1/;

/** Path-like values in a JSX child expression: members .slug/.path/.relativePath/.ref, a bare slug, node.name */
const PATH_EXPR =
  /\{[^{}]*?(?:\.(?:slug|path|relativePath|ref)\b|(?<![\w$.])slug(?![\w$:])|\bnode\.name\b)[^{}]*?\}/;

/** Calls passing a slug or path into a t() interpolation (t.rich is prescription 2 and excluded). */
const T_CALL = /(?<![.\w])t\(\s*["'][^"']+["']\s*,\s*\{[^}]*\b(?:slug|path)\b\s*:/;

const WINDOW = 12;

function walkTsx(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkTsx(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
}

interface Offence {
  file: string;
  line: number;
  snippet: string;
}

describe("uppercase 원소 안의 경로성 값 — 주소는 대문자 변형하지 않는다", () => {
  it("src/**/*.tsx 의 uppercase 원소 자식에 slug/path/폴더명 값이 없다", () => {
    const root = process.cwd();
    const files: string[] = [];
    walkTsx(join(root, "src"), files);

    const offences: Offence[] = [];
    let uppercaseSites = 0;

    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (!UPPERCASE_IN_STRING.test(lines[i])) continue;
        uppercaseSites++;

        // Window: from the uppercase line to the line holding the first closing `</`, at most WINDOW lines.
        const windowLines: string[] = [];
        for (let j = i; j < Math.min(i + WINDOW, lines.length); j++) {
          windowLines.push(lines[j]);
          if (j > i && (lines[j].includes("</") || lines[j].includes("/>"))) break;
        }
        let text = windowLines.join("\n");

        // Exempt after prescription 2's healthy pattern: a normal-case span or a t.rich value renderer.
        const cutAt = Math.min(
          ...["normal-case", "t.rich("]
            .map((marker) => text.indexOf(marker))
            .filter((idx) => idx >= 0),
        );
        if (Number.isFinite(cutAt)) text = text.slice(0, cutAt);

        const match = PATH_EXPR.exec(text) ?? T_CALL.exec(text);
        if (match) {
          offences.push({
            file: file.slice(root.length + 1),
            line: i + 1,
            snippet: match[0].replace(/\s+/g, " ").slice(0, 80),
          });
        }
      }
    }

    // The gate proves itself alive — if the scan breaks and reads 0, this assertion
    // fires before anything reports "no violations".
    expect(files.length, "src 의 .tsx 파일 수").toBeGreaterThan(100);
    expect(uppercaseSites, "uppercase 클래스 문자열 사용처 수").toBeGreaterThan(100);

    const report = offences
      .map((o) => `  ${o.file}:${o.line} → ${o.snippet}`)
      .join("\n");
    expect(
      offences,
      offences.length === 0
        ? ""
        : `A slug, path or folder name is an address, and transforming it with uppercase makes a different address.\n` +
            `If the whole element is a value, drop uppercase; if it mixes a label and a value, wrap the value\n` +
            `in a normal-case tracking-normal span (or a <value> tag with t.rich).\n${report}`,
    ).toEqual([]);
  });
});
