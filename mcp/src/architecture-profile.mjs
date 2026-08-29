const PROFILE_CONTRACT = 'architecture-profile/v1';
const BRIEF_CONTRACT = 'architectureBrief:v1';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROLE_ID = /^[a-z][a-z0-9-]*$/;
const MATCHED_FILE_SAMPLE_LIMIT = 20;
const VIOLATION_SAMPLE_LIMIT = 50;
const DEPENDENCY_USAGE_VALUES = ['value', 'type_only'];
const OBSERVED_IMPORT_USAGE_VALUES = [...DEPENDENCY_USAGE_VALUES, 'unknown'];

function nonBlank(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value.trim();
}

function stringArray(value, name, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${name} must be ${allowEmpty ? 'an' : 'a non-empty'} array of strings.`);
  }
  const rows = value.map((item, index) => nonBlank(item, `${name}[${index}]`));
  if (new Set(rows).size !== rows.length) throw new Error(`${name} must not contain duplicates.`);
  return rows;
}

function normalizePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

export function matchesPathPattern(path, pattern) {
  const candidate = normalizePath(path);
  const normalized = normalizePath(pattern);
  if (!normalized) return false;
  let source = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '*' && normalized[index + 1] === '*') {
      if (normalized[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index += 1;
      }
      continue;
    }
    if (char === '*') {
      source += '[^/]*';
      continue;
    }
    if (char === '?') {
      source += '[^/]';
      continue;
    }
    source += /[\\^$+?.()|{}[\]]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`).test(candidate);
}

function parsePatterns(value) {
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

function parseDependencyUsages(value) {
  if (value === undefined) return [...DEPENDENCY_USAGE_VALUES];
  const usages = stringArray(value, 'dependency_usages');
  const unsupported = usages.find((usage) => !DEPENDENCY_USAGE_VALUES.includes(usage));
  if (unsupported) {
    throw new Error(
      `dependency_usages contains unsupported usage: ${unsupported}. ` +
        `Expected one of ${DEPENDENCY_USAGE_VALUES.join(', ')}.`,
    );
  }
  return usages;
}

const GIT_REVISION_RE = /^[0-9a-f]{40}$/;
const FOLDER_FINGERPRINT_RE = /^sha256:[0-9a-f]{64}$/;
const MEASURED_GIT_SHORT_SHA_LENGTH = 12;

export function parseArchitectureProfile(frontmatter) {
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new Error('architecture profile frontmatter must be an object.');
  }
  if (frontmatter.architecture_schema !== PROFILE_CONTRACT) {
    throw new Error(`architecture_schema must be ${PROFILE_CONTRACT}.`);
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

  /* `summary_<id>`, not `role_summary_<id>`: every `role_*` key is a path group, so the second
     prefix would parse as a role called `summary_views`. Aspect first, role id last — the same
     shape `allow_<id>` already uses. Mirrors the web parser under the cross-surface contract. */
  const roleSummaries = new Map(
    Object.entries(frontmatter)
      .filter(([key]) => key.startsWith('summary_'))
      .map(([key, value]) => {
        const id = key.slice('summary_'.length);
        if (!ROLE_ID.test(id)) throw new Error(`Invalid architecture role id: ${id}.`);
        return [id, nonBlank(value, key)];
      }),
  );
  const roleEntries = Object.entries(frontmatter)
    .filter(([key]) => key.startsWith('role_') && key !== 'role_order')
    .map(([key, value]) => {
      const id = key.slice('role_'.length);
      if (!ROLE_ID.test(id)) throw new Error(`Invalid architecture role id: ${id}.`);
      return [id, stringArray(value, key)];
    });
  if (roleEntries.length < 2) throw new Error('architecture profile needs at least two roles.');
  const rolePaths = new Map(roleEntries);
  const roleOrder = frontmatter.role_order === undefined
    ? [...rolePaths.keys()].sort()
    : stringArray(frontmatter.role_order, 'role_order');
  if (roleOrder.length !== rolePaths.size || roleOrder.some((id) => !rolePaths.has(id))) {
    throw new Error('role_order must name every role exactly once.');
  }
  for (const summaryId of roleSummaries.keys()) {
    if (!rolePaths.has(summaryId)) {
      throw new Error(`summary_${summaryId} describes a role that does not exist.`);
    }
  }

  const dependencyPolicy = frontmatter.dependency_policy === undefined
    ? 'explicit'
    : nonBlank(frontmatter.dependency_policy, 'dependency_policy');
  if (!['explicit', 'lower-only'].includes(dependencyPolicy)) {
    throw new Error('dependency_policy must be explicit or lower-only.');
  }
  const allows = new Map();
  for (const roleId of roleOrder) {
    const key = `allow_${roleId}`;
    if (!Object.hasOwn(frontmatter, key)) continue;
    const targets = stringArray(frontmatter[key], key, { allowEmpty: true });
    const unknown = targets.find((target) => !rolePaths.has(target));
    if (unknown) throw new Error(`${key} references unknown role: ${unknown}.`);
    allows.set(roleId, targets);
  }

  return {
    contract: PROFILE_CONTRACT,
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
      return summary === undefined
        ? { id, paths: rolePaths.get(id) }
        : { id, paths: rolePaths.get(id), summary };
    }),
    dependencyPolicy,
    dependencyUsages: parseDependencyUsages(frontmatter.dependency_usages),
    allows,
    evidence: stringArray(frontmatter.evidence, 'evidence'),
  };
}

/**
 * ⚠️ **A collision has to say which two files collided.**
 *
 * Measured 2026-08-26: `atlas architecture .` at this repository's root died with
 * `Duplicate architecture profile slug: atlas-web.` and nothing else. The cause was the
 * repository's own generated mirror — `pnpm docs-vault:build` copies the vault into
 * `public/docs-vault/`, so the one profile was found twice. The message named neither path, so
 * the only way to learn that was to grep for the slug.
 *
 * Two collisions are not the same thing, and conflating them is what made the message useless:
 *
 * - **The same profile seen twice.** Identical `profile_uid` and identical frontmatter is one
 *   record reached by two paths — a generated mirror, a symlinked vault, a scan whose root
 *   contains both. Refusing to run is wrong; there is nothing for a person to resolve.
 * - **Two different profiles wearing one name.** Different `profile_uid`, or the same uid with
 *   frontmatter that disagrees, is a genuine conflict and must still fail closed — but now the
 *   error names both documents, because "which two?" is the whole question.
 */
function profileFingerprint(frontmatter) {
  // Key order must not decide identity: two mirrors of one file can serialise differently.
  return JSON.stringify(
    Object.fromEntries(Object.entries(frontmatter).sort(([left], [right]) => (left < right ? -1 : 1))),
  );
}

export function findArchitectureProfiles(docs) {
  const profiles = [];
  const seen = new Map();
  for (const doc of Array.isArray(docs) ? docs : []) {
    if (doc?.frontmatter?.architecture_schema !== PROFILE_CONTRACT) continue;
    const profile = parseArchitectureProfile(doc.frontmatter);
    const documentSlug = doc.slug ?? null;
    const fingerprint = profileFingerprint(doc.frontmatter);
    const previous = seen.get(profile.slug);
    if (previous) {
      if (previous.uid === profile.uid && previous.fingerprint === fingerprint) {
        // One record reached twice. Keep the first path and carry on.
        continue;
      }
      throw new Error(
        `Duplicate architecture profile slug: ${profile.slug}. ` +
          `${previous.documentSlug ?? '(unnamed document)'} and ${documentSlug ?? '(unnamed document)'} ` +
          'both declare it with different contents. Give one of them another profile_slug, ' +
          'or narrow the scan so only one is read.',
      );
    }
    seen.set(profile.slug, { uid: profile.uid, fingerprint, documentSlug });
    profiles.push({ ...profile, documentSlug });
  }
  return profiles.sort((left, right) => left.slug.localeCompare(right.slug, 'en'));
}

function matchingRoles(profile, path) {
  return profile.roles
    .filter((role) => role.paths.some((pattern) => matchesPathPattern(path, pattern)))
    .map((role) => role.id);
}

function inScope(profile, path) {
  return profile.scopePaths.some((pattern) => matchesPathPattern(path, pattern))
    && !profile.excludePaths.some((pattern) => matchesPathPattern(path, pattern));
}

function excludedFromScope(profile, path) {
  return profile.excludePaths.some((pattern) => matchesPathPattern(path, pattern));
}

function ruleFor(profile, fromRole, toRole) {
  if (fromRole === toRole) return { allowed: true, rule: 'same-role' };
  if (profile.dependencyPolicy === 'lower-only') {
    const fromIndex = profile.roles.findIndex((role) => role.id === fromRole);
    const toIndex = profile.roles.findIndex((role) => role.id === toRole);
    return { allowed: fromIndex < toIndex, rule: 'lower-only' };
  }
  if (!profile.allows.has(fromRole)) return { allowed: null, rule: `allow-${fromRole}` };
  return {
    allowed: profile.allows.get(fromRole).includes(toRole),
    rule: `allow-${fromRole}`,
  };
}

function importUsageOf(edge) {
  return OBSERVED_IMPORT_USAGE_VALUES.includes(edge?.importUsage)
    ? edge.importUsage
    : 'unknown';
}

export function evaluateArchitectureConformance(profile, importResult) {
  const edges = Array.isArray(importResult?.edges) ? importResult.edges : [];
  const filesByRole = new Map(profile.roles.map((role) => [role.id, new Set()]));
  const observed = new Map();
  const violations = [];
  let unmappedEdges = 0;
  let unruledEdges = 0;
  let unknownImportUsages = 0;
  let excludedByUsage = 0;
  const importUsageTally = { value: 0, type_only: 0, unknown: 0, missing: 0 };
  for (const edge of edges) {
    if (edge?.importUsage === undefined) importUsageTally.missing += 1;
    else if (Object.hasOwn(importUsageTally, edge.importUsage)) {
      importUsageTally[edge.importUsage] += 1;
    } else importUsageTally.unknown += 1;
  }

  for (const edge of edges) {
    // Architecture rules govern dependencies *originating* in the selected
    // scope. Excluded sources (tests, fixtures, generated code) do not become
    // violations merely because their target is production code. A production
    // source pointing outside the model remains an explicit unknown below.
    if (!inScope(profile, edge.from)) continue;
    if (excludedFromScope(profile, edge.to)) continue;
    const fromRoles = matchingRoles(profile, edge.from);
    const toRoles = matchingRoles(profile, edge.to);
    if (fromRoles.length !== 1 || toRoles.length !== 1) {
      unmappedEdges += 1;
      continue;
    }
    const [fromRole] = fromRoles;
    const [toRole] = toRoles;
    const importUsage = importUsageOf(edge);
    filesByRole.get(fromRole).add(normalizePath(edge.from));
    filesByRole.get(toRole).add(normalizePath(edge.to));
    const key = `${fromRole}\u0000${toRole}`;
    const row = observed.get(key) ?? {
      fromRole,
      toRole,
      count: 0,
      importUsageCounts: Object.fromEntries(
        OBSERVED_IMPORT_USAGE_VALUES.map((usage) => [usage, 0]),
      ),
      evidence: [],
    };
    row.count += 1;
    row.importUsageCounts[importUsage] += 1;
    if (row.evidence.length < 3) {
      row.evidence.push({
        from: normalizePath(edge.from),
        to: normalizePath(edge.to),
        kind: edge.kind ?? 'unknown',
        importUsage,
      });
    }
    observed.set(key, row);

    if (importUsage === 'unknown') {
      unknownImportUsages += 1;
      continue;
    }
    if (!profile.dependencyUsages.includes(importUsage)) {
      excludedByUsage += 1;
      continue;
    }

    const decision = ruleFor(profile, fromRole, toRole);
    if (decision.allowed === null) {
      unruledEdges += 1;
    } else if (!decision.allowed) {
      violations.push({
        fromRole,
        toRole,
        from: normalizePath(edge.from),
        to: normalizePath(edge.to),
        kind: edge.kind ?? 'unknown',
        importUsage,
        rule: decision.rule,
      });
    }
  }

  const roles = profile.roles.map((role) => {
    const matched = [...filesByRole.get(role.id)].sort();
    return {
      id: role.id,
      paths: role.paths,
      matchedFileCount: matched.length,
      matchedFiles: matched.slice(0, MATCHED_FILE_SAMPLE_LIMIT),
      matchedFilesLimited: matched.length > MATCHED_FILE_SAMPLE_LIMIT,
    };
  });
  const emptyRoles = roles.filter((role) => role.matchedFiles.length === 0).map((role) => role.id);
  const coverageIncomplete = importResult?.coverage?.allDetectedLanguagesSupported !== true;
  const hasUnknown = coverageIncomplete || unmappedEdges > 0 || unruledEdges > 0 ||
    unknownImportUsages > 0 || emptyRoles.length > 0;
  const status = violations.length > 0 ? 'violated' : hasUnknown ? 'unknown' : 'conforms';

  return {
    contract: 'architectureConformance:v1',
    status,
    roles,
    observedRoleEdges: [...observed.values()].sort((a, b) =>
      `${a.fromRole}:${a.toRole}`.localeCompare(`${b.fromRole}:${b.toRole}`, 'en'),
    ),
    excludedByUsage,
    violationCount: violations.length,
    violations: violations.slice(0, VIOLATION_SAMPLE_LIMIT),
    violationsLimited: violations.length > VIOLATION_SAMPLE_LIMIT,
    unknown: {
      coverageIncomplete,
      unmappedEdges,
      unruledEdges,
      unknownImportUsages,
      emptyRoles,
    },
    source: {
      rootPath: importResult?.rootPath ?? null,
      filesScanned: Number(importResult?.filesScanned ?? 0),
      supportedLanguages: Array.isArray(importResult?.coverage?.supportedLanguages)
        ? importResult.coverage.supportedLanguages
        : [],
      /*
       * ⚠️ **A whole-scan usage receipt.** `missing` counts edges the scanner emitted with no
       * `importUsage` at all, which is a different fact from an edge whose usage it could not
       * classify. The record writer's refusal gate reads these: a scan that cannot tell a
       * type-only import from a value one must not mint a durable receipt, and without this tally
       * it cannot tell that it cannot tell. Restored at the 2026-08-29 reconciliation, where
       * taking one side of the merge wholesale had left the gate reading a field nothing produced.
       */
      importUsageCounts: importUsageTally,
    },
  };
}

export function buildArchitectureBrief(profile, importResult, { measured } = {}) {
  const conformance = evaluateArchitectureConformance(profile, importResult);
  const nextActions = [];
  if (conformance.violations.length > 0) {
    nextActions.push({ id: 'inspect_violations', count: conformance.violations.length });
  }
  if (conformance.status === 'unknown') {
    nextActions.push({ id: 'close_measurement_gaps', unknown: conformance.unknown });
  }
  nextActions.push({ id: 'plan_within_architecture', profileSlug: profile.slug });
  return {
    contract: BRIEF_CONTRACT,
    sideEffect: 0,
    profile: {
      uid: profile.uid,
      slug: profile.slug,
      projectUid: profile.projectUid,
      title: profile.title,
      patterns: profile.patterns,
      scopePaths: profile.scopePaths,
      excludePaths: profile.excludePaths,
      roles: profile.roles.map((role) => ({
        id: role.id,
        paths: role.paths,
        allowedDependencies: profile.dependencyPolicy === 'lower-only'
          ? profile.roles
              .slice(profile.roles.findIndex((row) => row.id === role.id) + 1)
              .map((row) => row.id)
          : profile.allows.get(role.id) ?? null,
      })),
      dependencyPolicy: profile.dependencyPolicy,
      dependencyUsages: profile.dependencyUsages,
      evidence: profile.evidence,
    },
    conformance,
    agentPlanContract: {
      contract: 'architectureChangePlan:v1',
      requiredFields: [
        'touchedRoles',
        'plannedPaths',
        'expectedNewDependencies',
        'crossedBoundaries',
        'preservedInterfaces',
        'verificationCommands',
        'unknowns',
      ],
    },
    nextActions,
    ...(measured !== undefined ? { measured } : {}),
  };
}

export function buildArchitectureMeasuredStamp(inspection, { at, toolName, toolVersion } = {}) {
  const measuredAt = at ?? new Date().toISOString();
  if (typeof measuredAt !== 'string' || Number.isNaN(Date.parse(measuredAt))) {
    throw new Error('measured stamp requires an ISO-8601 time.');
  }
  const tool = {
    name: nonBlank(toolName, 'measured stamp tool name'),
    version: nonBlank(toolVersion, 'measured stamp tool version'),
  };
  if (inspection?.kind === 'git') {
    if (typeof inspection.revision !== 'string' || !GIT_REVISION_RE.test(inspection.revision)) {
      throw new Error('measured stamp requires a full git commit sha from the source inspection.');
    }
    if (typeof inspection.dirty !== 'boolean') {
      throw new Error('measured stamp requires a boolean git dirty flag.');
    }
    return {
      at: measuredAt,
      tool,
      source: {
        kind: 'git',
        revision: inspection.revision.slice(0, MEASURED_GIT_SHORT_SHA_LENGTH),
        dirty: inspection.dirty,
      },
    };
  }
  if (inspection?.kind === 'folder') {
    if (typeof inspection.fingerprint !== 'string' || !FOLDER_FINGERPRINT_RE.test(inspection.fingerprint)) {
      throw new Error('measured stamp requires a sha256: folder fingerprint from the source inspection.');
    }
    return {
      at: measuredAt,
      tool,
      source: { kind: 'folder', fingerprint: inspection.fingerprint },
    };
  }
  throw new Error('measured stamp requires a git or folder source inspection.');
}
