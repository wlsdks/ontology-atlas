import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A link labelled as the map must point at `/topology`, not `/`. The check needs label and
 * destination together, so lint cannot do it. Links that go home are out of scope.
 */

const MAP_ROUTE = "/topology";

/**
 * The testids of controls that promise the map, and the message keys that are the
 * evidence for that promise.
 *
 * **Why testids and not labels**: matching on label strings blinds the gate every
 * time the copy changes — `check-hosted-download-surface` was disarmed exactly that
 * way (a copy key was renamed, and `String.includes(undefined)` went looking for
 * `"undefined"` and passed green). A testid is the control's identity and is
 * independent of the copy.
 */
const MAP_DESTINED = [
  { testid: "gateway-hero-web-cta", why: "히어로의 「브라우저에서 열기」 — 웹 제품을 여는 버튼" },
  /**
   * Removing a row does not weaken the gate: it guards that a control promising the map goes to the
   * map. Reviving a removed control means restoring its row here.
   */
] as const;

/**
 * Collects the gateway chrome's sources by sweeping `src/` for files carrying the marker, so the
 * gate follows controls when they move between files.
 */
function collectSources(): string {
  const roots = [join(process.cwd(), "src")];
  const chunks: string[] = [];
  let scanned = 0;
  while (roots.length) {
    const dir = roots.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        roots.push(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        scanned += 1;
        const text = readFileSync(full, "utf8");
        if (text.includes("data-testid=")) chunks.push(text);
      }
    }
  }
  // If the parser dies this fails here first, rather than reporting "0 violations".
  if (scanned < 200) throw new Error(`소스 스캔이 ${scanned}개에서 멈췄다 — 순회가 깨졌다`);
  return chunks.join("\n");
}

/**
 * Extracts the `href` used in the same opening tag as a `data-testid="X"`.
 * Attribute order is free, so the whole tag is captured and searched.
 */
function hrefForTestid(source: string, testid: string): string[] {
  const found: string[] = [];
  const marker = `data-testid="${testid}"`;
  let cursor = source.indexOf(marker);
  while (cursor !== -1) {
    // Find the opening tag's start (`<`) and end (`>`) and look only inside that span.
    const open = source.lastIndexOf("<", cursor);
    const close = source.indexOf(">", cursor);
    const tag = source.slice(open, close === -1 ? source.length : close);
    const match = /href=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/.exec(tag);
    if (match) found.push(match[1] ?? match[2] ?? match[3] ?? "");
    cursor = source.indexOf(marker, cursor + marker.length);
  }
  return found;
}

describe("지도를 약속하는 링크의 목적지", () => {
  const source = collectSources();

  for (const { testid, why } of MAP_DESTINED) {
    it(`${testid} 는 ${MAP_ROUTE} 로 간다 — ${why}`, () => {
      const hrefs = hrefForTestid(source, testid);

      expect(
        hrefs.length,
        `No link with ${testid} was found. If the testid was removed or renamed, ` +
          `update this gate with it; it does not pass silently.`,
      ).toBeGreaterThan(0);

      for (const href of hrefs) {
        expect(
          href,
          `${testid} points at "${href}". Since 2026-07-29 \`/\` is the marketing ` +
            `page: a control that promises the map and goes there returns the person to the screen ` +
            `they just left. The map is ${MAP_ROUTE}.`,
        ).toBe(MAP_ROUTE);
      }
    });
  }

  /**
   * Checks that the detector does not disarm itself. If the extractor breaks,
   * `hrefs.length` becomes 0 and the test above fails with "not found"; this proves
   * that failure is **the correct behaviour**.
   */
  it("추출기가 실제로 href 를 읽는다 (탐지기 무장 확인)", () => {
    const probe = `
      <Link href="/" data-testid="probe-root">홈</Link>
      <Link data-testid="probe-map" href="/topology">지도</Link>
    `;
    expect(hrefForTestid(probe, "probe-root")).toEqual(["/"]);
    expect(hrefForTestid(probe, "probe-map")).toEqual(["/topology"]);
    expect(hrefForTestid(probe, "probe-absent")).toEqual([]);
  });
});

/**
 * Inverts the allowlist test: finds links by what the label promises (an i18n value that is exactly
 * "Map"), so an unregistered link is still checked. Sentences containing it are excluded as noise.
 */
const MAP_LABEL = /^[\s←→]*(?:지도|map)[\s←→]*$/i;

/** Leaf keys whose i18n value is literally "Map" — the names used by `t("<leaf>")`. */
function mapLabelKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of ["messages/ko.json", "messages/en.json"]) {
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (typeof value === "string") {
          if (MAP_LABEL.test(value)) keys.add(key);
        } else {
          walk(value);
        }
      }
    };
    walk(JSON.parse(readFileSync(join(process.cwd(), file), "utf8")));
  }
  return keys;
}

/**
 * The href of the **nearest enclosing opening tag that has one**, for the element
 * rendering `t("key")`.
 *
 * The label sits in child position (`<Link href=…>{t("key")}</Link>`) and is
 * sometimes wrapped one level deeper (`<span>{t("key")}</span>`), so this walks
 * backwards to the first tag with an href. If it is not a link (no href) it is out
 * of scope and skipped.
 */
/**
 * Reads the value of `href` from one opening tag, following a same-file constant one level.
 * Undeterminable forms such as call expressions return `null` and are skipped (no false positives).
 */
function hrefValue(tag: string, source: string): string | null {
  const literal = /href=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/.exec(tag);
  if (literal) return literal[1] ?? literal[2] ?? literal[3] ?? literal[4] ?? literal[5] ?? "";

  // `href={identifier}` — follows a simple constant declaration in the same file, one level only.
  const ident = /href=\{([A-Za-z_$][\w$]*)\}/.exec(tag);
  if (!ident) return null;
  const decl = new RegExp(
    `\\b(?:const|let|var)\\s+${ident[1]}\\s*(?::[^=]+)?=\\s*(?:"([^"]*)"|'([^']*)'|\`([^\`]*)\`)`,
  ).exec(source);
  if (!decl) return null;
  return decl[1] ?? decl[2] ?? decl[3] ?? "";
}

function hrefForLabelKey(source: string, key: string): string[] {
  const found: string[] = [];
  for (const marker of [`t("${key}")`, `t('${key}')`]) {
    let cursor = source.indexOf(marker);
    while (cursor !== -1) {
      let at = cursor;
      for (let hop = 0; hop < 6; hop += 1) {
        const open = source.lastIndexOf("<", at);
        if (open === -1) break;
        const close = source.indexOf(">", open);
        const tag = source.slice(open, close === -1 ? source.length : close);
        // Hitting a closing tag means we walked past a preceding **sibling**. Going
        // further up would pick up another link's href as our own (a probe caught this).
        if (tag.startsWith("</")) break;
        const href = hrefValue(tag, source);
        if (href !== null) {
          found.push(href);
          break;
        }
        at = open - 1;
      }
      cursor = source.indexOf(marker, cursor + marker.length);
    }
  }
  return found;
}

describe("라벨이 「지도」인 링크는 등록 없이도 감시된다", () => {
  const source = collectSources();
  const keys = [...mapLabelKeys()].sort();

  it("i18n 에서 지도 라벨 키를 실제로 찾는다 (탐지기 무장 확인)", () => {
    // At 0 the whole test idles — this blocks the silent disarming.
    expect(keys.length).toBeGreaterThan(0);
  });

  it("그 라벨을 렌더하는 링크는 전부 지도로 간다", () => {
    const violations: string[] = [];
    for (const key of keys) {
      for (const href of hrefForLabelKey(source, key)) {
        // The locale prefix is added by `@/i18n/navigation`, so it is absent from the source.
        if (href.replace(/\/$/, "") !== MAP_ROUTE) {
          violations.push(`t("${key}") → "${href}"`);
        }
      }
    }
    expect(
      violations,
      `A link labelled Map goes somewhere other than ${MAP_ROUTE}. ` +
        `Since 2026-07-30 \`/\` is the gateway (marketing), so a link that says Map and sends people there ` +
        `returns them to the screen they just left.`,
    ).toEqual([]);
  });

  it("추출기가 감싸인 라벨의 href 도 읽는다 (탐지기 무장 확인)", () => {
    const probe = `
      <Link href="/topology"><span>{t("crumbBack")}</span></Link>
      <Link href="/">{t("someOther")}</Link>
      <p>{t("crumbBack")}</p>
    `;
    expect(hrefForLabelKey(probe, "crumbBack")).toEqual(["/topology"]);
    expect(hrefForLabelKey(probe, "someOther")).toEqual(["/"]);
    expect(hrefForLabelKey(probe, "absent")).toEqual([]);
  });

  /**
   * The extractor must read variable and single-quoted `href` forms; these probes stop the gate
   * from narrowing silently.
   */
  it("추출기가 변수 href 와 작은따옴표 href 도 읽는다 (사정거리 프로브)", () => {
    const viaConst = `
      const workspaceHref = '/';
      <Link href={workspaceHref}>{t("crumbBack")}</Link>
    `;
    expect(hrefForLabelKey(viaConst, "crumbBack")).toEqual(["/"]);

    const viaSingleQuote = `<Link href={'/'}>{t("crumbBack")}</Link>`;
    expect(hrefForLabelKey(viaSingleQuote, "crumbBack")).toEqual(["/"]);

    const viaTemplateConst = "const h = `/topology/`;\n<Link href={h}>{t(\"crumbBack\")}</Link>";
    expect(hrefForLabelKey(viaTemplateConst, "crumbBack")).toEqual(["/topology/"]);

    // Call expressions whose value cannot be determined are skipped — guessing yields false positives, and a gate that does is switched off.
    const viaCall = `<Link href={getTopologyProjectHref(slug)}>{t("crumbBack")}</Link>`;
    expect(hrefForLabelKey(viaCall, "crumbBack")).toEqual([]);
  });
});
