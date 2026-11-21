// The sample library the capture adds in memory: five sources, six compiled wiki
// pages, one project-source binding and one saved automation.
import { readFileSync } from "node:fs";
import path from "node:path";

import { FAKE_SOURCE_ROOT, REPO, sha256 } from "./capture-context.mjs";

/** Five sources about Atlas itself, written for the sample — short, plain, and true. */
const SOURCES = {
  "sources/release-1.2-notes.md":
    "# 1.2 release notes\n\nThe Library reads a folder of sources and compiles wiki pages that cite them.\nThe Git screen restores one document behind a confirm.\nAutomations run a consistency round on a schedule.\n",
  "sources/harness-interview.txt":
    "Interview, harness tab.\nPeople wanted to see which instructions each agent was given, and which checks stop it.\nThe tab reads AGENTS.md, CLAUDE.md and the hook folders of the project source.\n",
  "sources/onboarding-survey.csv":
    "question,answer,count\nfirst screen understood,yes,14\nfirst screen understood,no,3\nfound the library,yes,9\n",
  "sources/architecture-review.md":
    "# Architecture review\n\nThe web app follows app, views, widgets, features, entities, shared.\nImports may only point down the ladder; ESLint enforces it.\n",
  "sources/agent-write-policy.md":
    "# Agent write policy\n\nAn agent may read the ontology freely.\nEvery Atlas write waits for a person to allow it once or reject it.\n",
};

const SOURCE_NAMES = Object.keys(SOURCES);

/** Six compiled pages. `stale` records a hash that no longer matches, so the shelf shows drift. */
export const PAGES = [
  {
    slug: "release-overview",
    title: "Release overview",
    cites: [0, 3],
    stale: false,
    facts: [
      "The Library compiles wiki pages that cite their sources. [[src:sources/release-1.2-notes.md#p1]]",
      "The layer ladder is enforced by ESLint. [[src:sources/architecture-review.md#p1]]",
      "The map is [[capabilities/ontology-map]]; the Library is [[capabilities/library-workspace]].",
    ],
  },
  {
    slug: "harness-needs",
    title: "What people asked of the harness",
    cites: [1],
    stale: false,
    facts: [
      "People wanted to see which instructions each agent was given. [[src:sources/harness-interview.txt#p1]]",
      "The tab reads the project source's instruction files. [[src:sources/harness-interview.txt#p1]]",
    ],
  },
  {
    slug: "onboarding-findings",
    title: "Onboarding findings",
    cites: [2, 0],
    stale: true,
    facts: [
      "14 of 17 people understood the first screen. [[src:sources/onboarding-survey.csv#p1]]",
      "9 people found the Library on their own. [[src:sources/onboarding-survey.csv#p1]]",
    ],
  },
  {
    slug: "layer-rules",
    title: "Layer rules",
    cites: [3],
    stale: false,
    facts: [
      "Imports point down the ladder only. [[src:sources/architecture-review.md#p1]]",
      "The checked profile lives in [[capabilities/architecture-conformance]].",
    ],
  },
  {
    slug: "write-review",
    title: "Write review",
    cites: [4],
    stale: false,
    facts: [
      "Reads are free; every Atlas write waits for a person. [[src:sources/agent-write-policy.md#p1]]",
      "The review itself is [[capabilities/meaning-write-review]].",
    ],
  },
  {
    slug: "agent-connection",
    title: "Agent connection",
    cites: [4, 1],
    stale: false,
    facts: [
      "The in-app agent works under the same write review. [[src:sources/agent-write-policy.md#p1]]",
      "Setting up an agent is [[capabilities/agent-connector-setup]].",
    ],
  },
];

/**
 * The Korean set's page titles and automation name are Korean, the way a Korean user's own folder
 * would read. Source file names and the fact lines stay as they are — they are file contents. The
 * Korean words live in a fixture because script sources print English only.
 */
const KO = JSON.parse(
  readFileSync(path.join(REPO, "scripts/fixtures/gateway-capture-ko.json"), "utf8"),
);
const TITLES_KO = KO.titles;
const fill = (template, values) =>
  template.replace(/\{(\w+)\}/g, (_, key) => String(values[key]));

export function wikiPage(page, locale) {
  const title = locale === "ko" ? TITLES_KO[page.slug] : page.title;
  const cited = page.cites.map((index) => SOURCE_NAMES[index]);
  // A fact must cite a source to fit the template; a line that only names a concept on the map
  // belongs in the summary.
  const facts = page.facts.filter((line) => line.includes("[[src:"));
  const mentions = page.facts.filter((line) => !line.includes("[[src:"));
  return [
    "---",
    `title: ${title}`,
    "created_by: agent:claude",
    "compiled_at: 2026-09-23T09:00:00Z",
    "sources:",
    ...cited.map((name) => `  - ${name}`),
    "source_hash:",
    ...cited.map((name) => `  ${name}: ${page.stale ? "0".repeat(64) : sha256(SOURCES[name])}`),
    "status: draft",
    `summary: ${title}.`,
    "---",
    "",
    "## Summary",
    "",
    [
      locale === "ko"
        ? fill(KO.summary, { count: cited.length, title })
        : `${title}, compiled from ${cited.length === 1 ? "one source" : `${cited.length} sources`}.`,
      ...mentions,
    ].join(" "),
    "",
    "## Facts",
    "",
    ...facts.map((fact) => `- ${fact}`),
    "",
    "## Decisions",
    "",
    "## Open questions",
    "",
    "## Not in sources",
    "",
  ].join("\n");
}

/**
 * One saved automation — a weekday consistency check of the sample library — and the two passes
 * it has already run. The dates follow the clock of the day the pictures are taken, so the next
 * run is always tomorrow morning and the screen never starts a pass of its own while shooting.
 */
function automationFiles(locale) {
  const ko = locale === "ko";
  const roundName = ko ? KO.roundName : "Library sources check";
  const day = 86_400_000;
  // The pictures are taken in UTC; until today's 09:00 UTC pass has ended, the latest pass is
  // yesterday's, so no run is dated ahead of the page's clock.
  const todaysPassEnd = new Date().setUTCHours(9, 1, 0, 0);
  const latestPassDay = Date.now() > todaysPassEnd ? Date.now() : Date.now() - day;
  const at = (offsetDays, hour, minute = 0) => {
    const date = new Date(latestPassDay + offsetDays * day);
    date.setUTCHours(hour, minute, 0, 0);
    return date.toISOString();
  };
  const stalePage = PAGES.find((page) => page.stale);
  const rounds = {
    v: 1,
    rounds: [
      {
        id: "round-library-check",
        name: roundName,
        kind: "consistency",
        cadence: { daily: "09:00", weekdaysOnly: true },
        enabled: true,
        onStale: "mark",
        places: [{ kind: "vault", paths: ["wiki"] }],
        createdAt: at(-8, 9),
        lastPassAt: at(0, 9),
        nextDueAt: at(1, 9),
      },
    ],
  };
  const pass = (offsetDays, outcome, stale, summary) => ({
    v: 1,
    id: `pass-${offsetDays}`,
    roundId: "round-library-check",
    roundName,
    kind: "consistency",
    startedAt: at(offsetDays, 9),
    endedAt: at(offsetDays, 9, 1),
    outcome,
    checked: PAGES.length,
    stale,
    written: [],
    refused: [],
    called: [],
    places: ["wiki"],
    agentTurns: 0,
    summary,
    trigger: "clock",
  });
  const ledger = [
    pass(-1, "held", [], ko ? KO.passHeld : "Every source still matches."),
    pass(0, "stale", [`wiki/${stalePage.slug}.md`], ko ? KO.passStale : "1 page's source changed."),
  ];
  return {
    ".ontology-atlas/rounds.json": rounds,
    ".ontology-atlas/rounds-ledger.jsonl": `${ledger.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
  };
}

export function buildOverlay(locale) {
  const overlay = new Map();
  for (const [name, text] of Object.entries(SOURCES)) overlay.set(name, text);
  for (const page of PAGES) overlay.set(`wiki/${page.slug}.md`, wikiPage(page, locale));
  overlay.set(
    ".ontology-atlas/project-sources.json",
    `${JSON.stringify(
      {
        contractVersion: 1,
        bindings: [
          {
            projectSlug: "ontology-atlas",
            sourceId: "ontology-atlas",
            rootPath: FAKE_SOURCE_ROOT,
            kind: "git",
            boundAt: "2026-09-23T09:00:00.000Z",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  for (const [name, text] of Object.entries(automationFiles(locale))) {
    overlay.set(name, typeof text === "string" ? text : `${JSON.stringify(text, null, 2)}\n`);
  }
  return overlay;
}
