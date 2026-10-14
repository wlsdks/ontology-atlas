import { expect, test, type Page } from "@playwright/test";
import { seedFirstRunSeen } from "./first-run-seed";
import { stubDirectoryPicker } from "./vault-picker-stub";
import ko from "../../messages/ko.json";

/**
 * Web surface smoke: asks only whether the web still does its own jobs (gateway map, folder fallback,
 * honest degradation of app-only capabilities). Pixel equivalence with the app is not checked.
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
  // A raw source and a document outside sources/, so the library draws and "Find
  // documents" has something to propose. Neither is Markdown, so neither can reach the
  // graph — which is the property the library rests on.
  "sources/handbook.pdf": "%PDF-1.7 smoke\n",
  "inbox/quarter plan.pdf": "%PDF-1.7 candidate\n",
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
    "uid: 00000000-0000-4000-8000-000000000003",
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
 * The gateway face is at `/` and the map at `/topology`; the map-alive check with a non-zero count
 * runs at the map's address.
 */
test.describe("웹 스모크 ① 관문", () => {
  test("`/` 가 얼굴로 뜬다 — 무엇인지 말하고, 받는 길과 보는 길을 함께 준다", async ({
    page,
  }) => {
    await gotoSettled(page, "/ko/");

    // Gateway chrome — the face's top bar, not the workbench rail.
    await expect(page.getByTestId("download-gnb")).toBeVisible({ timeout: 15_000 });

    // The face's two actions are alive: download, and look without installing; both live in the hero.
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
    const canvas = page.getByTestId("ontology-map-canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    const box = await canvas.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect(box?.height ?? 0).toBeGreaterThan(0);

    // The INDEX beside the map exists, holding the starter a first visitor reads.
    await expect(page.getByTestId("topology-index-panel")).toBeVisible();
    const starter = page.getByTestId("first-run-starter");
    await expect(starter).toBeVisible();

    // The number must come from real data: 0 means the map mounted but drew nothing. The marker is the
    // sample-size caption's own testid, so the gate breaks first if that surface disappears.
    const scale = starter.getByTestId("first-run-starter-sample-scale");
    await expect(scale).toBeVisible();
    const counts = (((await scale.textContent()) ?? "").match(/\d+/g) ?? []).map(Number);
    expect(counts.length).toBeGreaterThan(0);
    expect(counts.some((value) => value > 0)).toBe(true);

    // The gateway's two next actions are alive (disabled or absent means it is broken).
    await expect(page.getByTestId("first-run-starter-open")).toBeEnabled();
    await page.getByTestId("first-run-starter-more-toggle").click();
    await expect(page.getByTestId("first-run-starter-create")).toBeEnabled();
  });
});

// ── ② Fallback workbench — the folder is actually read ──────────────────────

test.describe("웹 스모크 ② 차선 워크벤치", () => {
  test("폴더를 고르면 웹이 그 폴더를 실제로 읽어 지도로 바꾼다", async ({ page }) => {
    await stubDirectoryPicker(page, SEED_VAULT);
    // The workbench is at the map address; `/` is the gateway.
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
    // The workbench is at the map address; `/` is the gateway.
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
// This registry is for the web-versus-app axis only: each row claims the browser cannot do this in
// principle. Width-axis degradation belongs to the responsive overflow spec (`surfaces.md`).
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
   * What does work on this screen. Checks only that the quoted section name exists on this screen, not
   * the wording; the translation-file equivalent is `settings-section-reference.contract.test.ts`.
   */
  alsoHereNamesSettingsSection?: true;
  /**
   * For when the working place is another destination: the card carries the link, and this asserts it
   * is on screen and resolves there.
   */
  alsoHereLink?: { testId: string; href: RegExp };
  /** This card only renders after a vault is open — attach the fixture folder first. */
  needsVault?: true;
};

const DEGRADED_SURFACES: readonly DegradedSurface[] = [
  {
    name: "회색지대 — 브라우저는 연결된 코드 폴더를 검사하지 못한다",
    url: "/ko/library/",
    needsVault: true,
    open: async (page) => {
      await page.getByTestId("library-open-vault").click();
      await expect(page.getByTestId("library-find-documents")).toBeVisible();
      await gotoSettled(page,"/ko/topology/?p=capabilities/checkout&guides=off");
      await page.getByTestId("map-detail-panel-more-menu-trigger").click();
      await page.getByTestId("map-detail-panel-action-gray-area").click();
    },
    card: "gray-area-web-limit",
    reason: /브라우저는[\s\S]*코드 폴더[\s\S]*설치한 앱/,
    destination: "gray-area-get-app",
  },
  {
    name: "기록(git) — 브라우저는 이 컴퓨터의 git 을 실행할 수 없다",
    url: "/ko/git/?focus=main",
    card: "atlas-git-panel",
    reason: /브라우저는[\s\S]*권한이 없어요/,
    destination: "atlas-git-web-get-app",
  },
  {
    // Registering it on the web would promise nothing could keep: it keeps a clock and opens a headless
    // agent session while the person is away, which a browser tab cannot do.
    name: "순회 — 브라우저는 자리를 비운 동안 시계를 지키거나 에이전트를 열 수 없다",
    url: "/ko/library/?tab=rounds",
    card: "library-rounds-app-required",
    reason: /설치한 앱만 할 수 있어요/,
    destination: "library-rounds-get-app",
  },
  {
    // Claims only that the browser cannot save the config automatically (it does not know the absolute
    // path); connecting works. Drawn only after a vault is open: with no vault there is no config.
    name: "에이전트 연결 — 브라우저는 폴더의 절대 경로를 몰라 설정을 대신 저장하지 못한다",
    url: "/ko/topology/",
    open: async (page) => {
      // Open the vault first — that is what draws the settings panel holding this card.
      await page.getByTestId("first-run-starter-open").click();
      await page.getByTestId("vault-guide-pick-existing").click();
      await page.getByTestId("first-run-starter").waitFor({ state: "detached", timeout: 20_000 });
      await page.getByTestId("app-nav-rail").getByRole("link", { name: "에이전트" }).click();
      await page.getByTestId("agents-tab-mcp").click();
      await page.getByTestId("agent-setup-section").waitFor({ timeout: 15_000 });
    },
    needsVault: true,
    card: "agent-server-unavailable",
    reason: /브라우저는[\s\S]*설정 파일을 대신 저장하지 못해요/,
    destination: "agent-connect-web-get-app",
  },
  {
    // Runtimes: a browser cannot launch programs on this computer, so the card states a reason. It must
    // also say a web user can attach an agent they started themselves (the MCP path).
    name: "실행기 — 브라우저는 이 컴퓨터의 프로그램을 띄우지 못한다",
    url: "/ko/agents/",
    card: "app-settings-runtimes-web",
    reason: /브라우저는[\s\S]*권한이 없어요/,
    // The card carries the download press, so the destination is checked as a link to /download/.
    destination: "app-settings-runtimes-get-app",
    // The row names the MCP place and links to it: a name with no way there is a dead pointer.
    alsoHereLink: { testId: "app-settings-runtimes-mcp-link", href: /\/agents\/\?tab=mcp/ },
  },
  {
    // Models: keeping a key needs an OS keychain and calling a runner needs a program on this computer;
    // the tab exists on the web and says so, with no sample rows for data it does not have.
    name: "모델 — 브라우저는 키를 안전하게 보관하지 못한다",
    url: "/ko/agents/?tab=models",
    card: "ai-connection-web-degraded",
    reason: /악성 코드[\s\S]*데스크톱 앱/,
    destination: "ai-connection-download-link",
  },
  {
    // Connectors: reading `~/.claude.json` needs a program on this computer and keeping a token needs an
    // OS keychain, but adding and removing work on the web, so the card must not call them unavailable.
    name: "연결 도구 — 웹은 이미 등록된 MCP 서버를 찾아 주지 못한다",
    url: "/ko/topology/",
    open: async (page) => {
      await page.getByTestId("first-run-starter-open").click();
      await page.getByTestId("vault-guide-pick-existing").click();
      await page.getByTestId("first-run-starter").waitFor({ state: "detached", timeout: 20_000 });
      await page.getByTestId("app-nav-rail").getByRole("link", { name: "에이전트" }).click();
      await page.getByTestId("agents-tab-mcp").click();
      /* The card sits inside the add-a-connector dialog, where finding what is already registered happens. */
      await page.getByTestId("connectors-panel").waitFor({ timeout: 15_000 });
      await page.getByTestId("connectors-add-open").click();
      /* The dialog is one list; the card stands inline where the machine scan would be, after the catalogue. */
    },
    needsVault: true,
    card: "connectors-discovery-unavailable",
    // ⚠️ The card **does not name the browser** — `surface-naming-ratchet` counts strings that
    // do, and this sentence is true wherever it renders, so it states the fact instead: a
    // program on this computer is what reads those files.
    reason: /이 컴퓨터에서 도는 프로그램이 있어야 하고[\s\S]*토큰을 담아 둘 자리도 여기에는 없어요/,
    destination: "connectors-web-get-app",
  },
  {
    /*
     * Importing from a service: the connection is written into the folder and works on either surface,
     * but a browser cannot start the tool that fetches, so the last step offers no press and says what
     * happened.
     */
    name: "서비스에서 가져오기 — 브라우저는 문서를 받아 올 코딩 도구를 띄우지 못한다",
    url: "/ko/topology/",
    open: async (page) => {
      await page.getByTestId("first-run-starter-open").click();
      await page.getByTestId("vault-guide-pick-existing").click();
      await page.getByTestId("first-run-starter").waitFor({ state: "detached", timeout: 20_000 });
      await page.getByTestId("app-nav-rail").getByRole("link", { name: "자료실" }).click();
      await page.getByTestId("library-import-open").waitFor({ timeout: 15_000 });
      await page.getByTestId("library-import-open").click();
      await page
        .locator('[data-testid="library-import-service"][data-service="notion"]')
        .click();
      /*
       * Notion needs a token, so the walk types one; the claim is unchanged: the browser cannot start the
       * tool that fetches, and says so.
       */
      await page.getByTestId("library-import-token").fill("ntn_smoke_value");
      await page.getByTestId("library-import-connect").click();
      await page
        .getByTestId("library-import-no-agent")
        .waitFor({ timeout: 20_000 });
    },
    needsVault: true,
    card: "library-import-no-agent",
    // The card does not name the browser: the sentence is true wherever it renders, and
    // `surface-naming-ratchet` counts strings that do.
    reason: /브라우저는 그 도구를 띄우지 못해요[\s\S]*연결은 저장되었고 켜져 있으니/,
    destination: "library-import-no-agent-app",
  },
  {
    /*
     * Finding documents outside the open folder: a binding is an absolute path a browser cannot be given.
     * The claim is narrow: the browser does walk the open folder, but cannot reach a second one.
     */
    /*
     * With no folder open the Library is a single stage whose one control is the picker, so one press
     * opens it.
     */
    name: "문서 찾기 — 브라우저는 연결해 둔 프로젝트 폴더까지 훑지 못한다",
    url: "/ko/library/",
    open: async (page) => {
      const picker = page.getByTestId("library-open-vault");
      await picker.waitFor({ timeout: 25_000 });
      await picker.click();
      await page.getByTestId("library-find-documents").waitFor({ timeout: 20_000 });
      await page.getByTestId("library-find-documents").click();
    },
    needsVault: true,
    card: "find-documents-web-limit",
    reason: /여기서는 지금 연 폴더만[\s\S]*절대 경로가 필요하고/,
    destination: "find-documents-web-get-app",
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
      if (surface.alsoHereLink) {
        const link = page.getByTestId(surface.alsoHereLink.testId);
        await expect(link, "이 화면에서도 되는 곳으로 갈 링크가 없다").toBeVisible();
        await expect(link).toHaveAttribute("href", surface.alsoHereLink.href);
      }
      if (surface.alsoHereNamesSettingsSection) {
        /*
         * The name inside the quotes must be a place that exists on this page, checked against its section
         * headings. Wording may change freely; this breaks only when the name points at something absent.
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
   * The absolute path is asked of the person and a runnable config is built on the spot. The guard
   * is that a half-filled config is never handed over.
   */
  test("에이전트 연결 — 웹에서도 그 자리에서 붙는 설정을 만든다", async ({ page }) => {
    // This path lives in the destination's MCP Connect section and is drawn after a vault is open;
    // with no vault there is no config to build.
    await stubDirectoryPicker(page, SEED_VAULT);
    await gotoSettled(page, "/ko/topology/");
    await page.getByTestId("first-run-starter-open").click();
    await page.getByTestId("vault-guide-pick-existing").click();
    await page.getByTestId("first-run-starter").waitFor({ state: "detached", timeout: 20_000 });
    await page.getByTestId("app-nav-rail").getByRole("link", { name: "에이전트" }).click();
    await page.getByTestId("agents-tab-mcp").click();
    await page.getByTestId("agent-setup-section").waitFor({ timeout: 15_000 });

    const panel = page.getByTestId("web-manual-connect");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // What to do is visible before anything is filled in — never bare inputs on an empty screen.
    const body = page.getByTestId("web-manual-connect-config-body");
    await expect(body).toContainText("mcpServers");
    // A config still holding placeholders will not attach, so copy stays locked.
    await expect(page.getByTestId("web-manual-connect-copy-config")).toBeDisabled();

    /*
     * Read the note from the catalogue instead of retyping it: a hand-typed excerpt breaks when wording
     * changes. Wording quality is the glossary gate's job (`ui-copy-glossary.contract.test.ts`).
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
     * The docs link is not the main path: the task finishes without leaving this place, and building a
     * config must not drop someone into the middle of a document.
     */
    await expect(page.getByTestId("agent-setup-section")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/ko/agents/");
  });

  /**
   * Skill-copy comparison is absent on the web (the manifest walker filters dot directories). `-`
   * means the surface lacks the capability; `0/0` means it works and found nothing; the two must not
   * collapse.
   */
  test("문서함이 웹에서는 스킬 사본 판정을 하지 않는다 — 없는 능력을 있는 척하지 않는다", async ({
    page,
  }) => {
    await gotoSettled(page, "/ko/docs/?guides=off");
    await expect(page.locator("main#main")).toHaveAttribute("data-skill-parity", "-");
  });

  test("다운로드 화면이 웹의 두 번째 일을 숨기지 않는다 (Windows 방문자)", async ({ page }) => {
    // A visitor on an OS with no app must not leave empty-handed: the Windows file button stands with the
    // unsigned marker at the point of download, and beside it is somewhere that works today.
    await gotoSettled(page, "/ko/download/");

    // ① The state of the file for your OS is known **at the point of download** —
    //    learning it only after scrolling is too late.
    const windows = page.getByTestId("gateway-hero-windows");
    await expect(windows).toBeVisible({ timeout: 15_000 });
    await expect(windows).toContainText("Windows");
    await expect(windows).toContainText(/미서명/);
    await expect(windows).toHaveAttribute("href", /github\.com/);

    // The path to what works today is on the same row: the web product at `/topology`. The
    // label-destination pairing is guarded by `tests/contract/routes/map-destination-route.contract.test.ts`.
    const web = page.getByTestId("gateway-hero-web-cta");
    await expect(web).toBeVisible();
    await expect(web).toHaveAttribute("href", /\/ko\/topology\/?$/);
  });

  test("설정의 키 자리는 에이전트 → 모델로 가고, 그곳이 브라우저에서 키를 받지 않는 이유를 말한다", async ({ page }) => {
    // The workbench is at the map address; `/` is the gateway.
    await gotoSettled(page, "/ko/topology/");

    // The settings trigger exists in both the rail and the map chrome — narrow to the rail.
    await page
      .getByTestId("app-nav-rail-utility-tier")
      .getByTestId("app-settings-trigger")
      .click();
    await page.getByTestId("app-settings-nav-agents").click();
    await page.getByTestId("app-settings-door-models").click();
    await expect(page).toHaveURL(/\/agents\/\?(?:.*&)?tab=models/);

    const card = page.getByTestId("ai-connection-web-degraded");
    await expect(card).toBeVisible({ timeout: 15_000 });
    // A rejection in principle needs a reason in plain words: scripts from another site could take the
    // key.
    await expect(card).toContainText("악성 코드");
    await expect(page.getByTestId("ai-connection-download-link")).toHaveAttribute(
      "href",
      /\/download\//,
    );
  });
});
