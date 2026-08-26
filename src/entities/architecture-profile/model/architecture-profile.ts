import { shellArg } from '@/shared/lib/shell-arg';

const ARCHITECTURE_PROFILE_CONTRACT = 'architecture-profile/v1' as const;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROLE_ID = /^[a-z][a-z0-9-]*$/;

interface ArchitecturePattern {
  axis: string;
  name: string;
}

interface ArchitectureRole {
  id: string;
  paths: string[];
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
  allows: Record<string, string[]>;
  evidence: string[];
  documentSlug?: string | null;
}

export interface ArchitectureHandoffContext {
  sourceRoot: string | null;
  vaultRoot: string | null;
  cliEntry: string | null;
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

  const rolePaths = new Map<string, string[]>();
  for (const [key, value] of Object.entries(frontmatter)) {
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
    roles: roleOrder.map((id) => ({ id, paths: rolePaths.get(id)! })),
    dependencyPolicy: rawPolicy,
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

export function deriveArchitectureProfiles(
  docs: ReadonlyArray<{ slug: string; frontmatter: Record<string, unknown> }>,
): ArchitectureProfile[] {
  const profiles: ArchitectureProfile[] = [];
  const seen = new Map<string, { uid: string; fingerprint: string; documentSlug: string }>();
  for (const doc of docs) {
    if (doc.frontmatter.architecture_schema !== ARCHITECTURE_PROFILE_CONTRACT) continue;
    const profile = parseArchitectureProfile(doc.frontmatter);
    const fingerprint = profileFingerprint(doc.frontmatter);
    const previous = seen.get(profile.slug);
    if (previous) {
      if (previous.uid === profile.uid && previous.fingerprint === fingerprint) continue;
      throw new Error(
        `Duplicate architecture profile slug: ${profile.slug}. ` +
          `${previous.documentSlug} and ${doc.slug} both declare it with different contents. ` +
          'Give one of them another profile_slug, or narrow the scan so only one is read.',
      );
    }
    seen.set(profile.slug, { uid: profile.uid, fingerprint, documentSlug: doc.slug });
    profiles.push({ ...profile, documentSlug: doc.slug });
  }
  return profiles.sort((left, right) => left.slug.localeCompare(right.slug, 'en'));
}

export function buildArchitectureAgentPrompt(
  profile: ArchitectureProfile,
  context: ArchitectureHandoffContext | null = null,
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

  return [
    `Start from the reviewed architecture profile ${profile.slug}.`,
    `Call inspect_architecture with ${JSON.stringify(inspectArguments)} before opening implementation files.`,
    cliFallback,
    'This UI does not embed a current conformance receipt; the first inspection is the source of truth for this run.',
    'Report the selected scope, declared pattern axes, role mappings, observed dependency coverage, violations, and unknowns.',
    'Do not treat unknown as compliant, and do not infer a named pattern from folder names.',
    'Before editing, return an architectureChangePlan:v1 with touchedRoles, plannedPaths, expectedNewDependencies, crossedBoundaries, preservedInterfaces, verificationCommands, and unknowns.',
    'After editing, call inspect_architecture again and compare the actual conformance result with the plan.',
  ].join('\n');
}
