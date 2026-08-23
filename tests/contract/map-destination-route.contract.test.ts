import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **A link that says it goes to the map must point at the map's address.**
 *
 * **Why this gate exists.** By owner decision on 2026-07-29, `/` becomes the
 * **marketing page** (ledger — the reversal of 2026-07 「root-first-open」). Until
 * then `/` and `/topology` were **the same screen**, so a link to the map could
 * point at either one and nobody would know.
 *
 * Measured just before the switch, that indifference turned out to be **three dead
 * promises**:
 *
 * | Label | Pointed at | After the switch |
 * |---|---|---|
 * | 「Back to map」 (back to the map) | `/` | lands on marketing |
 * | 「Try it in the browser, no install」 (try it in the browser, no install) | `/` | lands on marketing |
 * | 〃 (unpublished branch) | `/` | lands on marketing |
 *
 * The second is the worst — the owner defined the marketing page's job as
 * *"Drive a download or move to the web version"* (drive a download or move to the web
 * version), and that "move to the web version" button becomes **a loop back into
 * marketing**.
 *
 * **Why a contract test rather than lint.** The verdict needs **label and
 * destination together**. `href="/"` is not a defect by itself — the logo and the
 * 404's "home" correctly point at `/`. The defect is saying *"map"* and sending the
 * user to `/`, and that verdict does not fit in a single AST node.
 *
 * **What this gate does not guard.** Links that go home (logo, error pages,
 * breadcrumbs) are out of scope. The marketing page being home is correct, and
 * those links never promised a map.
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
   * ⚠️ `download-web-cta`'s **control itself disappeared on 2026-08-19** — the owner
   * removed the whole install section (*"Does this last one seem unnecessary? It's all at the top anyway."* — the last one seems unnecessary since it's all at the top
   * anyway). The hero's web CTA now carries the same promise.
   */
  /**
   * ⚠️ `download-back-to-map`'s **control itself disappeared on 2026-07-31**
   * (owner: *"This is a promotional page, so make it navigable only from the main screen."* — this is a
   * promotional page, so make it navigable only from the main screen). Putting a path
   * to the workbench in the gateway chrome offers the working surface to visitors who
   * have no vault yet, and people who do have one reach the map from `/` anyway.
   *
   * Removing the row **does not weaken the gate** — the proposition it guards is "a
   * control that promises the map goes to the map", not "that control exists". A
   * promise that does not exist cannot be broken, and the remaining row keeps
   * carrying the proposition.
   *
   * Conversely, **reviving the control means restoring a row here.** Without that,
   * only that link stands outside the watch, which is the shape this file exists to
   * prevent.
   */
] as const;

/**
 * Collects the gateway chrome's sources **without depending on file location**.
 *
 * ⚠️ This used to read the single file `src/views/download/ui/DownloadPage.tsx`.
 * When the GNB moved down into `widgets/gateway-chrome` on 2026-07-30 (so that
 * `/guide` and `/changelog` could share the chrome), **the testid vanished from
 * that file and the gate went blind** — fortunately a "not found" assertion made it
 * fail red instead of leaking green. Without that assertion it would have passed
 * silently.
 *
 * The lesson is **not to tie a gate's aim to a path**. Controls move under
 * refactoring; a testid is identity and does not. So `src/` is swept and only files
 * carrying the marker are collected — the gate follows the next move too.
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
        `${testid} 를 가진 링크를 못 찾았다. testid 가 사라졌거나 이름이 바뀌었다면 ` +
          `이 게이트도 함께 갱신해야 한다 — 조용히 통과시키지 않는다.`,
      ).toBeGreaterThan(0);

      for (const href of hrefs) {
        expect(
          href,
          `${testid} 가 "${href}" 를 가리킨다. \`/\` 는 2026-07-29 부터 마케팅 ` +
            `페이지다 — 지도를 약속한 컨트롤이 그리로 가면 사용자는 방금 떠난 ` +
            `화면으로 되돌아온다. 지도는 ${MAP_ROUTE} 다.`,
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
 * **A gate that works only if you remember to register does not exist for whatever
 * you forgot.**
 *
 * The test above iterates the `MAP_DESTINED` allowlist. That precisely guards "this
 * control goes to the map", but **a control not on the list is structurally out of
 * view**. So in the 2026-08-01 measurement, `/projects`'s "← map" link
 * was going to `/` (the gateway) while this whole file stayed green — that link had
 * no testid at all.
 *
 * This test inverts the aim. It searches by **what the label promises, not who
 * registered it**: collect the keys whose i18n value is literally "Map",
 * then look at the href of the links rendering those keys. Forgetting to register a
 * new link here no longer hides it, as long as the label promises a map.
 *
 * The reach is narrowed to **labels that are exactly "map"** because including
 * sentences that merely contain it ("view on the map") would also
 * catch explanatory copy that is not a link, producing noise. The class that
 * actually broke was exactly this narrow one; widening can wait until a violation
 * is observed.
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
 * Reads the **value** of `href` from one opening tag; `null` if it cannot.
 *
 * ⚠️ **This function's reach is the gate's reach** (lesson measured 2026-08-01).
 * It used to see only `href="…"`, ``href={`…`}``, and `href={"…"}`, so a real
 * defect **escaped in two forms**:
 *
 * - `href={workspaceHref}` — with `const workspaceHref = '/'` earlier in the file
 * - `href={'/'}` — **single quotes** inside the braces
 *
 * Both were the "map" link on `/project/[slug]`, labelled "map" but sending
 * the user to the gateway. The gate was green, because those were forms it did not
 * look at. It is the same illness this repository already learned from the
 * label-decoration rule: **a rule with too short a reach is the same as no rule.**
 *
 * Forms whose value cannot be determined (a call expression such as
 * `getTopologyProjectHref(slug)`) return `null` and are **skipped** — guessing here
 * produces false positives, and a gate that produces false positives is soon
 * switched off. For those links the function name itself states the destination.
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
      `라벨이 「지도」인데 ${MAP_ROUTE} 가 아닌 곳으로 가는 링크가 있다. ` +
        `\`/\` 는 2026-07-30 부터 관문(마케팅)이라, 지도라고 적어 놓고 그리로 ` +
        `보내면 사용자는 방금 떠난 화면으로 되돌아온다.`,
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
   * **The two forms that actually escaped.** These probes live here to stop the gate
   * narrowing silently — on 2026-08-01 both forms passed, and they passed not because
   * there was no defect but because **the extractor did not see that syntax**.
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
