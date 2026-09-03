import { shellArg } from '@/shared/lib/shell-arg';

const ARCHITECTURE_PROFILE_CONTRACT = 'architecture-profile/v1' as const;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROLE_ID = /^[a-z][a-z0-9-]*$/;
/*
 * A locale is recognised by shape, never by the application's list of locales. A profile is a
 * vault file that outlives whichever locales this build happens to ship, so `summary_views_fr`
 * has to parse the same way in a build that has no French screen: as a French sentence nobody
 * asks for yet, not as a role called `views_fr`. Two letters is the whole rule, which is why
 * `summary_views_kor` falls back to the role-id reading and is refused as an unknown role.
 */
const SUMMARY_LOCALE = /^[a-z]{2}$/;
const DEPENDENCY_USAGE_VALUES = ['value', 'type_only'] as const;

interface ArchitecturePattern {
  axis: string;
  name: string;
}

interface ArchitectureRole {
  id: string;
  paths: string[];
  /**
   * One sentence saying what this role is for, written by the person who reviewed the profile.
   *
   * **Why the contract carries it instead of the screen.** A role id is a folder name, and a folder
   * name is exactly what decision (2026-08-26) forbids reading intent from: `role_widgets` does not
   * say what a widget is any more than the directory does. Without this field the blueprint could
   * only ever show `widgets · src/widgets/**`, which asks the reader to already know the answer —
   * and the agent handoff packet passed the same bare id along. Optional, because a profile written
   * before this field existed stays valid and simply says nothing.
   */
  summary?: string;
  /**
   * The same sentence in other languages, keyed by the locale in `summary_<id>_<locale>`.
   *
   * Separate from `summary` on purpose. `summary` stays the canonical sentence a person reviewed
   * and the only one an agent brief, a prompt, or the CLI ever prints, so a translation can never
   * become the fact a machine reasons from. Only the web workbench reads this map, and only to
   * choose what the reader in front of it can read; where the map has no entry for the active
   * locale the canonical sentence is shown, never a blank.
   */
  summaries: Record<string, string>;
}

export interface ArchitectureProfile {
  contract: typeof ARCHITECTURE_PROFILE_CONTRACT;
  uid: string;
  slug: string;
  projectUid: string;
  title: string;
  patterns: ArchitecturePattern[];
  scopePaths: string[];
  excludePaths: string[];
  roles: ArchitectureRole[];
  dependencyPolicy: 'explicit' | 'lower-only';
  dependencyUsages: Array<(typeof DEPENDENCY_USAGE_VALUES)[number]>;
  allows: Record<string, string[]>;
  evidence: string[];
  documentSlug?: string | null;
}

export interface ArchitectureHandoffContext {
  sourceRoot: string | null;
  vaultRoot: string | null;
  cliEntry: string | null;
}

interface ArchitectureAgentReceiptContext {
  profileContentHash: string;
  measuredAt: string;
  source:
    | { kind: 'git'; revision: string; dirty: boolean }
    | { kind: 'folder'; fingerprint: string };
  status: 'conforms' | 'violated' | 'unknown';
  violationCount: number;
  unmappedEdges: number | null;
  unruledEdges: number | null;
}

/**
 * The tasks a workbench may hand an agent about an existing profile. `improve` finds where the
 * reviewed intent and the observed source disagree and asks the person for the rule; it may not
 * propose one (the 2026-08-26 refusal that `buildArchitectureDraftPrompt` documents applies to a
 * proposal exactly as it applies to a draft — a rule derived from today's imports approves the
 * status quo, whichever button it arrives through).
 */
export type ArchitectureAgentTaskKind = 'change' | 'verify' | 'improve';

interface ArchitectureAgentTaskContext {
  kind: ArchitectureAgentTaskKind;
  stage: 'understand' | 'plan' | 'verify';
  selectedRole: string | null;
  receipt: ArchitectureAgentReceiptContext | null;
}

function nonBlank(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function stringArray(value: unknown, name: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${name} must be ${allowEmpty ? 'an' : 'a non-empty'} array of strings.`);
  }
  const rows = value.map((item, index) => nonBlank(item, `${name}[${index}]`));
  if (new Set(rows).size !== rows.length) throw new Error(`${name} must not contain duplicates.`);
  return rows;
}

function parsePatterns(value: unknown): ArchitecturePattern[] {
  return stringArray(value, 'patterns').map((row, index) => {
    const separator = row.indexOf(':');
    if (separator <= 0 || separator === row.length - 1) {
      throw new Error(`patterns[${index}] must use axis:name.`);
    }
    return {
      axis: nonBlank(row.slice(0, separator), `patterns[${index}].axis`),
      name: nonBlank(row.slice(separator + 1), `patterns[${index}].name`),
    };
  });
}

function parseDependencyUsages(
  value: unknown,
): Array<(typeof DEPENDENCY_USAGE_VALUES)[number]> {
  if (value === undefined) return [...DEPENDENCY_USAGE_VALUES];
  const usages = stringArray(value, 'dependency_usages');
  const unsupported = usages.find(
    (usage) => !DEPENDENCY_USAGE_VALUES.includes(
      usage as (typeof DEPENDENCY_USAGE_VALUES)[number],
    ),
  );
  if (unsupported) {
    throw new Error(
      `dependency_usages contains unsupported usage: ${unsupported}. ` +
        `Expected one of ${DEPENDENCY_USAGE_VALUES.join(', ')}.`,
    );
  }
  return usages as Array<(typeof DEPENDENCY_USAGE_VALUES)[number]>;
}

export function parseArchitectureProfile(frontmatter: Record<string, unknown>): ArchitectureProfile {
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new Error('architecture profile frontmatter must be an object.');
  }
  if (frontmatter.architecture_schema !== ARCHITECTURE_PROFILE_CONTRACT) {
    throw new Error(`architecture_schema must be ${ARCHITECTURE_PROFILE_CONTRACT}.`);
  }
  const uid = nonBlank(frontmatter.profile_uid, 'profile_uid');
  const projectUid = nonBlank(frontmatter.project_uid, 'project_uid');
  if (!UUID_V4.test(uid)) throw new Error('profile_uid must be a lowercase UUIDv4.');
  if (!UUID_V4.test(projectUid)) throw new Error('project_uid must be a lowercase UUIDv4.');

  /*
   * ⚠️ **The retired key is refused by name, not aliased and not ignored.** Two councils
   * independently cured the same false red — 18 type-only edges an eslint config already permitted
   * — one with `type_only_dependencies: ruled|free` and one with `dependency_usages`, and the
   * 2026-08-29 reconciliation kept the shipped encoding. An alias would carry two spellings of one
   * policy through two parsers forever, for a key no profile ever wrote; ignoring it would flip
   * that profile's verdict without a word, which is the silent change this ledger forbids.
   */
  if (frontmatter.type_only_dependencies !== undefined) {
    throw new Error(
      'type_only_dependencies was replaced by dependency_usages: write dependency_usages: [value] for the old free, or omit the key for the old ruled.',
    );
  }

  const rolePaths = new Map<string, string[]>();
  /* `summary_<id>`, not `role_summary_<id>`: every `role_*` key is a path group, so the second
     prefix would parse as a role called `summary_views`. Aspect first, role id last — the same
     shape `allow_<id>` already uses. */
  const roleSummaries = new Map<string, string>();
  /* Role id to locale to sentence, in the order the file wrote them, so both parsers report the
     same first problem when a file carries several. */
  const localizedSummaries = new Map<string, Map<string, string>>();
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key.startsWith('summary_')) {
      const rest = key.slice('summary_'.length);
      const split = rest.lastIndexOf('_');
      const locale = split > 0 ? rest.slice(split + 1) : '';
      const summaryId = SUMMARY_LOCALE.test(locale) ? rest.slice(0, split) : rest;
      if (!ROLE_ID.test(summaryId)) throw new Error(`Invalid architecture role id: ${summaryId}.`);
      if (summaryId === rest) {
        roleSummaries.set(summaryId, nonBlank(value, key));
      } else {
        const byLocale = localizedSummaries.get(summaryId) ?? new Map<string, string>();
        byLocale.set(locale, nonBlank(value, key));
        localizedSummaries.set(summaryId, byLocale);
      }
      continue;
    }
    if (!key.startsWith('role_') || key === 'role_order') continue;
    const id = key.slice('role_'.length);
    if (!ROLE_ID.test(id)) throw new Error(`Invalid architecture role id: ${id}.`);
    rolePaths.set(id, stringArray(value, key));
  }
  if (rolePaths.size < 2) throw new Error('architecture profile needs at least two roles.');
  const roleOrder = frontmatter.role_order === undefined
    ? [...rolePaths.keys()].sort()
    : stringArray(frontmatter.role_order, 'role_order');
  if (roleOrder.length !== rolePaths.size || roleOrder.some((id) => !rolePaths.has(id))) {
    throw new Error('role_order must name every role exactly once.');
  }
  /* Mirrors the MCP parser: a summary for a role nobody declared is a typo, not a comment. */
  for (const summaryId of roleSummaries.keys()) {
    if (!rolePaths.has(summaryId)) {
      throw new Error(`summary_${summaryId} describes a role that does not exist.`);
    }
  }
  /*
   * A translation of nothing is refused too. `summary_views_ko` without `summary_views` would put
   * a sentence on the Korean screen that the English screen, every agent brief and the CLI cannot
   * show, so the same role would be explained on one surface and silent on the others. The
   * canonical sentence is the one a person reviewed; a locale line may only restate it.
   */
  for (const [summaryId, byLocale] of localizedSummaries) {
    for (const locale of byLocale.keys()) {
      const key = `summary_${summaryId}_${locale}`;
      if (!rolePaths.has(summaryId)) {
        throw new Error(`${key} describes a role that does not exist.`);
      }
      if (!roleSummaries.has(summaryId)) {
        throw new Error(`${key} translates summary_${summaryId}, which this profile does not declare.`);
      }
    }
  }

  const rawPolicy = frontmatter.dependency_policy === undefined
    ? 'explicit'
    : nonBlank(frontmatter.dependency_policy, 'dependency_policy');
  if (rawPolicy !== 'explicit' && rawPolicy !== 'lower-only') {
    throw new Error('dependency_policy must be explicit or lower-only.');
  }
  const allows: Record<string, string[]> = {};
  for (const roleId of roleOrder) {
    const key = `allow_${roleId}`;
    if (!Object.hasOwn(frontmatter, key)) continue;
    const targets = stringArray(frontmatter[key], key, true);
    const unknown = targets.find((target) => !rolePaths.has(target));
    if (unknown) throw new Error(`${key} references unknown role: ${unknown}.`);
    allows[roleId] = targets;
  }

  return {
    contract: ARCHITECTURE_PROFILE_CONTRACT,
    uid,
    slug: nonBlank(frontmatter.profile_slug, 'profile_slug'),
    projectUid,
    title: nonBlank(frontmatter.title, 'title'),
    patterns: parsePatterns(frontmatter.patterns),
    scopePaths: stringArray(frontmatter.scope_paths, 'scope_paths'),
    excludePaths: frontmatter.exclude_paths === undefined
      ? []
      : stringArray(frontmatter.exclude_paths, 'exclude_paths'),
    roles: roleOrder.map((id) => {
      const summary = roleSummaries.get(id);
      const summaries = Object.fromEntries(localizedSummaries.get(id) ?? []);
      return summary === undefined
        ? { id, paths: rolePaths.get(id)!, summaries }
        : { id, paths: rolePaths.get(id)!, summary, summaries };
    }),
    dependencyPolicy: rawPolicy,
    dependencyUsages: parseDependencyUsages(frontmatter.dependency_usages),
    allows,
    evidence: stringArray(frontmatter.evidence, 'evidence'),
  };
}

/**
 * ⚠️ **A collision has to say which two documents collided.**
 *
 * Measured 2026-08-26: `atlas architecture .` at this repository's root died with
 * `Duplicate architecture profile slug: atlas-web.` and nothing else. The cause was the
 * repository's own generated mirror — `pnpm docs-vault:build` copies the vault into
 * `public/docs-vault/`, so one profile was found twice. The message named neither document, so
 * the only way to learn that was to grep for the slug.
 *
 * Two collisions are not the same thing, and conflating them is what made the message useless:
 * identical `profile_uid` with identical frontmatter is **one record reached twice** and there is
 * nothing for a person to resolve, while a disagreement is a real conflict that must still fail
 * closed — now naming both documents, because "which two?" is the whole question.
 *
 * `mcp/src/architecture-profile.mjs` carries the same behaviour; the parity contract keeps them
 * from drifting.
 */
function profileFingerprint(frontmatter: Record<string, unknown>): string {
  // Key order must not decide identity: two mirrors of one file can serialise differently.
  return JSON.stringify(
    Object.fromEntries(Object.entries(frontmatter).sort(([left], [right]) => (left < right ? -1 : 1))),
  );
}

/** One document the vault carries as an architecture profile and this surface could not read. */
export interface ArchitectureProfileProblem {
  documentSlug: string;
  message: string;
}

/**
 * ⚠️ **One unreadable document must not take the route down with it.**
 *
 * Measured 2026-09-03: `deriveArchitectureProfiles` threw for the whole vault as soon as any one
 * document failed to parse, and `/architecture` calls it from a render-phase `useMemo`, so a
 * single unknown key in a single profile replaced every profile in the folder with an error
 * boundary. A person who added one line to one file lost the screen that would have told them
 * which line. The parse stays exactly as strict per document — a bad profile is still not shown —
 * but the failure is now a named report beside the profiles that did load.
 *
 * The duplicate-slug collision reports the same way and carries the wording `mcp` throws, because
 * the question a person has ("which two documents?") is the same on both surfaces. The MCP and
 * CLI keep throwing: an agent reading a half-scanned vault must not mistake it for a whole one,
 * while a person looking at the screen can see both the notice and what did load.
 */
export function deriveArchitectureProfilesReport(
  docs: ReadonlyArray<{ slug: string; frontmatter: Record<string, unknown> }>,
): { profiles: ArchitectureProfile[]; problems: ArchitectureProfileProblem[] } {
  const profiles: ArchitectureProfile[] = [];
  const problems: ArchitectureProfileProblem[] = [];
  const seen = new Map<string, { uid: string; fingerprint: string; documentSlug: string }>();
  for (const doc of docs) {
    if (doc.frontmatter.architecture_schema !== ARCHITECTURE_PROFILE_CONTRACT) continue;
    let profile: ArchitectureProfile;
    try {
      profile = parseArchitectureProfile(doc.frontmatter);
    } catch (error) {
      problems.push({
        documentSlug: doc.slug,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const fingerprint = profileFingerprint(doc.frontmatter);
    const previous = seen.get(profile.slug);
    if (previous) {
      if (previous.uid === profile.uid && previous.fingerprint === fingerprint) continue;
      problems.push({
        documentSlug: doc.slug,
        message:
          `Duplicate architecture profile slug: ${profile.slug}. ` +
          `${previous.documentSlug} and ${doc.slug} both declare it with different contents. ` +
          'Give one of them another profile_slug, or narrow the scan so only one is read.',
      });
      continue;
    }
    seen.set(profile.slug, { uid: profile.uid, fingerprint, documentSlug: doc.slug });
    profiles.push({ ...profile, documentSlug: doc.slug });
  }
  return {
    profiles: profiles.sort((left, right) => left.slug.localeCompare(right.slug, 'en')),
    problems,
  };
}

export function deriveArchitectureProfiles(
  docs: ReadonlyArray<{ slug: string; frontmatter: Record<string, unknown> }>,
): ArchitectureProfile[] {
  return deriveArchitectureProfilesReport(docs).profiles;
}

export function buildArchitectureAgentPrompt(
  profile: ArchitectureProfile,
  context: ArchitectureHandoffContext | null = null,
  task: ArchitectureAgentTaskContext = {
    kind: 'change',
    stage: 'understand',
    selectedRole: null,
    receipt: null,
  },
): string {
  const sourceRoot = context?.sourceRoot ?? null;
  const vaultRoot = context?.vaultRoot ?? null;
  const cliEntry = context?.cliEntry ?? null;
  const inspectArguments = sourceRoot
    ? { rootPath: sourceRoot, profileSlug: profile.slug }
    : { profileSlug: profile.slug };
  const cliFallback = sourceRoot && vaultRoot && cliEntry
    ? `CLI fallback: node ${shellArg(cliEntry)} architecture ${shellArg(sourceRoot)} --vault ${shellArg(vaultRoot)} --profile ${shellArg(profile.slug)} --json`
    : 'CLI fallback unavailable from this surface: Atlas could not verify absolute source, vault, and Atlas CLI entry paths. Use the connected MCP tool or open the source checkout that carries cli/src/index.mjs.';

  /*
   * The visible workbench state is part of the task, not decoration around it. Before this packet
   * existed, pressing Verify while a role was selected produced the same generic change prompt as
   * pressing Change with nothing selected. The agent then had to rediscover the exact state the
   * person had already judged, and a stale sidecar receipt was mentioned only as prose. A small,
   * typed packet makes the handoff inspectable without turning the receipt into current truth.
   */
  const packet = {
    contract: 'architectureAgentTask:v1',
    kind: task.kind,
    stage: task.stage,
    selectedRole: task.selectedRole,
    profile: {
      uid: profile.uid,
      slug: profile.slug,
      contentHash: task.receipt?.profileContentHash ?? null,
    },
    sourceRoot,
    vaultRoot,
    receipt: task.receipt,
  };
  const action = task.kind === 'change'
    ? [
        'Before editing, return an architectureChangePlan:v1 with touchedRoles, plannedPaths, expectedNewDependencies, crossedBoundaries, preservedInterfaces, verificationCommands, and unknowns.',
        'After editing, call inspect_architecture again and compare the actual conformance result with the plan.',
      ]
    : task.kind === 'improve'
      ? [
          'This is an improvement-finding task. The reviewed profile stays the person\'s to author; you find the places that need a decision and ask.',
          'Name every place where the reviewed profile and the observed imports disagree: crossings the rules forbid, dependencies whose role is unmapped, edges no rule covers, and roles no source matched. Cite the literal paths and import counts behind each one, and say which of them the bound receipt already knew about.',
          task.receipt
            ? 'Compare the fresh inspection with the bound receipt first and name every changed count or status, so the person knows which findings are new.'
            : 'No persisted receipt is bound to this screen. Do not search the filesystem for one; treat it as absent and say so.',
          'Where a rule is missing or an edge is unruled, ask the person what the rule should be. Write no `allow_*` keys, no `dependency_policy`, and no `dependency_usages`, and propose none: deriving them from what the code happens to do today would turn existing violations into permissions.',
          'Do not name a pattern, do not rename a role, and do not give a group an architectural name. A file whose imports do not match its role\'s paths is stated as a literal path and a question, never as a new role.',
          'Write nothing: not the profile, not a receipt, not implementation. Stop after the questions. The person answers them; you do not guess.',
        ]
    : task.receipt
      ? [
        'This is a verification task. Do not edit implementation or architecture-profile files unless the person explicitly asks after seeing the result.',
        'Compare the fresh inspection with the bound receipt, name every changed count or status, and state whether a new --record receipt should replace the local one.',
      ]
      : [
          'This is a verification task. Do not edit implementation or architecture-profile files unless the person explicitly asks after seeing the result.',
          'No persisted receipt is bound to this screen. Do not search the filesystem for one. Treat it as absent, report the fresh inspection, and state that `atlas architecture --record` would create the optional local receipt.',
        ];

  return [
    `Architecture task context: ${JSON.stringify(packet)}`,
    `Start from the reviewed architecture profile ${profile.slug}.`,
    `Call inspect_architecture with ${JSON.stringify(inspectArguments)} before opening implementation files.`,
    cliFallback,
    'The visible receipt may be stale. This inspection is the current observation receipt for this revision; the reviewed profile remains architecture intent.',
    'Report the selected scope, declared pattern axes, role mappings, observed dependency coverage, violations, and unknowns.',
    `Apply dependency rules only to the profile's declared import usages: ${profile.dependencyUsages.join(', ')}.`,
    'Do not treat unknown as compliant, and do not infer a named pattern from folder names.',
    ...action,
  ].join('\n');
}

/**
 * The sentence the architecture tab's empty state hands a connected agent.
 *
 * ⚠️ **Why a sentence and not a function call.** The standing 2026-08-24 decision behind
 * `first-run-starter`'s "make a map from my code" door settles this: the app never calls MCP —
 * that is the agents' surface — so a door that analysed the repository itself would create a
 * second canonical implementation of `analyze_repo_structure`, which `AGENTS.md` forbids. Handing
 * the work to the agent is not a workaround; it is the shape this product argues for.
 *
 * ⚠️ **What this sentence must refuse to ask for, and why each refusal was measured.**
 *
 * - **It may not ask for `allow_*`, `dependency_policy`, or `dependency_usages`.** Deriving rules
 *   from observed imports makes the status quo the rule. The source can prove that an edge exists
 *   and whether it is value or type-only usage; it cannot decide whether the reviewed policy
 *   permits that usage or direction. Omitting all three keys leaves every edge unruled, which the
 *   evaluator reports as `unknown` — and unknown is never compliant.
 * - **It may not ask the agent to name the pattern, or to name the roles.** The record's clause is
 *   "a pattern label is never inferred from folders". A role id is that claim in miniature:
 *   emitting `role_entities` or `role_adapters` from folder names is inferring Feature-Sliced
 *   Design or Hexagonal one identifier at a time, the ban routed around. Path-derived literal ids
 *   are an observation and carry no claim.
 * - **`patterns` cannot be left empty for the human to fill in later.** Both parsers require it
 *   non-empty, so a profile without it does not load at all. That constraint is the feature: the
 *   record cannot exist until a person has named the pattern, which makes approval structural
 *   rather than a dialog they click through.
 * - **`evidence` may not receive a generated edge list.** The same record's falsifier includes
 *   "if a profile becomes a second source of observed imports". Evidence points at the human
 *   authorities that already govern the boundary — a rules file, an architecture document.
 */
export function buildArchitectureDraftPrompt(
  context: ArchitectureHandoffContext | null = null,
): string {
  const sourceRoot = context?.sourceRoot ?? null;
  const vaultRoot = context?.vaultRoot ?? null;
  // The absolute path when the desktop bridge knows it, and never an invented one.
  const target = sourceRoot ?? 'the codebase this ontology folder describes';
  return [
    `Architecture task context: ${JSON.stringify({
      contract: 'architectureAgentTask:v1',
      kind: 'draft',
      stage: 'understand',
      selectedRole: null,
      profile: null,
      sourceRoot,
      vaultRoot,
      receipt: null,
    })}`,
    `Draft a first architecture profile for ${target}.`,
    '',
    'Work in this order and stop where it says to stop:',
    '1. Read the folder tree, then call `infer_imports` for the dependency edges that are actually',
    '   observed. Report which languages the scan could read and which files it skipped.',
    '2. Propose the scope globs and a set of path groups, using literal ids taken from the paths',
    '   themselves. Do not name a pattern, and do not give a group an architectural name — that',
    '   would be inferring the pattern one identifier at a time. Say which observed imports put',
    '   each path in each group.',
    '3. Show me the proposal and stop. Ask me two things: what this architecture is called, and',
    '   what each group should be named. I answer those; you do not guess them.',
    '4. Only then write one file under `architecture/` in the ontology folder, with',
    '   `architecture_schema: architecture-profile/v1`, a freshly minted lowercase UUIDv4',
    '   `profile_uid`, the `project_uid` of the project node this describes, the names I gave you,',
    '   the path groups as `role_<id>` globs, and `created_by: agent:<your tool name>`.',
    '   Write no `kind:` and no `uid:` — this record is deliberately not a node in the map.',
    '   Write no `allow_*` keys, no `dependency_policy`, and no `dependency_usages`: the rules are mine to state, and',
    '   deriving them from what the code happens to do today would turn existing violations into',
    '   permissions. Leaving them out reports every edge as unknown, which is the honest start.',
    '   Put the human authorities that already govern the boundary in `evidence` — a lint config,',
    '   an architecture document — never a list of the edges you just observed.',
    '5. Run `inspect_architecture` on the result and show me what it says.',
  ].join('\n');
}
