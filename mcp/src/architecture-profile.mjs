const PROFILE_CONTRACT = 'architecture-profile/v1';
const BRIEF_CONTRACT = 'architectureBrief:v1';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROLE_ID = /^[a-z][a-z0-9-]*$/;
/*
 * A locale is recognised by shape (two letters), never by the app's locale list:
 * a profile outlives the locales a build ships, so `summary_views_fr` is a
 * French sentence and `summary_views_kor` an unknown role. Mirrors the web parser.
 */
const SUMMARY_LOCALE = /^[a-z]{2}$/;
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

function compilePathPattern(pattern) {
  const normalized = normalizePath(pattern);
  if (!normalized) return null;
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
  return new RegExp(`${source}$`);
}

export function matchesPathPattern(path, pattern) {
  const candidate = normalizePath(path);
  return compilePathPattern(pattern)?.test(candidate) ?? false;
}
function createPathMatcher() {
  const patterns = new Map();
  return (path, pattern) => {
    const candidate = normalizePath(path);
    let regex = patterns.get(pattern);
    if (regex === undefined) {
      regex = compilePathPattern(pattern);
      patterns.set(pattern, regex);
    }
    return regex?.test(candidate) ?? false;
  };
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
   * The retired `type_only_dependencies` key is refused by name: an alias would
   * keep two spellings of one policy in two parsers, and ignoring it would flip a
   * profile's verdict silently. `dependency_usages` is the shipped encoding.
   */
  if (frontmatter.type_only_dependencies !== undefined) {
    throw new Error(
      'type_only_dependencies was replaced by dependency_usages: write dependency_usages: [value] for the old free, or omit the key for the old ruled.',
    );
  }

  // `summary_<id>`, not `role_summary_<id>`: every `role_*` key is a path group.
  // Aspect first, role id last, like `allow_<id>`. Mirrors the web parser.
  const roleSummaries = new Map();
  // Role id → locale → sentence in file order, so both parsers report the same
  // first problem.
  const localizedSummaries = new Map();
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!key.startsWith('summary_')) continue;
    const rest = key.slice('summary_'.length);
    const split = rest.lastIndexOf('_');
    const locale = split > 0 ? rest.slice(split + 1) : '';
    const id = SUMMARY_LOCALE.test(locale) ? rest.slice(0, split) : rest;
    if (!ROLE_ID.test(id)) throw new Error(`Invalid architecture role id: ${id}.`);
    if (id === rest) {
      roleSummaries.set(id, nonBlank(value, key));
      continue;
    }
    const byLocale = localizedSummaries.get(id) ?? new Map();
    byLocale.set(locale, nonBlank(value, key));
    localizedSummaries.set(id, byLocale);
  }
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
  /*
   * A translation of nothing is refused: `summary_views_ko`
   * without `summary_views` would explain a role on one screen and nowhere else. A locale
   * line may only restate the reviewed canonical sentence.
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
      // Parsed for parity with the web reader and unread here: `buildArchitectureBrief`
      // emits `summary` only, so no agent-facing text prints a translation.
      const summaries = Object.fromEntries(localizedSummaries.get(id) ?? []);
      return summary === undefined
        ? { id, paths: rolePaths.get(id), summaries }
        : { id, paths: rolePaths.get(id), summary, summaries };
    }),
    dependencyPolicy,
    dependencyUsages: parseDependencyUsages(frontmatter.dependency_usages),
    allows,
    evidence: stringArray(frontmatter.evidence, 'evidence'),
  };
}

/**
 * Duplicate profile slugs: identical `profile_uid` and frontmatter is one record
 * reached twice (a generated mirror such as `public/docs-vault/`, a symlink) and
 * is skipped; anything else is a real conflict that fails closed, naming both
 * files.
 */
function profileFingerprint(frontmatter) {
  // Key order must not decide identity: two mirrors can serialise differently.
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

function matchingRoles(profile, path, match) {
  return profile.roles
    .filter((role) => role.paths.some((pattern) => match(path, pattern)))
    .map((role) => role.id);
}

function inScope(profile, path, match) {
  return profile.scopePaths.some((pattern) => match(path, pattern))
    && !profile.excludePaths.some((pattern) => match(path, pattern));
}

function excludedFromScope(profile, path, match) {
  return profile.excludePaths.some((pattern) => match(path, pattern));
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

/**
 * O(E × P) tests; an invocation-local pool compiles each used pattern once.
 */
export function evaluateArchitectureConformance(profile, importResult) {
  const match = createPathMatcher();
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
    // Rules govern dependencies originating in scope: excluded sources (tests,
    // fixtures, generated code) are not violations for targeting production code.
    // A production source pointing outside the model stays an explicit unknown.
    if (!inScope(profile, edge.from, match)) continue;
    if (excludedFromScope(profile, edge.to, match)) continue;
    const fromRoles = matchingRoles(profile, edge.from, match);
    const toRoles = matchingRoles(profile, edge.to, match);
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
       * The `missing` tally counts edges with no `importUsage` at all, unlike
       * unclassifiable ones. The record writer refuses to mint a durable receipt
       * from a scan that cannot tell type-only imports from value imports, and
       * reads this tally to know.
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
