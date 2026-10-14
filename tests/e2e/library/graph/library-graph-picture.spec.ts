import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedFirstRunSeen } from "../../first-run-seed";
import type {
  LibraryGraphProbeEdge as ProbeEdge,
  LibraryGraphProbeLabel as ProbeLabel,
  LibraryGraphProbeNode as ProbeNode,
} from "./library-graph-probe";
import { stubDirectoryPicker } from "../../vault-picker-stub";
import { waitFrames } from "../../settle";

/**
 * Legibility at six, sixty and three hundred documents: no names cross, every mark is a mark,
 * the picture is centred, pages carry names. Screenshots are evidence, never the measurement.
 */

/** Mirrors `library-graph-view.ts`; a spec that imports the widget's own floor proves nothing. */
const MIN_SOURCE_MARK_PX = 3;
/**
 * The ceiling, mirrored on the same terms: the widest mark a folder may draw, in canvas
 * pixels, and the world radius the band tops out at. 36 is the map's own node chrome — the
 * family this picture belongs to — and the camera may take a folder no closer than that.
 */
const LIBRARY_MAX_MARK_PX = 36;
const WIDEST_MARK_WORLD_RADIUS = 9;
const NAMED_MARK_WORLD_RADIUS_MIN = 5;
/** Mirrors `LIBRARY_FIT_PADDING`: what the fit reserves on every side, in canvas pixels. */
const FIT_PADDING = 64;
/** Mirrors `SOURCE_LABEL_MIN_SCALE`: the zoom at which a file carries its own name. */
const SOURCE_LABEL_MIN_SCALE = 1.4;
/**
 * Mirrors `LEADER_MAX_MARKS`. Below it every mark that carries a name gets one, on a leader
 * if its four places are taken; above it the folder has already chosen a subset of names and
 * the collision order is what is judged instead.
 */
const LEADER_MAX_MARKS = 120;
/** The order at which every mark can carry its name at once; below it no mark is anonymous. */
const NAMES_ALL_FIT_MARKS = 30;
/**
 * Mirrors `STALE_DOT_STANDING_MAX`: how many standing amber dots a folder may draw at rest
 * before the picture says the number instead of painting it once per citation. A count of
 * unverified **citations**, never of marks — the amber ink is proportional to the dots and
 * to nothing else, measured at 6-11 canvas pixels of strict amber per dot on every fixture
 * and window below.
 */
const STALE_DOT_STANDING_MAX = 64;
/**
 * The standing amber's share of the canvas ink at rest. 4% sits between the densest legible folder
 * (2.09%) and a warning field (5.77%). At rest only: pressing `N sources changed` asks for the field.
 */
const AMBER_INK_BUDGET = 0.04;

/**
 * The three windows the Library is judged at: the 14-inch workbench, a narrow laptop, and the
 * wide external monitor whose capture is the observation G2 answers.
 */
const SIZES = [
  { name: "1512x901", width: 1512, height: 901 },
  { name: "1040x720", width: 1040, height: 720 },
  { name: "1920x1080", width: 1920, height: 1080 },
] as const;

/**
 * The legibility matrix keeps the two extremes: a mark size that drifts with the window shows there
 * first. The fit tile and stale routes do not depend on the window above `lg`, so each runs once.
 */
const [SIZE_1512, SIZE_1040, SIZE_1920] = SIZES;
const LEGIBILITY_SIZES = [SIZE_1040, SIZE_1920] as const;
const FIT_TILE_SIZES = [SIZE_1512] as const;
const STALE_ROUTE_SIZES = [SIZE_1040] as const;

/**
 * Folder shapes are written out, not read from disk: a path under `~/scratch` exists on one machine.
 * The picture depends on the graph: which files exist, which pages cite them, and the names.
 */
interface FolderShape {
  sources: readonly string[];
  /** `[slug, title, cited source names]`. A page citing nothing drawn is a loose mark. */
  pages: ReadonlyArray<readonly [string, string, readonly string[]]>;
  /** `[slug, title, kind]` — a map node a page can name. */
  concepts?: ReadonlyArray<readonly [string, string, string]>;
  /** Which concepts each page names, by page slug. */
  mentions?: Readonly<Record<string, readonly string[]>>;
}

function seedFolder(shape: FolderShape): Record<string, string> {
  const vault: Record<string, string> = {
    "project.md": ["---", "kind: project", "slug: probe", "title: Probe", "---", "", "# Probe", ""].join("\n"),
  };
  shape.sources.forEach((name, index) => {
    vault[`sources/${name}`] = `bytes for ${name}\n${"row,value\n".repeat(index + 2)}`;
  });
  (shape.concepts ?? []).forEach(([slug, title, kind], index) => {
    vault[`${slug}.md`] = [
      "---",
      `title: ${title}`,
      `kind: ${kind}`,
      `uid: 7a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c${(0x60 + index).toString(16)}`,
      "---",
      "",
      `# ${title}`,
      "",
    ].join("\n");
  });
  shape.pages.forEach(([slug, title, cites], index) => {
    const named = shape.mentions?.[slug] ?? [];
    vault[`wiki/${slug}.md`] = [
      "---",
      `title: ${title}`,
      "created_by: agent:claude",
      "compiled_at: 2026-09-11T04:20:00Z",
      "sources:",
      ...cites.map((name) => `  - sources/${name}`),
      "source_hash:",
      // A third of the pages record a hash that cannot match, so the broken-citation mark is
      // on the picture too.
      ...cites.map((name) => `  sources/${name}: ${(index % 3 === 0 ? "0" : "1").repeat(64)}`),
      "status: draft",
      `summary: ${title}.`,
      "---",
      "",
      "## Summary",
      "",
      `${title} in one line.`,
      "",
      "## Facts",
      "",
      ...named.map((concept) => `- Touches [[${concept}]].`),
      "",
      "## Decisions",
      "",
      "## Open questions",
      "",
      "## Not in sources",
      "",
    ].join("\n");
  });
  return vault;
}

const OWNER_SOURCES = [
  "chargeback-runbook.md",
  "dispute-handling-standard.docx",
  "dispute-metrics.xlsx",
  "fee-schedule.csv",
  "merchant-onboarding.html",
  "settlement-policy.md",
] as const;

const OWNER_PAGES: FolderShape["pages"] = [
  ["disputes", "Disputes", ["chargeback-runbook.md", "dispute-handling-standard.docx", "dispute-metrics.xlsx"]],
  ["merchant-onboarding", "Merchant Onboarding", ["merchant-onboarding.html"]],
  // Its one source is not in the folder, so nothing is drawn to it: this is the loose mark.
  ["refund-timing", "Refund Timing", []],
  ["settlement", "Settlement", ["settlement-policy.md", "fee-schedule.csv"]],
];

/**
 * The sixty-mark folder: twenty files, twenty-four write-ups, sixteen named concepts — one
 * large component, and one file nobody has written up. Sixty is also the width at which every
 * mark still carries its own name, so this measures the picture exactly at that edge.
 */
function sixtyMarkFolder(): FolderShape {
  const sources = [
    "risk-register.xlsx", "supplier-contract.docx", "incident-log.csv", "pricing-model.xlsx",
    "onboarding-guide.md", "sla-terms.md", "capacity-plan.csv", "audit-2026.pdf",
    "refund-policy.md", "tax-rules.csv", "payout-schedule.csv", "vendor-review.docx",
    "network-diagram.html", "retention-standard.md", "support-macros.csv", "release-plan.md",
    "field-notes.txt", "warehouse-layout.html", "carrier-rates.csv", "legacy-migration.md",
  ];
  const concepts: Array<readonly [string, string, string]> = [
    ["domains/payments", "Payments", "domain"],
    ["domains/logistics", "Logistics", "domain"],
    ["domains/support", "Support", "domain"],
    ["domains/compliance", "Compliance", "domain"],
    ["domains/pricing", "Pricing", "domain"],
    ["capabilities/payouts", "Payouts", "capability"],
    ["capabilities/refunds", "Refunds", "capability"],
    ["capabilities/routing", "Routing", "capability"],
    ["capabilities/ticketing", "Ticketing", "capability"],
    ["capabilities/audit-trail", "Audit trail", "capability"],
    ["capabilities/tax", "Tax", "capability"],
    ["capabilities/capacity", "Capacity", "capability"],
    ["capabilities/contracts", "Contracts", "capability"],
    ["capabilities/incidents", "Incidents", "capability"],
    ["capabilities/retention", "Retention", "capability"],
    ["capabilities/carriers", "Carriers", "capability"],
  ];
  const plan: Array<readonly [string, string, readonly number[], readonly number[]]> = [
    ["payout-timing", "Payout timing", [10, 9], [0, 5]],
    ["refund-windows", "Refund windows", [8, 9], [0, 6]],
    ["fee-structure", "Fee structure", [3, 9], [4, 10]],
    ["tax-treatment", "Tax treatment", [9, 3], [3, 10]],
    ["payment-risks", "Payment risks", [0, 8], [0, 3]],
    ["settlement-clock", "Settlement clock", [10, 5], [0, 5]],
    ["chargeback-path", "Chargeback path", [8, 0], [6, 9]],
    ["carrier-rates", "Carrier rates", [18, 6], [1, 15]],
    ["warehouse-flow", "Warehouse flow", [17, 6], [1, 11]],
    ["routing-rules", "Routing rules", [18, 12], [1, 7]],
    ["capacity-limits", "Capacity limits", [6, 3], [1, 11]],
    ["support-playbook", "Support playbook", [14, 4], [2, 8]],
    ["escalation-ladder", "Escalation ladder", [14, 2], [2, 13]],
    ["ticket-lifecycle", "Ticket lifecycle", [4, 14], [2, 8]],
    ["incident-review", "Incident review", [2, 5], [13, 3]],
    ["retention-rules", "Retention rules", [13, 7], [3, 14]],
    ["audit-findings", "Audit findings", [7, 13], [3, 9]],
    ["supplier-terms", "Supplier terms", [1, 11], [12, 3]],
    ["vendor-scorecard", "Vendor scorecard", [11, 1], [12, 4]],
    ["sla-commitments", "SLA commitments", [5, 2], [2, 13]],
    ["pricing-bands", "Pricing bands", [3, 18], [4, 10]],
    ["release-sequence", "Release sequence", [15, 19], [11]],
    ["migration-notes", "Migration notes", [19, 15], [11]],
    ["onboarding-path", "Onboarding path", [4, 12], [2]],
  ];
  const mentions: Record<string, readonly string[]> = {};
  for (const [slug, , , named] of plan) mentions[slug] = named.map((index) => concepts[index]![0]);
  return {
    sources,
    pages: plan.map(([slug, title, cites]) => [slug, title, cites.map((index) => sources[index]!)] as const),
    concepts,
    mentions,
  };
}

/**
 * Mirrors `opus-g2/make-vault-300.mjs`. Every file is cited by a page; consecutive pages of a
 * cluster share citation runs, so each cluster is one component rather than disconnected stars.
 */
function threeHundredMarkFolder(): FolderShape {
  const clusters = [
    ["payments", ["settlement", "payout", "chargeback", "fee-table", "dispute-log", "ledger", "reconciliation", "fx-rate"]],
    ["logistics", ["carrier-rate", "warehouse", "route-plan", "packing-list", "customs", "fleet-log", "dock-slot", "handover"]],
    ["support", ["macro", "ticket-export", "csat", "escalation", "shift-roster", "call-log", "playbook", "backlog"]],
    ["compliance", ["audit", "retention", "consent", "incident", "policy", "register", "review-note", "attestation"]],
    ["pricing", ["band", "discount", "margin", "quote", "tariff", "rebate", "price-test", "uplift"]],
    ["platform", ["runbook", "capacity", "deploy-log", "schema", "latency", "error-budget", "config", "migration"]],
  ] as const;
  const extensions = ["csv", "md", "xlsx", "pdf", "docx", "html", "txt", "json"];
  const perCluster = 50;
  const pagesPerCluster = 10;
  const sources: string[] = [];
  clusters.forEach(([key, stems], clusterIndex) => {
    for (let index = 0; index < perCluster; index += 1) {
      const serial = String(Math.floor(index / stems.length) + 1).padStart(2, "0");
      sources.push(`${key}-${stems[index % stems.length]}-${serial}.${extensions[(clusterIndex + index) % extensions.length]}`);
    }
  });
  const concepts: Array<readonly [string, string, string]> = clusters.flatMap(([key]) => [
    [`domains/${key}`, key, "domain"] as const,
    [`capabilities/${key}-work`, `${key} work`, "capability"] as const,
  ]);
  const pages: Array<readonly [string, string, readonly string[]]> = [];
  const mentions: Record<string, readonly string[]> = {};
  clusters.forEach(([key], clusterIndex) => {
    for (let within = 0; within < pagesPerCluster; within += 1) {
      const slug = `${key}-${String(within + 1).padStart(2, "0")}`;
      const cited = 6 + (within % 5);
      pages.push([
        slug,
        `${key} ${within + 1}`,
        Array.from({ length: cited }, (_, k) => sources[clusterIndex * perCluster + ((within * 5 + k) % perCluster)]!),
      ]);
      const named: string[] = [];
      if (within % 3 === 0) named.push(concepts[clusterIndex * 2 + (within % 2)]![0]);
      if (within === 1 || within === 4 || within === 7) {
        named.push(concepts[((clusterIndex + 1) % clusters.length) * 2]![0]);
      }
      if (named.length > 0) mentions[slug] = named;
    }
  });
  return { sources, pages, concepts, mentions };
}

const FIXTURES = [
  {
    name: "vault",
    shape: (): FolderShape => ({
      sources: OWNER_SOURCES,
      pages: [
        ...OWNER_PAGES,
        ["settlement-ko", "정산 일정과 수수료", ["settlement-policy.md", "fee-schedule.csv"]],
        [
          "answers/how-long-do-we-keep-dispute-records",
          "How long do we keep dispute records?",
          ["dispute-handling-standard.docx", "chargeback-runbook.md"],
        ],
      ],
    }),
  },
  { name: "vault-60", shape: sixtyMarkFolder },
  { name: "vault-300", shape: threeHundredMarkFolder },
] as const;

async function openGraph(page: Page, seed: Record<string, string>): Promise<void> {
  await seedFirstRunSeen(page);
  await stubDirectoryPicker(page, seed);
  await page.goto("/en/library/?guides=off&e2e=1");
  await page.getByTestId("library-open-vault").click();
  /* Own timeout: the 300-file folder is written into OPFS and read back before anything is drawn. */
  await expect(page.getByTestId("library-graph-canvas")).toBeVisible({ timeout: 60_000 });
  await expect
    .poll(async () => page.evaluate(() => window.__atlasLibraryGraph?.nodes().length ?? 0), {
      timeout: 20_000,
    })
    .toBeGreaterThan(3);
  await expect
    .poll(async () => page.evaluate(() => window.__atlasLibraryGraph?.alpha() ?? 1), { timeout: 20_000 })
    .toBeLessThan(0.01);
  // The flow layout is laid, not settled, so the alpha is 0 from the first frame; the marks
  // still travel while the camera eases to its fit, and a press aimed at a mark read
  // mid-journey lands on canvas.
  await expect
    .poll(async () => page.evaluate(() => window.__atlasLibraryGraph?.arriving() ?? true), { timeout: 20_000 })
    .toBe(false);
  // One more frame after the settle, so `labels()` holds the resting placement. A frame
  // is the unit; 120 ms was this machine's estimate of one.
  await waitFrames(page, 2);
  await settleToRest(page);
}

/**
 * **Waits for the picture the home spends its life in, rather than racing the arrival.**
 *
 * Every resting bar below is about the state a folder is in when nobody is touching it, and
 * two things sit between "the simulation has settled" and that state:
 *
 * 1. **The home's own breath** — `pulseRef.homeAt`, exposed as `flow().pulsing`, grows every
 *    standing dot from `STALE_DOT_RADIUS` to `STALE_DOT_RADIUS + STALE_DOT_BREATH` for two
 *    settle budgets, once per visit. That is 2.25x the disc's area, and more than that in
 *    strict-amber pixels, because a small disc's edge is mostly partial coverage and growing
 *    it turns those pixels into interior.
 * 2. **The dim ramp.** `focus` is deliberately kept while it runs back out, so the un-dim is
 *    not a hard cut; past the standing cap a dot rides that same eased value, so the
 *    neighbourhood a press or a pointer established fades rather than cutting.
 *
 * Neither wait is a sleep: `pulsing` is a condition the canvas publishes, and the second is
 * two reads of the same pixel statistic that agree. A picture that never stops changing
 * fails on the timeout rather than being measured mid-ramp, and one that is wrongly amber
 * stabilises at that number, so the bars still fire — each was re-probed red through here.
 */
async function settleToRest(page: Page): Promise<void> {
  const box = await page.getByTestId("library-graph-canvas").boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, Math.max(0, box.y - 24));
  await expect
    .poll(() => page.evaluate(() => window.__atlasLibraryGraph?.flow()?.pulsing ?? false), {
      timeout: 20_000,
    })
    .toBe(false);
  /*
   * And the canvas has stopped changing: two reads of the same pixel statistic, six frames
   * apart, that agree. A picture that never stops changing fails on the timeout rather than
   * being measured mid-ramp, and one that is wrongly amber stabilises at that number, so the
   * bars below still fire.
   */
  let previous = -1;
  await expect
    .poll(
      async () => {
        const now = (await canvasInk(page)).mark;
        const stable = now === previous;
        previous = now;
        if (!stable) await waitFrames(page, 6);
        return stable;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}

/**
 * Counts amber, mark and total ink inside the page in one pass; `ImageData` over CDP costs ~12s.
 * `amber` and `ink` keep the original measurement script's predicates so figures stay comparable.
 */
interface CanvasInk {
  /** Every strict-amber pixel on the canvas — 122's own scan, unmodified. */
  amber: number;
  /** Of those, the ones inside a placed name's box: the text engine's, not the mark's. */
  amberInNames: number;
  /** Of those, the ones that are a mark. This is what the bars below are stated in. */
  mark: number;
  /** Canvas pixels brighter than luma 30 — 122's `inkPixels`. */
  ink: number;
  /** `mark / ink`: the share the standing amber holds of the picture. */
  share: number;
  /** How many names the window placed, so the artefact above can be divided by it. */
  names: number;
}

async function canvasInk(page: Page): Promise<CanvasInk> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="library-graph-canvas"]');
    const context = canvas?.getContext("2d");
    const probe = window.__atlasLibraryGraph;
    if (!canvas || !context || !probe) {
      return { amber: -1, amberInNames: -1, mark: -1, ink: -1, share: -1, names: -1 };
    }
    /*
     * One pixel of slack around each box, because a glyph's antialiasing may sit a fraction
     * outside the box the renderer measured for it.
     */
    const boxes = probe.labels().map((label) => ({
      left: label.x - 1,
      right: label.x + label.width + 1,
      top: label.y - 1,
      bottom: label.y + label.height + 1,
    }));
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const width = canvas.width;
    let amber = 0;
    let amberInNames = 0;
    let ink = 0;
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index]!;
      const green = data[index + 1]!;
      const blue = data[index + 2]!;
      if (0.2126 * red + 0.7152 * green + 0.0722 * blue > 30) ink += 1;
      if (red > 190 && green > 140 && green < 210 && blue < 120) {
        amber += 1;
        const pixel = index / 4;
        const x = pixel % width;
        const y = (pixel - x) / width;
        if (boxes.some((box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)) {
          amberInNames += 1;
        }
      }
    }
    const mark = amber - amberInNames;
    return { amber, amberInNames, mark, ink, share: ink === 0 ? 0 : mark / ink, names: boxes.length };
  });
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Picture {
  canvas: { width: number; height: number };
  nodes: ProbeNode[];
  edges: ProbeEdge[];
  labels: ProbeLabel[];
  boxes: Box[];
  crossings: number;
  bboxFill: number;
  fillX: number;
  fillY: number;
  tallestEmptyBand: number;
  tallestEmptyColumn: number;
  cellOccupancy: number;
  maxNodeDiameter: number;
  labelOverlaps: Array<[string, string]>;
  labelsOverMarks: Array<[string, string]>;
  namedFraction: number;
  labelFontPx: number[];
  /** The camera's scale after the fit — clamped into `[LIBRARY_ZOOM_MIN, the folder's ceiling]`. */
  viewScale: number;
  /** The scale the fit was allowed to take: the canvas's own wish, clamped the same way. */
  allowedScale: number;
  /** This folder's ceiling: the camera at which its widest mark is `LIBRARY_MAX_MARK_PX`. */
  ceiling: number;
  /** Marks that carry a name at this zoom and did not get one. */
  anonymous: string[];
  /** The smallest source square drawn, across, in canvas pixels. */
  minSourceMarkPx: number;
  /** The largest mark drawn, across — a page's widest disc. */
  maxNodeDiameterPx: number;
  /** How far the marks' centre of mass sits from the canvas's centre, as a fraction of it. */
  centreOfMassOffset: number;
  /** The furthest group of the folder from the picture's middle, over the picture's radius. */
  componentSpread: number;
  /** How far the picture's bounding box sits from the canvas's centre, as a fraction of it. */
  pictureCentreOffset: number;
  /** Per flow column, how far its marks' vertical midpoint sits from the canvas's middle, over the canvas height. */
  columnOffsets: Array<{ kind: string; offset: number }>;
  /** Whether the flow columns stand left to right in the order files, pages, concepts. */
  columnsInOrder: boolean;
  /** The flow columns as the engine laid them, or null under the force layout. */
  layout: { rowGap: number; columns: Array<{ kind: string; x: number; grid: number; count: number }> } | null;
  /** How many connected groups the folder drew. */
  componentCount: number;
  /** Of the folder's pages, how many carry their own name. */
  pagesNamed: { named: number; total: number };
  /**
   * Whether every named page is at least as busy as every unnamed one — the claim that a
   * collision is always resolved against the quieter of the two.
   */
  /** Mean citation count of the named pages, and of the unnamed ones. */
  namedPageWeight: { named: number; unnamed: number };
}

/** Runs of the canvas's height that no box covers, in CSS px. */
function emptyRuns(boxes: readonly Box[], extent: number, axis: "y" | "x"): number[] {
  const covered = new Uint8Array(Math.ceil(extent));
  for (const box of boxes) {
    const from = Math.max(0, Math.floor(axis === "y" ? box.y : box.x));
    const to = Math.min(covered.length, Math.ceil(axis === "y" ? box.y + box.height : box.x + box.width));
    for (let index = from; index < to; index += 1) covered[index] = 1;
  }
  const runs: number[] = [];
  let run = 0;
  for (let index = 0; index < covered.length; index += 1) {
    if (covered[index] === 0) run += 1;
    else if (run > 0) {
      runs.push(run);
      run = 0;
    }
  }
  if (run > 0) runs.push(run);
  return runs;
}

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function measure(page: Page): Promise<Picture> {
  const raw = await page.evaluate(() => {
    const probe = window.__atlasLibraryGraph!;
    const view = probe.view();
    return {
      nodes: probe.nodes(),
      edges: probe.edges(),
      labels: probe.labels(),
      layout: probe.layout(),
      width: view.width,
      height: view.height,
      scale: view.scale,
    };
  });
  const canvas = { width: raw.width, height: raw.height };
  const markBoxes: Box[] = raw.nodes
    .filter((node) => Number.isFinite(node.x) && Number.isFinite(node.y))
    .map((node) => ({
      x: node.x - node.radius,
      y: node.y - node.radius,
      width: node.radius * 2,
      height: node.radius * 2,
    }));
  const labelBoxes: Box[] = raw.labels.map((label) => ({
    x: label.x,
    y: label.y,
    width: label.width,
    height: label.height,
  }));
  /*
   * **A line's own boxes.** Each edge is sampled along the straight chord between its
   * endpoints and the samples become small boxes, so the rows and columns a citation passes
   * through count as covered. The chord under-counts: the drawn edge bows away from it by up
   * to 17px, so every box here is one the picture really does paint.
   */
  const byId = new Map(raw.nodes.map((node) => [node.id, node]));
  const edgeBoxes: Box[] = [];
  for (const edge of raw.edges) {
    const from = byId.get(edge.source);
    const to = byId.get(edge.target);
    if (!from || !to || !Number.isFinite(from.x) || !Number.isFinite(to.x)) continue;
    const steps = Math.max(2, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 3));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      edgeBoxes.push({
        x: from.x + (to.x - from.x) * t - 1,
        y: from.y + (to.y - from.y) * t - 1,
        width: 2,
        height: 2,
      });
    }
  }
  const boxes = [...markBoxes, ...labelBoxes, ...edgeBoxes];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    maxX = Math.max(maxX, box.x + box.width);
    minY = Math.min(minY, box.y);
    maxY = Math.max(maxY, box.y + box.height);
  }
  const spanX = Math.max(0, maxX - minX);
  const spanY = Math.max(0, maxY - minY);

  // A fixed 6×4 grid: a hole in the middle of the picture that one stray mark keeps out of
  // the band statistic still empties four cells.
  const columns = 6;
  const rows = 4;
  const occupied = new Set<number>();
  for (const box of boxes) {
    const fromColumn = Math.max(0, Math.floor((box.x / canvas.width) * columns));
    const toColumn = Math.min(columns - 1, Math.floor(((box.x + box.width) / canvas.width) * columns));
    const fromRow = Math.max(0, Math.floor((box.y / canvas.height) * rows));
    const toRow = Math.min(rows - 1, Math.floor(((box.y + box.height) / canvas.height) * rows));
    for (let column = fromColumn; column <= toColumn; column += 1) {
      for (let row = fromRow; row <= toRow; row += 1) occupied.add(row * columns + column);
    }
  }

  const labelOverlaps: Array<[string, string]> = [];
  for (let a = 0; a < raw.labels.length; a += 1) {
    for (let b = a + 1; b < raw.labels.length; b += 1) {
      if (intersects(labelBoxes[a]!, labelBoxes[b]!)) {
        labelOverlaps.push([raw.labels[a]!.nodeId, raw.labels[b]!.nodeId]);
      }
    }
  }
  const labelsOverMarks: Array<[string, string]> = [];
  raw.labels.forEach((label, index) => {
    raw.nodes.forEach((node, nodeIndex) => {
      if (node.id === label.nodeId) return;
      if (!Number.isFinite(node.x)) return;
      if (intersects(labelBoxes[index]!, markBoxes[nodeIndex] ?? { x: 0, y: 0, width: 0, height: 0 })) {
        labelsOverMarks.push([label.nodeId, node.id]);
      }
    });
  });

  /*
   * **Crossings**, the readability number the design router asks for on a topology change:
   * two chords that cross and do not share an endpoint. Counted on the chords for the same
   * reason the coverage is — every edge on this canvas bows the same way and by the same
   * rule, so two chords that do not cross cannot become two curves that do.
   */
  let crossings = 0;
  const side = (a: ProbeNode, b: ProbeNode, c: ProbeNode): number =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  for (let a = 0; a < raw.edges.length; a += 1) {
    for (let b = a + 1; b < raw.edges.length; b += 1) {
      const first = raw.edges[a]!;
      const second = raw.edges[b]!;
      const shared =
        first.source === second.source ||
        first.source === second.target ||
        first.target === second.source ||
        first.target === second.target;
      if (shared) continue;
      const p1 = byId.get(first.source);
      const p2 = byId.get(first.target);
      const p3 = byId.get(second.source);
      const p4 = byId.get(second.target);
      if (!p1 || !p2 || !p3 || !p4) continue;
      const d1 = side(p1, p2, p3);
      const d2 = side(p1, p2, p4);
      const d3 = side(p3, p4, p1);
      const d4 = side(p3, p4, p2);
      if (d1 * d2 < 0 && d3 * d4 < 0) crossings += 1;
    }
  }

  /*
   * **The groups of the folder, and where each of them stands.** The composition is a rosette
   * around the centre (`library-graph-packing.ts`), so what this measures is the claim that
   * replaced the occupancy search: no group is thrown to a wall.
   */
  const parent = new Map<string, string>();
  for (const node of raw.nodes) parent.set(node.id, node.id);
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  for (const edge of raw.edges) {
    if (!parent.has(edge.source) || !parent.has(edge.target)) continue;
    const a = find(edge.source);
    const b = find(edge.target);
    if (a !== b) parent.set(a, b);
  }
  const groups = new Map<string, ProbeNode[]>();
  for (const node of raw.nodes) {
    if (!Number.isFinite(node.x)) continue;
    const root = find(node.id);
    const held = groups.get(root);
    if (held) held.push(node);
    else groups.set(root, [node]);
  }
  const pictureCentre = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const pictureRadius = Math.max(1, Math.hypot(spanX, spanY) / 2);
  const pictureCentreOffset = Math.hypot(
    (pictureCentre.x - canvas.width / 2) / Math.max(1, canvas.width),
    (pictureCentre.y - canvas.height / 2) / Math.max(1, canvas.height),
  );
  /*
   * **Every column of the flow picture stands level with the canvas's middle.** The layout
   * re-centres each column on the picture's middle after the barycentre pass, so the
   * midpoint of a column's marks — not their mean, which a busy top would skew — is what
   * says whether a column drifted; and the columns keep their order, files to the left of
   * pages to the left of concepts, or the picture is not reading left to right.
   */
  const columnOffsets: Array<{ kind: string; offset: number }> = [];
  let columnsInOrder = true;
  if (raw.layout) {
    const byKind = new Map<string, ProbeNode[]>();
    for (const node of raw.nodes) {
      if (!Number.isFinite(node.x)) continue;
      const held = byKind.get(node.kind);
      if (held) held.push(node);
      else byKind.set(node.kind, [node]);
    }
    let lastX = Number.NEGATIVE_INFINITY;
    for (const column of raw.layout.columns) {
      const members = byKind.get(column.kind) ?? [];
      if (members.length === 0) continue;
      const top = Math.min(...members.map((node) => node.y));
      const bottom = Math.max(...members.map((node) => node.y));
      columnOffsets.push({ kind: column.kind, offset: Math.abs((top + bottom) / 2 - canvas.height / 2) / Math.max(1, canvas.height) });
      const meanX = members.reduce((sum, node) => sum + node.x, 0) / members.length;
      if (meanX <= lastX) columnsInOrder = false;
      lastX = meanX;
    }
  }
  let componentSpread = 0;
  for (const members of groups.values()) {
    const cx = members.reduce((sum, node) => sum + node.x, 0) / members.length;
    const cy = members.reduce((sum, node) => sum + node.y, 0) / members.length;
    componentSpread = Math.max(componentSpread, Math.hypot(cx - pictureCentre.x, cy - pictureCentre.y) / pictureRadius);
  }

  const placed = raw.nodes.filter((node) => Number.isFinite(node.x));
  const massX = placed.reduce((sum, node) => sum + node.x, 0) / Math.max(1, placed.length);
  const massY = placed.reduce((sum, node) => sum + node.y, 0) / Math.max(1, placed.length);
  const centreOfMassOffset = Math.hypot(
    (massX - canvas.width / 2) / Math.max(1, canvas.width),
    (massY - canvas.height / 2) / Math.max(1, canvas.height),
  );

  /*
   * **The fit the camera was allowed to take**, recomputed here from the drawn picture.
   *
   * The world span is the drawn span divided by the scale, so this spec can ask the same
   * question `fitView` asks — *how close may this folder come* — without importing it. It is
   * what turns the fill finding into a falsifiable claim: the picture is as large as the
   * rule permits, or the rule is what is wrong. Inspection 122's S1 measured the opposite,
   * a picture at 38% of its canvas with the camera still 25% short of its own ceiling.
   */
  const widestWorldRadius = Math.max(
    0,
    ...raw.nodes.map((node) => node.radius / Math.max(1e-6, raw.scale)),
  );
  const ceiling =
    LIBRARY_MAX_MARK_PX / (2 * Math.max(NAMED_MARK_WORLD_RADIUS_MIN, widestWorldRadius));
  // Centres, not extents: `librarySimulationBounds` is the fit's own input and it bounds
  // the marks' positions. The padding is what covers their radii and their names.
  const centreSpanX = Math.max(...raw.nodes.map((node) => node.x)) - Math.min(...raw.nodes.map((node) => node.x));
  const centreSpanY = Math.max(...raw.nodes.map((node) => node.y)) - Math.min(...raw.nodes.map((node) => node.y));
  const wanted = Math.min(
    Math.max(1, canvas.width - FIT_PADDING * 2) / Math.max(1e-6, centreSpanX / raw.scale),
    Math.max(1, canvas.height - FIT_PADDING * 2) / Math.max(1e-6, centreSpanY / raw.scale),
  );
  const allowedScale = Math.min(ceiling, Math.max(MIN_SOURCE_MARK_PX / 7, wanted));

  /*
   * **Who was left anonymous.** A page always carries its name; a file and a concept carry
   * theirs once the camera is past `SOURCE_LABEL_MIN_SCALE`. Anything in that set without a
   * label box is a mark a person cannot ask a question about.
   */
  const namedAlready = new Set(raw.labels.map((label) => label.nodeId));
  // A folded file band (`FlowColumn.grid` above one) stands its squares 24px apart at the
  // ceiling: no room for a name, so its files carry theirs only once the person has zoomed
  // the band open (`FOLDED_LABEL_MIN_SCALE` in the engine), not at the source threshold.
  const foldedFiles = (raw.layout?.columns.find((column) => column.kind === "source")?.grid ?? 1) > 1;
  const anonymous = raw.nodes
    .filter((node) => Number.isFinite(node.x))
    .filter((node) => node.kind === "page" || (raw.scale >= SOURCE_LABEL_MIN_SCALE && !(node.kind === "source" && foldedFiles)))
    .filter((node) => !namedAlready.has(node.id))
    .map((node) => node.id);

  const sourceMarks = raw.nodes.filter((node) => node.kind === "source");
  const pages = raw.nodes.filter((node) => node.kind === "page");
  const namedIds = new Set(raw.labels.map((label) => label.nodeId));
  const pagesNamed = { named: pages.filter((page) => namedIds.has(page.id)).length, total: pages.length };
  /*
   * A page's radius **is** its citation count (`libraryMarkRadii`), so the busiest page is
   * the widest mark. The claim is about the *pass's order*, not about every individual pair:
   * a name can also lose because the four places it may stand are all off the frame, which is
   * a fact about where its dot sits rather than about how busy it is. So the two populations
   * are compared by mean.
   */
  const meanRadius = (held: readonly ProbeNode[]): number =>
    held.length === 0 ? 0 : held.reduce((sum, node) => sum + node.radius, 0) / held.length;

  return {
    canvas,
    nodes: raw.nodes,
    edges: raw.edges,
    labels: raw.labels,
    boxes,
    crossings,
    bboxFill: canvas.width * canvas.height > 0 ? (spanX * spanY) / (canvas.width * canvas.height) : 0,
    fillX: spanX / canvas.width,
    fillY: spanY / canvas.height,
    tallestEmptyBand: Math.max(0, ...emptyRuns(boxes, canvas.height, "y")),
    tallestEmptyColumn: Math.max(0, ...emptyRuns(boxes, canvas.width, "x")),
    cellOccupancy: occupied.size / (columns * rows),
    maxNodeDiameter: Math.max(0, ...raw.nodes.map((node) => node.radius * 2)),
    labelOverlaps,
    labelsOverMarks,
    namedFraction: raw.nodes.length > 0 ? raw.labels.length / raw.nodes.length : 0,
    labelFontPx: [...new Set(raw.labels.map((label) => label.fontPx))].sort((a, b) => a - b),
    viewScale: raw.scale,
    allowedScale,
    ceiling,
    anonymous,
    minSourceMarkPx: sourceMarks.length > 0 ? Math.min(...sourceMarks.map((node) => node.radius * 2)) : Infinity,
    maxNodeDiameterPx: Math.max(0, ...raw.nodes.map((node) => node.radius * 2)),
    centreOfMassOffset,
    componentSpread,
    pictureCentreOffset,
    columnOffsets,
    columnsInOrder,
    layout: raw.layout,
    componentCount: groups.size,
    pagesNamed,
    namedPageWeight: {
      named: meanRadius(pages.filter((page) => namedIds.has(page.id))),
      unnamed: meanRadius(pages.filter((page) => !namedIds.has(page.id))),
    },
  };
}

const outDir = process.env.ATLAS_PICTURE_OUT;

/**
 * **The legend under the canvas answers the state the canvas is in.**
 *
 * With a card open it went on reading *press a dot for a card beside it* — instructions for
 * the thing that had already happened (inspection 122, S19). What a reader still needs while
 * the card stands there is the mark vocabulary, so that half is kept verbatim and only the
 * gesture clause is swapped for the two ways back out.
 *
 * Run in the browser rather than in jsdom because the state it is about — *a card open with
 * nothing under the pointer* — is reached by pressing a painted mark and then taking the
 * pointer off the canvas, and both of those are hit tests against a real frame.
 */
test("the legend swaps its gesture for the way out while a card is open", async ({ page }) => {
  await page.setViewportSize({ width: 1512, height: 901 });
  await openGraph(page, seedFolder(FIXTURES[0]!.shape()));
  const hint = page.getByTestId("library-graph-hint");
  await expect(hint).toContainText("press a dot for a card beside it");

  const canvas = page.getByTestId("library-graph-canvas");
  const box = (await canvas.boundingBox())!;
  const mark = (await page.evaluate(() => {
    const nodes = window.__atlasLibraryGraph!.nodes().filter((node) => node.kind === "page");
    // The busiest page: the widest mark on the picture, so the press cannot miss it.
    return nodes.sort((first, second) => second.radius - first.radius)[0]!;
  }))!;
  await page.mouse.click(box.x + mark.x, box.y + mark.y);
  await expect(page.getByTestId("library-graph-card")).toBeVisible();

  // Pointer off the canvas: no mark is active, so this line is the legend's again.
  await page.mouse.move(box.x + box.width / 2, box.y - 40);
  await expect(hint).not.toContainText("press a dot for a card beside it");
  await expect(hint).toContainText("close the card");
  await expect(hint).toContainText("a square a source");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("library-graph-card")).toBeHidden();
  await expect(hint).toContainText("press a dot for a card beside it");
});

/**
 * **The fit tile never answers a press with the same pixels.**
 *
 * Inspection 122 pressed it twice on the Library home and measured a **pixel-identical
 * frame — 0 changed pixels above a threshold of 8** (S1). The picture was already framed, so
 * there was nothing for the press to do; what was wrong was that it was still offered. The
 * tile re-frames from any camera a person has taken, and with nothing to re-frame it takes
 * the disabled grammar `ChromeTile` already owns.
 *
 * Three claims, in one session on one folder: offered exactly when the camera is off the
 * fit, moving the picture when pressed, and back to not-offered afterwards.
 */
for (const size of FIT_TILE_SIZES) {
  test(`the fit tile only offers a press that moves the picture at ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openGraph(page, seedFolder(FIXTURES[0]!.shape()));
    const tile = page.getByTestId("library-graph-fit");
    const canvas = page.getByTestId("library-graph-canvas");

    // Framed on arrival: the press would repaint the same pixels, so it is not offered.
    await expect(tile).toBeDisabled();
    await expect(tile).toHaveAttribute("data-framed", "true");
    const framedShot = await canvas.screenshot();

    /*
     * Take the camera by hand — a wheel over the canvas, which is the gesture a person uses
     * — and the tile becomes the way back.
     */
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 240);
    await expect(tile).toBeEnabled();
    const movedShot = await canvas.screenshot();
    expect(movedShot.equals(framedShot), "the wheel did not move the picture, so this case proves nothing").toBe(
      false,
    );

    await tile.click();
    /*
     * The travel is eased, so what is waited for is the landing: the tile stops offering
     * again exactly when the camera has arrived at the fit.
     */
    await expect(tile).toBeDisabled({ timeout: 5_000 });
    const backShot = await canvas.screenshot();
    expect(backShot.equals(movedShot), "the fit tile was pressed and the picture did not move").toBe(false);
    // And it landed on the fit, not merely somewhere else.
    expect(
      await page.evaluate(() => window.__atlasLibraryGraph?.view().scale ?? 0),
      "the press moved the camera somewhere that is not the fit",
    ).toBeCloseTo(await measure(page).then((picture) => picture.allowedScale), 2);
  });
}

/**
 * Past the standing cap a stale citation stays one press away: the strip's `N sources changed` toggle,
 * a page card, or the pointer. Run at 1040 only: the strip folds its non-lead clauses below `lg`.
 */
for (const size of STALE_ROUTE_SIZES) {
  test(`a stale citation on the three-hundred-source folder is one press away at ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openGraph(page, seedFolder(FIXTURES.find((fixture) => fixture.name === "vault-300")!.shape()));
    const graph = page.getByTestId("library-graph-canvas");

    // The state the home spends its life in: 480 unverified citations and a calm picture.
    const resting = await canvasInk(page);
    const stale = await page.evaluate(
      () => window.__atlasLibraryGraph!.edges().filter((edge) => edge.certainty === "unverified").length,
    );
    expect(stale, "this folder no longer crosses the standing cap, so the case proves nothing").toBeGreaterThan(
      STALE_DOT_STANDING_MAX,
    );
    expect(resting.mark, "the folder is past the cap and still painting a field of amber").toBe(0);

    // ── 1. The clause. ──
    const clause = page.getByTestId("library-strip-stale");
    await expect(clause, "the count that replaces the dots is not on the screen").toBeVisible();
    // It carries a number, which is what the dots stop saying 480 times.
    await expect(clause).toContainText(/\d+/);
    await clause.click();
    await expect(clause).toHaveAttribute("aria-pressed", "true");
    await waitFrames(page, 6);
    const lit = await canvasInk(page);
    expect(
      lit.mark,
      "the clause was pressed and no stale citation lit: the count leads nowhere",
    ).toBeGreaterThan(0);
    // And the legend says what is lit, with both counts, so the picture can be checked.
    await expect(page.getByTestId("library-graph-hint")).toContainText("lit");
    if (outDir) {
      await graph.screenshot({ path: join(outDir, `vault-300-${size.name}-lit.png`) });
      await page.screenshot({ path: join(outDir, `vault-300-${size.name}-lit-window.png`) });
    }

    // The same press lifts it, and the canvas goes back to calm.
    await clause.click();
    await expect(clause).toHaveAttribute("aria-pressed", "false");
    await settleToRest(page);
    expect((await canvasInk(page)).mark, "the lit state did not lift").toBe(0);

    // ── 2. The card. ──
    const box = (await graph.boundingBox())!;
    const busiest = (await page.evaluate(() => {
      const probe = window.__atlasLibraryGraph!;
      const staleEnds = new Set<string>();
      for (const edge of probe.edges()) {
        if (edge.certainty !== "unverified") continue;
        staleEnds.add(edge.source);
      }
      const pages = probe.nodes().filter((node) => node.kind === "page" && staleEnds.has(node.id));
      return pages.sort((first, second) => second.radius - first.radius)[0] ?? null;
    }))!;
    expect(busiest, "no page on this folder carries an unverified citation").not.toBeNull();
    await page.mouse.click(box.x + busiest.x, box.y + busiest.y);
    await expect(page.getByTestId("library-graph-card")).toBeVisible();
    await waitFrames(page, 6);
    const withCard = await canvasInk(page);
    expect(
      withCard.mark,
      "a card is open on a page whose citations are unverified and no amber dot is drawn, so its own sentence names a mark nobody can see",
    ).toBeGreaterThan(0);
    // The card's sentence is the one that names the mark; it must be the one printed.
    await expect(page.getByTestId("library-graph-card-flow")).toContainText("amber dot");

    if (outDir) {
      await graph.screenshot({ path: join(outDir, `vault-300-${size.name}-card.png`) });
      await page.screenshot({ path: join(outDir, `vault-300-${size.name}-card-window.png`) });
    }

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("library-graph-card")).toBeHidden();
    // The pointer is off the mark and the dim has ramped out: calm again, and measurably so.
    await settleToRest(page);
    expect(
      (await canvasInk(page)).mark,
      "the dots stayed behind after the card closed and the pointer left",
    ).toBe(0);
  });
}

for (const fixture of FIXTURES) {
  for (const size of LEGIBILITY_SIZES) {
    test(`the ${fixture.name} picture stays legible at ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openGraph(page, seedFolder(fixture.shape()));
      const picture = await measure(page);
      const pixels = await canvasInk(page);
      const staleEdges = picture.edges.filter((edge) => edge.certainty === "unverified").length;

      if (outDir) {
        const stem = `${fixture.name}-${size.name}`;
        await page
          .getByTestId("library-graph-canvas")
          .screenshot({ path: join(outDir, `${stem}.png`) });
        await page.screenshot({ path: join(outDir, `${stem}-window.png`) });
        const { writeFileSync } = await import("node:fs");
        writeFileSync(
          join(outDir, `${stem}.json`),
          `${JSON.stringify(
            {
              fixture: fixture.name,
              size: size.name,
              canvas: picture.canvas,
              nodes: picture.nodes.length,
              edges: picture.edges.length,
              labels: picture.labels.length,
              crossings: picture.crossings,
              bboxFill: Number(picture.bboxFill.toFixed(4)),
              fillX: Number(picture.fillX.toFixed(4)),
              fillY: Number(picture.fillY.toFixed(4)),
              tallestEmptyBand: picture.tallestEmptyBand,
              tallestEmptyColumn: picture.tallestEmptyColumn,
              cellOccupancy: Number(picture.cellOccupancy.toFixed(4)),
              maxNodeDiameter: Number(picture.maxNodeDiameter.toFixed(2)),
              labelFontPx: picture.labelFontPx,
              labelOverlaps: picture.labelOverlaps,
              labelsOverMarks: picture.labelsOverMarks,
              namedFraction: Number(picture.namedFraction.toFixed(3)),
              viewScale: Number(picture.viewScale.toFixed(4)),
              allowedScale: Number(picture.allowedScale.toFixed(4)),
              ceiling: Number(picture.ceiling.toFixed(4)),
              anonymous: picture.anonymous,
              amberPixels: pixels.mark,
              amberPixelsWithNames: pixels.amber,
              amberPixelsInNames: pixels.amberInNames,
              inkPixels: pixels.ink,
              amberInkShare: Number(pixels.share.toFixed(4)),
              staleEdges,
              minSourceMarkPx: Number(picture.minSourceMarkPx.toFixed(2)),
              maxNodeDiameterPx: Number(picture.maxNodeDiameterPx.toFixed(2)),
              centreOfMassOffset: Number(picture.centreOfMassOffset.toFixed(4)),
              componentSpread: Number(picture.componentSpread.toFixed(4)),
              componentCount: picture.componentCount,
              pagesNamed: picture.pagesNamed,
              namedPageWeight: {
                named: Number(picture.namedPageWeight.named.toFixed(2)),
                unnamed: Number(picture.namedPageWeight.unnamed.toFixed(2)),
              },
              marks: picture.nodes.map((node) => ({
                id: node.id,
                kind: node.kind,
                x: Number(node.x.toFixed(1)),
                y: Number(node.y.toFixed(1)),
                radius: Number(node.radius.toFixed(2)),
              })),
            },
            null,
            2,
          )}\n`,
        );
      }

      // ── Legibility, not fill. ──
      /*
       * **What each bar is, and what it is stated against.**
       *
       * Before this change, at 1512×901: the six-document folder wore 34px marks and the
       * 372-mark folder had no measurement at all, because the fixture did not exist. After,
       * the same three folders at three windows measure a mark band of 10–18.5px at every one
       * of them, and the picture's size stops being a function of the window.
       */
      expect(picture.nodes.length, "the folder drew nothing").toBeGreaterThan(3);

      // ── The names. ──
      expect(picture.labelOverlaps, "two names cross each other").toEqual([]);
      /*
       * A name that loses all four places goes out on a leader instead of being dropped, so no mark is
       * anonymous on a folder of `NAMES_ALL_FIT_MARKS` or fewer, and at most one on the sixty-mark folder.
       */
      if (picture.nodes.length <= NAMES_ALL_FIT_MARKS) {
        expect(picture.anonymous, "a mark that carries a name at this zoom was left without one").toEqual([]);
      } else if (picture.nodes.length <= LEADER_MAX_MARKS) {
        expect(
          picture.anonymous.length,
          "more than one mark carrying a name was left without one",
        ).toBeLessThanOrEqual(1);
      }
      expect(picture.labelsOverMarks, "a name sits on a mark it does not belong to").toEqual([]);
      // `--text-label` (11) for a page, `--text-caption` (9.5) for a file or a concept. A
      // page's name is never the smaller of the two on one canvas.
      for (const font of picture.labelFontPx) expect(font).toBeGreaterThanOrEqual(9.5);
      /*
       * **How many write-ups are named, and which ones.**
       *
       * Naming all sixty write-ups of a three-hundred-file folder at the fitted zoom is not a
       * bar that can be met: sixty names at about 100px each need 6,000px of width inside a
       * picture 700px across. What can be met is that *enough* of them are named for a person
       * to read the folder off the home, and that the ones that survive are the busiest —
       * which is what makes the subset a policy rather than an accident. The `/ui-proof`
       * task the same round runs is "name three write-ups in ten seconds", so eight is the
       * floor here and the mean-weight comparison is the ordering claim.
       */
      expect(picture.pagesNamed.named, "fewer than eight write-ups carry their own name").toBeGreaterThanOrEqual(
        Math.min(8, picture.pagesNamed.total),
      );
      /*
       * ⚠️ **A tolerance, and the reason is geometric rather than a fudge.** The pass asks the
       * busiest page first, so it keeps the room — but a page in the crowded middle of a
       * cluster can have all four of its places taken by *marks*, while a quieter page on the
       * rim has three free. On the 372-mark folder at 1512 that lands the two means at 6.55
       * against 6.60, a ratio of 0.991: the named set is not the busy half, it is *not the
       * quiet half either*, which is the claim. A pass that had lost its ordering measures far
       * below this — the same folder with the rank reversed measures 0.86.
       */
      expect(
        picture.namedPageWeight.named / Math.max(1e-6, picture.namedPageWeight.unnamed),
        "the named write-ups are systematically quieter than the unnamed ones, so the priority is inverted",
      ).toBeGreaterThanOrEqual(0.97);

      /*
       * A flat fill percentage cannot be the bar: it would make marks larger on larger windows. The fit must
       * take all the camera it is allowed: scale is the canvas's wish clamped into the folder's band.
       */
      expect(
        picture.viewScale,
        "the fit stopped short of the camera this folder is allowed, so the canvas is emptier than the rule asks",
      ).toBeCloseTo(picture.allowedScale, 2);
      expect(
        picture.maxNodeDiameterPx,
        "a mark is wider than a map node, which is the balloon the ceiling exists to stop",
      ).toBeLessThanOrEqual(LIBRARY_MAX_MARK_PX + 1e-6);
      /*
       * A folder small enough to fit sits against the ceiling, so its widest mark is the same size at every
       * window. This bar also stops growing the world to fill the canvas.
       */
      if (picture.nodes.length <= NAMES_ALL_FIT_MARKS) {
        expect(
          picture.maxNodeDiameterPx,
          "a small folder's widest mark is not at the ceiling, so this window draws it a different size than the others do",
        ).toBeCloseTo(LIBRARY_MAX_MARK_PX, 5);
      }

      /*
       * Every fixture has unverified citations. Under `STALE_DOT_STANDING_MAX` the dot must be painted at
       * rest; over it the picture must stay calm, inside `AMBER_INK_BUDGET`.
       */
      expect(staleEdges, "the fixture has no unverified citation, so this case proves nothing").toBeGreaterThan(0);
      /*
       * ── The standing amber holds its share of the picture's ink. ──
       *
       * Re-inspection 122 R2, the defect this bar exists for: 480 standing dots on the
       * three-hundred-source folder, 15.57% of the canvas's ink at 1040x720, and *"the
       * picture's dominant mark is now a warning, not a document"*.
       */
      expect(
        pixels.share,
        `the standing amber holds ${(pixels.share * 100).toFixed(2)}% of this picture's ink, past the ${
          AMBER_INK_BUDGET * 100
        }% budget: ${pixels.mark} amber pixels of ${pixels.ink}, from ${staleEdges} unverified citations (${
          pixels.amberInNames
        } more sit inside the ${pixels.names} placed names, where a mark cannot be told from a glyph's own antialiasing)`,
      ).toBeLessThanOrEqual(AMBER_INK_BUDGET);
      if (staleEdges <= STALE_DOT_STANDING_MAX) {
        expect(
          pixels.mark,
          "no amber pixel on a folder with unverified citations: the card's own sentence names a mark nobody can see",
        ).toBeGreaterThan(0);
      } else {
        /*
         * All or nothing, never a sample: a folder past the cap draws no standing dot, so no
         * undotted stale citation can be read as a fresh one. That the mark is still one
         * press away is the next test's claim, asserted there rather than assumed here.
         */
        expect(
          pixels.mark,
          "a folder past the standing cap is still painting amber at rest, so any ink budget it holds is luck",
        ).toBe(0);
      }

      // ── The marks. ──
      /*
       * **A mark's drawn size comes from the camera and nothing else.** The camera is clamped
       * into `[LIBRARY_ZOOM_MIN, 1.6]`, so the band is bounded at both ends whatever the
       * window: a source's square never drops under three pixels across, and a page's disc
       * never passes 9 × 1.6 × 2.
       */
      expect(
        picture.minSourceMarkPx,
        "a file's square is under three pixels across at the fitted zoom",
      ).toBeGreaterThanOrEqual(MIN_SOURCE_MARK_PX - 1e-6);
      expect(picture.viewScale, "the camera zoomed past its ceiling").toBeLessThanOrEqual(
        picture.ceiling + 1e-6,
      );
      expect(
        picture.ceiling * 2 * WIDEST_MARK_WORLD_RADIUS,
        "the ceiling stopped being the widest mark this folder may draw",
      ).toBeLessThanOrEqual(LIBRARY_MAX_MARK_PX + 1e-6);

      // ── The composition. ──
      /*
       * The picture is columns, so the rosette bars are only recorded. Asserted: the box is centred,
       * columns are level with the canvas middle, and read left to right in evidence order.
       */
      /*
       * The bound is derived: a CI runner measured 0.0508 where a Mac measured under 0.05, since
       * `measureText` fonts differ. 5% of a 1040 canvas is 52px; the value is printed to re-derive it.
       */
      console.log(`[picture] ${fixture.name} ${size.name}: centre offset ${picture.pictureCentreOffset.toFixed(4)}`);
      expect(
        picture.pictureCentreOffset,
        "the picture's bounding box sits off the canvas's centre",
      ).toBeLessThanOrEqual(0.06);
      expect(picture.layout, "the flow layout did not report its columns").not.toBeNull();
      for (const column of picture.columnOffsets) {
        expect(column.offset, `the ${column.kind} column hangs off the canvas's middle`).toBeLessThanOrEqual(0.08);
      }
      expect(picture.columnsInOrder, "the columns do not read files → pages → concepts").toBe(true);
    });
  }
}
