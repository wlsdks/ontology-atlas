import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";
import ko from "../../messages/ko.json";

/**
 * Web surface smoke — the only eye on an unattended surface.
 *
 * The 2026-07-27 surface-split decision (`docs/DECISIONS.md`) stopped promising
 * that web and app show the same screens: desktop capabilities ship without a web
 * equivalent, and the owner uses only the app. The **one structural cost** of that
 * decision is unattended decay on the web — nobody is looking, yet the web is
 * currently the only inbound path (14-day unique visitors: 35, all web).
 *
 * So this file asks only whether the web still does its own two jobs. It does not
 * check pixel equivalence or compare against the app; that round-trip
 * verification was retired by the same decision.
 *
 *   ① Gateway  — the first screen opens as a usable map with no vault
 *   ② Fallback — a picked folder is really read, and browsers that cannot pick
 *                degrade honestly
 *   ③ Degrade  — app-only capabilities state "why + where" (zero dead CTAs)
 *
 * Any one of the three going red means the web is not doing its gateway job.
 */

// ── Shared ──────────────────────────────────────────────────────────────────

/**
 * `next dev` compiles a route on first entry. When suites run back to back,
 * hydration can finish late and a testid attaches one frame later — waiting for
 * networkidle absorbs that variance (the same convention as the other specs).
 */
async function gotoSettled(page: Page, url: string) {
  await seedFirstRunSeen(page);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

/** The smallest vault a person would plausibly pick — one project, one domain, one capability. */
const SEED_VAULT: Record<string, string> = {
  "project.md": [
    "---",
    "kind: project",
    "slug: smoke-shop",
    "title: Smoke Shop",
    "contains:",
    "  - smoke-orders",
    "---",
    "",
    "# Smoke Shop",
    "",
    "스모크용 최소 프로젝트.",
    "",
  ].join("\n"),
  "domains/orders.md": [
    "---",
    "kind: domain",
    "slug: smoke-orders",
    "title: Orders",
    "contains:",
    "  - smoke-checkout",
    "---",
    "",
    "# Orders",
    "",
    "주문 도메인.",
    "",
  ].join("\n"),
  "capabilities/checkout.md": [
    "---",
    "kind: capability",
    "slug: smoke-checkout",
    "title: Checkout",
    "domain: smoke-orders",
    "---",
    "",
    "# Checkout",
    "",
    "결제 역량.",
    "",
  ].join("\n"),
};

// ── ① Gateway — the face and the map are each alive at their own address ────

/**
 * **This section's addresses split on 2026-07-30.**
 *
 * `/` alone used to guard "the first screen opened without a vault renders a real
 * map". With the owner's sign-off (2026-07-29, decision ledger: reversing
 * 「root-first-open」) `/` became the web visitor's **face** and the map moved to
 * `/topology`.
 *
 * So the check was **moved, not deleted.** The guarantee that the map is alive
 * with a non-zero count still stands; only the address asking it changed. Deleting
 * instead of moving would have made that transition remove one of the gateway's
 * eyes.
 */
test.describe("웹 스모크 ① 관문", () => {
  test("`/` 가 얼굴로 뜬다 — 무엇인지 말하고, 받는 길과 보는 길을 함께 준다", async ({
    page,
  }) => {
    await gotoSettled(page, "/ko/");

    // Gateway chrome — the face's top bar, not the workbench rail.
    await expect(page.getByTestId("download-gnb")).toBeVisible({ timeout: 15_000 });

    // The visitor's two available actions are alive: download, and look without
    // installing.
    //
    // Re-aimed 2026-08-19: both used to live inside the install panel
    // (`download-hero-actions` · `download-web-cta`), which the owner removed
    // wholesale — *"The last section seems unnecessary; it is all at the top anyway."*
    // (the last section seems unnecessary; it is all at the top anyway). The hero now
    // carries both destinations, which was also the basis for that decision.
    await expect(page.getByTestId("gateway-hero-cta")).toBeVisible();
    const toMap = page.getByTestId("gateway-hero-web-cta");
    await expect(toMap).toBeVisible();
    // **Must not loop back to `/`** — that would make "go look" a dead promise.
    // Before the split both addresses rendered the same screen, so this defect was
    // invisible.
    await expect(toMap).toHaveAttribute("href", /\/topology\/?$/);

    // The face carries no "download" breadcrumb segment — this is not that address.
    await expect(page.getByTestId("download-back-to-map")).toHaveCount(0);
  });

  test("`/topology` 가 실제 지도 + 읽을 수 있는 숫자로 뜬다", async ({ page }) => {
    await gotoSettled(page, "/ko/topology/");

    // The map exists as a canvas with real dimensions.
    const canvas = page.getByTestId("topology-map-v2-canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const box = await canvas.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);

    // The INDEX beside the map exists, holding the starter a first visitor reads.
    await expect(page.getByTestId("topology-index-panel")).toBeVisible();
    const starter = page.getByTestId("first-run-starter");
    await expect(starter).toBeVisible();

    // The number must come from **real data**. A 0 means the map mounted but drew
    // nothing — a dead screen as far as the gateway is concerned.
    //
    // The marker moved from a "span holding only a number" inside the card to the
    // sample-size caption (2026-08-02). The previous marker leaned on the markup of a
    // three-part instrument cell (`<span>112</span>`); when that instrument was
    // demoted to a one-line caption the number moved inside a sentence and the marker
    // **outlived its component** — the exact failure mode that cost a release in
    // 2026-08. The marker now points at one surface with its own testid, and if that
    // surface disappears the gate breaks first.
    const scale = starter.getByTestId("first-run-starter-sample-scale");
    await expect(scale).toBeVisible();
    const counts = (((await scale.textContent()) ?? "").match(/\d+/g) ?? []).map(Number);
    expect(counts.length).toBeGreaterThan(0);
    expect(counts.some((value) => value > 0)).toBe(true);

    // The gateway's two next actions are alive (disabled or absent means it is broken).
    await expect(page.getByTestId("first-run-starter-open")).toBeEnabled();
    await expect(page.getByTestId("first-run-starter-create")).toBeEnabled();
  });
});

// ── ② Fallback workbench — the folder is actually read ──────────────────────

test.describe("웹 스모크 ② 차선 워크벤치", () => {
  test("폴더를 고르면 웹이 그 폴더를 실제로 읽어 지도로 바꾼다", async ({ page }) => {
    await stubDirectoryPicker(page, SEED_VAULT);
    // Testing the workbench, so go to the map address — since 2026-07-30 `/` is the gateway.
    await gotoSettled(page, "/ko/topology/");

    await page.getByTestId("first-run-starter-open").click();
    await expect(page.getByTestId("vault-guide-sheet")).toBeVisible();
    await page.getByTestId("vault-guide-pick-existing").click();

    // Success is judged as "my node from the picked folder is on screen". The
    // starter disappearing (sample → my data) is not enough — it can also disappear
    // when the folder opened but nothing was read.
    await expect(page.getByTestId("first-run-starter")).toHaveCount(0, { timeout: 20_000 });

    const index = page.getByTestId("topology-index-panel");
    await expect(index).toContainText("Smoke Shop", { timeout: 20_000 });
    // The seed folder is exactly 3 nodes and 2 edges. Matching counts mean the
    // frontmatter was really read and the edges were wired.
    await expect(index).toContainText("3 개념");
    await expect(index).toContainText("2 관계");
  });

  test("폴더를 못 여는 브라우저는 약속 대신 이유와 갈 곳을 준다", async ({ page }) => {
    // Reproduce a browser without FSA. The app decides that capability by whether
    // `showDirectoryPicker` is **callable**, so deleting it is enough.
    await page.addInitScript(() => {
      try {
        delete (window as unknown as Record<string, unknown>).showDirectoryPicker;
      } catch {
        /* non-configurable — the assertion below fails on its own */
      }
    });
    // Testing the workbench, so go to the map address — since 2026-07-30 `/` is the gateway.
    await gotoSettled(page, "/ko/topology/");

    const notice = page.getByTestId("first-run-starter-unsupported");
    await expect(notice).toBeVisible({ timeout: 15_000 });
    // Why it does not work and where it does, in one sentence.
    await expect(notice).toContainText("지원하지 않아요");
    await expect(notice).toContainText("Chrome/Edge");

    const cta = page.getByTestId("first-run-starter-unsupported-cta");
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", /\/download\//);

    // Pointing somewhere unreachable is a dead end, not guidance.
    await cta.click();
    await expect(page).toHaveURL(/\/download\//, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

// ── ③ Honest degradation — app-only capabilities state why + where ──────────

/**
 * Registry of desktop-only surfaces as opened on the web.
 *
 * The value is in it being a list: if whoever adds a desktop capability does not
 * add a row here, nobody ever looks at that capability's web degradation. A new
 * bridge gets a row (the `.claude/rules/surfaces.md` contract).
 */
// This registry is for the **web↔app axis** only — each row claims "the browser
// cannot do this in principle → the only destination is /download/". Degradation
// on the **viewport-width axis** (a surface the same web build opens on wide
// screens; first case: the studio below lg) does not belong here. Putting it here
// would make the row assert the falsehood "the web cannot do this", and the next
// auditor reads it as written. The width axis is gated by
// `responsive-overflow-audit.spec.ts`, where width is the independent variable
// (see `.claude/rules/surfaces.md` "degradation has two axes", 2026-07-28).
type DegradedSurface = {
  name: string;
  url: string;
  /**
   * The route to a card an address alone cannot reach. It exists **so that cards
   * which only appear after a click — a section inside the settings sheet — can
   * still be in the registry.** While this field did not exist, such capabilities
   * had to keep their own spec outside the list, which reopens by the back door the
   * very failure this list prevents: an unregistered capability nobody looks at.
   */
  open?: (page: Page) => Promise<void>;
  card: string;
  /** ① **Why** it does not work — the card states a reason, not an apology. */
  reason: RegExp;
  /**
   * ② **Where** it does work — a clickable link. The assertion goes as far as
   * clicking it and checking `/download/` actually opens (this is what guards
   * "zero dead CTAs").
   */
  destination?: string;
  /**
   * The other shape of ② — a card that names the destination **in prose only**.
   * `.claude/rules/surfaces.md` defines the destination as *"usually `/download/`,
   * or a single CLI command"*, so non-link guidance also satisfies the contract.
   *
   * ⚠️ **A card that has a link must use `destination`.** Moving it here silently
   * drops that row out of the "clicking goes nowhere" check.
   */
  destinationText?: RegExp;
  /**
   * ③ **What does work on this screen** (when anything does). Saying something is
   * unavailable when it works is the same species of lie as "coming soon"
   * (2026-08-01, `surfaces.md`), so once written it is locked against quietly
   * disappearing.
   *
   * ⚠️ **Measure whether the named place exists, not the wording** (2026-08-17).
   * This used to pin whole sentences like `/connect-my-agent/`; when the wording
   * changed it went red, and **that red could not distinguish "the wording is
   * stale" from "it points nowhere"**. It was in fact both — the card pointed at an
   * "MCP" section, and no section by that name existed in the sheet.
   * `documentation.md`: *do not pin sentences a human wrote; check only what a
   * machine can generate.*
   *
   * So this checks only **whether the name inside 「…」 is a real section name on
   * this screen**. The equivalent check on the translation files is
   * `tests/contract/settings-section-reference.contract.test.ts`.
   */
  alsoHereNamesSettingsSection?: true;
  /** This card only renders after a vault is open — attach the fixture folder first. */
  needsVault?: true;
};

const DEGRADED_SURFACES: readonly DegradedSurface[] = [
  {
    name: "기록(git) — 브라우저는 이 컴퓨터의 git 을 실행할 수 없다",
    url: "/ko/git/?focus=main",
    card: "atlas-git-panel",
    reason: /브라우저는[\s\S]*권한이 없어요/,
    destination: "atlas-git-web-get-app",
  },
  {
    // ⚠️ **This row claims "cannot save automatically", not "cannot connect"**
    // (2026-08-01). The previous wording was "You cannot connect on this screen" and it was false — MCP attaches to the folder,
    // not to Atlas, and the agent starts the server in its own session, so web users
    // do connect. The one thing a browser cannot do is **write the config file for
    // you**, because it does not know the absolute path. A degradation card
    // understating the capability is also an honesty violation, so this regex targets
    // the narrow claim (automatic saving). Whether the path that ends right there is
    // alive is checked by a separate spec below.
    //
    // ⚠️ **Re-aimed 2026-08-21** (ledger 90). This card used to be opened by the
    // connect sheet, which has since been retired. It is now drawn by the "MCP connection"
    // section of the "Agent" destination — **after a vault is open.**
    //
    // Owner's call: *"It is right to draw it only when a vault exists."* It is also more accurate: **with no vault there is no config
    // to save.** In the sheet era this card showed without a vault, and the sentence
    // was then saying it could not act on a file that did not yet exist.
    name: "에이전트 연결 — 브라우저는 폴더의 절대 경로를 몰라 설정을 대신 저장하지 못한다",
    url: "/ko/topology/",
    open: async (page) => {
      // Open the vault first — that is what draws the settings panel holding this card.
      await page.getByTestId("first-run-starter-open").click();
      await page.getByTestId("vault-guide-pick-existing").click();
      await page.getByTestId("first-run-starter").waitFor({ state: "detached", timeout: 20_000 });
      await page.getByTestId("app-nav-rail").getByRole("link", { name: "에이전트" }).click();
      await page.getByTestId("agent-setup-section").waitFor({ timeout: 15_000 });
    },
    needsVault: true,
    card: "agent-server-unavailable",
    reason: /브라우저는[\s\S]*설정 파일을 대신 저장하지 못합니다/,
    destination: "agent-connect-web-get-app",
  },
  {
    // **The "Runtimes" section** (registered 2026-08-16) — the screen that
    // finds coding agents installed on this machine and launches them inside the app.
    // A browser has no permission to launch programs on this computer, so the
    // rejection is in principle and the card states a reason rather than "coming
    // soon".
    //
    // **The first row whose destination is prose** — this section has no link element
    // today.
    //
    // **Also the first row where item ③ actually exists.** Before registration the
    // wording was only "The browser cannot run tools", and a web user reading just that sentence concludes the web cannot
    // use agents at all — precisely the falsehood `agent-server-unavailable` was
    // corrected for on 2026-08-01. Web users can attach an agent they started
    // themselves to this folder, and that path ("MCP") is in the same sheet. So that
    // sentence went into the card and is locked here.
    //
    // ⚠️ **Re-aimed 2026-08-21** (ledger 90). This section left the settings sheet
    // and became the "Agent" destination. The check is **re-addressed, not
    // deleted** — whether the degradation sentence is alive is a question worth asking
    // wherever the surface moves. Opening a sheet is no longer needed: the destination
    // opens directly by address.
    name: "실행기 — 브라우저는 이 컴퓨터의 프로그램을 띄우지 못한다",
    url: "/ko/agents/",
    card: "app-settings-runtimes-web",
    reason: /브라우저는[\s\S]*권한이 없어요/,
    destinationText: /맥 앱을 받으면/,
    alsoHereNamesSettingsSection: true,
  },
  {
    // **"Connectors"** (registered 2026-09-05) — external MCP servers a person lets the
    // in-app agent reach.
    //
    // Two abilities are app-only here and **neither is the feature itself**: reading
    // `~/.claude.json` to find what is already registered needs a program on this computer,
    // and keeping a token needs an OS keychain. The list lives in the vault folder, which a
    // browser holds, so adding and removing connectors work here — and the card has to say
    // that, or it repeats the 2026-08-01 falsehood of calling a working path unavailable.
    name: "연결 도구 — 웹은 이미 등록된 MCP 서버를 찾아 주지 못한다",
    url: "/ko/topology/",
    open: async (page) => {
      await page.getByTestId("first-run-starter-open").click();
      await page.getByTestId("vault-guide-pick-existing").click();
      await page.getByTestId("first-run-starter").waitFor({ state: "detached", timeout: 20_000 });
      await page.getByTestId("app-nav-rail").getByRole("link", { name: "에이전트" }).click();
      await page.getByTestId("connectors-panel").waitFor({ timeout: 15_000 });
    },
    needsVault: true,
    card: "connectors-discovery-unavailable",
    // ⚠️ The card **does not name the browser** — `surface-naming-ratchet` counts strings that
    // do, and this sentence is true wherever it renders, so it states the fact instead: a
    // program on this computer is what reads those files.
    reason: /이 컴퓨터에서 도는 프로그램이 있어야 하고[\s\S]*토큰을 담아 둘 자리도 여기에는 없습니다/,
    destination: "connectors-web-get-app",
  },
];

test.describe("웹 스모크 ③ 정직한 강등", () => {
  for (const surface of DEGRADED_SURFACES) {
    test(`${surface.name} — 이유와 갈 곳이 함께 있다`, async ({ page }) => {
      if (surface.needsVault) await stubDirectoryPicker(page, SEED_VAULT);
      await gotoSettled(page, surface.url);
      await surface.open?.(page);

      const card = page.getByTestId(surface.card);
      await expect(card).toBeVisible({ timeout: 15_000 });
      await expect(card).toHaveText(surface.reason);

      // A row with no destination is the same as never having been registered — one of
      // the two must be present, and there is no path to registering without either.
      expect(surface.destination ?? surface.destinationText).toBeDefined();

      if (surface.destination) {
        const destination = page.getByTestId(surface.destination);
        await expect(destination).toBeVisible();
        await expect(destination).toHaveAttribute("href", /\/download\//);
      }
      if (surface.destinationText) await expect(card).toHaveText(surface.destinationText);
      if (surface.alsoHereNamesSettingsSection) {
        /*
         * The name inside 「…」 must be **a place that really exists on the same screen**.
         * Wording may change freely; this only breaks when it points at something absent.
         *
         * ⚠️ **Re-aimed 2026-08-21**: it used to look in the settings sheet's section
         * list. When this section moved to a destination, the referent became **this
         * page's section headings** — a stronger contract too. If the card says something
         * also works here, that place must be on **this** screen.
         */
        const quoted = [...(await card.innerText()).matchAll(/[「“]([^」”]+)[」”]/gu)].map((m) =>
          m[1].trim(),
        );
        expect(quoted, "이 화면에서도 되는 곳을 이름으로 대야 한다").not.toEqual([]);
        const headings = (await page.getByRole("heading").allInnerTexts()).map((text) =>
          text.trim(),
        );
        expect(headings.length, "이 화면의 제목을 못 읽었다 — 이 검사가 헛돈다").toBeGreaterThan(1);
        for (const name of quoted) {
          expect(headings, `카드가 가리킨 「${name}」 자리가 이 화면에 없다`).toContain(name);
        }
      }
    });
  }

  /**
   * **The far side of degradation** — a card with only a reason and a destination,
   * and nothing that *works here*, is honest but a dead end. This card's only
   * alternative used to be a long docs link, and someone trying to connect lost the
   * sheet and landed in the middle of a document (reported by the owner).
   *
   * The value the browser does not know (the absolute path) is **asked of the person
   * who does**, and a runnable config is built on the spot. What this spec guards is
   * not the existence of input fields but the contract that **a half-filled config
   * is never handed over**.
   */
  test("에이전트 연결 — 웹에서도 그 자리에서 붙는 설정을 만든다", async ({ page }) => {
    // 2026-08-21 — the connect sheet was retired (ledger 90). This path lives in the
    // destination's "MCP Connect" section and is drawn after a vault is open (with no
    // vault there is no config to build).
    await stubDirectoryPicker(page, SEED_VAULT);
    await gotoSettled(page, "/ko/topology/");
    await page.getByTestId("first-run-starter-open").click();
    await page.getByTestId("vault-guide-pick-existing").click();
    await page.getByTestId("first-run-starter").waitFor({ state: "detached", timeout: 20_000 });
    await page.getByTestId("app-nav-rail").getByRole("link", { name: "에이전트" }).click();
    await page.getByTestId("agent-setup-section").waitFor({ timeout: 15_000 });

    const panel = page.getByTestId("web-manual-connect");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // What to do is visible before anything is filled in — never bare inputs on an empty screen.
    const body = page.getByTestId("web-manual-connect-config-body");
    await expect(body).toContainText("mcpServers");
    // A config still holding placeholders will not attach, so copy stays locked.
    await expect(page.getByTestId("web-manual-connect-copy-config")).toBeDisabled();

    /*
     * Never claim to have verified something that was never verified.
     *
     * **Read the sentence from the catalogue, do not retype it.** A hand-typed
     * excerpt (`Cannot prove it`) broke on 2026-08-22 when the copy was made plainer
     * — `Unable to prove` — which changed nothing about the claim, and a regex written
     * to cover both missed it again on the verb ending. What this proves is that the
     * screen renders *that* note; whether the note is well worded is the glossary
     * gate's job (`ui-copy-glossary.contract.test.ts`), not this spec's.
     */
    await expect(page.getByTestId("web-manual-connect-shape-only")).toContainText(
      ko.agentConnect.manualShapeOnlyNote,
    );

    // A `~` does not expand inside a config file — catch it and say why.
    await page.getByTestId("web-manual-connect-vault-input").fill("~/notes");
    await expect(page.getByTestId("web-manual-connect-vault-input-issue")).toBeVisible();

    // With both absolute paths in, the config has no placeholders and copy unlocks.
    await page.getByTestId("web-manual-connect-vault-input").fill("/Users/me/notes");
    await page
      .getByTestId("web-manual-connect-checkout-input")
      .fill("/Users/me/ontology-atlas");
    await page.getByTestId("web-manual-connect-path-confirmation").check();
    await expect(body).toContainText('"OATLAS_VAULT": "/Users/me/notes"');
    await expect(body).toContainText("/Users/me/ontology-atlas/mcp/src/index.js");
    await expect(page.getByTestId("web-manual-connect-copy-config")).toBeEnabled();
    await expect(page.getByTestId("web-manual-connect-copy-cli")).toBeEnabled();

    /*
     * The docs link stays but is **not the main path** — the task finishes without
     * leaving this place.
     *
     * 2026-08-21: what is measured moved from the sheet to the **destination**
     * (ledger 90). The locked meaning is unchanged — someone building a config must
     * not be dropped into the middle of a document halfway through.
     */
    await expect(page.getByTestId("agent-setup-section")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/ko/agents/");
  });

  /**
   * Skill-copy comparison is **correctly absent on the web** — the manifest walker
   * filters dot directories, so `.claude/skills` is invisible in a browser in
   * principle, and an FSA handle has no absolute path to work around it.
   *
   * This assertion exists because of the **opposite defect**: pretending to have a
   * capability that is absent (rendering 0 as "all match") makes the screen claim to
   * have verified something it never did. `-` means "this surface lacks the
   * capability" and `0/0` means "the capability works and found nothing" — the two
   * must not collapse into one value.
   *
   * The installed-app counterpart: the same attribute produced `11/3`, matching the
   * CLI `agent-files` verdict (11 shared skills, 3 diverged) — measured 2026-07-29.
   */
  test("문서함이 웹에서는 스킬 사본 판정을 하지 않는다 — 없는 능력을 있는 척하지 않는다", async ({
    page,
  }) => {
    await gotoSettled(page, "/ko/docs/?guides=off");
    await expect(page.locator("main#main")).toHaveAttribute("data-skill-parity", "-");
  });

  test("다운로드 화면이 웹의 두 번째 일을 숨기지 않는다 (Windows 방문자)", async ({ page }) => {
    // The reverse-direction defect — writing that something works nowhere when it
    // works here. Measured 2026-07-27: this screen said "opening a folder directly is
    // only possible in the installed app", and smoke ② directly above proves that
    // false. Not sending away a visitor whose OS has no app is the web's second job.
    //
    // ⚠️ 2026-07-29 — this spec had **already been sitting red** (found while
    // applying a council verdict). Both sentences it targeted were gone: "Chrome·Edge"
    // is in no locale catalogue, and "Signed installer" (`windowsPolicy`) is policy
    // prose that moved inside a disclosure and is **invisible in the default state**.
    //
    // Rather than resurrect the strings, **the claim was rewritten**. What must hold
    // is not a particular wording but "a visitor on an OS with no app does not leave
    // empty-handed".
    //
    // Re-aimed 2026-08-19: the place that answer lived in (the platform section inside
    // the panel) disappeared with the install section. The hero's second row does that
    // job now — the Windows file button stands **together with** the unsigned marker,
    // and beside it is somewhere that works today.
    await gotoSettled(page, "/ko/download/");

    // ① The state of the file for your OS is known **at the point of download** —
    //    learning it only after scrolling is too late.
    const windows = page.getByTestId("gateway-hero-windows");
    await expect(windows).toBeVisible({ timeout: 15_000 });
    await expect(windows).toContainText("Windows");
    await expect(windows).toContainText(/미서명/);
    await expect(windows).toHaveAttribute("href", /github\.com/);

    // ② The path to **what works today** is on the same row.
    //
    // ⚠️ 2026-07-29 (night) — the destination changed from `/ko/` to `/ko/topology/`
    // because the owner's decision made `/` a **marketing page** (ledger: reversing
    // "root-first-open"). This assertion means *"a visitor on an OS with no app can
    // reach something that works today"*, and that place is the **web product**, not
    // the intro screen — `/topology`.
    //
    // The label-destination pairing is guarded separately at source level by
    // `tests/contract/map-destination-route.contract.test.ts`.
    //
    // Deleted 2026-08-19: "Track to follow" (`download-platform-windows-track`) — that
    // link was degradation guidance shown only while the Windows build was
    // **unpublished**, and it went with the panel. A real file exists now, so the
    // destination is the file rather than a tracking issue.
    const web = page.getByTestId("gateway-hero-web-cta");
    await expect(web).toBeVisible();
    await expect(web).toHaveAttribute("href", /\/ko\/topology\/?$/);
  });

  test("설정의 AI 연결이 브라우저에서 키를 받지 않는 이유를 말한다", async ({ page }) => {
    // Testing the workbench, so go to the map address — since 2026-07-30 `/` is the gateway.
    await gotoSettled(page, "/ko/topology/");

    // The settings trigger exists in both the rail and the map chrome — narrow to the rail.
    await page
      .getByTestId("app-nav-rail-utility-tier")
      .getByTestId("app-settings-trigger")
      .click();
    // 2026-08-02 — the in-app agent is one LNB row (the drill-in corridor was
    // removed). The former two steps (section → summary row) became one.
    await page.getByTestId("app-settings-nav-ai").click();

    const card = page.getByTestId("ai-connection-web-degraded");
    await expect(card).toBeVisible({ timeout: 15_000 });
    // A rejection in principle, so a reason must stand — not "coming soon". The reason is
    // written in plain words now (2026-09-01): scripts from another site could take the key.
    await expect(card).toContainText("악성 코드");
    await expect(page.getByTestId("ai-connection-download-link")).toHaveAttribute(
      "href",
      /\/download\//,
    );
  });
});
